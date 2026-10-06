import { useState } from 'react'
import {
  ArrowRight,
  Coins,
  Download,
  Flame,
  Gauge,
  Layers,
  Play,
  Users,
  Wallet,
} from 'lucide-react'
import type { Currency } from '../lib/types'
import { chips as fmtChips, money, tableTotalInPlay } from '../lib/chips'
import { PRESETS } from '../lib/presets'
import { useApp } from '../store'
import { ChipDisc } from './Chip'

const FEATURES = [
  {
    icon: Users,
    title: 'Kişi sayısı senin',
    text: '2 kişiden 12 kişiye kadar koltuk sayısını ayarla, oyuncuları otur, koltukları taşı.',
  },
  {
    icon: Wallet,
    title: 'Toplam parayı sen belirle',
    text: 'Toplam bütçeyi gir, çip değerini otomatik hesaplasın. Her şey hem çip hem para olarak görünsün.',
  },
  {
    icon: Coins,
    title: 'Kör + ante',
    text: 'Small blind, big blind ve ante. Tek dokunuşla hazır şablonlar ya da kendi yapını.',
  },
  {
    icon: Flame,
    title: 'All-in ve çip işlemleri',
    text: 'Çip tepsisine dokun, masaya koy. ALL-IN, çağırma, pas, geri alma — hepsi tek ekranda.',
  },
  {
    icon: Layers,
    title: 'Ana pot + yan pot',
    text: 'All-in durumlarında yan potlar otomatik hesaplanır, kazanan doğru şekilde dağıtılır.',
  },
  {
    icon: Gauge,
    title: 'Bakiye ve kayıt',
    text: 'Her işlem kaydedilir. Net kâr, rebuy ve çıkışlar tek listede; geri al tek dokunuşta.',
  },
]

