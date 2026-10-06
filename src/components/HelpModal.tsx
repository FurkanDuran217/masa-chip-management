import { useApp } from '../store'
import { Modal } from './Modal'

const STEPS: Array<[string, string]> = [
  [
    '1. Odayı kur',
    'Ayarlar ekranından kişi sayısını, toplam bütçeyi, çip değerini ve körleri gir. Hazır şablonlar da var. Toplam bütçeyi biliyorsan bütçeden türet kutusuna yaz, çip değeri otomatik hesaplansın.',
  ],
  [
    '2. Oyuncuları oturt',
    'Masanın üstünden veya Oyuncular ekranından isimleri ekle. Her oyuncu giriş (buy-in) çipiyle başlar. Çipi biten oyuncuya rebuy ekle, çıkacak olanı Çık ile listeden düşür.',
  ],
  [
    '3. Eli başlat',
    'El Başlat düğmesi körleri ve anteyi otomatik koyar, düğmeyi (D) ve sırayı ayarlar. El bitince Eli kapat ile masada bekleyen çipler oyunculara geri döner.',
  ],
  [
    '4. Çip koy',
    'Alttaki Hedef satırından çip kimin önüne gideceğini seç, tepsideki çip düğmesine dokun. Koy modunda masaya ekler, Al modunda geri alır. Tek dokunuşla ALL-IN.',
  ],
  [
    '5. Kazananı seç ve dağıt',
    'Potu dağıt düğmesine bas, kazanan veya kazananları seç. Ana pot ve yan potlar otomatik hesaplanır, artık çipler düğmeden sonraki oyuncuya gider. Onaylayınca çipler kazanana geçer.',
  ],
  [
    '6. Bakiyeyi gör',
    'Bakiyeler panelinde her oyuncu için net = elindeki + masadaki − girdiği çip. Kim kazandı, kim ne kadar kaybetti tek bakışta görünür.',
  ],
]

const KEYS: Array<[string, string]> = [
  ['Ctrl + Z', 'Son işlemi geri al'],
  ['Boşluk', 'Eli başlat / sıradaki oyuncu'],
  ['A', 'Hedefe ALL-IN'],
  ['C', 'Çağır'],
  ['F', 'Pas'],
  ['1 – 9', 'Koltuk seç'],
  ['R', 'Önündeki çipleri geri al'],
  ['Esc', 'Kazanan seçimini bırak'],
]

export function HelpModal() {
  const { closeModal, table } = useApp()
  return (
    <Modal open onClose={closeModal} title="Nasıl Çalışır" subtitle="çip yönetimi rehberi" wide>
      <div className="space-y-4">
        <ol className="space-y-2.5">
          {STEPS.map(([title, text]) => (
            <li key={title} className="rounded-xl border border-white/10 bg-ink-900/60 p-3">
              <h3 className="text-[13px] font-bold text-gold-100">{title}</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed text-slate-400">{text}</p>
            </li>
          ))}
        </ol>

        <section>
          <h3 className="lbl">Klavye kısayolları</h3>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {KEYS.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border border-white/10 bg-ink-900/60 px-2.5 py-1.5">
                <kbd className="rounded border border-white/15 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-gold-200">
                  {k}
                </kbd>
                <span className="text-[11px] text-slate-400">{v}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-ink-900/60 p-3">
          <h3 className="text-[13px] font-bold text-gold-100">Bilmen gerekenler</h3>
          <ul className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed text-slate-400">
            <li>· Uygulama oyun kurallarını bilmez: el, flop, turn, river yoktur. Elini açıp ısırmak sana kalmış.</li>
            <li>· Çip değeri para cinsinden tanımlıdır: 1 çip = X para diyebilirsin (örn. 1 çip = 1 ₺).</li>
            <li>· Tüm kayıtlar bu cihazın tarayıcısında saklanır. Yedeklemek için Masalar → Dosya indir.</li>
            <li>· Yan potlar all-in durumlarında otomatik oluşur; dağıtımda her pot kendi uygun kazananına gider.</li>
            <li>
              · Şu anki masa: <span className="text-slate-200">{table?.name}</span> ·{' '}
              <span className="tabular-nums text-slate-300">{table?.players.length} oyuncu</span>
            </li>
          </ul>
        </section>
      </div>
    </Modal>
  )
}