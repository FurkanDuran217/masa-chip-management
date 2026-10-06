import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Crown,
  DoorOpen,
  Plus,
  RotateCcw,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
} from 'lucide-react'
import type { Table } from '../lib/types'
import { avatarColor, chips as fmtChips, initials, money, netOf } from '../lib/chips'
import { useApp } from '../store'
import { Modal } from './Modal'

export function PlayersModal({ table }: { table: Table }) {
  const { act, closeModal, notify } = useApp()
  const [name, setName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [payFor, setPayFor] = useState<string | null>(null)
  const [payValue, setPayValue] = useState('')

  const addPlayer = () => {
    act({ type: 'addPlayer', name })
    setName('')
    notify('Oyuncu eklendi', 'good')
  }

  return (
    <Modal open onClose={closeModal} title="Oyuncular" subtitle={`${table.players.length}/${table.maxPlayers} koltuk dolu`} wide>
      <div className="space-y-4">
        {/* ekle */}
        <div className="flex gap-1.5">
          <input
            className="field"
            placeholder="İsim yaz ve Enter'a bas"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
          />
          <button onClick={addPlayer} className="btn btn-gold shrink-0">
            <UserPlus size={14} /> Ekle
          </button>
        </div>

        {table.players.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/15 px-3 py-8 text-center text-xs text-slate-500">
            Henüz oyuncu yok. Yukarıdan isim ekleyerek başla.
          </p>
        )}

        <ul className="space-y-2">
          {table.players.map((p) => {
            const net = netOf(p)
            return (
              <li key={p.id} className="rounded-2xl border border-white/10 bg-ink-900/60 p-2.5">
                <div className="flex items-start gap-2">
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[11px] font-bold text-white shadow-inner"
                    style={{ background: avatarColor(p.id) }}
                  >
                    {initials(p.name)}
                  </span>

                  <div className="min-w-0 flex-1">
                    {editing === p.id ? (
                      <input
                        autoFocus
                        className="field py-1 text-sm"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => {
                          act({ type: 'renamePlayer', id: p.id, name: draft })
                          setEditing(null)
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur()
                          if (e.key === 'Escape') setEditing(null)
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setEditing(p.id)
                          setDraft(p.name)
                        }}
                        className="block max-w-full truncate text-left text-sm font-bold text-slate-100 hover:text-gold-200"
                      >
                        {p.name}
                      </button>
                    )}
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums text-slate-500">
                      <span className="font-bold text-gold-200">{fmtChips(p.stack)}</span>
                      <span className="text-slate-500">{money(p.stack * table.chipValue, table.currency)}</span>
                      {p.bet > 0 && <span className="text-amber-400/90">önünde {fmtChips(p.bet)}</span>}
                      {p.rebuys > 0 && <span className="text-violet-400/90">{p.rebuys} rebuy</span>}
                      {table.buttonSeat === p.seat && (
                        <span className="rounded bg-white/90 px-1 text-[9px] font-black text-ink-950">D</span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div
                      className={`text-sm font-black tabular-nums ${
                        net > 0 ? 'text-emerald-400' : net < 0 ? 'text-rose-400' : 'text-slate-500'
                      }`}
                    >
                      {net > 0 ? '+' : ''}
                      {fmtChips(net)}
                    </div>
                    <div className="text-[9px] uppercase tracking-wide text-slate-600">{p.seat + 1}. koltuk</div>
                  </div>
                </div>

                {/* aksiyonlar */}
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <button
                    onClick={() => act({ type: 'rebuy', id: p.id, amount: table.buyIn })}
                    className="btn btn-sm btn-ghost"
                    title="Tam giriş ekle"
                  >
                    +{fmtChips(table.buyIn)}
                  </button>
                  <button
                    onClick={() => act({ type: 'rebuy', id: p.id, amount: Math.round(table.buyIn / 2) })}
                    className="btn btn-sm btn-ghost"
                    title="Yarısını ekle"
                  >
                    +{fmtChips(Math.round(table.buyIn / 2))}
                  </button>
                  <button
                    onClick={() => act({ type: 'rebuy', id: p.id, amount: table.bb * 10 })}
                    className="btn btn-sm btn-ghost"
                    title="10 BB ekle"
                  >
                    +10BB
                  </button>
                  <button
                    onClick={() => {
                      setPayFor(p.id)
                      setPayValue(String(p.stack))
                    }}
                    className="btn btn-sm btn-ghost"
                    title="Stack'i elle düzelt"
                  >
                    Öde
                  </button>

                  <span className="h-4 w-px bg-white/10" />

                  <button onClick={() => act({ type: 'moveSeat', id: p.id, dir: -1 })} className="btn btn-sm btn-ghost" title="Sola taşı">
                    <ChevronLeft size={13} />
                  </button>
                  <button onClick={() => act({ type: 'setButton', seat: p.seat })} className="btn btn-sm btn-ghost" title="Düğme yap">
                    <Crown size={12} /> D
                  </button>
                  <button onClick={() => act({ type: 'moveSeat', id: p.id, dir: 1 })} className="btn btn-sm btn-ghost" title="Sağa taşı">
                    <ChevronRight size={13} />
                  </button>

                  <span className="h-4 w-px bg-white/10" />

                  <button
                    onClick={() =>
                      act({ type: 'setStatus', id: p.id, status: p.status === 'sitout' ? 'playing' : 'sitout' })
                    }
                    disabled={p.invested > 0}
                    className={`btn btn-sm ${p.status === 'sitout' ? 'btn-active' : 'btn-ghost'}`}
                    title="Mola ver / dön"
                  >
                    {p.status === 'sitout' ? <UserCheck size={12} /> : <UserMinus size={12} />}
                    {p.status === 'sitout' ? 'Oyunda' : 'Mola'}
                  </button>
                  <button onClick={() => act({ type: 'cashOut', id: p.id })} disabled={p.invested > 0} className="btn btn-sm btn-ghost" title="Masadan çık, çipleri öde">
                    <DoorOpen size={12} /> Çık
                  </button>
                  <button onClick={() => act({ type: 'removePlayer', id: p.id })} className="btn btn-sm btn-ghost text-rose-300" title="Oyuncuyu sil">
                    <Trash2 size={12} />
                  </button>
                </div>

                {/* ödeme */}
                {payFor === p.id && (
                  <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-gold-300/30 bg-gold-300/[0.07] p-2">
                    <span className="text-[11px] font-semibold text-gold-200">Yeni stack:</span>
                    <input
                      autoFocus
                      className="field w-28 py-1 text-center text-xs tabular-nums"
                      inputMode="numeric"
                      value={payValue}
                      onChange={(e) => setPayValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          act({ type: 'setStack', id: p.id, amount: Number(payValue.replace(/\D/g, '') || 0) })
                          setPayFor(null)
                        }
                        if (e.key === 'Escape') setPayFor(null)
                      }}
                    />
                    <button
                      onClick={() => {
                        act({ type: 'setStack', id: p.id, amount: Number(payValue.replace(/\D/g, '') || 0) })
                        setPayFor(null)
                      }}
                      className="btn btn-sm btn-gold"
                    >
                      Uygula
                    </button>
                    <button onClick={() => setPayFor(null)} className="btn btn-sm btn-ghost">
                      <RotateCcw size={12} />
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {table.players.length > 0 && (
          <button
            onClick={() => {
              act({ type: 'addPlayer' })
              notify('Boş koltuğa oyuncu eklendi', 'good')
            }}
            className="btn btn-ghost w-full"
          >
            <Plus size={14} /> Boş koltuğa oyuncu ekle
          </button>
        )}
      </div>
    </Modal>
  )
}