export function Landing() {
  const { state, dispatch, notify } = useApp()
  const [presetId, setPresetId] = useState(PRESETS[0].id)
  const preset = PRESETS.find((p) => p.id === presetId) ?? PRESETS[0]
  const [name, setName] = useState('')
  const [seats, setSeats] = useState(preset.patch.maxPlayers ?? 6)

  const currency: Currency = preset.patch.currency ?? 'TRY'
  const chipValue = preset.patch.chipValue ?? 1
  const buyIn = preset.patch.buyIn ?? 5000
  const sb = preset.patch.sb ?? 25
  const bb = preset.patch.bb ?? 50
  const denoms = preset.patch.denoms ?? [1, 5, 10, 25, 50, 100, 500, 1000]
  const total = seats * buyIn

  const create = () => {
    dispatch({
      type: 'createTable',
      input: { ...preset.patch, maxPlayers: seats, name: name.trim() || preset.name },
    })
    notify('Masa kuruldu!', 'good')
  }

  const continueTable = state.tables[0]

  return (
    <div className="min-h-full overflow-y-auto">
      {/* üst şerit */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-gold-300/30 bg-gradient-to-b from-gold-300/25 to-transparent text-lg font-black text-gold-200">
            M
          </span>
          <div>
            <div className="text-sm font-black tracking-tight text-gold-100">Masa</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">çip yönetimi</div>
          </div>
        </div>
        {continueTable && (
          <button onClick={() => dispatch({ type: 'setActive', id: continueTable.id })} className="btn btn-sm btn-ghost">
            <Play size={13} /> {continueTable.name}
          </button>
        )}
      </header>

      {/* hero */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-4 pb-10 sm:pt-10">
        <div className="grid items-center gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold-300/25 bg-gold-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-gold-200">
              Oyun yok · sadece çip
            </span>
            <h1 className="mt-3 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
              <span className="gold-text">Masa başı poker</span>
              <br />
              <span className="text-slate-100">çip defteri.</span>
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-400">
              Arkadaşlarınla oynadığınız masada kafanız çip saymakla meşgul olmasın. Kişi sayısını, toplam
              bütçeyi, körleri sen belirle; çip koyma, all-in, kazanan seçme ve bakiye işlemleri tek ekranda.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
              <span className="rounded-full border border-white/10 px-2 py-1">Veriler cihazında kalır</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Üyelik yok</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Telefon + masaüstü</span>
              <span className="rounded-full border border-white/10 px-2 py-1">Ücretsiz</span>
            </div>
          </div>

          {/* kurulum kartı */}
          <div className="panel p-4">
            <h2 className="text-sm font-black uppercase tracking-wide text-gold-100">Oda kur</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Hazır şablon seç, kişi sayısını belirle.</p>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPresetId(p.id)
                    setSeats(p.patch.maxPlayers ?? 6)
                  }}
                  className={`rounded-xl border px-2 py-2 text-left transition ${
                    p.id === presetId
                      ? 'border-gold-300/60 bg-gold-300/12'
                      : 'border-white/10 bg-ink-900/60 hover:border-white/25'
                  }`}
                >
                  <div className="text-[12px] font-bold text-slate-100">{p.name}</div>
                  <div className="text-[10px] leading-tight text-slate-500">{p.tag}</div>
                </button>
              ))}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <div>
                <label className="lbl">Masa adı</label>
                <input
                  className="field"
                  placeholder={preset.name}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="lbl">Kişi sayısı</label>
                <div className="flex items-center gap-1.5">
                  <button className="btn btn-sm" onClick={() => setSeats((s) => Math.max(2, s - 1))}>
                    −
                  </button>
                  <input
                    className="field text-center tabular-nums"
                    inputMode="numeric"
                    value={seats}
                    onChange={(e) => setSeats(Math.min(12, Math.max(2, Number(e.target.value.replace(/\D/g, '')) || 2)))}
                  />
                  <button className="btn btn-sm" onClick={() => setSeats((s) => Math.min(12, s + 1))}>
                    +
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center gap-1.5 py-1">
              {denoms.slice(0, 8).map((d) => (
                <ChipDisc key={d} value={d} denoms={denoms} size={30} label />
              ))}
            </div>

            <dl className="mt-2 grid grid-cols-3 gap-1.5 text-center">
              <Cell label="Giriş" value={`${fmtChips(buyIn)} çip`} sub={money(buyIn * chipValue, currency)} />
              <Cell label="Körler" value={`${fmtChips(sb)}/${fmtChips(bb)}`} sub={money(bb * chipValue, currency)} />
              <Cell label="Toplam" value={fmtChips(total)} sub={money(total * chipValue, currency)} />
            </dl>

            <button onClick={create} className="btn btn-gold mt-3 w-full py-2.5 text-sm">
              Masayı kur <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* özellikler */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-10">
        <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Neler yapabilir</h2>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel-flat p-3.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg border border-gold-300/20 bg-gold-300/10 text-gold-200">
                <f.icon size={15} />
              </span>
              <h3 className="mt-2 text-[13px] font-bold text-slate-100">{f.title}</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* kayıtlı masalar */}
      {state.tables.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-10">
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Kayıtlı masalar</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {state.tables.map((t) => (
              <button
                key={t.id}
                onClick={() => dispatch({ type: 'setActive', id: t.id })}
                className="panel-flat flex items-center gap-2 p-3 text-left transition hover:border-gold-300/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-slate-100">{t.name}</div>
                  <div className="text-[10px] tabular-nums text-slate-500">
                    {t.players.length}/{t.maxPlayers} kişi · {fmtChips(t.sb)}/{fmtChips(t.bb)} ·{' '}
                    {money(tableTotalInPlay(t) * t.chipValue, t.currency)}
                  </div>
                </div>
                <ArrowRight size={14} className="shrink-0 text-slate-600" />
              </button>
            ))}
          </div>
        </section>
      )}

      <footer className="mx-auto w-full max-w-6xl px-4 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-4 text-[10.5px] text-slate-600">
          <span>Masa · masa başı çip yönetimi</span>
          <span className="flex items-center gap-1.5">
            <Download size={11} />
            Tarayıcıdan "Yükle" diyerek uygulama gibi kullan
          </span>
        </div>
      </footer>
    </div>
  )
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-ink-900/60 px-2 py-1.5">
      <dt className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="text-[12px] font-bold tabular-nums text-gold-100">{value}</dd>
      {sub && <dd className="text-[10px] tabular-nums text-slate-500">{sub}</dd>}
    </div>
  )
}