// ============================================================
// Firebase Firestore & Realtime Sync Layer
// Config varsa Firestore ile tam senkron,
// Config yoksa LocalStorage + BroadcastChannel ile aynı tarayıcıda/sekmelerde tam senkron çalışır.
// ============================================================
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  setDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  type Firestore,
} from 'firebase/firestore';
import type { Group, Member, Room, HandRecord, LedgerEntry } from './types';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

const CONFIG_KEY = 'masa_poker_firebase_config';
const LOCAL_DATA_PREFIX = 'masa_poker_local_';

// Kanaldan sekme senkronu
const channel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('masa_poker_realtime_bus')
  : null;

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;

export function loadSavedFirebaseConfig(): FirebaseConfig | null {
  if (typeof window === 'undefined') return null;
  // 1. Vite ENV
  const envKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const envProj = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (envKey && envProj) {
    return {
      apiKey: envKey,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${envProj}.firebaseapp.com`,
      projectId: envProj,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
    };
  }
  // 2. LocalStorage
  const saved = localStorage.getItem(CONFIG_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  }
  return null;
}

export function saveFirebaseConfig(cfg: FirebaseConfig | null) {
  if (cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } else {
    localStorage.removeItem(CONFIG_KEY);
  }
  appInstance = null;
  dbInstance = null;
}

export function getDb(): Firestore | null {
  if (dbInstance) return dbInstance;
  const cfg = loadSavedFirebaseConfig();
  if (!cfg || !cfg.apiKey || !cfg.projectId) return null;
  try {
    if (!getApps().length) {
      appInstance = initializeApp(cfg);
    } else {
      appInstance = getApps()[0];
    }
    dbInstance = getFirestore(appInstance);
    return dbInstance;
  } catch (err) {
    console.error('Firebase init error:', err);
    return null;
  }
}

export function isFirebaseConnected(): boolean {
  return getDb() !== null;
}

// ---------------- LOCAL STORE YARDIMCILARI ----------------
// Aynı pencere/sekmedeki dinleyicilere anında bildirim göndermek için yerel EventTarget
const localBus = typeof window !== 'undefined' ? new EventTarget() : null;

function notifyLocal(key: string) {
  if (localBus) {
    try {
      localBus.dispatchEvent(new CustomEvent('local_sync', { detail: { key } }));
    } catch (e) {
      console.error('localBus dispatch error:', e);
    }
  }
}

function localGet<T>(key: string, def: T): T {
  try {
    const raw = localStorage.getItem(LOCAL_DATA_PREFIX + key);
    return raw ? JSON.parse(raw) : def;
  } catch {
    return def;
  }
}

function localSet<T>(key: string, val: T) {
  try {
    localStorage.setItem(LOCAL_DATA_PREFIX + key, JSON.stringify(val));
    notifyLocal(key);
    if (channel) {
      try {
        channel.postMessage({ type: 'LOCAL_UPDATE', key });
      } catch (e) {
        console.error('Channel postMessage error:', e);
      }
    }
  } catch (e) {
    console.error('Local storage error:', e);
  }
}

function subscribeLocal(key: string, fetch: () => void): () => void {
  // İlk veri çekimi
  fetch();

  // 1. Aynı sekme içi anında bildirim
  const onLocal = (e: Event) => {
    const custom = e as CustomEvent;
    if (custom.detail?.key === key || custom.detail?.key === 'all') fetch();
  };
  localBus?.addEventListener('local_sync', onLocal);

  // 2. Diğer sekmelerden BroadcastChannel
  const onMsg = (e: MessageEvent) => {
    if (e.data?.key === key || e.data?.key === 'all') fetch();
  };
  channel?.addEventListener('message', onMsg);

  // 3. Diğer pencerelerden StorageEvent
  const onStorage = (e: StorageEvent) => {
    if (e.key === LOCAL_DATA_PREFIX + key) fetch();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }

  return () => {
    localBus?.removeEventListener('local_sync', onLocal);
    channel?.removeEventListener('message', onMsg);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}

// ---------------- GRUP İŞLEMLERİ ----------------
export async function syncSaveGroup(group: Group) {
  // 1. Her zaman yerel depolamaya anında kaydet
  const groups = localGet<Record<string, Group>>('groups', {});
  groups[group.id] = group;
  localSet('groups', groups);

  // 2. Firebase bağlıysa arka planda buluta senkronize et
  const db = getDb();
  if (db) {
    try {
      await setDoc(doc(db, 'groups', group.id), group, { merge: true });
    } catch (err) {
      console.warn('Firestore syncSaveGroup error:', err);
    }
  }
}

export function localGetAllGroups(): Group[] {
  const groups = localGet<Record<string, Group>>('groups', {});
  return Object.values(groups);
}

export function syncSubscribeGroup(groupId: string, callback: (g: Group | null) => void): () => void {
  // Yerel veriyi anında dinle ve ilet
  const deliverLocal = () => {
    const groups = localGet<Record<string, Group>>('groups', {});
    callback(groups[groupId] || null);
  };
  const unsubLocal = subscribeLocal('groups', deliverLocal);

  const db = getDb();
  if (db) {
    try {
      const unsubRemote = onSnapshot(
        doc(db, 'groups', groupId),
        (snap) => {
          if (snap.exists()) {
            const g = snap.data() as Group;
            const groups = localGet<Record<string, Group>>('groups', {});
            groups[g.id] = g;
            localSet('groups', groups);
            callback(g);
          }
        },
        (err) => {
          console.warn('Firestore group error, using local:', err);
          deliverLocal();
        }
      );
      return () => {
        unsubLocal();
        unsubRemote();
      };
    } catch (e) {
      console.warn('Firestore subscribeGroup failed:', e);
    }
  }

  return unsubLocal;
}

// ---------------- ÜYELER ----------------
export async function syncSaveMember(groupId: string, member: Member) {
  // 1. Her zaman yerel depolamaya anında kaydet
  const key = `members_${groupId}`;
  const members = localGet<Record<string, Member>>(key, {});
  members[member.id] = member;
  localSet(key, members);

  // 2. Firebase bağlıysa buluta gönder
  const db = getDb();
  if (db) {
    try {
      await setDoc(doc(db, 'groups', groupId, 'members', member.id), member, { merge: true });
    } catch (err) {
      console.warn('Firestore syncSaveMember error:', err);
    }
  }
}

export function syncSubscribeMembers(groupId: string, callback: (m: Member[]) => void): () => void {
  const key = `members_${groupId}`;
  const deliverLocal = () => {
    const members = localGet<Record<string, Member>>(key, {});
    callback(Object.values(members));
  };
  const unsubLocal = subscribeLocal(key, deliverLocal);

  const db = getDb();
  if (db) {
    try {
      const unsubRemote = onSnapshot(
        collection(db, 'groups', groupId, 'members'),
        (snap) => {
          if (!snap.empty) {
            const list = snap.docs.map((d) => d.data() as Member);
            const map = localGet<Record<string, Member>>(key, {});
            list.forEach((m) => { map[m.id] = m; });
            localSet(key, map);
            callback(list);
          }
        },
        (err) => {
          console.warn('Firestore members error, using local:', err);
          deliverLocal();
        }
      );
      return () => {
        unsubLocal();
        unsubRemote();
      };
    } catch (e) {
      console.warn('Firestore subscribeMembers failed:', e);
    }
  }

  return unsubLocal;
}

// ---------------- ODA / MASA (ROOM) ----------------
export async function syncSaveRoom(groupId: string, room: Room) {
  // 1. HER ZAMAN yerel depolamaya anında kaydet
  const key = `rooms_${groupId}`;
  const rooms = localGet<Record<string, Room>>(key, {});
  rooms[room.id] = room;
  localSet(key, rooms);

  // 2. Firebase bağlıysa buluta gönder (hata olsa bile yerel çalışmaya devam eder)
  const db = getDb();
  if (db) {
    try {
      await setDoc(doc(db, 'groups', groupId, 'rooms', room.id), room, { merge: true });
    } catch (err) {
      console.warn('Firestore syncSaveRoom error (local copy preserved):', err);
    }
  }
}

export function syncGetRoom(groupId: string, roomId: string): Room | null {
  const key = `rooms_${groupId}`;
  const rooms = localGet<Record<string, Room>>(key, {});
  return rooms[roomId] || null;
}

export function syncSubscribeRoom(groupId: string, roomId: string, callback: (r: Room | null) => void): () => void {
  const key = `rooms_${groupId}`;
  const deliverLocal = () => {
    const rooms = localGet<Record<string, Room>>(key, {});
    callback(rooms[roomId] || null);
  };
  const unsubLocal = subscribeLocal(key, deliverLocal);

  const db = getDb();
  if (db) {
    try {
      const unsubRemote = onSnapshot(
        doc(db, 'groups', groupId, 'rooms', roomId),
        (snap) => {
          if (snap.exists()) {
            const r = snap.data() as Room;
            const rooms = localGet<Record<string, Room>>(key, {});
            rooms[r.id] = r;
            localSet(key, rooms);
            callback(r);
          }
        },
        (err) => {
          console.warn('Firestore room error, using local:', err);
          deliverLocal();
        }
      );
      return () => {
        unsubLocal();
        unsubRemote();
      };
    } catch (e) {
      console.warn('Firestore subscribeRoom failed:', e);
    }
  }

  return unsubLocal;
}

export function syncSubscribeRooms(groupId: string, callback: (r: Room[]) => void): () => void {
  const key = `rooms_${groupId}`;
  const deliverLocal = () => {
    const rooms = localGet<Record<string, Room>>(key, {});
    callback(Object.values(rooms));
  };
  const unsubLocal = subscribeLocal(key, deliverLocal);

  const db = getDb();
  if (db) {
    try {
      const unsubRemote = onSnapshot(
        collection(db, 'groups', groupId, 'rooms'),
        (snap) => {
          if (!snap.empty) {
            const list = snap.docs.map((d) => d.data() as Room);
            const map = localGet<Record<string, Room>>(key, {});
            list.forEach((r) => { map[r.id] = r; });
            localSet(key, map);
            callback(list);
          }
        },
        (err) => {
          console.warn('Firestore rooms error, using local:', err);
          deliverLocal();
        }
      );
      return () => {
        unsubLocal();
        unsubRemote();
      };
    } catch (e) {
      console.warn('Firestore subscribeRooms failed:', e);
    }
  }

  return unsubLocal;
}

// ---------------- EL GEÇMİŞİ (HAND RECORDS) ----------------
export async function syncRecordHand(groupId: string, hand: HandRecord) {
  const key = `hands_${groupId}`;
  const hands = localGet<HandRecord[]>(key, []);
  hands.unshift(hand);
  localSet(key, hands.slice(0, 1000));

  const db = getDb();
  if (db) {
    try {
      await setDoc(doc(db, 'groups', groupId, 'hands', hand.id), hand);
    } catch (err) {
      console.warn('Firestore syncRecordHand error:', err);
    }
  }
}

export function syncSubscribeHands(groupId: string, callback: (h: HandRecord[]) => void): () => void {
  const key = `hands_${groupId}`;
  const deliverLocal = () => {
    callback(localGet<HandRecord[]>(key, []));
  };
  const unsubLocal = subscribeLocal(key, deliverLocal);

  const db = getDb();
  if (db) {
    try {
      const q = query(collection(db, 'groups', groupId, 'hands'), orderBy('at', 'desc'), limit(150));
      const unsubRemote = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            callback(snap.docs.map((d) => d.data() as HandRecord));
          }
        },
        (err) => {
          console.warn('Firestore hands error, using local:', err);
          deliverLocal();
        }
      );
      return () => {
        unsubLocal();
        unsubRemote();
      };
    } catch (e) {
      console.warn('Firestore subscribeHands failed:', e);
    }
  }

  return unsubLocal;
}

// ---------------- HAVUZ HAREKETLERİ (LEDGER) ----------------
export async function syncAddLedger(groupId: string, entry: LedgerEntry) {
  const key = `ledger_${groupId}`;
  const ledger = localGet<LedgerEntry[]>(key, []);
  ledger.unshift(entry);
  localSet(key, ledger.slice(0, 1000));

  const db = getDb();
  if (db) {
    try {
      await setDoc(doc(db, 'groups', groupId, 'ledger', entry.id), entry);
    } catch (err) {
      console.warn('Firestore syncAddLedger error:', err);
    }
  }
}

export function syncSubscribeLedger(groupId: string, callback: (l: LedgerEntry[]) => void): () => void {
  const key = `ledger_${groupId}`;
  const deliverLocal = () => {
    callback(localGet<LedgerEntry[]>(key, []));
  };
  const unsubLocal = subscribeLocal(key, deliverLocal);

  const db = getDb();
  if (db) {
    try {
      const q = query(collection(db, 'groups', groupId, 'ledger'), orderBy('at', 'desc'), limit(200));
      const unsubRemote = onSnapshot(
        q,
        (snap) => {
          if (!snap.empty) {
            callback(snap.docs.map((d) => d.data() as LedgerEntry));
          }
        },
        (err) => {
          console.warn('Firestore ledger error, using local:', err);
          deliverLocal();
        }
      );
      return () => {
        unsubLocal();
        unsubRemote();
      };
    } catch (e) {
      console.warn('Firestore subscribeLedger failed:', e);
    }
  }

  return unsubLocal;
}
