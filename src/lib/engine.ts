// ============================================================
// Bahis motoru — saf fonksiyonlar. Kart yok; sadece çipler.
// Kural: Σ(stack) + Σ(committed) her an masadaki toplam çipe eşittir.
// ============================================================
import type { HandFlags, HandPlayer, Pot, RoomSettings, RoomState, Seat, Street } from './types';

export class EngineError extends Error {}

export type Action =
  | { type: 'fold' | 'check' | 'call' | 'allin'; seat: number }
  | { type: 'raise'; seat: number; to: number }
  | { type: 'start' }
  | { type: 'resolve'; winners: string[][] }
  | { type: 'cancelHand' }
  | { type: 'setButton'; seat: number };

export interface EngineEvent {
  kind: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'blinds' | 'street' | 'win' | 'showdown' | 'info';
  memberId: string;
  name: string;
  amount: number;
  text: string;
}

export interface HandResult {
  handNo: number;
  pot: number;
  players: Record<string, HandPlayer>;
  winners: string[];
}

export interface EngineResult {
  state: RoomState;
  events: EngineEvent[];
  hand?: HandResult;
}

const STREET_NEXT: Record<Street, Street> = {
  idle: 'preflop',
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
  river: 'showdown',
  showdown: 'idle',
};

export const STREET_LABEL: Record<Street, string> = {
  idle: 'El arası',
  preflop: 'Preflop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

export function emptyState(): RoomState {
  return {
    seats: [],
    street: 'idle',
    handNo: 0,
    button: 0,
    sbIdx: -1,
    bbIdx: -1,
    turn: -1,
    currentBet: 0,
    minRaise: 0,
    pot: 0,
    flags: {},
    startStacks: {},
    runout: false,
  };
}

export const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

// ---------- yardımcılar ----------
export const canAct = (s: Seat) => s.inHand && !s.folded && !s.allIn;
export const isLive = (s: Seat) => s.inHand && !s.folded;
export const eligibleForHand = (s: Seat) => !s.sittingOut && s.stack > 0;

export function nextIdx(seats: Seat[], from: number, pred: (s: Seat, i: number) => boolean): number {
  const n = seats.length;
  if (!n) return -1;
  for (let k = 1; k <= n; k++) {
    const i = (((from + k) % n) + n) % n;
    if (pred(seats[i], i)) return i;
  }
  return -1;
}

export const tableChips = (st: RoomState) =>
  st.seats.reduce((a, s) => a + s.stack + s.committed, 0);

export const potTotal = (st: RoomState) => st.seats.reduce((a, s) => a + s.committed, 0);

function flagsOf(st: RoomState, id: string): HandFlags {
  if (!st.flags[id]) st.flags[id] = { vpip: false, pfr: false, allIn: false, raises: 0, calls: 0 };
  return st.flags[id];
}

function put(st: RoomState, i: number, amount: number) {
  const s = st.seats[i];
  const a = Math.max(0, Math.min(amount, s.stack));
  s.stack -= a;
  s.bet += a;
  s.committed += a;
  if (s.stack === 0 && s.inHand) {
    s.allIn = true;
    flagsOf(st, s.memberId).allIn = true;
  }
  return a;
}

/** Ana pot + yan potlar (committed üzerinden) */
export function computePots(st: RoomState): Pot[] {
  const seats = st.seats.filter((s) => s.committed > 0 || isLive(s));
  const live = st.seats.filter(isLive);
  const levels = [...new Set(live.map((s) => s.committed))].filter((x) => x > 0).sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const L of levels) {
    let amount = 0;
    for (const s of seats) amount += Math.max(0, Math.min(s.committed, L) - Math.min(s.committed, prev));
    const eligible = live.filter((s) => s.committed >= L).map((s) => s.memberId);
    if (amount > 0) {
      const last = pots[pots.length - 1];
      if (last && last.eligible.length === eligible.length && last.eligible.every((e) => eligible.includes(e))) {
        last.amount += amount;
      } else pots.push({ amount, eligible });
    }
    prev = L;
  }
  // canlı oyuncuların en yüksek seviyesini aşan (fold edenlerin) çipleri son pota
  let extra = 0;
  for (const s of seats) extra += Math.max(0, s.committed - prev);
  if (extra > 0) {
    if (pots.length) pots[pots.length - 1].amount += extra;
    else pots.push({ amount: extra, eligible: live.map((s) => s.memberId) });
  }
  return pots;
}

