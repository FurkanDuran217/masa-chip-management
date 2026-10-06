export type Currency = 'TRY' | 'USD' | 'EUR' | 'GBP' | 'CHF'

export type PlayerStatus = 'playing' | 'sitout' | 'out' | 'cashedout'

export interface Player {
  id: string
  name: string
  seat: number
  stack: number
  /** bu sıradaki masaya koyduğu çip (önündeki yığın) */
  bet: number
  /** bu elde toplam masaya koyduğu çip */
  invested: number
  status: PlayerStatus
  allIn: boolean
  folded: boolean
  /** masaya toplam girdiği çip (rebuy dahil) */
  buyInTotal: number
  /** masadan çıkarken aldığı çip */
  cashOutTotal: number
  rebuys: number
}

export type LogKind =
  | 'setup'
  | 'hand'
  | 'bet'
  | 'return'
  | 'fold'
  | 'win'
  | 'split'
  | 'rebuy'
  | 'cashout'
  | 'info'
  | 'undo'

export interface LogEntry {
  id: string
  t: number
  kind: LogKind
  text: string
  amount?: number
  seat?: number
}

export interface BlindLevel {
  sb: number
  bb: number
}

export interface Table {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  currency: Currency
  /** 1 çip kaç para? */
  chipValue: number
  maxPlayers: number
  /** standart giriş (çip) */
  buyIn: number
  sb: number
  bb: number
  ante: number
  /** kullanılabilir çip ayarları (küçükten büyüğe) */
  denoms: number[]
  players: Player[]
  buttonSeat: number
  currentSeat: number
  /** aktif elde küçük/büyük kör oturan koltuk */
  sbSeat: number | null
  bbSeat: number | null
  handNumber: number
  handActive: boolean
  blindLevels: BlindLevel[]
  handsPerLevel: number
  blindLevel: number
  /** notlar */
  note: string
  log: LogEntry[]
}

export interface PotSlice {
  index: number
  amount: number
  eligible: string[]
  label: string
}

export interface AppState {
  version: number
  tables: Table[]
  activeTableId: string | null
  /** tableId -> geri alma yığını */
  undo: Record<string, Table[]>
}