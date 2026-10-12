// ============================================================
// Veri modeli
// ------------------------------------------------------------
// groups/{g}                      Group
// groups/{g}/members/{m}          Member   (genel çip havuzu bakiyesi burada)
// groups/{g}/rooms/{r}            Room     (o oyunun kendi çip hesabı + canlı el durumu)
// groups/{g}/hands/{h}            HandRecord (istatistik için her elin özeti)
// groups/{g}/ledger/{l}           LedgerEntry (havuz hareketleri)
// ============================================================

export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface GroupDefaults {
  sb: number;
  bb: number;
  ante: number;
  startingStack: number;
}

export interface Group {
  id: string;
  name: string;
  emoji: string;
  createdAt: number;
  createdBy: string;
  /** Yeni üyeye havuzdan verilen başlangıç çipi */
  startingBalance: number;
  /** Opsiyonel: 1 çip = kaç para (0 = kapalı) */
  chipValue: number;
  currency: string;
  defaults: GroupDefaults;
}

export interface Member {
  id: string;
  name: string;
  color: string;
  emoji: string;
  /** Genel havuzdaki serbest bakiye (masadaki çipler hariç) */
  balance: number;
  /** Havuza bugüne kadar konan toplam (başlangıç + yüklemeler) */
  deposited: number;
  pinHash: string;
  createdAt: number;
  archived: boolean;
}

export interface Seat {
  memberId: string;
  name: string;
  color: string;
  emoji: string;
  stack: number;
  /** Bu sokaktaki bet */
  bet: number;
  /** Bu elde toplam koyduğu (ante + tüm sokaklar) */
  committed: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  sittingOut: boolean;
}

export interface HandFlags {
  vpip: boolean;
  pfr: boolean;
  allIn: boolean;
  raises: number;
  calls: number;
}

export interface Pot {
  amount: number;
  eligible: string[]; // memberId
}

export interface RoomState {
  seats: Seat[];
  street: Street;
  handNo: number;
  /** Bu elin / sıradaki elin dealer'ı (seats index) */
  button: number;
  sbIdx: number;
  bbIdx: number;
  turn: number;
  currentBet: number;
  minRaise: number;
  /** Önceki sokaklardan toplanan */
  pot: number;
  flags: Record<string, HandFlags>;
  /** Elin başındaki stack'ler (istatistik) */
  startStacks: Record<string, number>;
  /** Herkes all-in olduğu için kalan kartlar açılıyor */
  runout: boolean;
}

export interface RoomSettings {
  sb: number;
  bb: number;
  ante: number;
  startingStack: number;
  maxSeats: number;
}

export type EventKind =
  | 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'
  | 'blinds' | 'street' | 'win' | 'join' | 'leave' | 'rebuy' | 'info' | 'undo' | 'showdown';

export interface RoomEvent {
  id: string;
  kind: EventKind;
  memberId: string;
  name: string;
  amount: number;
  text: string;
  at: number;
}

export interface RoomLedgerRow {
  name: string;
  buyIn: number;
  cashOut: number;
}

export interface Room {
  id: string;
  name: string;
  createdAt: number;
  createdBy: string;
  hostUid: string;
  status: 'open' | 'closed';
  /** YYYY-MM-DD (oyun günü) */
  date: string;
  settings: RoomSettings;
  state: RoomState;
  log: RoomEvent[];
  undo: string[];
  ledger: Record<string, RoomLedgerRow>;
  version: number;
  closedAt: number;
}

export interface HandPlayer {
  name: string;
  invested: number;
  won: number;
  vpip: boolean;
  pfr: boolean;
  allIn: boolean;
  raises: number;
  showdown: boolean;
  folded: boolean;
}

export interface HandRecord {
  id: string;
  roomId: string;
  roomName: string;
  date: string;
  handNo: number;
  at: number;
  pot: number;
  players: Record<string, HandPlayer>;
  winners: string[];
}

export type LedgerType = 'grant' | 'deposit' | 'buyin' | 'cashout' | 'adjust';

export interface LedgerEntry {
  id: string;
  memberId: string;
  type: LedgerType;
  /** Bakiyeye etkisi (işaretli) */
  amount: number;
  balanceAfter: number;
  roomId: string;
  note: string;
  at: number;
}
