import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  BarChart3,
  ChevronLeft,
  Layers,
  Plus,
  Settings,
  Undo2,
  Wallet,
} from 'lucide-react'
import type { Table } from '../lib/types'
import { chips as fmtChips, money, tableTotalInPlay } from '../lib/chips'
import { useApp } from '../store'

interface Props {
  table: Table
  compact: boolean
}

/**
 * Store, `useMemo`'un içinde `act`/`undo`/`openModal`/`setSide`/`notify` gibi
 * fonksiyonları her state değişiminde yeniden üretir. Bu yüzden bir olay
 * işleyicisini doğrudan memo'lu bir çocuğa props olarak geçirmek her render'da
 * eşitlik karşılaştırmasını kırar. `useStable` son çağrıyı bir ref'te tutar ve
 * kimliği değişmeyen bir sarmalayıcı döndürür; olay anında güncel closure çalışır.
 */
function useStable<A extends unknown[], R>(fn: (...a: A) => R): (...a: A) => R {
  const ref = useRef(fn)
  ref.current = fn
  return useCallback((...a: A) => ref.current(...a), [])
}

/**
 * Üst çubuğun çizdiği tüm table alanları. `sameStats` bu listeyi kapsar:
 * id, name, handNumber, handActive, ante, sb, bb, handsPerLevel, blindLevel,
 * blindLevels.length, maxPlayers, chipValue, currency, players.length ve
 * masadaki toplam çip.
 */
function sameStats(a: Table, b: Table): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.handNumber === b.handNumber &&
    a.handActive === b.handActive &&
    a.ante === b.ante &&
    a.sb === b.sb &&
    a.bb === b.bb &&
    a.handsPerLevel === b.handsPerLevel &&
    a.blindLevel === b.blindLevel &&
    a.blindLevels.length === b.blindLevels.length &&
    a.maxPlayers === b.maxPlayers &&
    a.chipValue === b.chipValue &&
    a.currency === b.currency &&
    a.players.length === b.players.length &&
    tableTotalInPlay(a) === tableTotalInPlay(b)
  )
}

export function TopBar({ table, compact }: Props) {
  const app = useApp()
  const [adding, setAdding] = useState(false)

  const addPlayer = useStable((name: string) => app.act({ type: 'addPlayer', name }))
  const rename = useStable((name: string) => app.act({ type: 'settings', patch: { name } }))
  const openTables = useStable(() => app.openModal('tables'))
  const openSetup = useStable(() => app.openModal('setup'))
  const toggleBalances = useStable(() => app.setSide(app.side === 'balances' ? null : 'balances'))
  const doUndo = useStable(() => app.undo())
  const notifyAdded = useStable((text: string) => app.notify(text, 'good'))
  const closeAdd = useCallback(() => setAdding(false), [])
  const toggleAdd = useCallback(() => setAdding((v) => !v), [])

  return (
    <header className="relative z-30 shrink-0 border-b border-white/10 bg-ink-950/80 backdrop-blur">
      <Bar
        table={table}
        compact={compact}
        canUndo={app.canUndo}
        balancesOpen={app.side === 'balances'}
        onOpenTables={openTables}
        onRename={rename}
        onUndo={doUndo}
        onToggleBalances={toggleBalances}
        onOpenSetup={openSetup}
      />

      {/* hızlı oyuncu ekleme — denetimsiz input, yazarken hiç render tetiklenmez */}
      {adding && <QuickAdd onAdd={addPlayer} onClose={closeAdd} onNotify={notifyAdded} />}

      {/* mobil istatistik + oyuncu ekle */}
      <MobileBar table={table} onToggleAdd={toggleAdd} />
    </header>
  )
}

interface BarProps {
  table: Table
  compact: boolean
  canUndo: boolean
  balancesOpen: boolean
  onOpenTables: () => void
  onRename: (name: string) => void
  onUndo: () => void
  onToggleBalances: () => void
  onOpenSetup: () => void
}

