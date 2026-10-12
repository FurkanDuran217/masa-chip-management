// ============================================================
// İş kuralları: havuz ↔ masa hareketleri, oda aksiyonları.
// Tüm yazımlar firebase.ts üzerinden (Firestore veya local).
// ============================================================
import { apply, addSeat, clone, emptyState, removeSeat, type Action } from './engine';
import {
  syncAddLedger, syncRecordHand, syncSaveGroup, syncSaveMember, syncSaveRoom,
} from './firebase';
import type { Group, GroupDefaults, LedgerType, Member, Room, RoomEvent, RoomSettings } from './types';
import { COLORS, EMOJIS, hashPin, today, uid } from './util';

const MAX_LOG = 200;
const MAX_UNDO = 25;

async function ledger(groupId: string, m: Member, type: LedgerType, amount: number, roomId = '', note = '') {
  await syncAddLedger(groupId, {
    id: `${Date.now()}_${uid(4)}`, memberId: m.id, type, amount, balanceAfter: m.balance, roomId, note, at: Date.now(),
  });
}

// ---------- grup ----------
export async function createGroup(p: {
  name: string;
  emoji: string;
  startingBalance: number;
  defaults: GroupDefaults;
  chipValue?: number;
  chipsPerCurrency?: number;
  currency?: string;
  password?: string;
}, by: string): Promise<Group> {
  const g: Group = {
    id: uid(6),
    name: p.name.trim() || 'Masa',
    emoji: p.emoji || '♠️',
    createdAt: Date.now(),
    createdBy: by,
    startingBalance: Math.max(0, Math.floor(p.startingBalance)),
    chipValue: p.chipValue ?? 0,
    chipsPerCurrency: p.chipsPerCurrency ?? 0,
    currency: p.currency ?? '₺',
    defaults: p.defaults,
    passwordHash: p.password ? await hashPin(p.password) : undefined,
  };
  await syncSaveGroup(g);
  return g;
}

export async function verifyGroupPassword(g: Group, inputPassword: string): Promise<boolean> {
  if (!g.passwordHash) return true;
  return (await hashPin(inputPassword)) === g.passwordHash;
}

export async function addMember(g: Group, name: string, pin: string, existing: Member[]): Promise<Member> {
  const n = existing.length;
  const m: Member = {
    id: uid(8), name: name.trim(), color: COLORS[n % COLORS.length], emoji: EMOJIS[n % EMOJIS.length],
    balance: g.startingBalance, deposited: g.startingBalance, pinHash: await hashPin(pin), createdAt: Date.now(), archived: false,
  };
  await syncSaveMember(g.id, m);
  if (g.startingBalance > 0) await ledger(g.id, m, 'grant', g.startingBalance, '', 'Başlangıç çipi');
  return m;
}

export async function deposit(groupId: string, m: Member, amount: number, note = 'Havuza yükleme') {
  const a = Math.floor(amount);
  if (!a) return;
  const next = { ...m, balance: m.balance + a, deposited: m.deposited + Math.max(0, a) };
  await syncSaveMember(groupId, next);
  await ledger(groupId, next, a > 0 ? 'deposit' : 'adjust', a, '', note);
}

export async function updateMember(groupId: string, m: Member) {
  await syncSaveMember(groupId, m);
}

// ---------- oda ----------
export async function createRoom(g: Group, by: string, name: string, settings: RoomSettings): Promise<Room> {
  const r: Room = {
    id: uid(8), name: name.trim() || `Masa ${today()}`, createdAt: Date.now(), createdBy: by, hostUid: by, status: 'open', date: today(),
    settings, state: emptyState(), log: [], undo: [], ledger: {}, version: 1, closedAt: 0,
  };
  await syncSaveRoom(g.id, r);
  return r;
}

function pushLog(r: Room, evs: Omit<RoomEvent, 'id' | 'at'>[]) {
  const now = Date.now();
  const add = evs.map((e, i) => ({ ...e, id: `${now}_${i}_${uid(3)}`, at: now }));
  r.log = [...add.reverse(), ...r.log].slice(0, MAX_LOG);
}

/** Havuzdan masaya çip al (yeni koltuk veya mevcut yığına ekleme — sadece el arası) */
export async function buyIn(groupId: string, room: Room, m: Member, amount: number) {
  const a = Math.floor(amount);
  if (a <= 0) throw new Error('Geçersiz miktar');
  if (a > m.balance) throw new Error('Havuzda yeterli çip yok');
  const r = clone(room);
  const idx = r.state.seats.findIndex((s) => s.memberId === m.id);
  if (idx >= 0) {
    if (r.state.street !== 'idle' && r.state.seats[idx].inHand) throw new Error('El bitince ekleyebilirsin');
    r.state.seats[idx].stack += a;
  } else {
    if (r.state.seats.length >= r.settings.maxSeats) throw new Error('Masa dolu');
    r.state = addSeat(r.state, { memberId: m.id, name: m.name, color: m.color, emoji: m.emoji, stack: a, sittingOut: false });
  }
  const row = r.ledger[m.id] ?? { name: m.name, buyIn: 0, cashOut: 0 };
  r.ledger[m.id] = { ...row, buyIn: row.buyIn + a };
  pushLog(r, [{ kind: idx >= 0 ? 'rebuy' : 'join', memberId: m.id, name: m.name, amount: a, text: `${m.name} ${idx >= 0 ? 'çip ekledi' : 'masaya oturdu'}: ${a}` }]);
  r.version++;
  const next = { ...m, balance: m.balance - a };
  await syncSaveMember(groupId, next);
  await syncSaveRoom(groupId, r);
  await ledger(groupId, next, 'buyin', -a, r.id, r.name);
}