export function toCall(st: RoomState, i: number) {
  const s = st.seats[i];
  return Math.max(0, Math.min(s.stack, st.currentBet - s.bet));
}

export function canRaise(st: RoomState, i: number) {
  const s = st.seats[i];
  if (!s || !canAct(s) || s.acted) return false;
  if (s.stack + s.bet <= st.currentBet) return false;
  const others = st.seats.filter((o, j) => j !== i && canAct(o));
  return others.length > 0;
}

/** Bu oyuncu için minimum "toplam bet" (raise to) */
export function minRaiseTo(st: RoomState, i: number, settings: RoomSettings) {
  const s = st.seats[i];
  const max = s.stack + s.bet;
  const min = st.currentBet === 0 ? Math.max(settings.bb, 1) : st.currentBet + Math.max(st.minRaise, 1);
  return Math.min(min, max);
}

export function maxRaiseTo(st: RoomState, i: number) {
  const s = st.seats[i];
  return s.stack + s.bet;
}

// ---------- el başlatma ----------
function startHand(st: RoomState, settings: RoomSettings, events: EngineEvent[]): HandResult | undefined {
  if (st.street !== 'idle') throw new EngineError('El zaten devam ediyor');
  const n = st.seats.length;
  const elig = st.seats.filter(eligibleForHand);
  if (elig.length < 2) throw new EngineError('El başlatmak için çipi olan en az 2 oyuncu gerekli');

  let button = st.button;
  if (button < 0 || button >= n || !eligibleForHand(st.seats[button])) {
    button = nextIdx(st.seats, button < 0 ? -1 : button, eligibleForHand);
  }
  st.button = button;
  st.handNo += 1;
  st.pot = 0;
  st.flags = {};
  st.startStacks = {};
  st.runout = false;
  for (const s of st.seats) {
    s.bet = 0;
    s.committed = 0;
    s.folded = false;
    s.allIn = false;
    s.acted = false;
    s.inHand = eligibleForHand(s);
    if (s.inHand) {
      st.startStacks[s.memberId] = s.stack;
      flagsOf(st, s.memberId);
    }
  }

  // ante
  if (settings.ante > 0) {
    st.seats.forEach((s, i) => {
      if (!s.inHand) return;
      put(st, i, settings.ante);
      s.bet = 0; // ante sokağın bet'i sayılmaz
    });
  }

  const inHand = (s: Seat) => s.inHand;
  let sb: number, bb: number;
  if (elig.length === 2) {
    sb = button;
    bb = nextIdx(st.seats, button, inHand);
  } else {
    sb = nextIdx(st.seats, button, inHand);
    bb = nextIdx(st.seats, sb, inHand);
  }
  st.sbIdx = sb;
  st.bbIdx = bb;
  const sbAmt = put(st, sb, settings.sb);
  const bbAmt = put(st, bb, settings.bb);
  st.currentBet = Math.max(settings.bb, ...st.seats.map((s) => s.bet));
  st.minRaise = Math.max(settings.bb, 1);
  st.street = 'preflop';
  st.turn = bb;

  events.push({
    kind: 'blinds',
    memberId: st.seats[button].memberId,
    name: st.seats[button].name,
    amount: sbAmt + bbAmt,
    text: `El #${st.handNo} · Dealer ${st.seats[button].name} · SB ${st.seats[sb].name} ${sbAmt} · BB ${st.seats[bb].name} ${bbAmt}`,
  });
  return progress(st, settings, bb, events);
}