/**
 * `table` her çip dokunuşunda yeni bir nesne olduğu için shallow compare yerine
 * yalnızca bu satırın çizdiği alanlar karşılaştırılır. Böylece bildirim/modal/
 * hedef koltuk değişimlerinde başlık yeniden çizilmez.
 */
const Bar = memo(
  function Bar({ table, compact, canUndo, balancesOpen, onOpenTables, onRename, onUndo, onToggleBalances, onOpenSetup }: BarProps) {
    const total = tableTotalInPlay(table)
    const seated = table.players.length

    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onOpenTables} className="btn btn-sm btn-ghost shrink-0" title="Masalar">
          {compact ? <Layers size={14} /> : <><ChevronLeft size={14} /> Masalar</>}
        </button>

        <div className="min-w-0 flex-1">
          <NameField tableId={table.id} name={table.name} onCommit={onRename} />
          {!compact && (
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <span className="tabular-nums">
                El #{table.handNumber + (table.handActive ? 1 : 0)}
              </span>
              <span className="text-slate-600" aria-hidden="true">•</span>
              <span className="tabular-nums">
                {table.ante > 0 && `Ante ${fmtChips(table.ante)} · `}
                SB {fmtChips(table.sb)} / BB {fmtChips(table.bb)}
              </span>
              {table.handsPerLevel > 0 && table.blindLevels.length > 1 && (
                <>
                  <span className="text-slate-600" aria-hidden="true">•</span>
                  <span className="tabular-nums text-gold-400/80">
                    Seviye {table.blindLevel + 1}/{table.blindLevels.length}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        <div className="hidden items-center gap-1.5 sm:flex">
          <Stat label="Masada" value={fmtChips(total)} sub={money(total * table.chipValue, table.currency)} />
          <Stat label="Koltuk" value={`${seated}/${table.maxPlayers}`} />
        </div>

        <button onClick={onUndo} disabled={!canUndo} className="btn btn-sm btn-ghost" title="Geri al">
          <Undo2 size={14} />
        </button>
        <button
          onClick={onToggleBalances}
          className={`btn btn-sm ${balancesOpen ? 'btn-active' : 'btn-ghost'}`}
          title="Bakiyeler"
        >
          <BarChart3 size={14} />
        </button>
        <button onClick={onOpenSetup} className="btn btn-sm btn-ghost" title="Masa ayarları">
          <Settings size={14} />
        </button>
      </div>
    )
  },
  (a, b) =>
    a.compact === b.compact &&
    a.canUndo === b.canUndo &&
    a.balancesOpen === b.balancesOpen &&
    a.onOpenTables === b.onOpenTables &&
    a.onRename === b.onRename &&
    a.onUndo === b.onUndo &&
    a.onToggleBalances === b.onToggleBalances &&
    a.onOpenSetup === b.onOpenSetup &&
    sameStats(a.table, b.table),
)

interface NameFieldProps {
  tableId: string
  name: string
  onCommit: (name: string) => void
}

/**
 * Masa adı düzenlemesi.
 *
 * Önceden her tuşta `act({type:'settings'})` çağrılıyordu: her harf tam uygulama
 * yeniden render'ı + kayda bir "Masa ayarları güncellendi" satırı + localStorage
 * yazımı demekti. Artık ad yerelde bir taslak (draft) olarak tutulur ve yalnızca
 * blur veya Enter ile commit edilir (tek kayıt satırı).
 *
 * - Bileşen hiç yeniden mount edilmediği ve değer yalnızca kullanıcı girdisiyle
 *   değiştiği için imleç (caret) kaymaz.
 * - Masa değişince taslak dışarıdan gelen ada döner; kullanıcı düzenlerken
 *   (dirty) dış değişiklikler metni ezmez.
 * - Escape taslağı geri alır, boş bırakılamaz.
 */
const NameField = memo(
  function NameField({ tableId, name, onCommit }: NameFieldProps) {
    const [draft, setDraft] = useState(name)
    const [dirty, setDirty] = useState(false)
    const dirtyRef = useRef(false)
    dirtyRef.current = dirty

    // masa değişimi veya kullanıcı elle düzenlemiyorken dış değeri takip et
    useEffect(() => {
      if (dirtyRef.current) return
      setDraft(name)
    }, [name, tableId])

    const commit = useCallback(() => {
      setDirty(false)
      const next = draft.trim()
      if (!next) {
        setDraft(name)
        return
      }
      if (next !== name) {
        setDraft(next)
        onCommit(next)
      } else if (draft !== name) {
        setDraft(name)
      }
    }, [draft, name, onCommit])

    return (
      <input
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value)
          setDirty(true)
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            setDirty(false)
            setDraft(name)
          }
        }}
        className={`w-full truncate rounded bg-transparent text-sm font-bold outline-none sm:text-base ${
          dirty ? 'text-gold-100 shadow-[inset_0_-1px_0_var(--color-gold-300)]' : 'text-gold-100'
        }`}
        aria-label="Masa adı"
        spellCheck={false}
      />
    )
  },
  (a, b) => a.tableId === b.tableId && a.name === b.name && a.onCommit === b.onCommit,
)

