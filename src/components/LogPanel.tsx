import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { Flame, HandCoins, Info, RotateCcw, ScrollText, Sparkles, TrendingDown, Undo2, Users } from 'lucide-react'
import type { LogEntry, LogKind, Table } from '../lib/types'
import { chips as fmtChips, computePots, money, netOf, toMoney } from '../lib/chips'
import { useApp } from '../store'
import { ChipStack } from './Chip'

const ICONS: Record<LogKind, typeof Info> = {
  setup: Sparkles,
  hand: HandCoins,
  bet: Flame,
  return: Undo2,
  fold: TrendingDown,
  win: Sparkles,
  split: Sparkles,
  rebuy: Users,
  cashout: Users,
  info: Info,
  undo: RotateCcw,
}

/** ikon rozeti (ön plan + zemin) — hepsi koyu zeminde AA üstü açıklık */
const TONES: Record<LogKind, string> = {
  setup: 'text-sky-300 bg-sky-500/10',
  hand: 'text-gold-200 bg-gold-500/10',
  bet: 'text-rose-300 bg-rose-500/10',
  return: 'text-amber-300 bg-amber-500/10',
  fold: 'text-slate-300 bg-slate-500/10',
  win: 'text-emerald-300 bg-emerald-500/10',
  split: 'text-teal-300 bg-teal-500/10',
  rebuy: 'text-violet-300 bg-violet-500/10',
  cashout: 'text-orange-300 bg-orange-500/10',
  info: 'text-slate-400 bg-slate-500/10',
  undo: 'text-slate-400 bg-slate-500/10',
}

/** satırın solundaki renkli çizgi: ardışık çip hamlelerini gözle izlemeyi kolaylaştırır */
const ACCENT: Record<LogKind, string> = {
  setup: 'bg-sky-400/70',
  hand: 'bg-gold-300/70',
  bet: 'bg-rose-400/70',
  return: 'bg-amber-300/70',
  fold: 'bg-slate-400/40',
  win: 'bg-emerald-300/70',
  split: 'bg-teal-300/70',
  rebuy: 'bg-violet-300/70',
  cashout: 'bg-orange-300/70',
  info: 'bg-slate-500/50',
  undo: 'bg-slate-500/50',
}

/** "çip akışı" sayılan türler — bunlar arka arkaya geldiğinde bir grup oluşturur */
const FLOW = new Set<LogKind>(['bet', 'return', 'fold'])

const LOG_CAP = 250
const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/* -------------------------------------------------------------------------- */
/* zaman biçimi önbelleği                                                      */
/* -------------------------------------------------------------------------- */

// 250 satırlık kayıt her render'da yeniden biçimleniyordu. Zaman damgası -> metin
// eşlemesi küçük bir Map'te tutulur; aynı saniye tekrar biçimlenmez.
const clockCache = new Map<number, string>()
const CLOCK_CACHE_MAX = 4000
const clockFmt = new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' })

function clockOf(t: number): string {
  const hit = clockCache.get(t)
  if (hit !== undefined) return hit
  const s = clockFmt.format(t)
  if (clockCache.size >= CLOCK_CACHE_MAX) {
    const oldest = clockCache.keys().next()
    if (!oldest.done) clockCache.delete(oldest.value)
  }
  clockCache.set(t, s)
  return s
}

/** kaba göreli zaman — saniye hassasiyeti gereksiz, okunabilirlik önemli */
function relOf(t: number, now: number): string {
  const d = now - t
  if (d < 45_000) return 'az önce'
  if (d < HOUR) return `${Math.max(1, Math.round(d / MINUTE))} dk önce`
  if (d < DAY) return `${Math.max(1, Math.round(d / HOUR))} sa önce`
  return `${Math.max(1, Math.round(d / DAY))} gün önce`
}

interface Row {
  e: LogEntry
  clock: string
  rel: string
  chips: string | null
  cash: string | null
  /** üstünde ayraç çizilecek mi (yeni çip grubunun ilk satırı) */
  group: boolean
}

/** log satırlarının tüm biçimlenmiş halini tek seferde üretir (memo'lanır) */
function buildRows(log: LogEntry[], chipValue: number, currency: Table['currency'], now: number): Row[] {
  const rows: Row[] = []
  let prevFlow = true
  for (let i = 0; i < log.length; i++) {
    const e = log[i]
    const flow = FLOW.has(e.kind)
    rows.push({
      e,
      clock: clockOf(e.t),
      rel: relOf(e.t, now),
      chips: e.amount === undefined ? null : `${fmtChips(e.amount)} çip`,
      cash: e.amount === undefined ? null : money(e.amount * chipValue, currency),
      group: flow && !prevFlow && i > 0,
    })
    prevFlow = flow
  }
  return rows
}

