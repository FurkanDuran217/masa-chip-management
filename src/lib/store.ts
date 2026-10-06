import type { AppState, BlindLevel, Currency, LogEntry, LogKind, Player, PlayerStatus, Table } from './types'
import { applyTableAction, createTable, defaultBlindLevels, type NewTableInput, type TableAction } from './table'

export const STORAGE_KEY = 'masa.chip.v1'
export const STATE_VERSION = 1
/** kaydetme gecikmesi (ms) — yazma sırasını toparlar */
export const SAVE_DEBOUNCE_MS = 220
const UNDO_LIMIT = 100
const UNDO_LIMIT_MIN = 5

/** dosya / paylaşım kutusu biçimi */
export const EXPORT_TYPE = 'masa-table'
const EXPORT_VERSION = 1
const SHARE_VERSION = 1
/** URL hash içinde taşınan masanın öneki (App.tsx ve TablesModal.tsx bunu kullanır) */
export const SHARE_HASH_KEY = '#masa='

/**
 * Her giriş noktasının (localStorage, dosya içe aktarma, paylaşım linki) dayandığı
 * üst sınırlar. "Sane" aralıklar buradan gelir; limitler oyunun kendi limitleriyle
 * (12 koltuk, 250 kayıt) aynı değerdedir ki kendi kaydettiğimiz dosyalar reddedilmesin.
 */
export const LIMITS = {
  /** saklanabilecek masa sayısı */
  MAX_TABLES: 100,
  /** oyuncu / koltuk üst sınırı (createTable ve addPlayer da 12 ile sınırlı) */
  MAX_PLAYERS: 12,
  MIN_PLAYERS: 2,
  /** tablo başına log kaydı (table.ts withLog da 250 ile sınırlı) */
  MAX_LOG: 250,
  /** tek seferde içe aktarılabilecek masa */
  MAX_IMPORT_TABLES: 20,
  /** çip ayarı değeri */
  MAX_DENOMS: 64,
  /** kör merdiveni basamağı */
  MAX_BLIND_LEVELS: 64,
  /** içe aktarma metni karakter sınırı */
  MAX_IMPORT_CHARS: 1_500_000,
  /** JSON iç içe geçme derinliği (masalarımız ~4) */
  MAX_JSON_DEPTH: 12,
  /** içe aktarılan tabloda kabul edilen ham log/oyuncu sayısı */
  MAX_IMPORT_PLAYERS: 12,
  MAX_IMPORT_LOG: 1000,
  /** paylaşım linki: kodlanmış yükün bayt cinsinden üst sınırı */
  MAX_SHARE_BYTES: 96 * 1024,
  /** tek seferde yazılacak ham metin sınırı (localStorage ~5 MB) */
  MAX_SAVE_CHARS: 4_000_000,
  /** güvenli tam sayı aralıkları */
  MAX_CHIPS: 1_000_000_000,
  MAX_HANDS: 1_000_000_000,
  MAX_HANDS_PER_LEVEL: 100_000,
  MAX_TIME: 8.64e15,
  /** metin alanları */
  MAX_NAME: 80,
  MAX_NOTE: 4000,
  MAX_LOG_TEXT: 500,
  /** nesne kimliği */
  MAX_ID: 128,
  /** base64'te tek seferde dönüştürülen bayt dilimi (stack taşmasını önler) */
  BASE64_CHUNK: 8192,
} as const

export const emptyState: AppState = { version: STATE_VERSION, tables: [], activeTableId: null, undo: {} }

export type RootAction =
  | { type: 'hydrate'; state: AppState }
  | { type: 'createTable'; input?: NewTableInput; activate?: boolean }
  | { type: 'deleteTable'; id: string }
  | { type: 'setActive'; id: string }
  | { type: 'renameTable'; id: string; name: string }
  | { type: 'duplicateTable'; id: string }
  | { type: 'tableAction'; id: string; action: TableAction }
  | { type: 'undo'; id: string }
  | { type: 'importTables'; tables: Table[] }
  | { type: 'replaceAll'; state: AppState }

const NON_UNDOABLE = new Set<string>(['clearLog'])

/** geri alma yığını ve tablo sayısı birlikte büyürse ikisini de kırp */
const MAX_TOTAL_UNDO = UNDO_LIMIT * LIMITS.MAX_TABLES

