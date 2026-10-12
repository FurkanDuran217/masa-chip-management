# Proje Durumu — Masa · Çip Yönetimi

_Son güncelleme: 12.10.2026_

> [!NOTE]
> Proje **v2 (Grup + Çok Cihaz + Havuz + Canlı Senkron + İstatistik)** arayüzü ve motoru başarıyla ayağa kaldırıldı. Derleme (`npm run build`) hatasız tamamlanıyor.

---

## 1. Şimdiye kadar yapılanlar

### v1 — Tek cihazlık çip yöneticisi
- Eski versiyon (`42a674e`).

### v2 — Çok Cihazlı Gerçek Zamanlı Poker Çip Yönetimi
- **Veri Modeli & Tip Sistemi:** `src/lib/types.ts` (Group, Member, Room, RoomState, HandRecord, LedgerEntry).
- **Bahis ve Çip Motoru:** `src/lib/engine.ts` (Körler, ante, raise to mantığı, ana ve yan pot hesaplama, all-in runout, çip korunumu güvencesi).
- **Gerçek Zamanlı Senkronizasyon:** `src/lib/firebase.ts` (Firebase Firestore veya yerel BroadcastChannel + LocalStorage).
- **İş Mantığı Katmanı:** `src/lib/actions.ts` (Grup kurma, üye ekleme, buy-in/cash-out, hamle işletme, undo).
- **İstatistik & Ses:** `src/lib/stats.ts` (VPIP, PFR, Showdown, Kâr/Zarar), `src/lib/sound.ts` (Ses efektleri ve titreşim).
- **Tasarım Sistemi:** `src/index.css` (Özel koyu tema, poker masası, dinamik koltuk halkası, aksiyon çubuğu).
- **Ekranlar & Arayüz Bileşenleri:**
  - `GroupGate`: Grup oluşturma veya koda göre katılma.
  - `MemberGate`: Profil seçimi, yeni oyuncu kaydı, PIN doğrulama.
  - `LobbyView`: Açık masalar, bakiye özeti, yeni masa oluşturma, davet bağlantısı.
  - `RoomView`: Canlı masa, koltuklar, kör etiketleri, bet çipleri, katlama/görme/artırma slider'ı, showdown pot dağıtımı.
  - `StatsView`: Oyuncu liderlik tablosu, el sayıları, kazanma ve katılım oranları.
  - `PoolView`: Grup havuz hareketleri defteri (ledger), bakiye yükleme.
  - `SettingsView`: Firebase bulut yapılandırması, ses ayarları, çıkış.
  - `App.tsx` & `main.tsx`: Sayfa yönlendirme ve context sağlayıcı.

---

## 2. Sıradaki Adımlar (Gelecek Geliştirmeler)
1. [ ] Otomatik selftest / fuzz test script'i (`scripts/selftest.ts`) yeni engine için eklenmesi.
2. [ ] PWA manifest ve servis işleyici ikonlarının eklenmesi.
3. [ ] Canlı ortam testleri (Firestore kural güvenliği & yetkilendirme).
