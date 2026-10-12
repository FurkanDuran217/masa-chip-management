# Masa · Çok Cihazlı Poker Çip Yönetimi (v2)

Arkadaş grubunuzla masa başı poker oynarken **çip sayma, bozukluk arama ve hesap kitap derdini bitiren** yeni nesil uygulama.

Kart yok, flop dağıtımı yok — sadece oda kurma, çoklu cihazdan bağlanma, çip koyma, artırma, all-in, yan potlar ve detaylı oyuncu istatistikleri.

---

## 🚀 Öne Çıkan Özellikler

- **Çok Cihazlı / Çok Oyunculu Senkron:**
  - Firebase Firestore ile tüm telefon ve bilgisayarlar anlık eşitlenir.
  - Yapılandırma girilmediğinde aynı ağ/tarayıcı sekmelerinde kesintisiz yerel senkron (BroadcastChannel) çalışır.
- **Grup ve Şifre Güvenliği:**
  - Her gruba özel katılım kodu veya davet linki.
  - İsteğe bağlı **Grup Şifresi** ile yabancıların katılımı engellenir.
  - Her oyuncu için profil koruma PIN kodu.
- **Esnek Çip / Para Oranı:**
  - İster doğrudan birim çip fiyatı girin (`1 Çip = 0.25 ₺`), ister küçük paralar için ters oran belirleyin (`1 TL = 10 Çip`).
- **Kusursuz Çip Muhasebesi:**
  - `Σ(stack + committed) === Total Chips` korunum kanunu ile sıfır kayıp güvencesi.
  - Otomatik ana pot ve katmanlı yan pot (side pot) ayrımı.
  - Showdown'da kazananları tek tıkla seçip potları paylaştırma.
- **Gelişmiş İstatistikler & Liderlik:**
  - Oynanan el sayısı, kazanılan el sayısı, en büyük pot.
  - **VPIP %** (Gönüllü pota girme oranı) & **PFR %** (Preflop artırma oranı).
  - Showdown kazanma yüzdesi ve kâr/zarar sıralaması.
- **Ses & Titreşim:** Sıra size geldiğinde, pot kazanıldığında ve hamlelerde ses efektleri.

---

## 🛠️ Hızlı Başlangıç

```bash
npm install
npm run dev        # Geliştirme sunucusu (http://localhost:5173)
npm run build      # Üretim derlemesi -> dist/
npm run preview    # Derlenen sürümü yerel sun
npm run selftest   # Çip korunumu ve yan pot fuzz testleri
```

---

## 📱 Kurulum (PWA)

Uygulama modern bir PWA (Progressive Web App) olarak paketlenmiştir. Telefonunuzda tarayıcıdan açıp **"Ana Ekrana Ekle"** diyerek native uygulama gibi tam ekran kullanabilirsiniz.