/* -------------------------------------------------------------------------- */
/* LogPanel                                                                    */
/* -------------------------------------------------------------------------- */

// Dış kabuk sadece store'dan `act` alır (temizleme için) ve asıl ağır ağacı
// memo'lu `LogBody`'e devreder. Böylece context değişimlerinde (bildirim, modal,
// hedef koltuk) 250 satırlık liste yeniden çizilmez.
export function LogPanel({ table, compact }: { table: Table; compact: boolean }) {
  const { act } = useApp()

  // `act` her store değişiminde yeni bir fonksiyon kimliği kazanır. Son çağrıyı
  // bir ref'te tutuyoruz ki memo sınırı kırılmasın; render sonrası olay
  // anında her zaman güncel `act` okunur (eski masa kimliğine dispatch etme riski yok).
  const actRef = useRef(act)
  actRef.current = act
  const clearLog = useCallback(() => actRef.current({ type: 'clearLog' }), [])

  return <LogBody table={table} compact={compact} onClear={clearLog} />
}

interface LogBodyProps {
  table: Table
  compact: boolean
  onClear: () => void
}

/**
 * `table` nesnesi her çip dokunuşunda değiştiği için shallow compare işe yaramaz;
 * yalnızca bu panelin gerçekten çizdiği alanlar karşılaştırılır:
 * log (kimlik), players (PotSummary), chipValue/currency (para biçimi).
 */
