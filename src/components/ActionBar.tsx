import { ArrowLeftRight, ChevronRight, Flame, Play, Plus, Undo2, X } from 'lucide-react'
import type { Table } from '../lib/types'
import { avatarColor, chips as fmtChips, currentMaxBet, initials, playerAt, toCall } from '../lib/chips'
import { useApp } from '../store'
import { ChipDisc } from './Chip'

interface Props {
  table: Table
  compact: boolean
}

export function ActionBar({ table, compact }: Props) {
  const { act, undo, canUndo, targetSeat, setTargetSeat, trayMode, setTrayMode, winners, clearWinners, notify, openModal, setSide, side } =
    useApp()

  const target = targetSeat !== null ? playerAt(table, targetSeat) : undefined
  const potTotal = table.players.reduce((s, p) => s + p.invested, 0)
  const maxBet = currentMaxBet(table)
  const cur = playerAt(table, table.currentSeat)

  const addChips = (amount: number) => {
    if (!target) return notify('Önce bir koltuk seç', 'warn')
    if (amount <= 0) return
    if (trayMode === 'push') {
      if (target.stack <= 0) return notify(`${target.name} elinde çip yok`, 'warn')
      act({ type: 'pushChips', id: target.id, amount: Math.min(amount, target.stack) })
    } else {
      if (target.bet <= 0) return notify(`${target.name} önünde çip yok`, 'warn')
      act({ type: 'pullChips', id: target.id, amount })
    }
  }

  const quick = [table.bb, table.bb * 2, table.bb * 3, Math.round(potTotal / 2), potTotal].filter((q) => q > 0)

  return (
    <div className="relative z-30 shrink-0 border-t border-white/10 bg-gradient-to-b from-ink-900/95 to-ink-950 shadow-[0_-18px_40px_-24px_rgba(0,0,0,0.9)]">
      {/* hedef seçici */}
      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/5 px-3 py-1.5 [scrollbar-width:none]">
        <span className="shrink-0 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Hedef</span>
        {table.players.length === 0 && <span className="text-[11px] text-slate-500">masaya oyuncu ekle</span>}
        {table.players.map((p) => (
          <button
            key={p.id}
            onClick={() => setTargetSeat(p.seat)}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 transition-all ${
              target?.id === p.id
                ? 'border-gold-300/70 bg-gold-300/15 text-gold-100'
                : 'border-white/10 bg-ink-800/60 text-slate-300 hover:border-white/25'
            }`}
            title={`${p.name} · elinde ${fmtChips(p.stack)} · önünde ${fmtChips(p.bet)}`}
          >
            <span
              className="grid h-5 w-5 place-items-center rounded-full text-[8px] font-bold text-white"
              style={{ background: avatarColor(p.id) }}
            >
              {initials(p.name)}
            </span>
            <span className="max-w-[74px] truncate text-[11px] font-semibold">{p.name}</span>
            {p.allIn && <span className="text-[8px] font-black text-rose-400">A</span>}
          </button>
        ))}
        <div className="ml-auto flex shrink-0 gap-1">
          <button
            onClick={() => setTrayMode('push')}
            className={`btn btn-sm ${trayMode === 'push' ? 'btn-gold' : 'btn-ghost'}`}
            title="Masaya çip koy"
          >
            <Plus size={12} /> Koy
          </button>
          <button
            onClick={() => setTrayMode('pull')}
            className={`btn btn-sm ${trayMode === 'pull' ? 'btn-active' : 'btn-ghost'}`}
            title="Önünden çip geri al"
          >
            <Undo2 size={12} /> Al
          </button>
        </div>
      </div>

      {/* çip tepsisi */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
        {table.denoms.map((d) => (
          <ChipDisc
            key={d}
            value={d}
            denoms={table.denoms}
            size={compact ? 32 : 36}
            label
            onClick={() => addChips(d)}
            title={`${fmtChips(d)} çip ${trayMode === 'push' ? 'koy' : 'geri al'}`}
          />
        ))}
        <button
          onClick={() => {
            if (!target) return notify('Koltuk seç', 'warn')
            act({ type: 'allIn', id: target.id })
          }}
          className="btn btn-sm ml-auto shrink-0 btn-danger"
          title="Tüm çip masaya"
        >
          <Flame size={13} /> ALL-IN
        </button>
      </div>

      {/* el kontrolleri + kısayollar */}
      <div className="flex items-center gap-1.5 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none]">
        {table.handActive ? (
          <>
            {cur && toCall(cur, maxBet) > 0 && (
              <button onClick={() => act({ type: 'call', id: cur.id })} className="btn shrink-0 btn-green">
                Çağır {fmtChips(Math.min(toCall(cur, maxBet), cur.stack))}
              </button>
            )}
            <button onClick={() => act({ type: 'nextTurn' })} className="btn btn-sm shrink-0 btn-ghost" title="Sıradaki oyuncu">
              <ChevronRight size={13} /> Sıradaki
            </button>
            {cur && (
              <button onClick={() => act({ type: 'fold', id: cur.id })} className="btn btn-sm shrink-0 btn-ghost">
                <X size={12} /> Pas
              </button>
            )}
            <button onClick={() => act({ type: 'endHand' })} className="btn btn-sm shrink-0 btn-ghost">
              Eli kapat
            </button>
          </>
        ) : (
          <button onClick={() => act({ type: 'startHand' })} className="btn shrink-0 btn-gold">
            <Play size={13} /> El Başlat
          </button>
        )}

        <span className="h-5 w-px shrink-0 bg-white/10" />

        {quick.map((q, i) => (
          <button key={i} onClick={() => addChips(q)} className="btn btn-sm shrink-0 btn-ghost" title={`${fmtChips(q)} çip`}>
            {fmtChips(q)}
          </button>
        ))}

        <span className="h-5 w-px shrink-0 bg-white/10" />

        <button onClick={undo} disabled={!canUndo} className="btn btn-sm shrink-0 btn-ghost" title="Geri al (Ctrl+Z)">
          <Undo2 size={13} />
        </button>
        <button
          onClick={() => setSide(side === 'log' ? null : 'log')}
          className={`btn btn-sm shrink-0 ${side === 'log' ? 'btn-active' : 'btn-ghost'}`}
        >
          Kayıt
        </button>

        {potTotal > 0 && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {winners.length > 0 && (
              <>
                <span className="text-[11px] font-bold text-emerald-300">{winners.length} kazanan</span>
                <button onClick={clearWinners} className="btn btn-sm btn-ghost">
                  temizle
                </button>
              </>
            )}
            <button onClick={() => openModal('payout')} className="btn shrink-0 btn-green">
              <ArrowLeftRight size={13} /> Potu dağıt
            </button>
          </div>
        )}
      </div>
    </div>
  )
}