import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Player, Table } from '../lib/types'
import { chips as fmtChips, money } from '../lib/chips'
import { ChipStack } from './Chip'
import { SeatCard } from './SeatCard'

interface Props {
  table: Table
  compact: boolean
  targetSeat: number | null
  winners: string[]
  onSelectSeat: (seat: number) => void
  onClearBet: (id: string) => void
  onAddPlayer: () => void
  onSetButton: (seat: number) => void
  onOpenPayout: () => void
}

/* ---------------------------------------------------------------- ölçüm */

interface Box {
  w: number
  h: number
}

/** tahta kutusunu px olarak izler; ilk kare için yedek değer kullanılır */
function useBoardBox() {
  const ref = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<Box>({ w: 0, h: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      const w = Math.round(r.width)
      const h = Math.round(r.height)
      setBox((p) => (Math.abs(p.w - w) < 2 && Math.abs(p.h - h) < 2 ? p : { w, h }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return { ref, box }
}

/* -------------------------------------------------------------- yerleşim */

/** koltuk kartı ölçü sınırları (px) */
const CARD = {
  compact: { wMax: 96, wMin: 76, hMax: 50, hMin: 34 },
  desktop: { wMax: 152, wMin: 118, hMax: 68, hMin: 62 },
} as const

/** pot paneli ölçüleri (px): normal / sıkışık (çip yığını gizlenir) */
const POT = {
  compact: { w: 100, h: 128, wTight: 84, hTight: 48 },
  desktop: { w: 176, h: 158, wTight: 124, hTight: 54 },
} as const

/** koltuk kartının dışına taşan rozet/dokunma payı (px) */
const BLEED_X = 6 // düğme + net rozeti
const BLEED_Y = 14 // alt rozet satırı ve genişletilmiş dokunma alanı
const GAP = 5

interface BoardPlan {
  w: number
  h: number
  n: number
  cardW: number
  cardH: number
  rx: number
  ry: number
  potW: number
  potH: number
  potChips: boolean
  potTight: boolean
  dense: boolean
}

interface BetPlace {
  x: number
  y: number
  size: number
  cols: number // 0 ise sadece tutar rozeti çizilir
  small: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

/** koltuğun merkezine göre açı (radyan) */
function angleOf(seat: number, n: number) {
  return ((-90 + (seat * 360) / n) * Math.PI) / 180
}

/** kartların (rozet payıyla) birbirine ve pota binmediği en geniş düzen */
function planBoard(w: number, h: number, n: number, compact: boolean): BoardPlan {
  const C = compact ? CARD.compact : CARD.desktop
  const P = compact ? POT.compact : POT.desktop
  const pad = compact ? 4 : 8
  const wantRx = w * (compact ? 0.34 : 0.4)
  const wantRy = h * (compact ? 0.36 : 0.37)
  // çok kısa tahtada kart da küçülür, yoksa halka ezilir
  const short = h < 420
  const hMin = short ? (compact ? 32 : 52) : C.hMin
  const cardH = clamp(Math.round(h / 9), hMin, C.hMax)
  const fh = cardH + BLEED_Y

  // komşu koltukları ayırmak için gereken en küçük yarıçaplar
  const need = { rx: 0, ry: 0 }
  for (let s = 0; s < n; s++) {
    const a1 = angleOf(s, n)
    const a2 = angleOf((s + 1) % n, n)
    const dc = Math.abs(Math.cos(a2) - Math.cos(a1))
    const ds = Math.abs(Math.sin(a2) - Math.sin(a1))
    const nx = dc > 1e-6 ? (C.wMax + BLEED_X * 2) / dc : Infinity
    const ny = ds > 1e-6 ? fh / ds : Infinity
    const m = Math.min(nx, ny)
    if (m === nx) need.rx = Math.max(need.rx, nx)
    if (m === ny) need.ry = Math.max(need.ry, ny)
  }

  const make = (cardW: number, tight: boolean): BoardPlan => {
    const fw = cardW + BLEED_X * 2
    const potW = tight ? P.wTight : P.w
    const potH = tight ? P.hTight : P.h
    return {
      w,
      h,
      n,
      cardW,
      cardH,
      rx: clamp(Math.max(wantRx, need.rx), 24, (w - fw) / 2 - pad),
      ry: clamp(Math.max(wantRy, need.ry), 20, (h - fh) / 2 - pad),
      potW,
      potH,
      potChips: !tight,
      potTight: tight,
      dense: cardW < C.wMax || short,
    }
  }

  const fits = (p: BoardPlan) => {
    const fw = p.cardW + BLEED_X * 2
    const pot: Rect = { x: (w - p.potW) / 2, y: (h - p.potH) / 2, w: p.potW, h: p.potH }
    const boxes: Rect[] = []
    for (let s = 0; s < n; s++) {
      const a = angleOf(s, n)
      boxes.push({
        x: w / 2 + p.rx * Math.cos(a) - fw / 2,
        y: h / 2 + p.ry * Math.sin(a) - fh / 2,
        w: fw,
        h: fh,
      })
    }
    for (const b of boxes) if (hits(b, pot)) return false
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) if (hits(boxes[i], boxes[j])) return false
    }
    return true
  }

  let last: BoardPlan | null = null
  for (const tight of [false, true]) {
    for (let cw = C.wMax; cw >= C.wMin; cw -= 2) {
      const p = make(cw, tight)
      if (fits(p)) return p
      last = p
    }
  }
  return last ?? make(C.wMin, true)
}

/** koltuk merkezi (px) */
function seatCenter(seat: number, p: BoardPlan) {
  const a = angleOf(seat, p.n)
  return { x: p.w / 2 + p.rx * Math.cos(a), y: p.h / 2 + p.ry * Math.sin(a) }
}

/**
 * Önündeki çip yığını: koltuk ile pot arasındaki boş şeride sığar.
 * Sığmıyorsa çip yığını küçülür, o da sığmazsa sadece tutar rozeti kalır.
 */
function betPlace(seat: number, p: BoardPlan): BetPlace {
  const a = angleOf(seat, p.n)
  const dx = p.rx * Math.cos(a)
  const dy = p.ry * Math.sin(a)
  const cx = p.w / 2 + dx
  const cy = p.h / 2 + dy
  const horiz = Math.abs(dx) >= Math.abs(dy)
  const room = Math.max(
    0,
    horiz
      ? Math.abs(dx) - p.cardW / 2 - p.potW / 2 - GAP
      : Math.abs(dy) - p.cardH / 2 - p.potH / 2 - GAP,
  )
  const maxSize = p.dense ? 15 : p.potTight ? 17 : 20
  const pillH = p.dense ? 13 : 15
  let size = maxSize
  let cols = 0
  for (const c of [3, 2, 1]) {
    const need = horiz ? c * maxSize + (c - 1) * 6 : 1.42 * maxSize + 6 + pillH
    if (room >= need) {
      cols = c
      break
    }
  }
  const bw = cols ? cols * size + (cols - 1) * 6 : p.dense ? 46 : 58
  const bh = cols ? 1.42 * size + 6 + pillH : pillH
  // şeridin ortasına yerleş, ama ne potun ne koltuğun üstüne binmesin
  const base = (horiz ? p.potW : p.potH) / 2
  const half = horiz ? bw / 2 : bh / 2
  const lo = base + GAP + half
  const hi = Math.abs(horiz ? dx : dy) - (horiz ? p.cardW : p.cardH) / 2 - half
  const along = hi >= lo ? clamp(base + GAP + room / 2, lo, hi) : (lo + hi) / 2
  const sign = (horiz ? dx : dy) < 0 ? -1 : 1
  const edge = horiz ? bw / 2 + 2 : bh / 2 + 2
  const x = horiz ? cx + sign * along : cx
  const y = horiz ? cy : cy + sign * along
  return {
    x: clamp(x, edge, Math.max(edge, p.w - edge)),
    y: clamp(y, edge, Math.max(edge, p.h - edge)),
    size,
    cols,
    small: p.dense,
  }
}

/* -------------------------------------------------------------- parçalar */

/** oyuncunun önündeki çip yığını için uçuş animasyonu */
function useFlyIn(trigger: number) {
  const [show, setShow] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      if (trigger > 0) {
        setShow(true)
        const t = setTimeout(() => setShow(false), 480)
        return () => clearTimeout(t)
      }
      return
    }
    if (trigger <= 0) return
    setShow(true)
    const t = setTimeout(() => setShow(false), 480)
    return () => clearTimeout(t)
  }, [trigger])
  return show
}