export function rootReducer(state: AppState, action: RootAction): AppState {
  switch (action.type) {
    case 'hydrate':
    case 'replaceAll':
      return sanitizeState(action.state)

    case 'createTable': {
      const table = createTable(action.input)
      const tables = [...state.tables, table].slice(-LIMITS.MAX_TABLES)
      return {
        ...state,
        tables,
        activeTableId: action.activate === false ? state.activeTableId : table.id,
        undo: { ...state.undo },
      }
    }

    case 'deleteTable': {
      const tables = state.tables.filter((t) => t.id !== action.id)
      const undo = { ...state.undo }
      // silinen masanın geri alma geçmişi de temizlenir
      delete undo[action.id]
      const activeTableId =
        state.activeTableId === action.id ? (tables[0]?.id ?? null) : state.activeTableId
      const nextActive = tables.some((t) => t.id === activeTableId) ? activeTableId : (tables[0]?.id ?? null)
      return { ...state, tables, activeTableId: nextActive, undo }
    }

    case 'setActive':
      return { ...state, activeTableId: action.id }

    case 'renameTable':
      return {
        ...state,
        tables: state.tables.map((t) =>
          t.id === action.id ? { ...t, name: safeName(action.name, t.name), updatedAt: Date.now() } : t,
        ),
      }

    case 'duplicateTable': {
      const src = state.tables.find((t) => t.id === action.id)
      if (!src) return state
      // yeni masa ve yeni oyuncu id'leri (React key / activeTableId çakışması olmasın)
      const copy = reidentify(src, {
        freshTableId: true,
        freshPlayerIds: true,
        used: new Set(state.tables.map((t) => t.id)),
      })
      copy.name = `${src.name} (kopya)`
      copy.createdAt = Date.now()
      copy.updatedAt = Date.now()
      copy.log = []
      const tables = [...state.tables, copy].slice(-LIMITS.MAX_TABLES)
      const undo = { ...state.undo }
      // yeni id için eski bir yığın kalmasın
      delete undo[copy.id]
      return {
        ...state,
        tables,
        activeTableId: tables.includes(copy) ? copy.id : (tables[0]?.id ?? null),
        undo,
      }
    }

    case 'tableAction': {
      const idx = state.tables.findIndex((t) => t.id === action.id)
      if (idx === -1) return state
      const prev = state.tables[idx]
      const next = safeApply(prev, action.action)
      if (next === prev) return state
      const tables = [...state.tables]
      tables[idx] = next
      const undo = { ...state.undo }
      if (!NON_UNDOABLE.has(action.action.type)) {
        undo[action.id] = pushUndo(undo[action.id], prev)
      }
      return { ...state, tables, undo }
    }

    case 'undo': {
      const stack = state.undo[action.id]
      if (!stack || stack.length === 0) return state
      const prev = stack[stack.length - 1]
      const tables = state.tables.map((t) => (t.id === action.id ? prev : t))
      const undo = { ...state.undo }
      undo[action.id] = stack.slice(0, -1)
      return { ...state, tables, undo }
    }

    case 'importTables': {
      if (!Array.isArray(action.tables) || action.tables.length === 0) return state
      const used = new Set(state.tables.map((t) => t.id))
      const room = Math.max(0, LIMITS.MAX_TABLES - state.tables.length)
      const added = action.tables
        .slice(0, room)
        // id çakışmasını reducer seviyesinde de engelle (parseImport zaten yeni id verir)
        .map((t) => reidentify(t, { used }))
      if (added.length === 0) return state
      const tables = [...state.tables, ...added]
      const last = added[added.length - 1]
      return {
        ...state,
        tables,
        // içe aktarılan son masayı aç
        activeTableId: tables.includes(last) ? last.id : state.activeTableId,
        undo: { ...state.undo },
      }
    }

    default:
      return state
  }
}

// ------------------------------------------------------------------- reducer yardımcıları

/**
 * Masanın (ve istenirse oyuncuların) kimliklerini tazeler.
 * `fresh*` bayrakları kimliği her koşulda yeniler; aksi halde yalnızca
 * eksik/çakışan kimlikler yenilenir. `used` kümesindeki kimliklere asla çarpmaz.
 */
function reidentify(
  t: Table,
  opts: { freshTableId?: boolean; freshPlayerIds?: boolean; used?: Set<string> },
): Table {
  const copy = structuredClone(t)
  const used = opts.used ?? new Set<string>()
  if (opts.freshTableId || typeof copy.id !== 'string' || !copy.id || used.has(copy.id)) {
    do {
      copy.id = newId('t')
    } while (used.has(copy.id))
  }
  used.add(copy.id)
  const pids = new Set<string>()
  for (const p of copy.players) {
    if (opts.freshPlayerIds || typeof p.id !== 'string' || !p.id || pids.has(p.id)) {
      do {
        p.id = newId('p')
      } while (pids.has(p.id))
    }
    pids.add(p.id)
  }
  return copy
}

/** bir reducer hatası tüm uygulamayı düşürmemeli */
function safeApply(prev: Table, action: TableAction): Table {
  try {
    return applyTableAction(prev, action)
  } catch {
    return prev
  }
}

function pushUndo(stack: Table[] | undefined, prev: Table): Table[] {
  const next = [...(stack ?? []), prev]
  const room = Math.min(UNDO_LIMIT, Math.max(UNDO_LIMIT_MIN, MAX_TOTAL_UNDO - next.length))
  return next.length > room ? next.slice(-room) : next
}

function safeName(raw: string, fallback: string): string {
  if (typeof raw !== 'string') return fallback
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, LIMITS.MAX_NAME)
  return s || fallback
}

// ------------------------------------------------------------------- kimlik üretimi

let idSeq = 0

