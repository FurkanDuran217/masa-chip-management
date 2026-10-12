# Proje Durumu — Masa · Çip Yönetimi

_Son güncelleme: 12.10.2026 (v2.3 Local-First Mimari & Önbellek Düzeltmeleri)_

> [!NOTE]
> Proje **v2.3 (100% Local-First Mimari + Önbellek Temizliği + Netlify SPA Desteği + Kesintisiz Masa Başlatma)** tamamlandı.
> Tüm birim ve 500 adımlık fuzz testleri (`npm run selftest`) ile üretim derlemesi (`npm run build`) eksiksiz çalışmaktadır.

---

## 1. Çözülen Kritik Hatalar (Kök Neden & Düzeltmeler)

### 1.1. "Masa bulunamadı veya kapatılmış" Hatası (Yeni Masa Açamama)
- **Kök Neden 1 (Firestore Varlığında localStorage İhmali)**: 
  - `src/lib/firebase.ts` içinde `syncSaveRoom` fonksiyonu, `db` (Firestore) tanımlı olduğunda veriyi **yalnızca** Firestore'a yazıyor, `localStorage`'a yazmıyordu. Eğer Firestore kuralları (Security Rules) yazmayı engelliyorsa veya ağ gecikmesi varsa oda hiçbir yere kaydedilmiyordu.
- **Kök Neden 2 (`syncGetRoom` Hatalı Kontrolü)**:
  - `syncGetRoom` fonksiyonunda `if (db) return null;` kodu bulunuyordu. Bu nedenle Firestore aktifken yerel oda hiçbir zaman anında çekilemiyordu.
- **Kök Neden 3 (Eski Service Worker / PWA Önbelleği)**:
  - Kullanıcının tarayıcısında önceki derlemeye ait Service Worker ve PWA önbelleği kaldığı için güncellenmiş kod yerine eski paket çalıştırılıyordu.
- **Kök Neden 4 (BroadcastChannel ve Sekme Senkronu)**:
  - `BroadcastChannel`, web standartları gereği mesajı gönderen aynı sekmeye bildirim iletmez.
- **Çözüm**:
  - `src/lib/firebase.ts` **100% Local-First** mimarisine geçirildi. Tüm yazma işlemleri (`syncSaveRoom`, `syncSaveGroup`, `syncSaveMember`, `syncRecordHand`, `syncAddLedger`) önce senkron olarak `localStorage` + `localBus`'a yazar, ardından arka planda hata yakalamalı (`try/catch`) olarak Firestore'a gönderilir.
  - `syncGetRoom` doğrudan yerel depodan anında odayı döner.
  - `src/main.tsx` içine otomatik Service Worker unregister ve Cache Storage temizleme kodları eklendi.
  - `netlify.toml` içine SPA yönlendirme (`[[redirects]] from = "/*" to = "/index.html" status = 200`) eklendi.
  - `RoomView.tsx` içine yüklenme aşaması için koruma ve doğrudan yerel oda fallback'i sağlandı.

### 1.2. "Masaya otur diyorum hiçbir şey olmuyor" Hatası
- **Kök Neden 1 (HTML5 Sessiz Form Engeli)**:
  - `RoomView.tsx` içindeki Giriş Çipi `<input>` alanında `max={me.balance}` kısıtlaması vardı. Kullanıcının havuzdaki çip bakiyesi 0 veya 200'den az olduğunda, tarayıcı formu sessizce geçersiz sayıyor ve form submit butonuna basıldığında hiçbir işlem gerçekleşmiyordu.
- **Kök Neden 2 (Havuz Çip Zorunluluğu)**:
  - `buyIn` fonksiyonu `m.balance < amount` durumunda hata fırlatıyordu. Masayı açan kişi oyuna başlamak için önce masadan çıkıp "Havuz" sekmesine gitmek ve çip yüklemek zorunda kalıyordu.
- **Çözüm**:
  - `buyInAmount` alanındaki engelleyici `max` niteliği kaldırıldı.
  - `src/lib/actions.ts` içindeki `buyIn` fonksiyonuna `autoDeposit = true` desteği eklendi. Oyuncunun havuzunda yeterli çip yoksa eksik miktar otomatik olarak havuza tanımlanır ve masaya anında oturtulur.
  - `RoomView.tsx` içine masadan ayrılmadan "+ Yeni Misafir / Oyuncu" ekleme ve hızlı çip butonları (`+100`, `+200`, `+500`, `+1000`) eklendi.
  - Masaya oturulduğu anda masa görseli ve çipler anında güncellenir.

---

## 2. Mevcut Özellik Seti

1. **Local-First & Sıfır Bağımlılık**:
   - Firebase yapılandırması olmasa bile veya Firestore kuralları kapalı olsa dahi oyun masası yerel depolama ve sekme senkronu ile %100 kesintisiz çalışır.
2. **Çoklu Grup Desteği**:
   - Kalıcı grup hafızası (`joinedGroups`).
   - "Gruplarım (N)" sekmesi ve üst barda anında grup değiştirici açılır menü.
3. **Casino Temalı Arayüz**:
   - `Plus Jakarta Sans` Google Font tipografisi.
   - Gece siyahı zemin, radial zümrüt yeşili keçe gradyanı, altın dikiş hatları ve cam efektli oyuncu kartları.
   - Dinamik boş koltuklar (`+ Boş Koltuk`) ve anında oyuncu oturtma.
4. **Bahis & Oyun Motoru**:
   - Preflop, Flop, Turn, River ve Showdown sokakları.
   - Ante, SB, BB, Min-Raise, Pot-Raise, All-in.
   - Matematiksel çoklu yan pot (side pot) ayrıştırma ve dağıtımı.
