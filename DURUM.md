# Proje Durumu — Masa · Çip Yönetimi

_Son güncelleme: 12.10.2026 (v2.2 Hata Çözümleri)_

> [!NOTE]
> Proje **v2.2 (Masa Açma & Masaya Oturma Kök Neden Çözümleri + Çoklu Grup + Casino UI)** tamamlandı.
> Tüm birim ve 500 adımlık fuzz testleri (`npm run selftest`) ile üretim derlemesi (`npm run build`) eksiksiz çalışmaktadır.

---

## 1. Çözülen Kritik Hatalar (Kök Neden & Düzeltmeler)

### 1.1. "Masa bulunamadı veya kapatılmış" Hatası (Yeni Masa Açamama)
- **Kök Neden 1 (BroadcastChannel Körü)**: 
  - `src/lib/firebase.ts` içinde yerel depolama değişiklikleri sadece `BroadcastChannel` üzerinden yayınlanıyordu. Web standartları gereği `BroadcastChannel`, mesajı gönderen aynı sekmeye bildirim iletmez. Bu nedenle yeni masa açıldığında mevcut sekmedeki `syncSubscribeRooms` tetiklenmiyor ve `rooms` listesi güncellenmiyordu.
- **Kök Neden 2 (Erken Hata Render'ı)**:
  - `src/components/RoomView.tsx`, odalar henüz yüklenme aşamasındayken `room` bulunamadığı anda beklemeden doğrudan `"Masa bulunamadı veya kapatılmış"` ekranını ekrana basıyordu.
- **Çözüm**:
  - `src/lib/firebase.ts` içine `localBus` (`EventTarget`) eklendi. Her `localSet` çağrısında aynı sekme anında, diğer sekmeler ise `BroadcastChannel` ve `StorageEvent` ile senkronize edildi.
  - `src/store.tsx` içine `roomsLoaded` ve `addRoomOptimistic` mekanizması eklendi; yeni masa açıldığı salisede hafızaya eklenir.
  - `RoomView.tsx` içine yüklenme aşaması (`!roomsLoaded`) için zarif bir spinner eklendi, asılsız "Masa bulunamadı" uyarısı engellendi.

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

1. **Çoklu Grup Desteği**:
   - Kalıcı grup hafızası (`joinedGroups`).
   - "Gruplarım (N)" sekmesi ve üst barda anında grup değiştirici açılır menü.
2. **Casino Temalı Arayüz**:
   - `Plus Jakarta Sans` Google Font tipografisi.
   - Gece siyahı zemin, radial zümrüt yeşili keçe gradyanı, altın dikiş hatları ve cam efektli oyuncu kartları.
   - Dinamik boş koltuklar (`+ Boş Koltuk`) ve anında oyuncu oturtma.
3. **Bahis & Oyun Motoru**:
   - Preflop, Flop, Turn, River ve Showdown sokakları.
   - Ante, SB, BB, Min-Raise, Pot-Raise, All-in.
   - Matematiksel çoklu yan pot (side pot) ayrıştırma ve dağıtımı.
4. **PWA & Offline-First**:
   - Manifest ve SVG maskable ikonlar.
   - Firestore bulut senkronizasyonu + sıfır kurulumlu yerel çoklu sekme senkronizasyonu.
