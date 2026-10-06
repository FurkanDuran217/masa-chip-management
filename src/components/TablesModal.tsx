import { useRef, useState } from 'react'
import { Copy, Download, FileUp, HelpCircle, Layers, Play, Plus, RotateCcw, Share2, Trash2, Users } from 'lucide-react'
import type { Table } from '../lib/types'
import { chips as fmtChips, money } from '../lib/chips'
import { PRESETS } from '../lib/presets'
import { buildShareUrl, exportTable, parseImport } from '../lib/store'
import { useApp } from '../store'
import { useLocalInstallPrompt } from '../lib/hooks'
import { Modal } from './Modal'

export function TablesModal({ table }: { table: Table }) {
  const { state, dispatch, act, closeModal, notify, openModal } = useApp()
  const { canInstall, install } = useLocalInstallPrompt()
  const fileRef = useRef<HTMLInputElement>(null)
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)

  const download = () => {
    const blob = new Blob([exportTable(table)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${table.name.replace(/\s+/g, '-').toLowerCase()}-masa.json`
    a.click()
    URL.revokeObjectURL(url)
    notify('Masa dosyası indirildi', 'good')
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportTable(table))
      notify('Panoya kopyalandı', 'good')
    } catch {
      notify('Kopyalanamadı', 'warn')
    }
  }

  const doImport = (text: string) => {
    try {
      const tables = parseImport(text)
      dispatch({ type: 'importTables', tables })
      closeModal()
      notify(`${tables.length} masa içe aktarıldı`, 'good')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Geçersiz dosya', 'warn')
    }
  }

  const shareLink = async () => {
    try {
      await navigator.clipboard.writeText(buildShareUrl(table))
      notify('Paylaşım linki kopyalandı', 'good')
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Link kopyalanamadı', 'warn')
    }
  }

  return (
    <Modal open onClose={closeModal} title="Masalar" subtitle="oda kur, aç, yedekle" wide>
      <div className="space-y-4">
        {/* yeni masa */}
        <section>
          <h3 className="lbl">Yeni masa</h3>
          <div className="mb-2 flex gap-1.5">
            <button
              onClick={() => openModal('players')}
              className="btn btn-sm btn-ghost flex-1"
              title="Oyuncu ekle, isim değiştir, rebuy, çıkış"
            >
              <Users size={13} /> Oyuncu yönetimi
            </button>
            <button onClick={() => openModal('help')} className="btn btn-sm btn-ghost" title="Nasıl çalışır?">
              <HelpCircle size={13} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {PRESETS.slice(0, 4).map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  dispatch({ type: 'createTable', input: { ...p.patch, name: p.name } })
                  closeModal()
                  notify('Masa oluşturuldu', 'good')
                }}
                className="rounded-xl border border-white/10 bg-ink-900/70 px-2 py-2 text-left transition hover:border-gold-300/50"
              >
                <div className="text-[12px] font-bold text-gold-100">{p.name}</div>
                <div className="text-[10px] text-slate-500">{p.tag}</div>
              </button>
            ))}
          </div>
          <button
            onClick={() => {
              dispatch({ type: 'createTable', input: { name: `Masa ${state.tables.length + 1}` } })
              closeModal()
              notify('Masa oluşturuldu', 'good')
            }}
            className="btn btn-ghost mt-1.5 w-full"
          >
            <Plus size={14} /> Şablonla başlat
          </button>
        </section>

        {/* kayıtlı masalar */}
        <section>
          <h3 className="lbl">Kayıtlı masalar</h3>
          <ul className="space-y-1.5">
            {state.tables.map((t) => (
              <li
                key={t.id}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 ${
                  t.id === table.id ? 'border-gold-300/50 bg-gold-300/[0.08]' : 'border-white/10 bg-ink-900/60'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold text-slate-100">{t.name}</div>
                  <div className="text-[10px] tabular-nums text-slate-500">
                    {t.players.length}/{t.maxPlayers} kişi · {fmtChips(t.sb)}/{fmtChips(t.bb)} · giriş{' '}
                    {fmtChips(t.buyIn)} çip ({money(t.buyIn * t.chipValue, t.currency)}) · el #{t.handNumber}
                  </div>
                </div>
                {t.id === table.id ? (
                  <span className="shrink-0 text-[10px] font-black uppercase text-gold-300">açık</span>
                ) : (
                  <button
                    onClick={() => {
                      dispatch({ type: 'setActive', id: t.id })
                      closeModal()
                    }}
                    className="btn btn-sm btn-ghost shrink-0"
                  >
                    <Play size={12} /> aç
                  </button>
                )}
                <button
                  onClick={() => dispatch({ type: 'duplicateTable', id: t.id })}
                  className="btn btn-sm btn-ghost shrink-0"
                  title="Kopyala"
                >
                  <Copy size={12} />
                </button>
                <button
                  onClick={() => {
                    if (state.tables.length === 1) return notify('Son masayı silemezsin', 'warn')
                    if (!confirm(`"${t.name}" silinsin mi?`)) return
                    dispatch({ type: 'deleteTable', id: t.id })
                    notify('Masa silindi', 'good')
                  }}
                  className="btn btn-sm btn-ghost shrink-0 text-rose-300"
                  title="Sil"
                >
                  <Trash2 size={12} />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* oyun sıfırlama */}
        <section className="rounded-2xl border border-white/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-slate-400">
              Yeni oyun: bakiyeler, eller ve kayıtlar sıfırlanır, herkes {fmtChips(table.buyIn)} çip alır.
            </div>
            <div className="flex gap-1.5">
              <button onClick={() => openModal('setup')} className="btn btn-sm btn-ghost">
                <Layers size={13} /> Ayarlar
              </button>
              <button
                onClick={() => {
                  if (!confirm('Yeni oyun başlatılsın mı? Tüm ilerleme sıfırlanır.')) return
                  act({ type: 'resetChips' })
                  notify('Yeni oyun başladı', 'good')
                }}
                className="btn btn-sm btn-danger"
              >
                <RotateCcw size={13} /> Yeni oyun
              </button>
            </div>
          </div>
        </section>

        {/* yedekle */}
        <section>
          <h3 className="lbl">Yedekle / paylaş</h3>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={download} className="btn btn-sm btn-ghost">
              <Download size={13} /> Dosya indir
            </button>
            <button onClick={copy} className="btn btn-sm btn-ghost">
              <Copy size={13} /> Panoya kopyala
            </button>
            <button onClick={shareLink} className="btn btn-sm btn-ghost">
              <Share2 size={13} /> Link kopyala
            </button>
            <button onClick={() => fileRef.current?.click()} className="btn btn-sm btn-ghost">
              <FileUp size={13} /> Dosyadan al
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                doImport(await f.text())
                e.target.value = ''
              }}
            />
          </div>
          <button onClick={() => setShowPaste((v) => !v)} className="mt-1.5 text-[11px] font-semibold text-slate-400 hover:text-gold-200">
            {showPaste ? 'yapıştırmayı kapat' : 'elle yapıştır'}
          </button>
          {showPaste && (
            <textarea
              className="field mt-1.5 h-24 font-mono text-[10px]"
              placeholder='{ "type": "masa-table", ... }'
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
          )}
          {showPaste && (
            <button onClick={() => doImport(paste)} className="btn btn-sm btn-gold mt-1.5">
              İçe aktar
            </button>
          )}
        </section>

        {/* uygulama */}
        <section className="rounded-2xl border border-white/10 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[11px] text-slate-400">
              Veriler sadece bu cihazda saklanır. Uygulamayı masaüstüne kurmak için:
            </div>
            <button
              onClick={async () => {
                const ok = await install()
                notify(ok ? 'Uygulama kuruldu' : 'Kurulum iptal edildi', ok ? 'good' : 'info')
              }}
              disabled={!canInstall}
              className="btn btn-sm btn-ghost"
            >
              <Download size={13} /> Uygulamayı kur
            </button>
          </div>
          <p className="mt-1.5 text-[10px] text-slate-600">
            {canInstall
              ? 'Kurulum penceresini aç.'
              : 'Tarayıcı menüsünden "Yükle / Install" ya da adres çubuğundaki kurulum simgesini kullan.'}
          </p>
        </section>
      </div>
    </Modal>
  )
}