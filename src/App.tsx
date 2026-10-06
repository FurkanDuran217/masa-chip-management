import { useEffect, useRef } from 'react'
import { HelpCircle, Users } from 'lucide-react'
import { useApp } from './store'
import { useMediaQuery } from './lib/hooks'
import { playerAt } from './lib/chips'
import { SHARE_HASH_KEY, decodeTable } from './lib/store'
import { TableBoard } from './components/TableBoard'
import { ActionBar } from './components/ActionBar'
import { TopBar } from './components/TopBar'
import { BalancePanel, LogPanel } from './components/LogPanel'
import { Landing } from './components/Landing'
import { SetupModal } from './components/SetupModal'
import { PayoutModal } from './components/PayoutModal'
import { PlayersModal } from './components/PlayersModal'
import { TablesModal } from './components/TablesModal'
import { HelpModal } from './components/HelpModal'

export function App() {
  const app = useApp()
  const { table, modal, side, setSide, winners, notify, notice } = app
  const compact = useMediaQuery('(max-width: 760px)')

  // #masa=<base64> ile gelen paylaşım linki
  const imported = useRef(false)
  useEffect(() => {
    if (imported.current) return
    const hash = location.hash
    if (!hash.startsWith(SHARE_HASH_KEY)) return
    imported.current = true
    try {
      const tables = decodeTable(hash)
      if (tables.length > 0) {
        app.dispatch({ type: 'importTables', tables })
        notify('Paylaşılan masa yüklendi', 'good')
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Bağlantı okunamadı', 'warn')
    }
    history.replaceState(null, '', location.pathname)
  }, [app, notify])

  if (!table) return <Landing />

  const onSelectSeat = (seat: number) => app.setTargetSeat(seat)

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink-900">
      <TopBar table={table} compact={compact} />

      <div className="flex min-h-0 flex-1">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <TableBoard
            table={table}
            compact={compact}
            targetSeat={app.targetSeat}
            winners={winners}
            onSelectSeat={onSelectSeat}
            onClearBet={(id) => app.act({ type: 'clearBet', id })}
            onAddPlayer={() => app.act({ type: 'addPlayer' })}
            onSetButton={(seat) => app.act({ type: 'setButton', seat })}
            onOpenPayout={() => app.openModal('payout')}
          />
          <ActionBar table={table} compact={compact} />
        </main>

        {side && (
          <>
            {compact && <div className="fade-in fixed inset-0 z-40 bg-ink-950/70" onClick={() => setSide(null)} />}
            <aside
              className={`panel shrink-0 ${
                compact ? 'fixed inset-x-0 bottom-0 top-[20%] z-40 rounded-b-none' : 'z-20 w-[300px] border-l border-white/10 xl:w-[340px]'
              }`}
            >
              {side === 'log' ? <LogPanel table={table} compact={compact} /> : <BalancePanel table={table} />}
            </aside>
          </>
        )}
      </div>

      {/* masa üstü kısayol düğmeleri */}
      <div className="absolute right-3 top-[calc(50%+52px)] z-20 hidden -translate-y-1/2 flex-col gap-1.5 lg:flex">
        <button onClick={() => app.openModal('players')} className="btn btn-sm btn-ghost !px-2" title="Oyuncular">
          <Users size={14} />
        </button>
        <button onClick={() => app.openModal('help')} className="btn btn-sm btn-ghost !px-2" title="Nasıl çalışır?">
          <HelpCircle size={14} />
        </button>
      </div>

      {winners.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[168px] z-40 flex justify-center sm:bottom-[152px]">
          <div className="pop flex items-center gap-2 rounded-full border border-emerald-400/40 bg-ink-950/95 px-3.5 py-1.5 text-[11px] font-bold text-emerald-200 shadow-xl">
            {winners.length} kazanan seçildi
            <button
              onClick={() => app.clearWinners()}
              className="pointer-events-auto rounded-full border border-emerald-400/40 px-2 py-0.5 text-[10px] hover:bg-emerald-400/15"
            >
              temizle
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div
          className={`pop fixed left-1/2 top-3 z-[60] -translate-x-1/2 rounded-full border px-3.5 py-2 text-[12px] font-bold shadow-xl backdrop-blur ${
            notice.tone === 'warn'
              ? 'border-amber-400/40 bg-amber-950/95 text-amber-200'
              : notice.tone === 'good'
                ? 'border-emerald-400/40 bg-emerald-950/95 text-emerald-200'
                : 'border-white/15 bg-ink-850/95 text-slate-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      {modal === 'setup' && <SetupModal table={table} />}
      {modal === 'payout' && <PayoutModal table={table} />}
      {modal === 'players' && <PlayersModal table={table} />}
      {modal === 'tables' && <TablesModal table={table} />}
      {modal === 'help' && <HelpModal />}

      <KeyboardShortcuts />
    </div>
  )
}

function KeyboardShortcuts() {
  const app = useApp()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return
      const t = app.table
      if (!t) return
      const k = e.key.toLowerCase()

      if (e.ctrlKey || e.metaKey) {
        if (k === 'z') {
          e.preventDefault()
          app.undo()
        }
        return
      }
      if (k === 'escape') {
        if (app.winners.length > 0) app.clearWinners()
        return
      }
      if (k >= '1' && k <= '9') {
        const seat = Number(k) - 1
        if (playerAt(t, seat)) app.setTargetSeat(seat)
        return
      }
      if (k === ' ') {
        e.preventDefault()
        app.act({ type: t.handActive ? 'nextTurn' : 'startHand' })
        return
      }
      const target = app.targetSeat !== null ? playerAt(t, app.targetSeat) : undefined
      if (!target) return
      if (k === 'a') app.act({ type: 'allIn', id: target.id })
      if (k === 'c') app.act({ type: 'call', id: target.id })
      if (k === 'f') app.act({ type: 'fold', id: target.id })
      if (k === 'r') app.act({ type: 'clearBet', id: target.id })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app])
  return null
}