import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Coins, Info, Plus, RotateCcw, Trash2, TrendingUp, TriangleAlert, Users, Wand } from 'lucide-react'
import type { BlindLevel, Currency, Table } from '../lib/types'
import { chips as fmtChips, money, parseNum } from '../lib/chips'
import { PRESETS } from '../lib/presets'
import { defaultBlindLevels } from '../lib/table'
import { useApp } from '../store'
import { ChipDisc } from './Chip'
import { Modal } from './Modal'

interface Draft {
  name: string
  currency: Currency
  chipValue: number
  maxPlayers: number
  buyIn: number
  sb: number
  bb: number
  ante: number
  denoms: number[]
  handsPerLevel: number
  blindLevels: BlindLevel[]
  note: string
}

const CURRENCIES: Currency[] = ['TRY', 'USD', 'EUR', 'GBP', 'CHF']

const BLIND_PRESETS: Array<[number, number]> = [
  [5, 10],
  [10, 20],
  [25, 50],
  [50, 100],
  [100, 200],
  [500, 1000],
]

const BUYIN_PRESETS = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000]

/** kör listesinde kaç satır görünsün */
const LEVEL_ROWS = 6

/** hangi alanlar "değişti" listesinde görünsün */
const FIELD_LABELS: Array<[keyof Draft, string]> = [
  ['name', 'Masa adı'],
  ['currency', 'Para birimi'],
  ['chipValue', 'Çip değeri'],
  ['maxPlayers', 'Kişi sayısı'],
  ['buyIn', 'Giriş'],
  ['sb', 'SB'],
  ['bb', 'BB'],
  ['ante', 'Ante'],
  ['denoms', 'Çip ayarları'],
  ['handsPerLevel', 'Kör yükseltme'],
  ['blindLevels', 'Kör listesi'],
  ['note', 'Not'],
]

type Issue = { key: string; msg: string; level: 'error' | 'warn' }

