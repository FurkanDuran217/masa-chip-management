import type { ReactNode } from 'react'
import { decompose } from '../lib/chips'

export interface Palette {
  face: string
  ring: string
  ink: string
}

export const CHIP_PALETTE: Palette[] = [
  { face: '#f1f5f9', ring: '#e11d48', ink: '#0f172a' },
  { face: '#ef4444', ring: '#7f1d1d', ink: '#fef2f2' },
  { face: '#22c55e', ring: '#14532d', ink: '#f0fdf4' },
  { face: '#111827', ring: '#f59e0b', ink: '#fbbf24' },
  { face: '#a855f7', ring: '#4c1d95', ink: '#faf5ff' },
  { face: '#fbbf24', ring: '#78350f', ink: '#3f2704' },
  { face: '#f97316', ring: '#7c2d12', ink: '#fff7ed' },
  { face: '#38bdf8', ring: '#0c4a6e', ink: '#f0f9ff' },
  { face: '#ec4899', ring: '#831843', ink: '#fdf2f8' },
  { face: '#2dd4bf', ring: '#134e4a', ink: '#042f2e' },
  { face: '#64748b', ring: '#1e293b', ink: '#e2e8f0' },
  { face: '#a3e635', ring: '#365314', ink: '#1a2e05' },
]

export function paletteFor(value: number, denoms: number[]): Palette {
  const sorted = [...denoms].sort((a, b) => a - b)
  const i = sorted.indexOf(value)
  if (i >= 0) return CHIP_PALETTE[i % CHIP_PALETTE.length]
  // denomlarda yoksa: en yakın büyük çipin rengini kullan
  let best = -1
  sorted.forEach((d, idx) => {
    if (d >= value) best = idx
  })
  if (best >= 0) return CHIP_PALETTE[best % CHIP_PALETTE.length]
  return CHIP_PALETTE[0]
}

export function chipLabel(value: number): string {
  if (value >= 1_000_000) return `${Math.round(value / 100_000) / 10}M`
  if (value >= 1000) return `${value / 1000}K`
  return String(value)
}

interface ChipProps {
  value: number
  denoms: number[]
  size?: number
  label?: boolean
  title?: string
  onClick?: () => void
  muted?: boolean
  style?: React.CSSProperties
}

export function ChipDisc({ value, denoms, size = 26, label = false, title, onClick, muted, style }: ChipProps) {
  const p = paletteFor(value, denoms)
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      title={title ?? `${value} çip`}
      onClick={onClick}
      className={`chip ${label ? 'lg' : ''} ${onClick ? 'cursor-pointer hover:brightness-110 active:scale-95 transition-transform' : ''}`}
      style={
        {
          '--size': `${size}px`,
          '--face': p.face,
          '--ring': p.ring,
          '--ink': p.ink,
          opacity: muted ? 0.45 : 1,
          ...style,
        } as React.CSSProperties
      }
    >
      <span className="val">{chipLabel(value)}</span>
    </Tag>
  )
}

interface StackProps {
  amount: number
  denoms: number[]
  size?: number
  maxColumns?: number
  perColumn?: number
  label?: boolean
  emptyText?: ReactNode
}

/** tutarı gerçek çip yığını gibi gösterir */
export function ChipStack({ amount, denoms, size = 26, maxColumns = 4, perColumn = 4, label = false, emptyText }: StackProps) {
  if (amount <= 0) return <>{emptyText}</>
  const parts = decompose(amount, denoms)
  let columns = parts.map((p) => ({ value: p.value, count: p.count }))
  if (columns.length > maxColumns) {
    const head = columns.slice(0, maxColumns - 1)
    const rest = columns.slice(maxColumns - 1)
    const restValue = rest.reduce((s, r) => s + r.value * r.count, 0)
    columns = [...head, { value: restValue, count: rest.reduce((s, r) => s + r.count, 0) }]
  }
  return (
    <div className="flex items-end gap-1.5">
      {columns.map((col, ci) => (
        <div key={`${ci}-${col.value}`} className="flex flex-col items-center gap-1">
          <div className="stack">
            {Array.from({ length: Math.min(col.count, perColumn) }, (_, i) => (
              <ChipDisc key={i} value={col.value} denoms={denoms} size={size} label={label} />
            ))}
          </div>
          {col.count > perColumn && (
            <span className="text-[10px] font-bold text-gold-200/90">+{col.count - perColumn}</span>
          )}
        </div>
      ))}
    </div>
  )
}