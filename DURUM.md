# Proje Durumu — Masa · Çip Yönetimi

_Son güncelleme: 12.10.2026_

> [!NOTE]
> Proje **v2 (Grup + Çok Cihaz + Havuz + Canlı Senkron + İstatistik)** tüm temel ve ileri düzey gereksinimleriyle tamamlandı.
> Tüm birim ve fuzz testleri (`npm run selftest`) ile üretim derlemesi (`npm run build`) eksiksiz çalışmaktadır.

---

## 1. Tamamlanan Mimari ve Özellikler

### Motor & Mantık Katmanı (`src/lib/`):
- `types.ts`: Grup, şifre, üye, PIN, masa durumu, yan potlar, el istatistikleri ve hesap defteri tipleri.
- `engine.ts`: Saf fonksiyonlarla çalışan poker bahis motoru; ante, körler, minimum/maksimum raise, sokak geçişleri, all-in runout, tam matematiksel ana & yan pot hesaplama.
- `actions.ts`: Grup oluşturma, şifre doğrulama, havuza yükleme, masaya buy-in/cash-out, hamle işletme ve geri alma (undo).
- `firebase.ts`: Firestore gerçek zamanlı bulut senkronu + yerel BroadcastChannel/LocalStorage yedeği.
- `stats.ts`: VPIP%, PFR%, Showdown kazanma oranı, net kâr/zarar ve en büyük pot liderlik hesaplamaları.
- `sound.ts`: Web Audio API ile sıfır harici dosya bağımlılıklı çip, ses ve titreşim efektleri.

### Arayüz & Deneyim Katmanı (`src/components/` & `src/`):
- `GroupGate`: Grup oluşturma (şifreli, ters çip oranı seçenekli) ve katılım.
- `GroupLockGate`: Şifreli gruplara izinsiz girişleri engelleyen koruma ekranı.
- `MemberGate`: Profil seçimi, yeni oyuncu kaydı ve PIN doğrulaması.
- `LobbyView`: Açık masalar, el numarası, bakiye kartı, davet bağlantısı ve yeni masa başlatma.
- `RoomView`: Canlı elips poker masası, dinamik koltuk halkası, pot merkezi, aksiyon barı, raise slider'ı, yan pot dağıtım modalı, tek cihazdan veya ortak masadan diğer oyuncuları masaya oturtma.
- `PoolView`: Grup ortak çip havuzu ve defteri (ledger), bakiye yükleme.
- `StatsView`: Oyuncu liderlik tablosu ve detaylı istatistikler.
- `SettingsView`: Firebase senkronizasyon ayarları ve ses tercihi.
- `index.css`: Koyu tema, akıcı animasyonlar ve şık kart tasarımları.

### Test & PWA:
- `scripts/selftest.ts`: Çip korunumu, körler, yan potlar ve 500 hamlelik rastgele fuzz testi (`npm run selftest`).
- `public/`: `manifest.webmanifest`, `icon.svg` ve `icon-maskable.svg` PWA kurulum dosyaları.
