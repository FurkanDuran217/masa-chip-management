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
  updateDoc,
  onSnapshot,
  getDoc,
  getDocs,
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
    if (channel) {
      channel.postMessage({ type: 'LOCAL_UPDATE', key });
    }
  } catch (e) {
    console.error('Local storage error:', e);
  }
}

// ---------------- GRUP İŞLEMLERİ ----------------
export async function syncSaveGroup(group: Group) {
  const db = getDb();
  if (db) {
    await setDoc(doc(db, 'groups', group.id), group, { merge: true });
  } else {
    const groups = localGet<Record<string, Group>>('groups', {});
    groups[group.id] = group;
    localSet('groups', groups);
  }
}

export function syncSubscribeGroup(groupId: string, callback: (g: Group | null) => void): () => void {
  const db = getDb();
  if (db) {
    return onSnapshot(doc(db, 'groups', groupId), (snap) => {
      callback(snap.exists() ? (snap.data() as Group) : null);
    });
  }
  // Local fallback
  const fetch = () => {
    const groups = localGet<Record<string, Group>>('groups', {});
    callback(groups[groupId] || null);
  };
  fetch();
  const onMsg = (e: MessageEvent) => {
    if (e.data?.key === 'groups') fetch();
  };
  channel?.addEventListener('message', onMsg);
  return () => channel?.removeEventListener('message', onMsg);
}

// ---------------- ÜYELER ----------------
export async function syncSaveMember(groupId: string, member: Member) {
  const db = getDb();
  if (db) {
    await setDoc(doc(db, 'groups', groupId, 'members', member.id), member, { merge: true });
  } else {
    const key = `members_${groupId}`;
    const members = localGet<Record<string, Member>>(key, {});
    members[member.id] = member;
    localSet(key, members);
  }
}

export function syncSubscribeMembers(groupId: string, callback: (m: Member[]) => void): () => void {
  const db = getDb();
  if (db) {
    return onSnapshot(collection(db, 'groups', groupId, 'members'), (snap) => {
      const list = snap.docs.map((d) => d.data() as Member);
      callback(list);
    });
  }
  const key = `members_${groupId}`;
  const fetch = () => {
    const members = localGet<Record<string, Member>>(key, {});
    callback(Object.values(members));
  };
  fetch();
  const onMsg = (e: MessageEvent) => {
    if (e.data?.key === key) fetch();
  };
  channel?.addEventListener('message', onMsg);
  return () => channel?.removeEventListener('message', onMsg);
}

// ---------------- ODA / MASA (ROOM) ----------------
export async function syncSaveRoom(groupId: string, room: Room) {
  const db = getDb();
  if (db) {
    await setDoc(doc(db, 'groups', groupId, 'rooms', room.id), room, { merge: true });
  } else {
    const key = `rooms_${groupId}`;
    const rooms = localGet<Record<string, Room>>(key, {});
    rooms[room.id] = room;
    localSet(key, rooms);
  }
}

export function syncSubscribeRoom(groupId: string, roomId: string, callback: (r: Room | null) => void): () => void {
  const db = getDb();
  if (db) {
    return onSnapshot(doc(db, 'groups', groupId, 'rooms', roomId), (snap) => {
      callback(snap.exists() ? (snap.data() as Room) : null);
    });
  }
  const key = `rooms_${groupId}`;
  const fetch = () => {
    const rooms = localGet<Record<string, Room>>(key, {});
    callback(rooms[roomId] || null);
  };
  fetch();
  const onMsg = (e: MessageEvent) => {
    if (e.data?.key === key) fetch();
  };
  channel?.addEventListener('message', onMsg);
  return () => channel?.removeEventListener('message', onMsg);
}

export function syncSubscribeRooms(groupId: string, callback: (r: Room[]) => void): () => void {
  const db = getDb();
  if (db) {
    return onSnapshot(collection(db, 'groups', groupId, 'rooms'), (snap) => {
      callback(snap.docs.map((d) => d.data() as Room));
    });
  }
  const key = `rooms_${groupId}`;
  const fetch = () => {
    const rooms = localGet<Record<string, Room>>(key, {});
    callback(Object.values(rooms));
  };
  fetch();
  const onMsg = (e: MessageEvent) => {
    if (e.data?.key === key) fetch();
  };
  channel?.addEventListener('message', onMsg);
  return () => channel?.removeEventListener('message', onMsg);
}

// ---------------- EL GEÇMİŞİ (HAND RECORDS) ----------------
export async function syncRecordHand(groupId: string, hand: HandRecord) {
  const db = getDb();
  if (db) {
    await setDoc(doc(db, 'groups', groupId, 'hands', hand.id), hand);
  } else {
    const key = `hands_${groupId}`;
    const hands = localGet<HandRecord[]>(key, []);
    hands.unshift(hand);
    localSet(key, hands.slice(0, 1000));
  }
}

export function syncSubscribeHands(groupId: string, callback: (h: HandRecord[]) => void): () => void {
  const db = getDb();
  if (db) {
    const q = query(collection(db, 'groups', groupId, 'hands'), orderBy('at', 'desc'), limit(150));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => d.data() as HandRecord));
    });
  }
  const key = `hands_${groupId}`;
  const fetch = () => {
    callback(localGet<HandRecord[]>(key, []));
  };
  fetch();
  const onMsg = (e: MessageEvent) => {
    if (e.data?.key === key) fetch();
  };
  channel?.addEventListener('message', onMsg);
  return () => channel?.removeEventListener('message', onMsg);
}

// ---------------- HAVUZ HAREKETLERİ (LEDGER) ----------------
export async function syncAddLedger(groupId: string, entry: LedgerEntry) {
  const db = getDb();
  if (db) {
    await setDoc(doc(db, 'groups', groupId, 'ledger', entry.id), entry);
  } else {
    const key = `ledger_${groupId}`;
    const ledger = localGet<LedgerEntry[]>(key, []);
    ledger.unshift(entry);
    localSet(key, ledger.slice(0, 1000));
  }
}

export function syncSubscribeLedger(groupId: string, callback: (l: LedgerEntry[]) => void): () => void {
  const db = getDb();
  if (db) {
    const q = query(collection(db, 'groups', groupId, 'ledger'), orderBy('at', 'desc'), limit(200));
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map((d) => d.data() as LedgerEntry));
    });
  }
  const key = `ledger_${groupId}`;
  const fetch = () => {
    callback(localGet<LedgerEntry[]>(key, []));
  };
  fetch();
  const onMsg = (e: MessageEvent) => {
    if (e.data?.key === key) fetch();
  };
  channel?.addEventListener('message', onMsg);
  return () => channel?.removeEventListener('message', onMsg);
}
