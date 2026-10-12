# Proje Durumu — Masa · Çip Yönetimi

_Son güncelleme: 12.10.2026_

> [!NOTE]
> Proje **v2.1 (Çoklu Grup Yönetimi + Görsel Koltuk/Masa Açma Düzeltmesi + Casino Temalı Ultra UI/UX)** tamamlandı.
> Tüm birim ve 500 adımlık fuzz testleri (`npm run selftest`) ile üretim derlemesi (`npm run build`) eksiksiz çalışmaktadır.

---

## 1. Bu Oturumda Yapılan Yenilikler ve Çözümler

### 1.1. Çoklu Grup Desteği ("Birden fazla grupta olabilmeliyiz")
- **Kalıcı Grup Hafızası (`src/store.tsx`)**:
  - `joinedGroups` listesi eklendi (`masa_saved_groups_list` üzerinden saklanır).
  - Kullanıcı yeni bir grup açtığında veya katıldığında grup otomatik olarak listeye eklenir.
  - `switchGroup(targetGroupId)` ve `leaveGroup(targetGroupId)` metotları ile gruplar arası anında geçiş sağlandı.
  - Her grup için aktif üye kimliği bağımsız olarak (`masa_active_member_{groupId}`) korunur.
- **Grup Geçiş Arayüzü (`src/components/GroupGate.tsx` & `src/App.tsx`)**:
  - `GroupGate` ekranına **"Gruplarım (N)"** sekmesi eklendi; daha önce girilmiş tüm gruplar kartlar halinde listelenir ve tek tıkla gruba girilebilir.
  - Üst çubuğa (Header) hızlı grup açılır menüsü (Select Dropdown) ve "Gruplar" butonu yerleştirildi; böylece aktif masadan çıkmadan doğrudan diğer gruba geçiş yapılabilir.

### 1.2. Masa Açma ve El Başlatma Düzeltmesi ("Ben masa açamıyorum...")
- **Kök Neden**: Kullanıcı yeni masa oluşturduğunda masa boş (0 koltuk) açılıyor ve masada en az 2 oyuncu oturana kadar "Eli Başlat" butonu kilitli kalıyordu. Masada koltuklar görsel olarak belirmediği için kullanıcı masanın takıldığını düşünüyordu.
- **Çözüm (`src/components/RoomView.tsx`)**:
  - Masa etrafına etkileşimli **"Boş Koltuk (+)"** slotları eklendi.
  - Masaya tek tıkla oyuncu oturtma modalı ve hızlı bakiye belirleme eklendi.
  - Masanın altındaki aksiyon çubuğuna net durum uyarısı eklendi ("Masada en az 2 oyuncu oturmalı (Şu an: N/2)").
  - Kullanıcı henüz masada değilse veya tek oyuncu varsa doğrudan "Masaya Otur / Oyuncu Ekle" butonu öne çıkarıldı.

### 1.3. Casino Temalı Ultra-Lüks UI/UX Dönüşümü ("UI çok çirkin gözüküyor")
- **Yeni Tasarım Sistemi (`src/index.css`)**:
  - **Tipografi**: Modern, net ve profesyonel `Plus Jakarta Sans` Google Font ailesine geçildi.
  - **Renk Paleti**: Derin gece siyahı zemin (`#0a0d14`), parıltılı altın vurgular (`#f59e0b`, `#fbbf24`), zümrüt keçe yeşili (`#064e3b` radial gradient) ve neon amber pot göstergeleri.
  - **Poker Masası Keçesi**: Çok katmanlı radial gradyan, altın iç ve dış dikiş halkaları, derinlik katan iç gölgeler (`inset 0 0 50px rgba(0,0,0,0.8)`).
  - **Koltuk & Oyuncu Kartları**: Cam efektli (glassmorphism) arka planlar, aktif sıra için altın darbe animasyonu (`pulse`), dealer/SB/BB için metalik rozetler.
  - **Aksiyon Butonları**: 3D derinlik hissi veren gradyan butonlar (Pas, Gör, Artır, All-in), tıklandığında mikro-animasyonlar.
  - **Kartlar**: Gerçek iskambil kartı stili (kırmızı kupa/karo, koyu maça/sinek) ve net bordürler.
  - **Çip Efektleri**: Özel çip dokusu ve stacked çip göstergeleri.

---

## 2. Mimari ve Bileşen Haritası

### Motor Katmanı (`src/lib/`):
- `types.ts`: Grup, şifre, üye, PIN, masa durumu, yan potlar, el istatistikleri ve defter tipleri.
- `engine.ts`: Saf fonksiyonel poker bahis motoru; körler, pot & yan pot hesaplamaları, all-in runout, tam matematiksel çip korunumu.
- `actions.ts`: Grup oluşturma, şifre doğrulama, havuz yükleme, masaya oturma/kalkma, hamle işletme ve geri alma.
- `firebase.ts`: Firestore gerçek zamanlı bulut senkronizasyonu + BroadcastChannel/LocalStorage yerel yedeği.
- `stats.ts`: VPIP%, PFR%, Showdown kazanma oranı, kâr/zarar ve liderlik tablosu.
- `sound.ts`: Web Audio API ile sıfır harici dosya bağımlılıklı çip ve aksiyon ses efektleri.

### Görünüm Katmanı (`src/components/` & `src/`):
- `GroupGate`: Grup oluşturma, şifreli giriş ve çoklu grup listesi ("Gruplarım").
- `GroupLockGate`: Şifreli gruplar için parola doğrulama ekranı.
- `MemberGate`: Profil seçimi, yeni oyuncu kaydı ve PIN koruması.
- `LobbyView`: Açık masalar, bakiye kartı, davet bağlantısı ve yeni masa başlatma.
- `RoomView`: Canlı elips poker masası, dinamik boş koltuklar, pot merkezi, aksiyon barı, raise slider'ı, yan pot dağıtımı ve hızlı oyuncu oturtma.
- `PoolView`: Grup ortak çip havuzu ve hesap defteri (ledger).
- `StatsView`: Oyuncu liderlik tablosu ve istatistik analizi.
- `SettingsView`: Firebase senkronizasyon ayarları ve ses kontrolleri.

---

## 3. Test & Kalite Güvencesi
- `npm run selftest`: 5 test aşaması + 500 rastgele fuzz hamlesi (Sıfır çip kaybı, tam pot dengesi).
- `npm run build`: TypeScript ve Vite üretim derlemesi hatasız.