// ---------- ilerleme ----------
function progress(st: RoomState, settings: RoomSettings, from: number, events: EngineEvent[]): HandResult | undefined {
  const live = st.seats.filter(isLive);
  if (live.length === 1) {
    // herkes pas geçti
    const w = live[0];
    const total = potTotal(st);
    const won: Record<string, number> = { [w.memberId]: total };
    w.stack += total;
    events.push({ kind: 'win', memberId: w.memberId, name: w.name, amount: total, text: `${w.name} potu aldı (${total})` });
    return finishHand(st, won, false);
  }

  const actors = st.seats.map((s, i) => ({ s, i })).filter(({ s }) => canAct(s));
  let need = actors.filter(({ s }) => !s.acted || s.bet < st.currentBet);
  if (actors.length === 1 && need.length === 1 && need[0].s.bet >= st.currentBet) need = [];

  if (need.length) {
    const ids = new Set(need.map((x) => x.i));
    st.turn = nextIdx(st.seats, from, (_s, i) => ids.has(i));
    return undefined;
  }

  // sokak bitti → betleri topla
  for (const s of st.seats) {
    st.pot += s.bet;
    s.bet = 0;
    s.acted = false;
  }
  st.currentBet = 0;
  st.minRaise = Math.max(settings.bb, 1);

  if (st.street === 'river' || actors.length <= 1) {
    st.runout = st.street !== 'river';
    st.street = 'showdown';
    st.turn = -1;
    events.push({
      kind: 'showdown',
      memberId: '',
      name: '',
      amount: st.pot,
      text: st.runout ? 'Herkes all-in! Kalan kartları açın' : 'Showdown — kartları açın',
    });
    return undefined;
  }

  st.street = STREET_NEXT[st.street];
  st.turn = nextIdx(st.seats, st.button, canAct);
  events.push({ kind: 'street', memberId: '', name: '', amount: st.pot, text: `${STREET_LABEL[st.street]} açılsın` });
  return undefined;
}

function finishHand(st: RoomState, won: Record<string, number>, showdown: boolean): HandResult {
  const players: Record<string, HandPlayer> = {};
  let pot = 0;
  for (const s of st.seats) {
    if (!(s.memberId in st.startStacks)) continue;
    const f = st.flags[s.memberId] ?? { vpip: false, pfr: false, allIn: false, raises: 0, calls: 0 };
    pot += s.committed;
    players[s.memberId] = {
      name: s.name,
      invested: s.committed,
      won: won[s.memberId] ?? 0,
      vpip: f.vpip,
      pfr: f.pfr,
      allIn: f.allIn,
      raises: f.raises,
      showdown: showdown && !s.folded,
      folded: s.folded,
    };
  }
  const result: HandResult = {
    handNo: st.handNo,
    pot,
    players,
    winners: Object.keys(won).filter((k) => won[k] > 0),
  };
  resetHand(st);
  st.button = nextIdx(st.seats, st.button, eligibleForHand);
  if (st.button < 0) st.button = 0;
  return result;
}

function resetHand(st: RoomState) {
  for (const s of st.seats) {
    s.bet = 0;
    s.committed = 0;
    s.folded = false;
    s.allIn = false;
    s.acted = false;
    s.inHand = false;
  }
  st.street = 'idle';
  st.turn = -1;
  st.pot = 0;
  st.currentBet = 0;
  st.sbIdx = -1;
  st.bbIdx = -1;
  st.flags = {};
  st.startStacks = {};
  st.runout = false;
}