export function SetupModal({ table }: { table: Table }) {
  const { act, closeModal, notify, state, dispatch, openModal } = useApp()
  const [d, setD] = useState<Draft>(() => fromTable(table))
  /** elle yapılan değişiklik var mı? (şablon uygulamak sayılmaz) */
  const [touched, setTouched] = useState(false)
  const [presetId, setPresetId] = useState<string | null>(null)
  const [budgetText, setBudgetText] = useState('')
  /** çip değeri odaktayken ham yazım korunur (0, yazarken 0 olmasın) */
  const [chipText, setChipText] = useState<string | null>(null)
  const [showAllLevels, setShowAllLevels] = useState(false)
  const [ask, setAsk] = useState<'none' | 'discard' | 'reset'>('none')
  const [ack, setAck] = useState(false)
  /** onay penceresi açıkken yapılacak ek işlem: açılacak masa id'si */
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    setD(fromTable(table))
    setTouched(false)
    setPresetId(null)
    setBudgetText('')
    setChipText(null)
    setShowAllLevels(false)
    setAsk('none')
    setAck(false)
    setPending(null)
  }, [table.id]) // eslint-disable-line react-hooks/exhaustive-deps

  /** şablon uygulaması dışındaki her değişiklik "gerçek" değişikliktir */
  const touch = () => {
    setTouched(true)
    setPresetId(null)
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    touch()
    setD((s) => ({ ...s, [k]: v }))
  }

  const changes = useMemo(() => changedFields(d, table), [d, table])
  const dirty = touched && changes.length > 0

  const issues = useMemo(() => validate(d, table), [d, table])
  const errors = issues.filter((i) => i.level === 'error')
  const canSave = errors.length === 0
  const errAt = (k: string) => errors.find((i) => i.key === k)?.msg
  const warnAt = (k: string) => issues.find((i) => i.level === 'warn' && i.key === k)?.msg

  const totalChips = d.maxPlayers * d.buyIn
  const budget = totalChips * d.chipValue
  const seated = table.players.length
  const minSeats = table.players.reduce((mx, p) => Math.max(mx, p.seat + 1), 2)
  const onTable = table.players.reduce((s, p) => s + p.stack + p.invested, 0)
  /** çip tutarını paraya çevir (her yerde para görünsün) */
  const m = (n: number) => money(n * d.chipValue, d.currency)

  const activePreset = PRESETS.find((p) => p.id === presetId)
  const budgetNum = parseNum(budgetText)
  const previewChipValue = totalChips > 0 && budgetNum > 0 ? Math.round((budgetNum / totalChips) * 10000) / 10000 : 0

  const save = (): boolean => {
    if (!canSave) {
      notify(`${errors.length} ayar düzeltilmeli`, 'warn')
      return false
    }
    let levels = d.blindLevels
    let extra = ''
    if (levels.length === 0) {
      levels = regenerateLevels(d.sb, d.bb, 12)
      extra = ' · kör listesi SB/BB’den yeniden üretildi'
    }
    act({
      type: 'settings',
      patch: {
        name: d.name.trim(),
        currency: d.currency,
        chipValue: d.chipValue,
        maxPlayers: d.maxPlayers,
        buyIn: d.buyIn,
        sb: d.sb,
        bb: d.bb,
        ante: d.ante,
        denoms: d.denoms,
        handsPerLevel: d.handsPerLevel,
        blindLevels: levels,
        note: d.note,
      },
    })
    setTouched(false)
    setPresetId(null)
    notify(`Ayarlar kaydedildi${extra}`, 'good')
    return true
  }

  const requestClose = () => {
    if (dirty) {
      setPending(null)
      setAsk('discard')
      return
    }
    closeModal()
  }

  const runPending = (id: string) => {
    dispatch({ type: 'setActive', id })
    notify('Masa değiştirildi', 'good')
  }

  const applyAndReset = () => {
    if (!save()) return
    act({ type: 'resetChips' })
    setAsk('none')
    setAck(false)
    closeModal()
    notify('Yeni oyun başlatıldı', 'good')
  }

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)
    if (!p) return
    setD((s) => ({
      ...s,
      ...p.patch,
      denoms: p.patch.denoms ? [...p.patch.denoms] : s.denoms,
      blindLevels: p.patch.blindLevels ? p.patch.blindLevels.map((l) => ({ ...l })) : s.blindLevels,
    }))
    // şablon bir başlangıç noktası: kullanıcı elle bir şey değiştirmeden "Vazgeç"e basabilir
    setTouched(false)
    setPresetId(id)
  }

  /** sb/bb değişince kör listesi de ondan türetilir (önizleme ile gerçek aynı kalır) */
  const setBlinds = (sb: number, bb: number) => {
    setD((s) => ({ ...s, sb, bb, blindLevels: regenerateLevels(sb, bb, s.blindLevels.length) }))
    touch()
  }

  const addDenom = (raw: string) => {
    const v = Math.round(parseNum(raw))
    if (!Number.isFinite(v) || v <= 0) {
      notify('Geçerli bir çip değeri gir (örn. 25)', 'warn')
      return
    }
    if (d.denoms.includes(v)) {
      notify(`${fmtChips(v)} çip zaten listede, eklenmedi`, 'warn')
      return
    }
    setD((s) => ({ ...s, denoms: [...s.denoms, v].sort((a, b) => a - b) }))
    touch()
  }

  const removeDenom = (v: number) => {
    if (d.denoms.length <= 1) {
      notify('Son çip ayarı silinemez', 'warn')
      return
    }
    set('denoms', d.denoms.filter((x) => x !== v))
  }

  const suggestDenomsForBb = () => {
    set('denoms', suggestDenoms(d.bb))
    notify(`BB (${fmtChips(d.bb)}) için çip seti hazırlandı`, 'good')
  }

  const setLevel = (i: number, key: 'sb' | 'bb', raw: string) => {
    const v = Math.max(0, Math.round(parseNum(raw)))
    setD((s) => ({
      ...s,
      blindLevels: s.blindLevels.map((l, idx) => (idx === i ? { ...l, [key]: v } : l)),
    }))
    touch()
  }

  const removeLevel = (i: number) => {
    if (d.blindLevels.length <= 1) {
      notify('Son kör seviyesi silinemez', 'warn')
      return
    }
    setD((s) => ({ ...s, blindLevels: s.blindLevels.filter((_, idx) => idx !== i) }))
    touch()
  }

  const addLevel = () => {
    setD((s) => {
      const last = s.blindLevels[s.blindLevels.length - 1]
      if (!last) return { ...s, blindLevels: regenerateLevels(s.sb, s.bb, 12) }
      return { ...s, blindLevels: [...s.blindLevels, { sb: last.sb * 2, bb: last.bb * 2 }] }
    })
    touch()
  }

  const regenerateLadder = () => {
    setD((s) => ({ ...s, blindLevels: regenerateLevels(s.sb, s.bb, 12) }))
    touch()
    notify('Kör listesi SB/BB’den yeniden üretildi', 'good')
  }

  const applyBudget = () => {
    if (totalChips <= 0) {
      notify('Önce kişi sayısı ve girişi düzelt', 'warn')
      return
    }
    if (budgetNum <= 0) {
      notify('Geçerli bir toplam bütçe gir', 'warn')
      return
    }
    setD((s) => ({ ...s, chipValue: previewChipValue }))
    touch()
    setBudgetText('')
    notify(`1 çip = ${money(previewChipValue, d.currency)} olarak ayarlandı`, 'good')
  }

  const openTable = (id: string) => {
    if (dirty) {
      setPending(id)
      setAsk('discard')
      return
    }
    runPending(id)
  }

  const visibleLevels = showAllLevels ? d.blindLevels : d.blindLevels.slice(0, LEVEL_ROWS)

  return (
    <>
      <Modal
        open
        onClose={requestClose}
        title="Masa Ayarları"
        subtitle="kişi sayısı, toplam para, körler ve çip ayarları"
        wide
        footer={
          <>
            {dirty && (
              <span className="mr-auto min-w-0 text-[10px] font-semibold leading-tight text-gold-200/90">
                Kaydedilmemiş değişiklikler var
              </span>
            )}
            <button type="button" onClick={requestClose} className="btn btn-ghost">
              Vazgeç
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!canSave}
              className="btn btn-gold"
              title={canSave ? 'Ayarları kaydet' : 'Önce hataları düzelt'}
            >
              <Check size={14} /> Kaydet
            </button>
          </>
        }
      >
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          {/* kaydedilmemiş değişiklikler */}
          {dirty && (
            <div className="rounded-xl border border-gold-300/25 bg-gold-300/[0.07] px-3 py-2 text-[11px] text-gold-100">
              Kaydedilmemiş değişiklikler: <span className="font-bold">{changes.join(' · ')}</span>
            </div>
          )}

          {/* hata özeti */}
          {errors.length > 0 && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/25 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-rose-200">
                <TriangleAlert size={13} /> {errors.length} ayar düzeltilmeli — Kaydet kilitli
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[10px] leading-relaxed text-rose-200/85">
                {errors.map((i, n) => (
                  <li key={n}>{i.msg}</li>
                ))}
              </ul>
            </div>
          )}

          {/* şablonlar */}
          <section>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="lbl mb-0">Hazır şablon</h3>
              {activePreset && <span className="text-[10px] font-bold text-gold-200">uygulandı — Kaydet’e bas</span>}
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {PRESETS.map((p) => {
                const on = p.id === presetId
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => applyPreset(p.id)}
                    className={`rounded-xl border px-2 py-2 text-left transition ${
                      on
                        ? 'border-gold-300/70 bg-gold-300/15'
                        : 'border-white/10 bg-ink-900/70 hover:border-gold-300/50 hover:bg-ink-800'
                    }`}
                  >
                    <div className={`flex items-center gap-1 text-[12px] font-bold ${on ? 'text-gold-100' : 'text-slate-100'}`}>
                      {on && <Check size={11} className="shrink-0 text-gold-300" />}
                      {p.name}
                    </div>
                    <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{p.tag}</div>
                  </button>
                )
              })}
            </div>
            {activePreset && (
              <p className="mt-1.5 text-[10px] leading-relaxed text-gold-200/90">
                «{activePreset.name}» uygulandı → {d.maxPlayers} kişi · giriş {fmtChips(d.buyIn)} çip ({m(d.buyIn)}) ·{' '}
                {fmtChips(d.sb)}/{fmtChips(d.bb)} · 1 çip = {money(d.chipValue, d.currency)} · bütçe {money(budget, d.currency)}.
                Kalıcı olması için <b>Kaydet</b>’e bas.
              </p>
            )}
          </section>

          {/* temel */}
          <section className="space-y-3">
            <h3 className="lbl">Masa ve giriş</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Masa adı" error={errAt('name')}>
                <input className="field" value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="Cumartesi ev oyunu" />
              </Field>

              <Field label="Para birimi">
                <select className="field" value={d.currency} onChange={(e) => set('currency', e.target.value as Currency)}>
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="1 çip kaç para?"
                error={errAt('chipValue')}
                hint={
                  <span className="mt-1 block text-[10px] text-slate-500">
                    Şu an 1 çip = {money(d.chipValue, d.currency)} · BB = {money(d.bb * d.chipValue, d.currency)}
                  </span>
                }
              >
                <input
                  className="field tabular-nums"
                  inputMode="decimal"
                  aria-label="1 çip kaç para"
                  value={chipText ?? String(d.chipValue)}
                  onChange={(e) => {
                    setChipText(e.target.value)
                    set('chipValue', Math.round(parseNum(e.target.value) * 10000) / 10000)
                  }}
                  onBlur={() => setChipText(null)}
                />
              </Field>

              <Field
                label={
                  <>
                    <Users size={11} className="mr-1 inline" />
                    Kişi sayısı (koltuk)
                  </>
                }
                error={errAt('maxPlayers')}
                hint={<span className="mt-1 block text-[10px] text-slate-500">Şu an masada {seated} oyuncu var (en az {minSeats} koltuk).</span>}
              >
                <div className="flex items-center gap-1.5">
                  <button type="button" className="btn btn-sm" onClick={() => set('maxPlayers', Math.max(2, d.maxPlayers - 1))} aria-label="Kişi azalt">
                    −
                  </button>
                  <input
                    className="field text-center tabular-nums"
                    inputMode="numeric"
                    aria-label="Kişi sayısı"
                    value={d.maxPlayers}
                    onChange={(e) => set('maxPlayers', Math.min(12, Math.max(2, Math.round(parseNum(e.target.value)) || 2)))}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => set('maxPlayers', Math.min(12, d.maxPlayers + 1))} aria-label="Kişi artır">
                    +
                  </button>
                </div>
              </Field>

              <Field
                label={
                  <>
                    <Coins size={11} className="mr-1 inline" />
                    Giriş (buy-in)
                  </>
                }
                error={errAt('buyIn')}
                hint={
                  <span className="mt-1 block text-[10px] text-slate-500">
                    {fmtChips(d.buyIn)} çip = {m(d.buyIn)} / kişi · BB oranı {d.buyIn > 0 && d.bb > 0 ? `${((d.bb / d.buyIn) * 100).toFixed(1)}%` : '—'}
                  </span>
                }
              >
                <div className="flex gap-1.5">
                  <input
                    className="field tabular-nums"
                    inputMode="numeric"
                    aria-label="Giriş (buy-in) çip"
                    value={String(d.buyIn)}
                    onChange={(e) => set('buyIn', Math.round(parseNum(e.target.value)))}
                  />
                  <select
                    className="field w-28 shrink-0"
                    value={''}
                    aria-label="Hazır giriş"
                    onChange={(e) => {
                      const v = parseNum(e.target.value)
                      if (v > 0) set('buyIn', v)
                    }}
                  >
                    <option value="">hazır</option>
                    {BUYIN_PRESETS.map((v) => (
                      <option key={v} value={v}>
                        {fmtChips(v)}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
            </div>
          </section>

          {/* toplam para */}
          <section className="rounded-2xl border border-gold-300/25 bg-gradient-to-br from-gold-300/[0.09] to-transparent p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-gold-300/80">
                  Masa toplam bütçesi
                  {presetId && d.currency !== table.currency && (
                    <span className="rounded-md border border-gold-300/40 px-1 py-px text-[9px] tracking-normal text-gold-200">
                      {table.currency} → {d.currency}
                    </span>
                  )}
                </div>
                <div className="text-2xl font-black tabular-nums text-gold-100">{money(budget, d.currency)}</div>
                <div className="text-[11px] tabular-nums text-slate-400">
                  {fmtChips(totalChips)} çip · {d.maxPlayers} kişi
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] tabular-nums text-slate-400">
                  <span>1 çip = {money(d.chipValue, d.currency)}</span>
                  <span>giriş = {m(d.buyIn)}</span>
                  <span>BB = {m(d.bb)}</span>
                </div>
              </div>

              <div className="w-full sm:w-60">
                <span className="lbl">Toplam bütçeyi gir → çip değerini hesapla</span>
                <div className="flex gap-1.5">
                  <input
                    className="field tabular-nums"
                    inputMode="decimal"
                    aria-label="Toplam bütçe"
                    placeholder={money(budget, d.currency)}
                    value={budgetText}
                    onChange={(e) => setBudgetText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        applyBudget()
                      }
                    }}
                  />
                  <button type="button" onClick={applyBudget} className="btn btn-sm shrink-0" title="Çip değerini bu bütçeye göre hesapla">
                    <Wand size={13} /> Uygula
                  </button>
                </div>
                <p className="mt-1 text-[10px] leading-relaxed text-slate-500">
                  {previewChipValue > 0 ? (
                    <>
                      Uygulanırsa: 1 çip = <span className="text-gold-200">{money(previewChipValue, d.currency)}</span> · toplam{' '}
                      {money(budgetNum, d.currency)}
                    </>
                  ) : (
                    'Uygula’ya basana kadar hiçbir değer değişmez.'
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* körler */}
          <section className="space-y-2">
            <h3 className="lbl">Körler (blind)</h3>
            <div className="grid grid-cols-3 gap-2">
              <Field
                label="Small blind"
                error={errAt('sb')}
                hint={<span className="mt-1 block text-[10px] tabular-nums text-slate-500">{m(d.sb)}</span>}
              >
                <input
                  className="field tabular-nums"
                  inputMode="numeric"
                  aria-label="Small blind"
                  value={String(d.sb)}
                  onChange={(e) => setBlinds(Math.round(parseNum(e.target.value)), d.bb)}
                />
              </Field>
              <Field
                label="Big blind"
                error={errAt('bb')}
                hint={<span className="mt-1 block text-[10px] tabular-nums text-slate-500">{m(d.bb)}</span>}
              >
                <input
                  className="field tabular-nums"
                  inputMode="numeric"
                  aria-label="Big blind"
                  value={String(d.bb)}
                  onChange={(e) => setBlinds(d.sb, Math.round(parseNum(e.target.value)))}
                />
              </Field>
              <Field
                label="Ante"
                error={errAt('ante')}
                hint={<span className="mt-1 block text-[10px] tabular-nums text-slate-500">{d.ante > 0 ? m(d.ante) : 'ante yok'}</span>}
              >
                <input
                  className="field tabular-nums"
                  inputMode="numeric"
                  aria-label="Ante"
                  value={String(d.ante)}
                  onChange={(e) => set('ante', Math.round(parseNum(e.target.value)))}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {BLIND_PRESETS.map(([sb, bb]) => (
                <button
                  key={`${sb}`}
                  type="button"
                  onClick={() => setBlinds(sb, bb)}
                  className={`btn btn-sm ${d.sb === sb && d.bb === bb ? 'btn-active' : 'btn-ghost'}`}
                >
                  {fmtChips(sb)}/{fmtChips(bb)}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setBlinds(Math.round(d.buyIn / 100), Math.round(d.buyIn / 50))}
                className="btn btn-sm btn-ghost"
                title="Buy-in'in %1 / %2'si"
              >
                %1/%2
              </button>
              <button type="button" onClick={() => set('ante', Math.max(1, Math.round(d.bb / 10)))} className="btn btn-sm btn-ghost">
                ante = BB/10
              </button>
              <button type="button" onClick={() => set('ante', 0)} className="btn btn-sm btn-ghost">
                ante yok
              </button>
            </div>
            <p className="text-[10px] text-slate-500">
              SB {fmtChips(d.sb)} çip = {m(d.sb)} · BB {fmtChips(d.bb)} çip = {m(d.bb)}
            </p>
          </section>

          {/* kör yükseltme */}
          <section className="space-y-2">
            <h3 className="lbl">
              <TrendingUp size={11} className="mr-1 inline" />
              Kör yükseltme (turnuva)
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400">Her</span>
              <input
                className="field w-20 text-center tabular-nums"
                inputMode="numeric"
                aria-label="Her kaç elde kör artar"
                placeholder="0"
                disabled={d.handsPerLevel === 0}
                value={d.handsPerLevel === 0 ? '' : String(d.handsPerLevel)}
                onChange={(e) => set('handsPerLevel', Math.max(0, Math.round(parseNum(e.target.value))))}
              />
              <span className="text-[11px] text-slate-400">elde kör iki katına çıksın</span>
              <button
                type="button"
                onClick={() => set('handsPerLevel', d.handsPerLevel > 0 ? 0 : 10)}
                className={`btn btn-sm ${d.handsPerLevel > 0 ? 'btn-active' : 'btn-ghost'}`}
              >
                {d.handsPerLevel > 0 ? 'açık' : 'kapalı'}
              </button>
            </div>

            {d.handsPerLevel <= 0 ? (
              <p className="text-[10px] text-slate-500">
                Kapalı: körler elle sabit ({fmtChips(d.sb)}/{fmtChips(d.bb)} = {m(d.bb)}). Otomatik artış için düğmeye bas.
              </p>
            ) : (
              <div className="space-y-1.5">
                {errAt('ladder') && <Msg level="error">{errAt('ladder')}</Msg>}
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <p className="text-[10px] text-slate-500">
                    Her seviye bir öncekinin 2 katı. SB/BB değişince liste baştan üretilir; satırları elle de düzenleyebilirsin.
                  </p>
                  <button type="button" onClick={regenerateLadder} className="btn btn-sm btn-ghost shrink-0">
                    <RotateCcw size={11} /> SB/BB’den üret
                  </button>
                </div>
                <div className="space-y-1">
                  {visibleLevels.map((l, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-ink-900/60 px-2 py-1">
                      <span className="w-14 shrink-0 text-[9px] font-bold uppercase tracking-wider text-slate-500">
                        {i === 0 ? '1. el' : `${i * d.handsPerLevel + 1}. el`}
                      </span>
                      <input
                        className="field w-14 shrink-0 py-1 text-center text-xs tabular-nums"
                        inputMode="numeric"
                        aria-label={`${i + 1}. seviye small blind`}
                        value={String(l.sb)}
                        onChange={(e) => setLevel(i, 'sb', e.target.value)}
                      />
                      <span className="text-[10px] text-slate-600">/</span>
                      <input
                        className="field w-14 shrink-0 py-1 text-center text-xs tabular-nums"
                        inputMode="numeric"
                        aria-label={`${i + 1}. seviye big blind`}
                        value={String(l.bb)}
                        onChange={(e) => setLevel(i, 'bb', e.target.value)}
                      />
                      <span className="ml-auto truncate text-[10px] tabular-nums text-slate-500">{money(l.bb * d.chipValue, d.currency)}</span>
                      {i === table.blindLevel && <span className="shrink-0 rounded border border-gold-300/40 px-1 text-[9px] text-gold-200">şu an</span>}
                      <button
                        type="button"
                        onClick={() => removeLevel(i)}
                        className="btn btn-ghost shrink-0 px-1 py-0.5"
                        title="Seviye sil"
                        aria-label={`${i + 1}. seviyeyi sil`}
                      >
                        <Trash2 size={11} className="text-rose-400" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button type="button" onClick={addLevel} className="btn btn-sm btn-ghost">
                    <Plus size={11} /> Seviye ekle
                  </button>
                  {d.blindLevels.length > LEVEL_ROWS && (
                    <button type="button" onClick={() => setShowAllLevels((v) => !v)} className="btn btn-sm btn-ghost">
                      {showAllLevels ? 'İlk 6 seviye' : `Tümü (${d.blindLevels.length})`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* çip ayarları */}
          <section className="space-y-2">
            <h3 className="lbl">Çip ayarları</h3>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-ink-900/60 p-2.5">
              {d.denoms.map((v) => (
                <button key={v} type="button" onClick={() => removeDenom(v)} className="group relative" title={`${fmtChips(v)} çip — sil`}>
                  <ChipDisc value={v} denoms={d.denoms} size={38} label />
                  <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border border-white/20 bg-ink-950 opacity-0 transition group-hover:opacity-100">
                    <Trash2 size={8} className="text-rose-400" />
                  </span>
                </button>
              ))}
              <AddDenom onAdd={addDenom} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={suggestDenomsForBb} className="btn btn-sm btn-ghost">
                <Wand size={12} /> BB için uygun çipler ({fmtChips(d.bb)})
              </button>
              <span className="text-[10px] text-slate-500">Tepsi bu çiplerden oluşur; en küçük çip BB’den büyük olmamalı.</span>
            </div>
            {errAt('denoms') && <Msg level="error">{errAt('denoms')}</Msg>}
            {warnAt('denoms') && <Msg level="warn">{warnAt('denoms')}</Msg>}
          </section>

          <section>
            <label className="lbl">Not</label>
            <textarea
              className="field min-h-16 resize-y"
              value={d.note}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Örn. cumartesi ev oyunu, kasa Zeynep'te"
            />
            <p className="mt-1 text-[10px] text-slate-500">Notta Enter yeni satır açar; tek satırlık alanlarda Enter kaydeder.</p>
          </section>

          {/* tehlikeli */}
          <section className="rounded-2xl border border-rose-500/25 bg-rose-950/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] leading-relaxed text-rose-200/80">
                Ayarları uygulayıp tüm çipleri sıfırlar: {seated} oyuncunun toplam {fmtChips(onTable)} çipi silinir, herkes{' '}
                {fmtChips(d.buyIn)} çip ({m(d.buyIn)}) ile yeniden başlar.
              </div>
              <button
                type="button"
                onClick={() => {
                  setAck(false)
                  setPending(null)
                  setAsk('reset')
                }}
                className="btn btn-sm btn-danger"
              >
                <RotateCcw size={13} /> Yeni oyun başlat
              </button>
            </div>
          </section>

          {/* masalar */}
          <section className="rounded-2xl border border-white/10 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="lbl mb-0">Kayıtlı masalar ({state.tables.length})</h3>
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'createTable' })
                  notify('Yeni masa oluşturuldu', 'good')
                }}
                className="btn btn-sm btn-ghost"
              >
                <Plus size={13} /> Masa ekle
              </button>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {state.tables.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 ${
                    t.id === table.id ? 'border-gold-300/50 bg-gold-300/10' : 'border-white/10 bg-ink-900/60'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-bold text-slate-100">{t.name}</div>
                    <div className="text-[10px] tabular-nums text-slate-500">
                      {t.players.length}/{t.maxPlayers} kişi · {fmtChips(t.sb)}/{fmtChips(t.bb)} · {money(t.buyIn * t.chipValue, t.currency)}
                    </div>
                  </div>
                  {t.id !== table.id && (
                    <button type="button" onClick={() => openTable(t.id)} className="btn btn-sm btn-ghost">
                      aç
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="flex justify-end gap-2 pb-1">
            <button type="button" onClick={() => openModal('help')} className="btn btn-ghost">
              Nasıl çalışır?
            </button>
          </div>
        </form>
      </Modal>

      {ask === 'discard' && (
        <Confirm
          title="Değişiklikler kaydedilmedi"
          confirmLabel={pending ? 'Kaydet ve masayı aç' : 'Kaydet ve kapat'}
          confirmClass="btn btn-gold"
          onCancel={() => {
            setAsk('none')
            setPending(null)
          }}
          onConfirm={() => {
            if (!save()) return
            setAsk('none')
            if (pending) runPending(pending)
            else closeModal()
          }}
        >
          <p>Şu değişiklikler kaybolacak:</p>
          <p className="rounded-lg border border-white/10 bg-ink-950/50 px-2 py-1.5 text-[11px] text-slate-300">{changes.join(' · ')}</p>
          <button
            type="button"
            onClick={() => {
              setAsk('none')
              setPending(null)
              closeModal()
            }}
            className="btn btn-ghost mt-1 w-full justify-center"
          >
            Kaydetmeden kapat
          </button>
        </Confirm>
      )}

      {ask === 'reset' && (
        <Confirm
          title="Yeni oyun başlatılsın mı?"
          tone="danger"
          confirmLabel="Evet, çipleri sıfırla"
          confirmClass="btn btn-danger"
          disabled={!ack}
          onCancel={() => setAsk('none')}
          onConfirm={applyAndReset}
        >
          <p>Ayarlar uygulanacak ve <b>tüm çipler sıfırlanacak</b>. El geçmişi ve kim oturduğu korunur.</p>
          <div className="rounded-lg border border-white/10 bg-ink-950/50 px-2 py-1.5">
            <div className="text-[11px] font-bold text-rose-200">
              {seated} oyuncunun toplam {fmtChips(onTable)} çipi silinecek
            </div>
            <ul className="mt-1 space-y-0.5 text-[10px] text-slate-400">
              {table.players.slice(0, 4).map((p) => (
                <li key={p.id}>
                  {p.name}: {fmtChips(p.stack + p.invested)} çip
                </li>
              ))}
              {seated > 4 && <li>ve {seated - 4} kişi daha…</li>}
            </ul>
            <div className="mt-1 text-[10px] text-slate-400">
              Herkes {fmtChips(d.buyIn)} çip = {m(d.buyIn)} ile başlayacak.
            </div>
          </div>
          <label className="flex cursor-pointer items-start gap-2 text-[11px] text-slate-200">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 accent-rose-400" />
            <span>
              Anladım: {fmtChips(onTable)} çip silinecek, el sayacı ve kör seviyesi sıfırlanacak.
            </span>
          </label>
        </Confirm>
      )}
    </>
  )
}

/** etiket + içerik + satır içi hata/uyarı */
function Field({
  label,
  error,
  hint,
  children,
}: {
  label: ReactNode
  error?: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <span className="lbl">{label}</span>
      {children}
      {hint}
      {error && <Msg level="error">{error}</Msg>}
    </div>
  )
}

function Msg({ level, children }: { level: 'error' | 'warn'; children: ReactNode }) {
  const Icon = level === 'error' ? TriangleAlert : Info
  return (
    <p className={`mt-1 flex items-start gap-1 text-[10px] leading-relaxed ${level === 'error' ? 'text-rose-300' : 'text-amber-300/90'}`}>
      <Icon size={11} className="mt-px shrink-0" />
      <span>{children}</span>
    </p>
  )
}

/** ikinci katman onay penceresi (kaydedilmemiş değişiklik / yeni oyun) */
function Confirm({
  title,
  tone = 'warn',
  confirmLabel,
  confirmClass,
  disabled,
  onCancel,
  onConfirm,
  children,
}: {
  title: string
  tone?: 'warn' | 'danger'
  confirmLabel: string
  confirmClass: string
  disabled?: boolean
  onCancel: () => void
  onConfirm: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fade-in absolute inset-0 bg-ink-950/85 backdrop-blur-sm" onClick={onCancel} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onCancel()
          }
        }}
        className="sheet-in panel-flat relative w-full max-w-sm p-4 text-left"
      >
        <div className={`text-sm font-black uppercase tracking-wide ${tone === 'danger' ? 'text-rose-200' : 'text-gold-100'}`}>{title}</div>
        <div className="mt-2 space-y-2 text-[12px] leading-relaxed text-slate-300">{children}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button ref={ref} type="button" onClick={onCancel} className="btn btn-ghost">
            Vazgeç
          </button>
          <button type="button" onClick={onConfirm} disabled={disabled} className={confirmClass}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddDenom({ onAdd }: { onAdd: (v: string) => void }) {
  const [v, setV] = useState('')
  const submit = () => {
    onAdd(v)
    setV('')
  }
  return (
    <div className="flex items-center gap-1">
      <input
        className="field w-20 py-1 text-center text-xs tabular-nums"
        placeholder="değer"
        inputMode="numeric"
        aria-label="Yeni çip değeri"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button type="button" onClick={submit} className="btn btn-sm" title="Çip ayarı ekle">
        <Plus size={13} />
      </button>
    </div>
  )
}

function fromTable(t: Table): Draft {
  return {
    name: t.name,
    currency: t.currency,
    chipValue: t.chipValue,
    maxPlayers: t.maxPlayers,
    buyIn: t.buyIn,
    sb: t.sb,
    bb: t.bb,
    ante: t.ante,
    denoms: [...t.denoms],
    handsPerLevel: t.handsPerLevel,
    blindLevels: t.blindLevels.length > 0 ? t.blindLevels.map((l) => ({ ...l })) : defaultBlindLevels(t.sb, t.bb),
    note: t.note,
  }
}

/** draft ile kayıtlı tablo arasında farklı alanların okunur listesi */
function changedFields(d: Draft, t: Table): string[] {
  const base = fromTable(t)
  return FIELD_LABELS.filter(([k]) => JSON.stringify(d[k]) !== JSON.stringify(base[k])).map(([, label]) => label)
}

/** mevcut sb/bb'den iki katlayarak kör listesi üret */
function regenerateLevels(sb: number, bb: number, count: number): BlindLevel[] {
  const n = Math.max(1, Math.min(40, count))
  return Array.from({ length: n }, (_, i) => ({
    sb: Math.max(0, Math.round(sb * Math.pow(2, i))),
    bb: Math.max(0, Math.round(bb * Math.pow(2, i))),
  }))
}

function niceStep(n: number): number {
  if (!(n > 0)) return 1
  const p = Math.pow(10, Math.floor(Math.log10(n)))
  const f = n / p
  const s = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return Math.round(s * p)
}

/** BB'ye göre makul bir çip seti (en küçük çip her zaman ≤ BB) */
function suggestDenoms(bb: number): number[] {
  const base = niceStep(Math.max(1, bb / 100))
  return [1, 5, 10, 25, 50, 100, 500, 1000].map((k) => k * base)
}

function validate(d: Draft, table: Table): Issue[] {
  const out: Issue[] = []
  const err = (key: string, msg: string) => out.push({ key, msg, level: 'error' })
  const warn = (key: string, msg: string) => out.push({ key, msg, level: 'warn' })

  const seated = table.players.length
  const minSeats = table.players.reduce((mx, p) => Math.max(mx, p.seat + 1), 2)

  if (!d.name.trim()) err('name', 'Masa adı boş olamaz.')
  if (!Number.isFinite(d.chipValue) || d.chipValue <= 0) err('chipValue', '“1 çip kaç para?” 0’dan büyük olmalı.')
  if (!Number.isFinite(d.maxPlayers) || d.maxPlayers < 2) err('maxPlayers', 'En az 2 koltuk olmalı.')
  else if (d.maxPlayers > 12) err('maxPlayers', 'En fazla 12 koltuk olabilir.')
  else if (d.maxPlayers < minSeats) err('maxPlayers', `Masada ${seated} oyuncu var; koltuk en az ${minSeats} olmalı.`)
  if (!Number.isFinite(d.buyIn) || d.buyIn <= 0) err('buyIn', 'Giriş (buy-in) 0’dan büyük olmalı.')
  if (!Number.isFinite(d.sb) || d.sb < 0) err('sb', 'Küçük kör negatif olamaz.')
  if (!Number.isFinite(d.bb) || d.bb <= 0) err('bb', 'Büyük kör 0’dan büyük olmalı.')
  if (d.bb > 0 && d.sb > d.bb) err('bb', `BB (${fmtChips(d.bb)}) SB’den (${fmtChips(d.sb)}) küçük olamaz.`)
  if (d.buyIn > 0 && d.bb > d.buyIn) err('buyIn', `Giriş (${fmtChips(d.buyIn)} çip) BB’den (${fmtChips(d.bb)} çip) küçük olamaz.`)
  if (!Number.isFinite(d.ante) || d.ante < 0) err('ante', 'Ante negatif olamaz.')
  else if (d.buyIn > 0 && d.ante > d.buyIn) err('ante', `Ante (${fmtChips(d.ante)} çip) girişten büyük olamaz.`)
  if (!Number.isFinite(d.handsPerLevel) || d.handsPerLevel < 0) err('handsPerLevel', 'Elde sayısı negatif olamaz (0 = kapalı).')

  if (d.denoms.length === 0) {
    err('denoms', 'En az bir çip ayarı olmalı.')
  } else {
    const seen = new Set<number>()
    const valid: number[] = []
    let duplicated = 0
    for (const v of d.denoms) {
      if (!Number.isFinite(v) || v <= 0 || !Number.isInteger(v)) continue
      if (seen.has(v)) duplicated += 1
      seen.add(v)
      valid.push(v)
    }
    if (valid.length !== d.denoms.length) err('denoms', 'Çip ayarları pozitif tam sayı olmalı.')
    else if (duplicated > 0) err('denoms', `${duplicated} çip ayarı birden fazla kez var.`)
    const min = valid.length > 0 ? Math.min(...valid) : 0
    if (min > 0 && d.bb > 0 && min > d.bb)
      warn('denoms', `En küçük çip (${fmtChips(min)}) BB’den (${fmtChips(d.bb)}) büyük — kör bu çiplerle ödenemez.`)
    else if (min > 0 && d.bb > 0 && d.bb % min !== 0)
      warn('denoms', `BB (${fmtChips(d.bb)}), en küçük çipin (${fmtChips(min)}) katı değil; elde artan çip çıkabilir.`)
  }

  if (d.handsPerLevel > 0) {
    if (d.blindLevels.length === 0) {
      err('ladder', 'Kör listesi boş — “SB/BB’den üret”e bas.')
    } else {
      const first = d.blindLevels[0]
      if (!Number.isFinite(first.bb) || first.bb <= 0) err('ladder', 'İlk kör seviyesinin BB’si 0’dan büyük olmalı.')
      else if (first.sb > first.bb) err('ladder', 'İlk seviyede SB, BB’den büyük olamaz.')
    }
  }

  return out
}