interface QuickAddProps {
  onAdd: (name: string) => void
  onClose: () => void
  onNotify: (text: string) => void
}

/** Hızlı oyuncu ekleme satırı: denetimsiz input + ref, yazarken sıfır render. */
const QuickAdd = memo(
  function QuickAdd({ onAdd, onClose, onNotify }: QuickAddProps) {
    const inputRef = useRef<HTMLInputElement>(null)

    const commit = () => {
      const value = (inputRef.current?.value ?? '').trim()
      if (!value) {
        inputRef.current?.focus()
        return
      }
      onAdd(value)
      onClose()
      onNotify('Oyuncu eklendi')
    }

    return (
      <div className="flex items-center gap-1.5 border-t border-white/5 bg-ink-900/80 px-3 py-1.5">
        <input
          ref={inputRef}
          autoFocus
          placeholder="İsim"
          aria-label="Yeni oyuncu adı"
          className="field flex-1 py-1 text-xs"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') onClose()
          }}
        />
        <button onClick={commit} className="btn btn-sm btn-gold">
          <Plus size={13} /> Ekle
        </button>
        <button onClick={onClose} className="btn btn-sm btn-ghost">
          Kapat
        </button>
      </div>
    )
  },
  (a, b) => a.onAdd === b.onAdd && a.onClose === b.onClose && a.onNotify === b.onNotify,
)

const MobileBar = memo(
  function MobileBar({ table, onToggleAdd }: { table: Table; onToggleAdd: () => void }) {
    const total = tableTotalInPlay(table)
    const seated = table.players.length
    return (
      <div className="flex items-center gap-2 border-t border-white/5 px-3 py-1.5 sm:hidden">
        <span className="flex items-center gap-1 text-[11px] text-slate-400">
          <Wallet size={12} className="text-gold-300" />
          <span className="tabular-nums font-bold text-gold-100">{fmtChips(total)}</span>
          <span className="text-slate-400">({seated}/{table.maxPlayers})</span>
        </span>
        <span className="text-[11px] tabular-nums text-slate-400">
          El #{table.handNumber + (table.handActive ? 1 : 0)} · {fmtChips(table.sb)}/{fmtChips(table.bb)}
        </span>
        <button onClick={onToggleAdd} className="btn btn-sm ml-auto btn-ghost">
          <Plus size={13} /> Oyuncu
        </button>
      </div>
    )
  },
  (a, b) => a.onToggleAdd === b.onToggleAdd && sameStats(a.table, b.table),
)

const Stat = memo(function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/70 px-2.5 py-1 text-right">
      <div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-sm font-bold tabular-nums text-gold-100">{value}</div>
      {sub && <div className="text-[9px] tabular-nums text-slate-400">{sub}</div>}
    </div>
  )
})