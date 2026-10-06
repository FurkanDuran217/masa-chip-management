import type { Currency, Player, PotSlice, Table } from './types'

export const CURRENCY_LABEL: Record<Currency, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
  CHF: 'CHF',
}

const nf = new Map<string, Intl.NumberFormat>()

function fmt(locale: string, opts: Intl.NumberFormatOptions) {
  const key = locale + JSON.stringify(opts)
  let f = nf.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, opts)
    nf.set(key, f)
  }
  return f
}

/** 12500 -> "12.500" */
export function chips(n: number): string {
  return fmt('tr-TR', { maximumFractionDigits: 2 }).format(n)
}

/** 12500 -> "12.500 ₺" */
export function money(n: number, currency: Currency): string {
  const s = fmt('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)
  const sign = CURRENCY_LABEL[currency]
  return currency === 'TRY' ? `${s} ${sign}` : `${sign}${s}`
}

/** "12.5K" / "1.25M" gibi kısa çip etiketi (yerleşimlerde) */
export function shortChips(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return trim(n / 1_000_000) + 'M'
  if (abs >= 10_000) return trim(n / 1000) + 'K'
  if (abs >= 1_000) return chips(n)
  return chips(n)
}

function trim(n: number): string {
  const r = Math.round(n * 10) / 10
  return chips(r)
}

/** ayarlanan para birimine göre çipin parasal karşılığı */
export function toMoney(nChips: number, t: Pick<Table, 'chipValue' | 'currency'>): string {
  return money(nChips * t.chipValue, t.currency)
}

/** çip değerini okunur string'den çevir (tr/en parse) */
export function parseNum(input: string): number {
  const cleaned = input.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number.parseFloat(cleaned)
  return Number.isFinite(n) ? n : 0
}

export interface ChipPart {
  value: number
  count: number
}

/** tutarı çip ayarlarına göre parçalarına ayır */
export function decompose(amount: number, denoms: number[]): ChipPart[] {
  let left = Math.round(amount)
  const sorted = [...denoms].filter((d) => d > 0).sort((a, b) => b - a)
  const out: ChipPart[] = []
  for (const d of sorted) {
    if (d > left) continue
    const count = Math.floor(left / d)
    if (count > 0) {
      out.push({ value: d, count })
      left -= count * d
    }
  }
  if (left > 0 && sorted.length > 0) {
    out.push({ value: left, count: 1 })
  }
  return out
}

export function totalInPlay(p: Player): number {
  return p.stack + p.invested
}

export function tableTotalInPlay(t: Table): number {
  return t.players.reduce((s, p) => s + totalInPlay(p), 0)
}

export function totalCommitted(t: Table): number {
  return t.players.reduce((s, p) => s + p.invested, 0)
}

export function potAmount(t: Table): number {
  return totalCommitted(t)
}

export function currentMaxBet(t: Table): number {
  return t.players.reduce((m, p) => Math.max(m, p.folded ? 0 : p.bet), 0)
}

export function toCall(p: Player, maxBet: number): number {
  return Math.max(0, maxBet - p.bet)
}

/**
 * Ana pot + yan potlar (all-in doğru hesaplanır)
 * - Katman sınırları MASADAKİ TÜM yatırımlardan üretilir, böylece pas geçmiş bir
 *   oyuncunun fazla çipi de potun içinde kalır (çağrılmamış bahis iadesi gibi).
 * - Uygunluk (eligibility) yalnızca pas geçmemiş oyuncuları içerir.
 * - Katman katkısı max(0, min(invested, üst) - alt); aksi halde düşük yatırımlı
 *   oyuncular katman tutarını eksiye düşürür ve çip kaybolurdu.
 * - Hak edenleri aynı olan ardışık katmanlar tek potta birleştirilir.
 */
export function computePots(players: Player[]): PotSlice[] {
  const committed = players.filter((p) => p.invested > 0)
  if (committed.length === 0) return []

  const levels = [...new Set(committed.map((p) => p.invested))].sort((a, b) => a - b)
  const raw: PotSlice[] = []
  let prevLevel = 0

  for (const level of levels) {
    let amount = 0
    for (const p of committed) amount += Math.max(0, Math.min(p.invested, level) - prevLevel)
    if (amount > 0) {
      const eligible = committed.filter((p) => p.invested >= level && !p.folded).map((p) => p.id)
      raw.push({ index: raw.length, amount, eligible, label: '' })
    }
    prevLevel = level
  }

  if (raw.length === 0) return []

  // aynı hak edenlere sahip katmanları birleştir
  const merged: PotSlice[] = []
  for (const pot of raw) {
    const last = merged[merged.length - 1]
    if (last && sameSet(last.eligible, pot.eligible)) {
      last.amount += pot.amount
    } else {
      merged.push({ ...pot })
    }
  }
  return merged.map((p, i) => ({ ...p, index: i, label: i === 0 ? 'Ana Pot' : `Yan Pot ${i}` }))
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((x) => set.has(x))
}

/** oyuncu net kârı: eldeki + masadaki çip - girdiği çip */
export function netOf(p: Player): number {
  return p.stack + p.invested + p.cashOutTotal - p.buyInTotal
}

/** masada oturan koltuklar: 'sitout' hâlâ koltuktadır, 'out'/'cashedout' değil */
export function occupiedSeats(t: Table): number[] {
  return t.players.filter((p) => p.status !== 'out' && p.status !== 'cashedout').map((p) => p.seat)
}

export function playerAt(t: Table, seat: number): Player | undefined {
  return t.players.find((p) => p.seat === seat)
}

/**
 * Verilen koltuktan yönde, dolu ilk koltuğu bul (dairesel).
 * `requireChips` ile kör/ilk hamle aranırken çipi kalmayanlar atlanır
 * (aksi halde 0 çipli oyuncu körü yutar ve kimse kör alamaz).
 */
export function nextOccupied(t: Table, from: number, step = 1, requireChips = false): number {
  const n = Math.max(2, t.maxPlayers)
  for (let i = 1; i <= n; i++) {
    const seat = (((from + step * i) % n) + n) % n
    const p = playerAt(t, seat)
    if (p && p.status !== 'out' && p.status !== 'cashedout' && (!requireChips || p.stack > 0)) return seat
  }
  return -1
}

export function activeSeats(t: Table): number[] {
  return t.players
    .filter((p) => p.status === 'playing' && !p.folded && p.stack + p.bet > 0)
    .map((p) => p.seat)
    .sort((a, b) => a - b)
}

/**
 * Sıradaki oyuncu (oyunda, çipi olan, pas geçmemiş).
 * `from` koltuğu daima atlanır: aksi halde sıra kendi üstünde kilitlenirdi.
 * Boş koltuklar atlandığı için koltuk numarası boşlukları sorun değildir.
 */
export function nextToAct(t: Table, from: number, step = 1): number {
  const live = activeSeats(t)
  if (live.length === 0) return -1
  const n = Math.max(2, t.maxPlayers)
  for (let i = 1; i <= n; i++) {
    const seat = (((from + step * i) % n) + n) % n
    if (live.includes(seat)) return seat
  }
  return -1
}

const AVATAR_COLORS = [
  '#f43f5e',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
  '#6366f1',
  '#a855f7',
  '#ec4899',
  '#84cc16',
]

export function avatarColor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('tr-TR')
  return (parts[0][0] + parts[1][0]).toLocaleUpperCase('tr-TR')
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}