function Bet({ player, table, place, compact }: { player: Player; table: Table; place: BetPlace; compact: boolean }) {
  const fly = useFlyIn(player.bet)
  if (player.bet <= 0) return null
  return (
    <div className={`pointer-events-none flex max-w-full flex-col items-center ${fly ? 'deal-in' : ''}`}>
      {place.cols > 0 && (
        <ChipStack amount={player.bet} denoms={table.denoms} size={place.size} perColumn={2} maxColumns={place.cols} />
      )}
      <span
        className={`mt-0.5 max-w-full truncate rounded-full border border-white/10 bg-ink-950/85 px-1.5 font-bold tabular-nums text-gold-100 ${
          place.small ? 'text-[9px]' : compact ? 'text-[10px]' : 'text-[11px]'
        }`}
      >
        {fmtChips(player.bet)}
      </span>
    </div>
  )
}

/* ------------------------------------------------------------------ tahta */

export function TableBoard({
  table,
  compact,
  targetSeat,
  winners,
  onSelectSeat,
  onClearBet,
  onAddPlayer,
  onSetButton,
  onOpenPayout,
}: Props) {
  const n = table.maxPlayers
  const { ref, box } = useBoardBox()
  // ölçüm gelene kadar makul bir ilk kare çiz
  const w = box.w > 40 ? box.w : compact ? 360 : 960
  const h = box.h > 40 ? box.h : compact ? 420 : 640
  const plan = useMemo(() => planBoard(w, h, n, compact), [w, h, n, compact])

  const potTotal = table.players.reduce((s, p) => s + p.invested, 0)
  const activeHand = table.handActive

  return (
    <div ref={ref} className="relative flex-1 overflow-hidden">
      {/* çiğnöş */}
      <div className="felt absolute inset-x-[3%] inset-y-[2%] sm:inset-x-[5%] sm:inset-y-[4%]" />

      {/* masa adı filigranı */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="max-w-[70%] truncate text-[3.2vw] font-black uppercase tracking-[0.2em] text-white/[0.045] sm:text-[4.4vw]">
          {table.name}
        </span>
      </div>

      {/* pot merkezi */}
      <div
        className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
        style={{ left: plan.w / 2, top: plan.h / 2 }}
      >
        <button
          type="button"
          onClick={onOpenPayout}
          disabled={potTotal === 0}
          style={{ width: plan.potW }}
          className={`flex flex-col items-center overflow-hidden rounded-3xl border transition-all ${
            plan.potTight ? 'px-2 py-1.5' : 'px-3 py-2'
          } ${
            potTotal > 0
              ? 'border-gold-300/40 bg-ink-950/70 shadow-[0_0_34px_-6px_rgba(242,193,78,0.45)] hover:border-gold-300/70'
              : 'border-white/10 bg-ink-950/45'
          }`}
          title={potTotal > 0 ? 'Potu dağıt' : undefined}
          aria-label={potTotal > 0 ? `Potu dağıt, potta ${fmtChips(potTotal)} çip var` : 'Ortada çip yok'}
        >
          <span className="max-w-full truncate text-[9px] font-black uppercase tracking-[0.22em] text-gold-300/90 sm:text-[10px]">
            Pot
          </span>
          {potTotal > 0 ? (
            <>
              {plan.potChips && (
                <div className="my-1 max-w-full overflow-hidden">
                  <ChipStack amount={potTotal} denoms={table.denoms} size={compact ? 19 : 26} perColumn={4} maxColumns={3} />
                </div>
              )}
              <span
                className={`max-w-full truncate font-black tabular-nums text-gold-100 ${
                  compact ? 'text-base' : 'text-2xl'
                }`}
              >
                {fmtChips(potTotal)}
              </span>
              {!plan.potTight && (
                <span className="max-w-full truncate text-[10px] font-medium text-slate-400">
                  {money(potTotal * table.chipValue, table.currency)}
                </span>
              )}
            </>
          ) : (
            <span className={`max-w-full truncate font-semibold text-slate-500 ${compact ? 'text-[11px]' : 'text-xs'}`}>
              {activeHand ? 'Ortada çip yok' : 'El başlat'}
            </span>
          )}
        </button>
      </div>

      {/* önlerindeki çip yığınları */}
      {table.players.map((p) => {
        if (p.bet <= 0) return null
        const place = betPlace(p.seat, plan)
        return (
          <div key={p.id} className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: place.x, top: place.y }}>
            <Bet player={p} table={table} place={place} compact={compact} />
          </div>
        )
      })}

      {/* koltuklar */}
      {Array.from({ length: n }, (_, seat) => {
        const p = table.players.find((x) => x.seat === seat) ?? null
        const c = seatCenter(seat, plan)
        return (
          <div
            key={seat}
            className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: c.x, top: c.y, width: plan.cardW }}
          >
            <SeatCard
              table={table}
              player={p}
              seat={seat}
              compact={compact}
              cardH={plan.cardH}
              dense={plan.dense}
              isTurn={p !== null && p.seat === table.currentSeat && activeHand}
              isTarget={p !== null && p.seat === targetSeat}
              isWinner={p !== null && winners.includes(p.id)}
              onSelect={() => onSelectSeat(seat)}
              onClearBet={() => p && onClearBet(p.id)}
              onAddPlayer={onAddPlayer}
              onSetButton={() => onSetButton(seat)}
            />
          </div>
        )
      })}
    </div>
  )
}