// ---------- oyuncu aksiyonları ----------
function playerAction(st: RoomState, settings: RoomSettings, a: Exclude<Action, { type: 'start' | 'resolve' | 'cancelHand' | 'setButton' }>, events: EngineEvent[]) {
  if (!['preflop', 'flop', 'turn', 'river'].includes(st.street)) throw new EngineError('Şu an bahis turu yok');
  if (a.seat !== st.turn) throw new EngineError('Sıra bu oyuncuda değil');
  const s = st.seats[a.seat];
  if (!s || !canAct(s)) throw new EngineError('Bu oyuncu aksiyon alamaz');
  const f = flagsOf(st, s.memberId);
  const pre = st.street === 'preflop';
  const ev = (kind: EngineEvent['kind'], amount: number, text: string) =>
    events.push({ kind, memberId: s.memberId, name: s.name, amount, text });

  let type = a.type;
  let to = a.type === 'raise' ? Math.floor(a.to) : 0;
  if (type === 'allin') {
    const max = s.stack + s.bet;
    if (max > st.currentBet && canRaise(st, a.seat)) {
      type = 'raise';
      to = max;
    } else type = 'call';
  }

  switch (type) {
    case 'fold':
      s.folded = true;
      s.acted = true;
      ev('fold', 0, `${s.name} pas`);
      break;
    case 'check':
      if (s.bet < st.currentBet) throw new EngineError('Check yapılamaz, önünde bet var');
      s.acted = true;
      ev('check', 0, `${s.name} check`);
      break;
    case 'call': {
      const need = st.currentBet - s.bet;
      if (need <= 0) throw new EngineError('Çağıracak bet yok');
      const paid = put(st, a.seat, need);
      s.acted = true;
      if (pre) f.vpip = true;
      f.calls++;
      if (s.allIn) ev('allin', s.bet, `${s.name} ALL-IN (call ${s.bet})`);
      else ev('call', paid, `${s.name} call ${paid}`);
      break;
    }
    case 'raise': {
      if (!canRaise(st, a.seat)) throw new EngineError('Bu durumda raise yapılamaz');
      const max = s.stack + s.bet;
      if (to > max) throw new EngineError('Yeterli çip yok');
      if (to <= st.currentBet) throw new EngineError('Raise mevcut betten büyük olmalı');
      const min = minRaiseTo(st, a.seat, settings);
      if (to < min && to !== max) throw new EngineError(`En az ${min} olmalı`);
      const wasBet = st.currentBet === 0;
      const size = to - st.currentBet;
      if (size >= st.minRaise || wasBet) {
        st.minRaise = Math.max(size, settings.bb, 1);
        st.seats.forEach((o, j) => {
          if (j !== a.seat && canAct(o)) o.acted = false;
        });
      }
      put(st, a.seat, to - s.bet);
      st.currentBet = to;
      s.acted = true;
      if (pre) {
        f.vpip = true;
        f.pfr = true;
      }
      f.raises++;
      if (s.allIn) ev('allin', to, `${s.name} ALL-IN ${to}!`);
      else if (wasBet) ev('bet', to, `${s.name} bet ${to}`);
      else ev('raise', to, `${s.name} raise → ${to}`);
      break;
    }
  }
  return progress(st, settings, a.seat, events);
}

function resolve(st: RoomState, winners: string[][], events: EngineEvent[]): HandResult {
  if (st.street !== 'showdown') throw new EngineError('Showdown değil');
  const pots = computePots(st);
  const won: Record<string, number> = {};
  const order = (ids: string[]) => {
    // dealer'ın solundan başlayarak sırala (artık çip için)
    const n = st.seats.length;
    const pos = (id: string) => {
      const i = st.seats.findIndex((s) => s.memberId === id);
      return (i - st.button - 1 + n * 2) % n;
    };
    return [...ids].sort((a, b) => pos(a) - pos(b));
  };
  pots.forEach((p, k) => {
    let ws = p.eligible.length === 1 ? p.eligible : (winners[k] ?? []).filter((w) => p.eligible.includes(w));
    if (!ws.length) throw new EngineError(`Pot ${k + 1} için kazanan seçilmedi`);
    ws = order([...new Set(ws)]);
    const share = Math.floor(p.amount / ws.length);
    let rem = p.amount - share * ws.length;
    for (const w of ws) {
      const amt = share + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      won[w] = (won[w] ?? 0) + amt;
    }
  });
  for (const s of st.seats) {
    if (won[s.memberId]) s.stack += won[s.memberId];
  }
  for (const [id, amt] of Object.entries(won)) {
    const s = st.seats.find((x) => x.memberId === id)!;
    const net = amt - s.committed;
    // potu geri alan (iade) değil, gerçekten kazananı duyur
    events.push({
      kind: 'win',
      memberId: id,
      name: s.name,
      amount: amt,
      text: net > 0 ? `${s.name} kazandı: +${net} (pot ${amt})` : `${s.name} ${amt} geri aldı`,
    });
  }
  return finishHand(st, won, true);
}

