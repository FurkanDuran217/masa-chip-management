import { useEffect, useMemo, useState } from 'react'
import { Check, Crown, Layers, Sparkles } from 'lucide-react'
import type { Table } from '../lib/types'
import { avatarColor, chips as fmtChips, computePots, initials, money } from '../lib/chips'
import { useApp } from '../store'
import { ChipStack } from './Chip'
import { Modal } from './Modal'

type Mode = 'pots' | 'split'

export function PayoutModal({ table }: { table: Table }) {
  const { act, closeModal, winners, clearWinners, toggleWinner, notify } = useApp()
  const [mode, setMode] = useState<Mode>('pots')

  const pots = useMemo(() => computePots(table.players), [table.players])
  const total = pots.reduce((s, p) => s + p.amount, 0)
  const nameOf = (id: string) => table.players.find((p) => p.id === id)?.name ?? '?'

  // varsayılan: her pot için uygun en çok yatıran oyuncu
  const autoAssign = useMemo(() => {
    const m: Record<number, string> = {}
    pots.forEach((pot, i) => {
      const best = pot.eligible
        .map((id) => table.players.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => !!p)
        .sort((a, b) => b.invested - a.invested || a.seat - b.seat)[0]
      m[i] = best?.id ?? ''
    })
    return m
  }, [pots, table.players])

  const [assign, setAssign] = useState<Record<number, string>>(autoAssign)
  useEffect(() => setAssign(autoAssign), [autoAssign])

  // önizleme
  const gains: Record<string, number> = useMemo(() => {
    if (mode === 'split') {
      if (winners.length === 0) return {}
      const share = Math.floor(total / winners.length)
      const m: Record<string, number> = {}
      winners.forEach((id) => (m[id] = share))
      let rest = total - share * winners.length
      const order = [...winners].sort(
        (a, b) =>
          (table.players.find((p) => p.id === a)?.seat ?? 0) - (table.players.find((p) => p.id === b)?.seat ?? 0),
      )
      let k = 0
      while (rest > 0 && order.length > 0) {
        m[order[k % order.length]] += 1
        rest -= 1
        k++
      }
      return m
    }
    const m: Record<string, number> = {}
    pots.forEach((pot, i) => {
      const id = assign[i]
      if (id && pot.eligible.includes(id)) m[id] = (m[id] ?? 0) + pot.amount
    })
    return m
  }, [mode, pots, assign, winners, total, table.players])

  const awarded = Object.values(gains).reduce((a, b) => a + b, 0)
  const unclaimed = total - awarded
  const canConfirm = mode === 'split' ? winners.length > 0 && unclaimed === 0 : unclaimed === 0 && pots.length > 0

  const confirm = () => {
    if (mode === 'split') {
      if (winners.length === 0) return notify('En az 1 kazanan seç', 'warn')
      act({ type: 'split', winners })
      notify(winners.length > 1 ? `${winners.length} kişiye bölündü` : 'Pot dağıtıldı', 'good')
    } else {
      if (unclaimed > 0) return notify('Her pot için kazanan seç', 'warn')
      act({ type: 'distribute', winners: [...new Set(Object.keys(gains))] })
      notify('Pot dağıtıldı', 'good')
    }
    clearWinners()
    closeModal()
  }

  return (
    <Modal
      open
      onClose={() => {
        clearWinners()
        closeModal()
      }}
      title="Potu Dağıt"
      subtitle={`${fmtChips(total)} çip · ${money(total * table.chipValue, table.currency)}`}
      footer={
        <>
          <div className="mr-auto flex gap-1">
            <button
              onClick={() => setMode('pots')}
              className={`btn btn-sm ${mode === 'pots' ? 'btn-active' : 'btn-ghost'}`}
            >
              Pot pot
            </button>
            <button
              onClick={() => setMode('split')}
              className={`btn btn-sm ${mode === 'split' ? 'btn-active' : 'btn-ghost'}`}
            >
              <Layers size={12} /> Eşit böl
            </button>
          </div>
          <button onClick={clearWinners} className="btn btn-ghost">
            temizle
          </button>
          <button onClick={confirm} disabled={!canConfirm} className="btn btn-green">
            <Check size={14} /> Onayla
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {pots.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-6 text-center text-xs text-slate-500">
            Masada çip yok.
          </p>
        ) : mode === 'pots' ? (
          <>
            <section>
              <h3 className="lbl">Her pot için kazanan</h3>
              <ul className="space-y-1.5">
                {pots.map((pot, i) => (
                  <li key={pot.label} className="rounded-xl border border-white/10 bg-ink-900/60 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-200">{pot.label}</div>
                        <div className="text-[10px] text-slate-500">
                          {pot.eligible.length} oyuncu uygun
                        </div>
                      </div>
                      <ChipStack amount={pot.amount} denoms={table.denoms} size={14} perColumn={3} maxColumns={3} />
                      <span className="w-14 shrink-0 text-right text-sm font-black tabular-nums text-gold-200">
                        {fmtChips(pot.amount)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {pot.eligible.length === 0 ? (
                        <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold text-rose-300">
                          uygun oyuncu yok
                        </span>
                      ) : (
                        pot.eligible.map((id) => {
                          const p = table.players.find((x) => x.id === id)!
                          const on = assign[i] === id
                          return (
                            <button
                              key={id}
                              onClick={() => setAssign((s) => ({ ...s, [i]: id }))}
                              className={`flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-2 text-[10px] font-bold transition ${
                                on
                                  ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-100'
                                  : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/25'
                              }`}
                            >
                              <span
                                className="grid h-4 w-4 place-items-center rounded-full text-[7px] font-bold text-white"
                                style={{ background: avatarColor(p.id) }}
                              >
                                {initials(p.name)}
                              </span>
                              {p.name}
                            </button>
                          )
                        })
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="lbl mb-0">Bölüşecek kazananlar</h3>
              <button
                onClick={() => pots.forEach((pot) => pot.eligible.forEach((id) => !winners.includes(id) && toggleWinner(id)))}
                className="text-[11px] font-semibold text-slate-400 hover:text-gold-200"
              >
                uygun olanların tümü
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {table.players
                .filter((p) => p.invested > 0)
                .map((p) => {
                  const on = winners.includes(p.id)
                  const eligible = !p.folded
                  return (
                    <button
                      key={p.id}
                      onClick={() => eligible && toggleWinner(p.id)}
                      disabled={!eligible}
                      className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 text-left transition ${
                        on ? 'border-emerald-400/60 bg-emerald-500/15' : 'border-white/10 bg-ink-900/60 hover:border-white/25'
                      } ${!eligible ? 'opacity-40' : ''}`}
                    >
                      <span
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
                        style={{ background: avatarColor(p.id) }}
                      >
                        {initials(p.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-bold text-slate-100">{p.name}</span>
                        <span className="block text-[10px] tabular-nums text-slate-500">
                          {eligible ? `${fmtChips(p.invested)} yatırdı` : 'pas geçti'}
                        </span>
                      </span>
                      {on && <Crown size={13} className="shrink-0 text-emerald-300" />}
                    </button>
                  )
                })}
            </div>
            {winners.length > 1 && (
              <p className="mt-1.5 text-[10px] text-slate-500">
                Tam pot {winners.length} kişiye eşit bölünür, artık çipler koltuğa göre dağıtılır.
              </p>
            )}
          </section>
        )}

        {/* önizleme */}
        <section className="rounded-2xl border border-gold-300/25 bg-gradient-to-br from-gold-300/[0.09] to-transparent p-3">
          <h3 className="lbl">Dağıtım önizlemesi</h3>
          {Object.keys(gains).length === 0 ? (
            <p className="text-[11px] text-slate-500">Kazanan seçilmedi.</p>
          ) : (
            <ul className="space-y-1.5">
              {Object.entries(gains)
                .sort((a, b) => b[1] - a[1])
                .map(([id, amount]) => (
                  <li key={id} className="flex items-center gap-2">
                    <span
                      className="grid h-5 w-5 place-items-center rounded-full text-[8px] font-bold text-white"
                      style={{ background: avatarColor(id) }}
                    >
                      {initials(nameOf(id))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-200">
                      {nameOf(id)}
                    </span>
                    <ChipStack amount={amount} denoms={table.denoms} size={14} perColumn={3} maxColumns={3} />
                    <span className="w-16 shrink-0 text-right text-xs font-black tabular-nums text-gold-100">
                      +{fmtChips(amount)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
          {unclaimed > 0 && (
            <p className="mt-2 rounded-lg bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
              {fmtChips(unclaimed)} çipin kazananı seçilmedi.
            </p>
          )}
          {unclaimed === 0 && Object.keys(gains).length > 0 && (
            <p className="mt-2 flex items-center gap-1 text-[11px] font-bold text-emerald-300">
              <Sparkles size={12} /> {fmtChips(total)} çipin tamamı dağıtılacak
            </p>
          )}
        </section>
      </div>
    </Modal>
  )
}