// ============================================================
// Uygulama durumu: aktif grup, oturum açmış üye, canlı abonelikler.
// ============================================================
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  isFirebaseConnected, syncSubscribeGroup, syncSubscribeHands, syncSubscribeLedger, syncSubscribeMembers, syncSubscribeRooms,
} from './lib/firebase';
import type { Group, HandRecord, LedgerEntry, Member, Room } from './lib/types';

const GROUP_KEY = 'masa_active_group';
const MEMBER_KEY = 'masa_active_member';

export type View = { name: 'lobby' } | { name: 'room'; roomId: string } | { name: 'stats' } | { name: 'pool' } | { name: 'settings' };

export interface SavedGroupMeta {
  id: string;
  name: string;
  emoji: string;
  lastActive: number;
}

interface Ctx {
  online: boolean;
  groupId: string | null;
  group: Group | null;
  groupLoaded: boolean;
  joinedGroups: SavedGroupMeta[];
  members: Member[];
  rooms: Room[];
  roomsLoaded: boolean;
  hands: HandRecord[];
  ledger: LedgerEntry[];
  me: Member | null;
  view: View;
  toast: string | null;
  isGroupUnlocked: boolean;
  unlockGroup: (id: string) => void;
  switchGroup: (id: string) => void;
  leaveGroup: (id: string) => void;
  addRoomOptimistic: (r: Room) => void;
  setGroupId: (id: string | null) => void;
  setMeId: (id: string | null) => void;
  go: (v: View) => void;
  notify: (msg: string) => void;
  /** async işlemi çalıştır, hatayı toast olarak göster */
  run: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
}

const C = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [groupId, setGroupIdRaw] = useState<string | null>(() => {
    const fromUrl = new URLSearchParams(location.search).get('g');
    return fromUrl || localStorage.getItem(GROUP_KEY);
  });
  const [joinedGroups, setJoinedGroups] = useState<SavedGroupMeta[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('masa_saved_groups_list') || '[]');
    } catch {
      return [];
    }
  });
  const [unlockedGroups, setUnlockedGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('masa_unlocked_groups') || '{}');
    } catch {
      return {};
    }
  });
  const [meId, setMeIdRaw] = useState<string | null>(() => {
    const initialG = new URLSearchParams(location.search).get('g') || localStorage.getItem(GROUP_KEY);
    return initialG ? localStorage.getItem(`${MEMBER_KEY}_${initialG}`) || localStorage.getItem(MEMBER_KEY) : null;
  });
  const [group, setGroup] = useState<Group | null>(null);
  const [groupLoaded, setGroupLoaded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomsLoaded, setRoomsLoaded] = useState(false);
  const [hands, setHands] = useState<HandRecord[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [view, setView] = useState<View>(() => {
    const r = new URLSearchParams(location.search).get('r');
    return r ? { name: 'room', roomId: r } : { name: 'lobby' };
  });
  const [toast, setToast] = useState<string | null>(null);

  const setGroupId = (id: string | null) => {
    if (id) {
      localStorage.setItem(GROUP_KEY, id);
      const savedMe = localStorage.getItem(`${MEMBER_KEY}_${id}`);
      setMeIdRaw(savedMe || null);
    } else {
      localStorage.removeItem(GROUP_KEY);
      setMeIdRaw(null);
    }
    setGroupIdRaw(id);
    setView({ name: 'lobby' });
  };

  const setMeId = (id: string | null) => {
    if (groupId) {
      if (id) localStorage.setItem(`${MEMBER_KEY}_${groupId}`, id);
      else localStorage.removeItem(`${MEMBER_KEY}_${groupId}`);
    }
    if (id) localStorage.setItem(MEMBER_KEY, id);
    else localStorage.removeItem(MEMBER_KEY);
    setMeIdRaw(id);
  };

  const switchGroup = (id: string) => {
    setGroupId(id);
  };

  const leaveGroup = (id: string) => {
    setJoinedGroups((prev) => {
      const next = prev.filter((g) => g.id !== id);
      localStorage.setItem('masa_saved_groups_list', JSON.stringify(next));
      return next;
    });
    if (groupId === id) {
      setGroupId(null);
    }
  };

  const addRoomOptimistic = (r: Room) => {
    setRooms((prev) => [r, ...prev.filter((x) => x.id !== r.id)]);
    setRoomsLoaded(true);
  };

  useEffect(() => {
    setGroup(null);
    setGroupLoaded(false);
    setMembers([]);
    setRooms([]);
    setRoomsLoaded(false);
    setHands([]);
    setLedger([]);
    if (!groupId) return;
    const offs = [
      syncSubscribeGroup(groupId, (g) => {
        setGroup(g);
        setGroupLoaded(true);
        if (g) {
          setJoinedGroups((prev) => {
            const exists = prev.some((x) => x.id === g.id);
            const item = { id: g.id, name: g.name, emoji: g.emoji, lastActive: Date.now() };
            const next = exists
              ? prev.map((x) => (x.id === g.id ? item : x))
              : [item, ...prev];
            localStorage.setItem('masa_saved_groups_list', JSON.stringify(next));
            return next;
          });
        }
      }),
      syncSubscribeMembers(groupId, (m) => setMembers(m.sort((a, b) => a.createdAt - b.createdAt))),
      syncSubscribeRooms(groupId, (r) => {
        setRooms(r.sort((a, b) => b.createdAt - a.createdAt));
        setRoomsLoaded(true);
      }),
      syncSubscribeHands(groupId, setHands),
      syncSubscribeLedger(groupId, setLedger),
    ];
    return () => offs.forEach((f) => f());
  }, [groupId]);

  // URL'yi görünümle senkron tut (paylaşılabilir link)
  useEffect(() => {
    const p = new URLSearchParams();
    if (groupId) p.set('g', groupId);
    if (view.name === 'room') p.set('r', view.roomId);
    const q = p.toString();
    history.replaceState(null, '', q ? `?${q}` : location.pathname);
  }, [groupId, view]);

  const notify = (msg: string) => {
    setToast(msg);
    window.clearTimeout((notify as unknown as { t?: number }).t);
    (notify as unknown as { t?: number }).t = window.setTimeout(() => setToast(null), 2600);
  };

  const run = async <T,>(fn: () => Promise<T>) => {
    try {
      return await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
      return undefined;
    }
  };

  const me = useMemo(() => members.find((m) => m.id === meId) ?? null, [members, meId]);

  const unlockGroup = (id: string) => {
    setUnlockedGroups((prev) => {
      const next = { ...prev, [id]: true };
      localStorage.setItem('masa_unlocked_groups', JSON.stringify(next));
      return next;
    });
  };

  const isGroupUnlocked = !group?.passwordHash || Boolean(groupId && unlockedGroups[groupId]);

  const value: Ctx = {
    online: isFirebaseConnected(), groupId, group, groupLoaded, joinedGroups, members, rooms, roomsLoaded, hands, ledger, me, view, toast,
    isGroupUnlocked, unlockGroup, switchGroup, leaveGroup, addRoomOptimistic,
    setGroupId, setMeId, go: setView, notify, run,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useStore() {
  const c = useContext(C);
  if (!c) throw new Error('StoreProvider yok');
  return c;
}