/** aynı milisaniyede üretilen id'lerin de çakışmaması için sayaç */
function newId(prefix: string): string {
  idSeq = (idSeq + 1) % 1_000_000
  return `${prefix}_${Date.now().toString(36)}${idSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

// ------------------------------------------------------------------- sürüm / göç

/**
 * Kaydedilmiş veri sürümleri arasındaki yükseltme zinciri.
 * Anahtar = depoda yazan sürüm, değer = bir sonraki sürümün şemasına taşıyan adım.
 *
 * Yeni bir alan eklendiğinde: STATE_VERSION'ı 1 artır ve buraya `<eski sürüm>: migrateX`
 * biçiminde bir adım ekle. Adım girdiyi değiştirmeden yeni şemayı üretmeli; alan
 * doğrulamasının kalanı `sanitizeTable` içinde yapılır (burada da olabilir).
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // v0 -> v1: sürüm alanı olmayan çok eski yedekler (alan adları farklıydı)
  0: (raw) => ({ ...raw, version: 1, tables: legacyTables(raw) }),
}

const MAX_MIGRATION_STEPS = 16

/** v0: sürüm alanı yok; eski alan adları yeni adlara eşlenir */
function legacyTables(raw: Record<string, unknown>): unknown[] {
  const list = Array.isArray(raw.tables) ? raw.tables : []
  return list.map((t) => {
    const o = asRecord(t)
    if (!o) return t
    const next: Record<string, unknown> = { ...o }
    if (typeof next.sb !== 'number' && typeof next.smallBlind === 'number') next.sb = next.smallBlind
    if (typeof next.bb !== 'number' && typeof next.bigBlind === 'number') next.bb = next.bigBlind
    if (typeof next.maxPlayers !== 'number' && typeof next.maxSeats === 'number') next.maxPlayers = next.maxSeats
    if (typeof next.createdAt !== 'number' && typeof next.created === 'number') next.createdAt = next.created
    if (!Array.isArray(next.log) && Array.isArray(next.logs)) next.log = next.logs
    if (!Array.isArray(next.players) && Array.isArray(next.seats)) {
      next.players = next.seats.map((s, i) => (typeof s === 'string' ? { name: s, seat: i } : { ...asRecord(s), seat: i }))
    }
    if (Array.isArray(next.players)) {
      next.players = next.players.map((p, i) => {
        const po = asRecord(p)
        if (!po) return p
        const out: Record<string, unknown> = { ...po }
        if (typeof out.seat !== 'number' && typeof out.position === 'number') out.seat = out.position
        if (typeof out.seat !== 'number') out.seat = i
        if (typeof out.stack !== 'number' && typeof out.chips === 'number') out.stack = out.chips
        return out
      })
    }
    return next
  })
}

function readVersion(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v)
  if (typeof v === 'string' && /^\d{1,4}$/.test(v.trim())) return Number.parseInt(v.trim(), 10)
  // sürüm alanı yoksa/bozuksa en eski şema varsayılır
  return 0
}

/** eski şemayı yükseltir, sonra toplu olarak onarır; asla fırlatmaz */
export function migrateState(raw: unknown): AppState {
  let current: unknown = raw
  let version = readVersion(asRecord(current)?.version)
  let steps = 0
  while (version < STATE_VERSION && steps < MAX_MIGRATION_STEPS) {
    steps++
    const step = MIGRATIONS[version]
    if (!step) break
    current = step(asRecord(current) ?? {})
    const next = readVersion(asRecord(current)?.version)
    version = next > version ? next : version + 1
  }
  // version > STATE_VERSION ise (yeni sürümden eski uygulamaya) en iyi çaba: onar ve kullan
  return sanitizeState(current)
}

export function loadState(): AppState {
  if (typeof localStorage === 'undefined') return { ...emptyState }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...emptyState }
    return migrateState(JSON.parse(raw))
  } catch {
    return { ...emptyState }
  }
}

// ------------------------------------------------------------------- temizleme / onarma

type JsonObject = Record<string, unknown>

function asRecord(v: unknown): JsonObject | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as JsonObject) : null
}

function isObject(v: unknown): v is JsonObject {
  return asRecord(v) !== null
}

const CURRENCIES: readonly Currency[] = ['TRY', 'USD', 'EUR', 'GBP', 'CHF']
const STATUSES: readonly PlayerStatus[] = ['playing', 'sitout', 'out', 'cashedout']
const LOG_KINDS: readonly LogKind[] = [
  'setup', 'hand', 'bet', 'return', 'fold', 'win', 'split', 'rebuy', 'cashout', 'info', 'undo',
]

/** sonlu tam sayı, [min, max] aralığında; değer bozuksa fallback */
function intOf(v: unknown, min: number, max: number, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  const n = Math.round(v)
  return Math.min(max, Math.max(min, n))
}

/** çip miktarı: sonlu, tam, 0 <= n <= LIMITS.MAX_CHIPS */
function chipsOf(v: unknown, fallback: number): number {
  return intOf(v, 0, LIMITS.MAX_CHIPS, Math.min(LIMITS.MAX_CHIPS, Math.max(0, Math.round(fallback))))
}

function boolOf(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function timeOf(v: unknown, fallback: number): number {
  return intOf(v, 1, LIMITS.MAX_TIME, fallback)
}

function nameOf(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback
  const s = v.replace(/\s+/g, ' ').trim().slice(0, LIMITS.MAX_NAME)
  return s || fallback
}

function noteOf(v: unknown): string {
  if (typeof v !== 'string') return ''
  return v.slice(0, LIMITS.MAX_NOTE)
}

/** boşsa varsayılan, çakışırsa yeni kimlik üretir */
function uniqueId(v: unknown, used: Set<string>, prefix: string): string {
  const s = typeof v === 'string' && v.length > 0 && v.length <= LIMITS.MAX_ID ? v : newId(prefix)
  if (used.has(s)) {
    const fresh = newId(prefix)
    used.add(fresh)
    return fresh
  }
  used.add(s)
  return s
}

function arrayOf(v: unknown, cap: number): unknown[] {
  return Array.isArray(v) ? (v.length > cap ? v.slice(0, cap) : v) : []
}

function firstFreeSeat(taken: Set<number>, maxPlayers: number): number {
  for (let i = 0; i < maxPlayers; i++) if (!taken.has(i)) return i
  return -1
}

/** tablo olduğuna dair en az bir tanıtıcı alan arar (tamamen yabancı nesneleri ele) */
function looksLikeTable(o: JsonObject): boolean {
  return typeof o.id === 'string' || typeof o.name === 'string' || Array.isArray(o.players)
}

interface SanitizeTableOpts {
  /** yeni masa + oyuncu kimlikleri üret ve log'u temizle (içe aktarma) */
  imported?: boolean
  /** çakışan kimliklerin toplandığı küme */
  used?: Set<string>
}

/**
 * Her alanı tek tek doğrular/onarır; ne zaman hata fırlatmaz.
 * Tablo değeri tanınmıyorsa null döner (localStorage'da atlanır, içe aktarmada reddedilir).
 */
function sanitizeTable(raw: unknown, opts: SanitizeTableOpts = {}): Table | null {
  const o = asRecord(raw)
  if (!o || !looksLikeTable(o)) return null
  const used = opts.used ?? new Set<string>()
  const now = Date.now()

  const playersRaw = arrayOf(o.players, LIMITS.MAX_PLAYERS)
  const players: Player[] = []
  const seats = new Set<number>()
  const pids = new Set<string>()

  const buyIn = intOf(o.buyIn, 1, LIMITS.MAX_CHIPS, 5000)
  const sb = intOf(o.sb, 0, LIMITS.MAX_CHIPS, 25)
  const bb = Math.max(sb, intOf(o.bb, 0, LIMITS.MAX_CHIPS, sb * 2))
  const maxPlayers = intOf(
    o.maxPlayers,
    LIMITS.MIN_PLAYERS,
    LIMITS.MAX_PLAYERS,
    // koltuk sayısı yoksa oyuncu sayısından türetilir (en az 2, en çok 12)
    Math.min(LIMITS.MAX_PLAYERS, Math.max(LIMITS.MIN_PLAYERS, playersRaw.length || 6)),
  )
  // koltuk sayısı veriden küçükse büyütülür; oyuncu kaybolmaz
  let seats4Max = maxPlayers

  for (const pr of playersRaw) {
    if (players.length >= LIMITS.MAX_PLAYERS) break
    const po = asRecord(pr)
    if (!po) continue
    // koltuk: 0..maxPlayers-1 ve benzersiz; çakışırsa boş koltuğa taşınır
    let seat = intOf(po.seat, -1, seats4Max - 1, -1)
    if (seat < 0 || seats.has(seat)) {
      seat = firstFreeSeat(seats, seats4Max)
      if (seat < 0 && seats4Max < LIMITS.MAX_PLAYERS) {
        seats4Max++
        seat = firstFreeSeat(seats, seats4Max)
      }
      if (seat < 0) continue // 12 koltuk da dolu
    }
    seats.add(seat)
    const stack = chipsOf(po.stack, buyIn)
    const bet = chipsOf(po.bet, 0)
    const invested = Math.max(chipsOf(po.invested, 0), bet)
    players.push({
      id: opts.imported ? newId('p') : uniqueId(po.id, pids, 'p'),
      name: nameOf(po.name, `Oyuncu ${players.length + 1}`),
      seat,
      stack,
      bet,
      invested,
      status: STATUSES.includes(po.status as PlayerStatus) ? (po.status as PlayerStatus) : 'playing',
      // all-in yalnızca yığın bitmişken geçerlidir (table.ts post())
      allIn: boolOf(po.allIn) && stack === 0,
      folded: boolOf(po.folded),
      buyInTotal: chipsOf(po.buyInTotal, stack + invested),
      cashOutTotal: chipsOf(po.cashOutTotal, 0),
      rebuys: intOf(po.rebuys, 0, 100000, 0),
    })
  }
  players.sort((a, b) => a.seat - b.seat)

  const id = opts.imported ? newId('t') : uniqueId(o.id, used, 't')
  const blindLevels = sanitizeLevels(o.blindLevels, sb, bb)
  let handActive = boolOf(o.handActive)
  let buttonSeat = intOf(o.buttonSeat, 0, seats4Max - 1, players[0]?.seat ?? 0)
  let currentSeat = intOf(o.currentSeat, 0, seats4Max - 1, players[0]?.seat ?? 0)
  let sbSeat: number | null = null
  let bbSeat: number | null = null

  if (handActive) {
    // el başlamışken masada oynayacak en az 2 kişi yoksa el kapatılmış sayılır
    const seated = players.filter((p) => p.status !== 'out').length
    if (seated < 2) handActive = false
  }
  if (handActive) {
    sbSeat = intOf(o.sbSeat, 0, seats4Max - 1, buttonSeat)
    bbSeat = intOf(o.bbSeat, 0, seats4Max - 1, (sbSeat + 1) % seats4Max)
  }

  // el dışında masada asılı çip kalmamalı; varsa yığınlara iade edilir (table.ts refundBets)
  if (!handActive) {
    for (const p of players) {
      if (p.invested > 0) p.stack += p.invested
      p.invested = 0
      p.bet = 0
      p.folded = false
      p.allIn = false
    }
    if (!players.some((p) => p.seat === buttonSeat)) buttonSeat = players[0]?.seat ?? 0
    if (!players.some((p) => p.seat === currentSeat)) currentSeat = buttonSeat
  }

  const createdAt = timeOf(o.createdAt, now)
  const table: Table = {
    id,
    name: nameOf(o.name, 'Yeni Masa'),
    createdAt,
    updatedAt: Math.max(createdAt, timeOf(o.updatedAt, now)),
    currency: CURRENCIES.includes(o.currency as Currency) ? (o.currency as Currency) : 'TRY',
    chipValue: moneyValueOf(o.chipValue),
    maxPlayers: seats4Max,
    buyIn,
    sb,
    bb,
    ante: chipsOf(o.ante, 0),
    denoms: sanitizeDenoms(o.denoms),
    players,
    buttonSeat,
    currentSeat,
    sbSeat,
    bbSeat,
    handNumber: intOf(o.handNumber, 0, LIMITS.MAX_HANDS, 0),
    handActive,
    blindLevels,
    handsPerLevel: intOf(o.handsPerLevel, 0, LIMITS.MAX_HANDS_PER_LEVEL, 0),
    blindLevel: intOf(o.blindLevel, 0, blindLevels.length - 1, 0),
    note: noteOf(o.note),
    log: opts.imported ? [] : sanitizeLog(o.log, new Set<string>()),
  }
  return table
}

function moneyValueOf(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return 1
  return Math.min(1e9, Math.round(v * 1e6) / 1e6)
}

function sanitizeDenoms(v: unknown): number[] {
  const uniq = new Set<number>()
  for (const d of arrayOf(v, LIMITS.MAX_DENOMS)) {
    const n = chipsOf(d, 0)
    if (n > 0) uniq.add(n)
  }
  const list = [...uniq].sort((a, b) => a - b)
  return list.length > 0 ? list : [1]
}

function sanitizeLevels(v: unknown, sb: number, bb: number): BlindLevel[] {
  const out: BlindLevel[] = []
  for (const item of arrayOf(v, LIMITS.MAX_BLIND_LEVELS)) {
    const l = asRecord(item)
    if (!l) continue
    const s = intOf(l.sb, 0, LIMITS.MAX_CHIPS, 0)
    // big blind >= small blind
    out.push({ sb: s, bb: Math.max(s, intOf(l.bb, 0, LIMITS.MAX_CHIPS, s)) })
  }
  return out.length > 0 ? out : defaultBlindLevels(sb, bb)
}

function sanitizeLog(v: unknown, used: Set<string>): LogEntry[] {
  const out: LogEntry[] = []
  for (const item of arrayOf(v, LIMITS.MAX_LOG)) {
    const e = asRecord(item)
    if (!e) continue
    const text = typeof e.text === 'string' ? e.text.slice(0, LIMITS.MAX_LOG_TEXT) : ''
    if (!text) continue
    const entry: LogEntry = {
      id: uniqueId(e.id, used, 'l'),
      t: timeOf(e.t, Date.now()),
      kind: LOG_KINDS.includes(e.kind as LogKind) ? (e.kind as LogKind) : 'info',
      text,
    }
    if (typeof e.amount === 'number' && Number.isFinite(e.amount)) {
      entry.amount = intOf(e.amount, -LIMITS.MAX_CHIPS, LIMITS.MAX_CHIPS, 0)
    }
    if (typeof e.seat === 'number' && Number.isFinite(e.seat)) {
      entry.seat = intOf(e.seat, 0, LIMITS.MAX_PLAYERS - 1, 0)
    }
    out.push(entry)
  }
  return out
}

/** tüm uygulama durumunu toplu olarak onarır; asla fırlatmaz */
export function sanitizeState(raw: unknown): AppState {
  const obj = asRecord(raw)
  if (!obj) return { ...emptyState }
  const used = new Set<string>()
  const tables: Table[] = []
  for (const item of arrayOf(obj.tables, LIMITS.MAX_TABLES)) {
    const t = sanitizeTable(item, { used })
    if (t) tables.push(t)
  }
  const wanted = obj.activeTableId
  const activeTableId =
    typeof wanted === 'string' && used.has(wanted) ? wanted : (tables[0]?.id ?? null)
  return { version: STATE_VERSION, tables, activeTableId, undo: {} }
}

// ------------------------------------------------------------------- kalıcılık / hata bildirimi

export type SaveErrorKind = 'kota' | 'erisim' | 'serilestirme'

export interface SaveError {
  kind: SaveErrorKind
  /** kullanıcıya gösterilebilir Türkçe mesaj */
  message: string
  /** düzeltilmişse kaçıncı deneme yazdı */
  trimmed?: boolean
}

type SaveListener = (error: SaveError | null) => void

let saveError: SaveError | null = null
const saveListeners = new Set<SaveListener>()

/**
 * Kaydetme durumunu izler.
 * - başarılı tam yazma: `fn(null)`
 * - başarısız (veya kısaltılarak kurtarılan) yazma: `fn(hata)`
 * Geri çağrı, `localStorage` erişimi olmayan ortamda da tetiklenir.
 * @returns aboneliği bitiren fonksiyon
 */
export function onSaveError(fn: SaveListener): () => void {
  saveListeners.add(fn)
  return () => {
    saveListeners.delete(fn)
  }
}

/** son bilinen kaydetme hatası (başarılı yazmadan sonra null) */
export function getSaveError(): SaveError | null {
  return saveError
}

/** kullanıcı uyarıyı kapatırsa sıfırlar */
export function clearSaveError(): void {
  setSaveError(null)
}

function setSaveError(error: SaveError | null): void {
  saveError = error
  for (const fn of [...saveListeners]) {
    try {
      fn(error)
    } catch {
      /* bildirim hatası yutulur, kaydetme akışını bozmasın */
    }
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** değişiklikleri geciktirilmiş olarak yazar (hata durumunda `onSaveError` tetiklenir) */
export function saveState(state: AppState): void {
  if (typeof localStorage === 'undefined') {
    setSaveError({ kind: 'erisim', message: 'Kaydedilemedi: tarayıcı depolaması kullanılamıyor.' })
    return
  }
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    persist(state)
  }, SAVE_DEBOUNCE_MS)
}

/** kota hâlinde sırayla denenecek kayıt sayıları: tam → kısaltılmış → kayıtsız */
const LOG_TRIM_STEPS: readonly number[] = [LIMITS.MAX_LOG, 60, 0]

function persist(state: AppState): void {
  let payload: AppState
  try {
    payload = { ...state, version: STATE_VERSION, undo: {} }
  } catch {
    setSaveError({ kind: 'serilestirme', message: 'Kaydedilemedi: veri kopyalanamadı.' })
    return
  }

  let lastError: SaveError = {
    kind: 'erisim',
    message: 'Kaydedilemedi: tarayıcı depolamasına erişilemiyor.',
  }

  for (const keep of LOG_TRIM_STEPS) {
    let json: string
    try {
      json = JSON.stringify(trimLogs(payload, keep))
    } catch {
      setSaveError({ kind: 'serilestirme', message: 'Kaydedilemedi: veri okunamadı, biçim bozuk olabilir.' })
      return
    }
    if (json.length > LIMITS.MAX_SAVE_CHARS) {
      lastError = { kind: 'kota', message: 'Kaydedilemedi: veri çok büyük, eski kayıtları silin.' }
      continue
    }
    try {
      localStorage.setItem(STORAGE_KEY, json)
      if (keep < LIMITS.MAX_LOG) {
        // kısaltılarak kurtarıldı: kullanıcı bilgilendirilir ama veri kaybolmadı
        setSaveError({
          kind: 'kota',
          trimmed: true,
          message:
            keep > 0
              ? 'Depolama alanı dolu; eski kayıtlar kısaltılarak kaydedildi.'
              : 'Depolama alanı dolu; kayıtlar olmadan kaydedildi.',
        })
      } else {
        setSaveError(null)
      }
      return
    } catch (err) {
      lastError = isQuotaError(err)
        ? { kind: 'kota', message: 'Kaydedilemedi: tarayıcı depolama alanı doldu. Eski masaları silin veya kayıtları temizleyin.' }
        : { kind: 'erisim', message: 'Kaydedilemedi: tarayıcı depolamasına erişilemiyor.' }
    }
  }

  setSaveError(lastError)
}

/** kota dolduğunda yazılacak küçültülmüş kopya */
function trimLogs(state: AppState, keep: number): AppState {
  if (keep >= LIMITS.MAX_LOG) return state
  return {
    ...state,
    undo: {},
    tables: state.tables.map((t) => (t.log.length > keep ? { ...t, log: t.log.slice(0, keep) } : t)),
  }
}

function isQuotaError(err: unknown): boolean {
  const e = asRecord(err)
  if (!e) return false
  return e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22 || e.code === 1014
}

// ------------------------------------------------------------------- dışa aktarma / içe aktarma

/** masayı indirilebilir/pano yapıştırılabilir JSON dosyasına çevirir */
export function exportTable(t: Table): string {
  try {
    return JSON.stringify({ type: EXPORT_TYPE, version: EXPORT_VERSION, table: t }, null, 2)
  } catch {
    throw new Error('Dışa aktarılamadı: masa verisi okunamadı.')
  }
}

/**
 * JSON (veya ham base64 paylaşım kodu) içeriğinden masaları okur.
 * Yabancı kimlikler atılır: her masaya **yeni id + yeni oyuncu id** verilir, log temizlenir.
 * Geçersiz/çok büyük içerikte Türkçe mesajlı `Error` fırlatır.
 */
export function parseImport(text: string): Table[] {
  if (typeof text !== 'string') throw new Error('Geçersiz içerik: metin bekleniyordu.')
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Boş içerik: içe aktarılacak veri yok.')
  if (trimmed.length > LIMITS.MAX_IMPORT_CHARS) {
    throw new Error(`İçerik çok büyük (en fazla ${LIMITS.MAX_IMPORT_CHARS} karakter olmalı).`)
  }

  let data: unknown
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    data = parseJsonText(trimmed, 'Geçersiz JSON: dosya okunamadı.')
  } else {
    // yapıştırılan metin bir paylaşım kodu (base64) olabilir
    data = parseJsonText(decodeBase64Utf8(trimmed), 'Geçersiz paylaşım kodu: içerik okunamadı.')
  }

  const payloads = extractTablePayloads(data)
  if (payloads.length === 0) throw new Error('Dosyada masa bulunamadı.')
  if (payloads.length > LIMITS.MAX_IMPORT_TABLES) {
    throw new Error(
      `Tek seferde en fazla ${LIMITS.MAX_IMPORT_TABLES} masa içe aktarılabilir (dosyada ${payloads.length} masa var).`,
    )
  }

  const used = new Set<string>()
  return payloads.map((raw, i) => {
    const o = asRecord(raw)
    if (!o) throw new Error(`${i + 1}. madede beklenen alanlar eksik veya bozuk.`)
    if (Array.isArray(o.players) && o.players.length > LIMITS.MAX_IMPORT_PLAYERS) {
      throw new Error(
        `${i + 1}. masada ${o.players.length} oyuncu var; en fazla ${LIMITS.MAX_IMPORT_PLAYERS} oyuncu destekleniyor.`,
      )
    }
    if (Array.isArray(o.log) && o.log.length > LIMITS.MAX_IMPORT_LOG) {
      throw new Error(
        `${i + 1}. masada ${o.log.length} kayıt var; en fazla ${LIMITS.MAX_IMPORT_LOG} kayıt destekleniyor.`,
      )
    }
    if (Array.isArray(o.denoms) && o.denoms.length > LIMITS.MAX_DENOMS) {
      throw new Error(
        `${i + 1}. masada ${o.denoms.length} çip ayarı var; en fazla ${LIMITS.MAX_DENOMS} çip ayarı destekleniyor.`,
      )
    }
    if (Array.isArray(o.blindLevels) && o.blindLevels.length > LIMITS.MAX_BLIND_LEVELS) {
      throw new Error(
        `${i + 1}. masada ${o.blindLevels.length} kör seviyesi var; en fazla ${LIMITS.MAX_BLIND_LEVELS} destekleniyor.`,
      )
    }
    const table = sanitizeTable(raw, { imported: true, used })
    if (!table) throw new Error(`${i + 1}. madede beklenen alanlar eksik veya bozuk.`)
    // not: updatedAt kaynaktan korunur; dışa/içe aktarma gidiş-dönüşü birebir aynı kalır
    return table
  })
}

function parseJsonText(text: string, message: string): unknown {
  if (jsonDepth(text, LIMITS.MAX_JSON_DEPTH) > LIMITS.MAX_JSON_DEPTH) {
    throw new Error('İçerik çok derin iç içe geçmiş; geçersiz dosya.')
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new Error(message)
  }
}

/**
 * `{tables:[…]}`, `{table:{…}}`, paylaşım yükü `{v,t:{…}}`, çıplak `{…}` ve `[…]`
 * biçimlerinden masaları ayıklar. Dizi uzunluğu `cap` ile sınırlıdır.
 */
function extractTablePayloads(data: unknown): unknown[] {
  const cap = LIMITS.MAX_IMPORT_TABLES + 1 // taşmayı tespit etmek için 1 fazlası
  const unwrap = (item: unknown): unknown[] => {
    const o = asRecord(item)
    if (!o) return []
    if (Array.isArray(o.tables)) return o.tables.slice(0, cap)
    if (isObject(o.table)) return [o.table]
    if (isObject(o.t)) return [o.t] // paylaşım yükü: { v, t }
    return [item]
  }
  if (Array.isArray(data)) return data.slice(0, cap).flatMap(unwrap)
  return unwrap(data)
}

/** JSON metninin maksimum iç içe geçme derinliği (string literal'ler atlanır) */
function jsonDepth(text: string, cap: number): number {
  let depth = 0
  let max = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{' || c === '[') {
      depth++
      if (depth > max) {
        max = depth
        if (max > cap) return max
      }
    } else if (c === '}' || c === ']') depth--
  }
  return max
}

// ------------------------------------------------------------------- base64 (UTF-8 güvenli, parçalı)

/**
 * UTF-8 güvenli, parçalı base64 kodlama.
 * `String.fromCharCode(...bytes)` tek seferde yayılırsa büyük girdilerde stack taşar
 * ("Maximum call stack size exceeded"); burada baytlar 8 KB'lık dilimler hâlinde dönüştürülür.
 * Yazma tarafı `btoa` (ikili/latin1 metin bekler), çözme tarafı aşağıdaki elle doğrulamalı çözücüdür.
 */
export function encodeBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text)
  if (typeof btoa !== 'function') return bytesToBase64(bytes)
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += LIMITS.BASE64_CHUNK) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + LIMITS.BASE64_CHUNK)))
  }
  return btoa(parts.join(''))
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** `btoa` yoksa devreye giren yedek kodlayıcı */
function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]) >>> 0
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + B64_CHARS[n & 63]
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = (bytes[i] << 16) >>> 0
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + '=='
  } else if (rest === 2) {
    const n = ((bytes[i] << 16) | (bytes[i + 1] << 8)) >>> 0
    out += B64_CHARS[(n >> 18) & 63] + B64_CHARS[(n >> 12) & 63] + B64_CHARS[(n >> 6) & 63] + '='
  }
  return out
}

/** base64 → UTF-8 metin; bozuk kodda Türkçe mesajlı `Error` fırlatır */
export function decodeBase64Utf8(input: string): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(base64ToBytes(input))
}

function base64ToBytes(input: string): Uint8Array {
  if (typeof input !== 'string') throw new Error('Geçersiz paylaşım kodu.')
  let s = input.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '')
  // boş kod: parseImport'in "içerik yok" hatasına düşsün
  if (s.length === 0) return new Uint8Array(0)
  if (s.length % 4 === 1) throw new Error('Paylaşım kodu bozuk: geçersiz uzunluk.')
  while (s.length % 4 !== 0) s += '='
  // dolgu baytları sayıdan düşülür, yoksa çözümün sonuna NUL eklenir
  const groups = s.length / 4
  const out = new Uint8Array(groups * 3 - (s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0))
  let o = 0
  for (let i = 0; i < s.length; i += 4) {
    const pad2 = s[i + 2] === '='
    const pad3 = s[i + 3] === '='
    const c0 = B64_CHARS.indexOf(s[i])
    const c1 = B64_CHARS.indexOf(s[i + 1])
    const c2 = pad2 ? 0 : B64_CHARS.indexOf(s[i + 2])
    const c3 = pad3 ? 0 : B64_CHARS.indexOf(s[i + 3])
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error('Paylaşım kodu bozuk: geçersiz karakter.')
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3
    out[o++] = (n >> 16) & 255
    if (!pad2) out[o++] = (n >> 8) & 255
    if (!pad3) out[o++] = n & 255
  }
  return out
}

/**
 * Paylaşım linki kodunu üretir (UTF-8 güvenli, parçalı base64).
 * Çok büyük masalarda log kısaltılır; o da olmazsa Türkçe mesajlı hata fırlatılır.
 */
export function encodeTable(table: Table): string {
  const full = safeStringify({ v: SHARE_VERSION, t: table })
  if (full.length <= LIMITS.MAX_SHARE_BYTES) return encodeBase64Utf8(full)
  const trimmed = safeStringify({ v: SHARE_VERSION, t: { ...table, log: table.log.slice(0, 40) } })
  if (trimmed.length <= LIMITS.MAX_SHARE_BYTES) return encodeBase64Utf8(trimmed)
  throw new Error('Masa verisi paylaşım linki için çok büyük; kayıtları temizleyip tekrar deneyin.')
}

/**
 * Paylaşım kodunu (`#masa=…` hash'i veya ham base64) masalara çevirir.
 * `parseImport` ile aynı kuralları uygular: yeni id'ler, boş log, limit denetimi.
 * Hataların mesajları Türkçedir.
 */
export function decodeTable(encoded: string): Table[] {
  if (typeof encoded !== 'string') throw new Error('Geçersiz paylaşım kodu.')
  let raw = encoded.trim()
  if (raw.startsWith(SHARE_HASH_KEY)) raw = raw.slice(SHARE_HASH_KEY.length)
  // linkte `+` ve `=` karakterleri url-kodludur; ham kodda düzeltme gerekmez
  if (raw.includes('%')) {
    try {
      raw = decodeURIComponent(raw)
    } catch {
      /* bozuk yüzde kodlaması: ham bırak, base64 çözücü reddedecek */
    }
  }
  return parseImport(decodeBase64Utf8(raw))
}

/** `https://…/#masa=…` biçiminde paylaşım linki üretir */
export function buildShareUrl(table: Table): string {
  if (typeof location === 'undefined') throw new Error('Paylaşım linki oluşturulamadı: tarayıcı dışı ortam.')
  const data = encodeTable(table)
  return `${location.origin}${location.pathname}${SHARE_HASH_KEY}${encodeURIComponent(data)}`
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    throw new Error('Masa verisi okunamadı (JSON üretilemedi).')
  }
}