/** Masadan kalk, yığını havuza geri koy */
export async function cashOut(groupId: string, room: Room, m: Member) {
  const r = clone(room);
  const idx = r.state.seats.findIndex((s) => s.memberId === m.id);
  if (idx < 0) throw new Error('Masada değil');
  const stack = r.state.seats[idx].stack;
  r.state = removeSeat(r.state, idx);
  const row = r.ledger[m.id] ?? { name: m.name, buyIn: 0, cashOut: 0 };
  r.ledger[m.id] = { ...row, cashOut: row.cashOut + stack };
  pushLog(r, [{ kind: 'leave', memberId: m.id, name: m.name, amount: stack, text: `${m.name} kalktı: ${stack} havuza döndü` }]);
  r.version++;
  const next = { ...m, balance: m.balance + stack };
  await syncSaveMember(groupId, next);
  await syncSaveRoom(groupId, r);
  await ledger(groupId, next, 'cashout', stack, r.id, r.name);
}

export async function toggleSitOut(groupId: string, room: Room, seat: number) {
  const r = clone(room);
  const s = r.state.seats[seat];
  if (!s) return;
  if (s.inHand && r.state.street !== 'idle') throw new Error('El bitince');
  s.sittingOut = !s.sittingOut;
  r.version++;
  await syncSaveRoom(groupId, r);
}

/** Motor aksiyonu uygula, log + undo + el kaydı */
export async function act(groupId: string, room: Room, action: Action) {
  const r = clone(room);
  const res = apply(r.state, r.settings, action);
  r.undo = [JSON.stringify(room.state), ...r.undo].slice(0, MAX_UNDO);
  r.state = res.state;
  pushLog(r, res.events);
  r.version++;
  await syncSaveRoom(groupId, r);
  if (res.hand) {
    await syncRecordHand(groupId, {
      id: `${r.id}_${res.hand.handNo}_${uid(3)}`, roomId: r.id, roomName: r.name, date: r.date, at: Date.now(), ...res.hand,
    });
  }
  return res;
}

/** Son aksiyonu geri al (el geçmişine yazılmış kayıt silinmez) */
export async function undo(groupId: string, room: Room) {
  if (!room.undo.length) throw new Error('Geri alınacak işlem yok');
  const r = clone(room);
  const [prev, ...rest] = r.undo;
  const prevState = JSON.parse(prev);
  // koltuk seti değiştiyse (buy-in/cash-out sonrası) geri alma güvensiz
  const ids = (st: { seats: { memberId: string }[] }) => st.seats.map((s) => s.memberId).join(',');
  if (ids(prevState) !== ids(r.state)) throw new Error('Oturma düzeni değişti, geri alınamaz');
  r.state = prevState;
  r.undo = rest;
  pushLog(r, [{ kind: 'undo', memberId: '', name: '', amount: 0, text: 'Son işlem geri alındı' }]);
  r.version++;
  await syncSaveRoom(groupId, r);
}

export async function updateRoomSettings(groupId: string, room: Room, settings: RoomSettings) {
  await syncSaveRoom(groupId, { ...room, settings, version: room.version + 1 });
}

/** Odayı kapat: herkesi havuza geri gönder */
export async function closeRoom(groupId: string, room: Room, members: Member[]) {
  let r = clone(room);
  if (r.state.street !== 'idle') r = { ...r, state: apply(r.state, r.settings, { type: 'cancelHand' }).state };
  for (const s of [...r.state.seats]) {
    const m = members.find((x) => x.id === s.memberId);
    r.state = removeSeat(r.state, r.state.seats.findIndex((x) => x.memberId === s.memberId));
    const row = r.ledger[s.memberId] ?? { name: s.name, buyIn: 0, cashOut: 0 };
    r.ledger[s.memberId] = { ...row, cashOut: row.cashOut + s.stack };
    if (!m) continue;
    const next = { ...m, balance: m.balance + s.stack };
    await syncSaveMember(groupId, next);
    await ledger(groupId, next, 'cashout', s.stack, r.id, `${r.name} (kapanış)`);
  }
  r.status = 'closed';
  r.closedAt = Date.now();
  r.version++;
  await syncSaveRoom(groupId, r);
}

export async function verifyPin(m: Member, pin: string) {
  if (!m.pinHash) return true;
  return (await hashPin(pin)) === m.pinHash;
}