function cancelHand(st: RoomState, events: EngineEvent[]) {
  if (st.street === 'idle') throw new EngineError('Devam eden el yok');
  for (const s of st.seats) s.stack += s.committed;
  const no = st.handNo;
  resetHand(st);
  st.handNo = Math.max(0, no - 1);
  events.push({ kind: 'info', memberId: '', name: '', amount: 0, text: `El #${no} iptal edildi, çipler iade edildi` });
}

export function apply(state: RoomState, settings: RoomSettings, action: Action): EngineResult {
  const st = clone(state);
  const events: EngineEvent[] = [];
  let hand: HandResult | undefined;
  const before = tableChips(st);
  switch (action.type) {
    case 'start':
      hand = startHand(st, settings, events);
      break;
    case 'resolve':
      hand = resolve(st, action.winners, events);
      break;
    case 'cancelHand':
      cancelHand(st, events);
      break;
    case 'setButton':
      if (st.street !== 'idle') throw new EngineError('Dealer sadece el arasında değişir');
      if (!st.seats[action.seat]) throw new EngineError('Koltuk yok');
      st.button = action.seat;
      break;
    default:
      hand = playerAction(st, settings, action, events);
  }
  if (tableChips(st) !== before) throw new EngineError('Çip muhasebesi tutmadı (iç hata)');
  return { state: st, events, hand };
}

// ---------- koltuk yönetimi (el arasında) ----------
export function addSeat(state: RoomState, seat: Omit<Seat, 'bet' | 'committed' | 'inHand' | 'folded' | 'allIn' | 'acted'>): RoomState {
  const st = clone(state);
  if (st.seats.some((s) => s.memberId === seat.memberId)) throw new EngineError('Zaten masada');
  st.seats.push({ ...seat, bet: 0, committed: 0, inHand: false, folded: false, allIn: false, acted: false });
  return st;
}

export function removeSeat(state: RoomState, idx: number): RoomState {
  const st = clone(state);
  const s = st.seats[idx];
  if (!s) throw new EngineError('Koltuk yok');
  if (s.inHand && st.street !== 'idle') throw new EngineError('Oyuncu elde; el bitince kalkabilir');
  if (st.street !== 'idle') {
    // el devam ederken indeksleri kaydırmak yerine sadece el arasında izin ver
    throw new EngineError('Masadan kalkmak için elin bitmesini bekleyin');
  }
  st.seats.splice(idx, 1);
  const n = st.seats.length;
  if (idx < st.button) st.button--;
  if (n === 0) st.button = 0;
  else st.button = ((st.button % n) + n) % n;
  return st;
}

export function moveSeat(state: RoomState, idx: number, dir: -1 | 1): RoomState {
  const st = clone(state);
  if (st.street !== 'idle') throw new EngineError('Sıra sadece el arasında değişir');
  const j = idx + dir;
  if (j < 0 || j >= st.seats.length) return st;
  [st.seats[idx], st.seats[j]] = [st.seats[j], st.seats[idx]];
  if (st.button === idx) st.button = j;
  else if (st.button === j) st.button = idx;
  return st;
}
