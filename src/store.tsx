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

interface Ctx {
  online: boolean;
  groupId: string | null;
  group: Group | null;
  groupLoaded: boolean;
  members: Member[];
  rooms: Room[];
  hands: HandRecord[];
  ledger: LedgerEntry[];
  me: Member | null;
  view: View;
  toast: string | null;
  isGroupUnlocked: boolean;
  unlockGroup: (id: string) => void;
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
  const [unlockedGroups, setUnlockedGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('masa_unlocked_groups') || '{}');
    } catch {
      return {};
    }
  });
  const [meId, setMeIdRaw] = useState<string | null>(() => localStorage.getItem(MEMBER_KEY));
  const [group, setGroup] = useState<Group | null>(null);
  const [groupLoaded, setGroupLoaded] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [hands, setHands] = useState<HandRecord[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [view, setView] = useState<View>(() => {
    const r = new URLSearchParams(location.search).get('r');
    return r ? { name: 'room', roomId: r } : { name: 'lobby' };
  });
  const [toast, setToast] = useState<string | null>(null);

  const setGroupId = (id: string | null) => {
    if (id) localStorage.setItem(GROUP_KEY, id);
    else localStorage.removeItem(GROUP_KEY);
    setMeId(null);
    setGroupIdRaw(id);
  };
  const setMeId = (id: string | null) => {
    if (id) localStorage.setItem(MEMBER_KEY, id);
    else localStorage.removeItem(MEMBER_KEY);
    setMeIdRaw(id);
  };

  useEffect(() => {
    setGroup(null);
    setGroupLoaded(false);
    setMembers([]);
    setRooms([]);
    setHands([]);
    setLedger([]);
    if (!groupId) return;
    const offs = [
      syncSubscribeGroup(groupId, (g) => {
        setGroup(g);
        setGroupLoaded(true);
      }),
      syncSubscribeMembers(groupId, (m) => setMembers(m.sort((a, b) => a.createdAt - b.createdAt))),
      syncSubscribeRooms(groupId, (r) => setRooms(r.sort((a, b) => b.createdAt - a.createdAt))),
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
    online: isFirebaseConnected(), groupId, group, groupLoaded, members, rooms, hands, ledger, me, view, toast,
    isGroupUnlocked, unlockGroup,
    setGroupId, setMeId, go: setView, notify, run,
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useStore() {
  const c = useContext(C);
  if (!c) throw new Error('StoreProvider yok');
  return c;
}
