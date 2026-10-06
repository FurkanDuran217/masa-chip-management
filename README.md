# Masa · Çip Yönetimi

Masa başı poker oynarken **çip sayma derdini bitiren** uygulama. Oyun kuralları yok, kart yok,
flop yok — sadece oda kurma, çip koyma, all-in, pot dağıtma ve bakiye takibi.

Hem web sitesi hem de kurulabilir bir uygulama (PWA): aynı kod, tarayıcıda açılır,
"Yükle" ile masaüstüne/phone ikonuyla tek dokunuşla uygulama olur.

---

## Hızlı başlangıç

```bash
npm install
npm run dev        # geliştirme sunucusu (http://localhost:5173)
npm run build      # üretim derlemesi -> dist/
npm run preview    # derlenmiş sürümü yerel sun
npm run selftest   # çip muhasebesi kendi kendine testi
```

## Ne yapabilir

| İhtiyaç | Nasıl |
| --- | --- |
| Odayı kurmak | Giriş ekranından şablon seç veya Ayarlar'dan kişi sayısı / bütçe / kör / ante gir |
| Toplam parayı belirlemek | "Masa toplam bütçesi" kutusuna toplam parayı yaz → çip değeri otomatik hesaplanır |
| Kişi sayısını ayarlamak | 2–12 kişi, koltuk sayısı anında değişir |
| Small / big blind, ante | Hazır 5/10, 10/20, 25/50, 50/100, 100/200, 500/1000 veya serbest giriş |
| Çip koymak | Alt taraftaki **çip tepsisi**: çip düğmesine dokun → hedef oyuncunun önüne eklenir |
| All-in | Tek dokunuşla **ALL-IN** düğmesi |
| Hızlı artırma | `+BB`, `+2BB`, `+3BB`, `½ pot`, `pot` kısayolları |
| Geri alma | Koltuk kartındaki ↩ düğmesi, tepsideki **Al** modu, `Ctrl+Z` |
| Potu dağıtmak | **Potu dağıt** → her pot için kazanan (varsayılanı otomatik) veya **Eşit böl** |
| Bakiye | Sağ üstteki grafik düğmesi: net = elindeki + masadaki − girdiği |
| Rebuy / çıkış / ödeme | Masalar → Oyuncu yönetimi |
| Yedekleme | Masalar → Dosya indir / Panoya kopyala / Link kopyala |

## Klavye kısayolları

| Tuş | İşlev |
| --- | --- |
| `Boşluk` | Eli başlat / sıradaki oyuncu |
| `A` | Hedefe ALL-IN |
| `C` | Çağır |
| `F` | Pas |
| `R` | Önündeki çipleri geri al |
| `1`–`9` | Koltuk seç |
| `Ctrl+Z` | Son işlemi geri al |
| `Esc` | Kazanan seçimini temizle |

---

## Çip muhasebesi neden güvenilir

Bu uygulamanın tek kritik kuralı şu:

```
Σ (stack + invested + cashOutTotal)  ===  Σ buyInTotal
```

Hiçbir çip kaybolmaz, hiçbir çip yoktan çıkmaz. `npm run selftest` bunu her işlemden
sonra doğrulayan bir fuzz testi dahil **~29.000 kontrol** çalıştırır:

- temel el akışı (kör → çağırma → raise → dağıt → el kapatma)
- all-in yan potları ve uygunluk kuralları
- artık çip bölüşümü
- turnuva kör yükseltmesi
- rebuy / ödeme / elle düzeltme
- heads-up (2 kişi) kuralı
- 60 tur × 80 rastgele işlemlik fuzz

Ana pot + yan pot hesabı `src/lib/chips.ts` içindeki `computePots` ile yapılır:
katman sınırları masadaki tüm yatırımlardan üretilir, uygunluk yalnızca pas geçmemiş
oyuncuları içerir ve hak edenleri aynı olan katmanlar tek potta birleştirilir.

### "Eli kapat" ne yapar?

Dağıtım yapılmadan el kapatılırsa masada kalan çipler ilgili oyuncuların yığınına
iade edilir (el iptal edilmiş gibi). Kayıtlar bu iadeyi açıkça yazar.

---

## Mimari

```
src/
  lib/
    types.ts      # veri modeli (Table, Player, LogEntry, PotSlice)
    chips.ts      # çip↔para, çip ayrıştırma, ana/yan pot hesabı, koltuk sırası
    table.ts      # tüm oyun kuralları: saf fonksiyonlar (reducer -> Table)
    store.ts      # tablo listesi, geri alma yığını, localStorage, dışa/içe aktarma
    presets.ts    # hazır masa şablonları
    hooks.ts      # medya sorgusu, PWA kurulum istemi
  components/
    Landing.tsx     # giriş / kurulum sitesi
    TableBoard.tsx  # çiğnöş, pot merkezi, koltuk halkası
    SeatCard.tsx    # oyuncu kartı
    ActionBar.tsx   # hedef seçici + çip tepsisi + el kontrolleri
    TopBar.tsx      # masa adı, el/kör bilgisi, toplam bakiye
    LogPanel.tsx    # işlem kayıtları + bakiye paneli
    SetupModal.tsx  # oda kurucu: kişi, bütçe, kör, ante, çip ayarları
    PayoutModal.tsx # pot / yan pot dağıtımı, eşit bölme
    PlayersModal.tsx# oyuncu yönetimi
    TablesModal.tsx # masa listesi, yedekleme, paylaşım
    HelpModal.tsx   # kısa rehber
  store.tsx       # React context: uygulama durumu + arayüz durumu
  App.tsx         # ekran düzeni, kısayollar, paylaşım linki
```

Durum tamamen React + `localStorage` üzerinde; sunucu, hesap ve üyelik yok.
Aynı cihazda iki sekme açarsanız sekmeler arası senkron çalışır.

## Veri ve gizlilik

- Tüm kayıtlar yalnızca cihazın tarayıcısında (`localStorage`, anahtar `masa.chip.v1`).
- Sunucuya hiçbir istek gitmez.
- Yedeklemek için: Masalar → Dosya indir (`.json`) veya Bağlantı kopyala.

## Yayınlama

`npm run build` çıktısı (`dist/`) tamamen statiktir; herhangi bir yere yükleyebilirsiniz.
`base: './'` ayarı sayesinde alt klasöre de (örn. GitHub Pages `/repo/`) çalışır.

PWA manifesti `manifest.webmanifest`, ikonlar `icon.svg` / `icon-maskable.svg`.
Üretimde `sw.js` basit bir offline cache olarak devreye girer.