const LogBody = memo(
  function LogBody({ table, compact, onClear }: LogBodyProps) {
    const listRef = useRef<HTMLDivElement>(null)

    // Önceden `table.log.length` idi: kayıt 250'ye dayandığında uzunluk sabit
    // kaldığı için yeni kayıtlar otomatik kaydırmayı tetiklemiyordu.
    useEffect(() => {
      const el = listRef.current
      if (el) el.scrollTop = 0
    }, [table.log])

    // `Date.now()` render başına bir kez okunur; göreli zaman 30 sn'lik kovalara
    // yuvarlanır, böylece "2 dk önce" metinleri saniyede bir değil 30 saniyede
    // bir yeniden hesaplanır ve useMemo gerçekten işe yarar.
    const bucket = Math.floor(Date.now() / 30_000)
    const rows = useMemo(
      () => buildRows(table.log, table.chipValue, table.currency, bucket * 30_000),
      [table.log, table.chipValue, table.currency, bucket],
    )

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-2 border-b border-white/8 px-3 py-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">Kayıtlar</h2>
          <div className="flex items-center gap-2.5">
            {table.log.length > 0 && (
              <span className="text-[11px] tabular-nums text-slate-400">{table.log.length}/{LOG_CAP}</span>
            )}
            <button
              onClick={onClear}
              className="text-[11px] font-semibold text-slate-400 hover:text-slate-200"
            >
              temizle
            </button>
          </div>
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/[0.05] text-slate-400">
                <ScrollText size={16} />
              </span>
              <p className="text-xs font-bold text-slate-300">Henüz kayıt yok</p>
              <p className="text-[11px] leading-relaxed text-slate-400/90">
                Masadan bir oyuncu seç, sonra çip düğmelerine dokun.
                <br />
                Her çip işlemi burada, en yeniden eskiye doğru listelenir.
              </p>
            </div>
          ) : (
            <ul role="log" className="flex flex-col gap-1">
              {rows.map((r) => (
                <li
                  key={r.e.id}
                  className={`row-in relative flex items-start gap-2 py-1.5 pr-2 pl-3 hover:bg-white/[0.03] ${
                    r.group ? 'mt-1.5 rounded-t-lg border-t border-white/10 pt-2.5' : 'rounded-lg'
                  }`}
                >
                  <span className={`absolute inset-y-1 left-1 w-[2px] rounded-full ${ACCENT[r.e.kind]}`} aria-hidden="true" />
                  <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md ${TONES[r.e.kind]}`}>
                    <LogIcon kind={r.e.kind} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] leading-snug text-slate-200">{r.e.text}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] tabular-nums text-slate-400">
                      <span>{r.clock}</span>
                      <span aria-hidden="true">·</span>
                      <span>{r.rel}</span>
                      {r.chips && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-slate-300">{r.chips}</span>
                        </>
                      )}
                      {r.cash && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-gold-300">{r.cash}</span>
                        </>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!compact && <PotSummary table={table} />}
      </div>
    )
  },
  (a, b) =>
    a.compact === b.compact &&
    a.onClear === b.onClear &&
    a.table.log === b.table.log &&
    a.table.players === b.table.players &&
    a.table.chipValue === b.table.chipValue &&
    a.table.currency === b.table.currency,
)

function LogIcon({ kind }: { kind: LogKind }) {
  const Icon = ICONS[kind]
  return <Icon size={11} strokeWidth={2.5} />
}

/** computePots + toplam yatırım yalnızca `players` değiştiğinde hesaplanır */
const PotSummary = memo(
  function PotSummary({ table }: { table: Table }) {
    const { pots, total } = useMemo(
      () => ({
        pots: computePots(table.players),
        total: table.players.reduce((s, p) => s + p.invested, 0),
      }),
      [table.players],
    )

    return (
      <div className="border-t border-white/8 px-3 py-2.5">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Pot durumu</span>
          <span className="text-xs font-bold tabular-nums text-gold-200">{fmtChips(total)}</span>
        </div>
        {pots.length === 0 ? (
          <p className="text-[11px] text-slate-400">Masada bekleyen çip yok.</p>
        ) : (
          <ul className="space-y-1">
            {pots.map((pot) => (
              <li key={pot.label} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1">
                <span className="text-[11px] font-semibold text-slate-300">{pot.label}</span>
                <span className="text-[11px] tabular-nums text-gold-200">{fmtChips(pot.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  },
  (a, b) => a.table.players === b.table.players,
)

/* -------------------------------------------------------------------------- */
/* BalancePanel                                                                */
/* -------------------------------------------------------------------------- */

/** structuredClone her aksiyonda `denoms` dizisini de yeniliyor; değer karşılaştır. */
function sameDenoms(a: number[], b: number[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Bakiyeler paneli oyuncu satırlarını, chip yığınlarını ve paralarını çizdiği için
 * `players` kimliği değiştiğinde yeniden çizilmesi gerekir (chip dokunuşunda zaten
 * öyle olur). Kıyas, `players` + `denoms` değerleri + para ayarları ile sınırlı.
 */
export const BalancePanel = memo(
  function BalancePanel({ table }: { table: Table }) {
    const { rows, totalNet } = useMemo(() => {
      const list = table.players.map((p) => ({ p, net: netOf(p) })).sort((a, b) => b.net - a.net)
      return { rows: list, totalNet: list.reduce((s, r) => s + r.net, 0) }
    }, [table.players])

    return (
      <div className="flex h-full flex-col">
        <div className="border-b border-white/8 px-3 py-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-300">Bakiyeler</h2>
          <p className="text-[10px] text-slate-400">Net = elindeki + masadaki − girdiği</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11px] leading-relaxed text-slate-400">
              Masada oyuncu yok.
              <br />
              «Oyuncu» düğmesinden masaya oturt.
            </p>
          ) : (
            rows.map(({ p, net }) => (
              <div key={p.id} className="mb-1.5 rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-bold text-slate-100">{p.name}</span>
                  <span
                    className={`shrink-0 text-sm font-black tabular-nums ${
                      net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : 'text-slate-400'
                    }`}
                  >
                    {net > 0 ? '+' : ''}
                    {fmtChips(net)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-400">
                  <span className="tabular-nums">{toMoney(p.stack, table)} elinde</span>
                  {p.invested > 0 && <span className="tabular-nums text-gold-400/80">{fmtChips(p.invested)} masada</span>}
                  {p.rebuys > 0 && <span className="tabular-nums text-violet-400/80">{p.rebuys} rebuy</span>}
                </div>
                {p.stack > 0 && (
                  <div className="mt-1.5">
                    <ChipStack amount={p.stack} denoms={table.denoms} size={15} perColumn={3} maxColumns={4} />
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="flex items-center justify-between border-t border-white/8 px-3 py-2.5 text-xs">
          <span className="text-slate-400">Toplam net</span>
          <span
            className={`font-black tabular-nums ${
              totalNet > 0 ? 'text-emerald-400' : totalNet < 0 ? 'text-rose-400' : 'text-slate-400'
            }`}
          >
            {totalNet > 0 ? '+' : ''}
            {fmtChips(totalNet)}
          </span>
        </div>
      </div>
    )
  },
  (a, b) =>
    a.table.players === b.table.players &&
    a.table.chipValue === b.table.chipValue &&
    a.table.currency === b.table.currency &&
    sameDenoms(a.table.denoms, b.table.denoms),
)