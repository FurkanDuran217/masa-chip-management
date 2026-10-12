# Proje Durumu — Masa · Çip Yönetimi

_Son güncelleme: 12.10.2026_

> [!WARNING]
> Proje şu an **yeniden yazım (v2) ortasında** ve **çalışır durumda değil**.
> Arayüz (React bileşenleri, `main.tsx`, `App.tsx`, CSS) henüz yazılmadı;
> `npm run dev` / `npm run build` hata verir. Son çalışan sürüm: commit `42a674e`.

---

## 1. Şimdiye kadar yapılanlar

### v1 — Tek cihazlık çip yöneticisi (commit edildi, canlıda)
| Commit | İş |
| --- | --- |
| `38d77e3` | İlk sürüm: oda kurma, çip tepsisi, all-in, ana/yan pot, bakiye, yedekleme, PWA |
| `1e577f0` | Service worker: navigasyon network-first, asset cache-first |
| `fcfecb3` | Deploy sonrası beyaz ekrana yol açan service worker kaldırıldı |
| `27a7237` | Eski cache'leri temizleme |
| `42a674e` | Kendini imha eden SW, `netlify.toml`, hata ekranı → beyaz ekran kalıcı çözüldü |

### v2 — Grup + çok cihaz + istatistik (bu commit, yarım)
Amaç: aynı arkadaş grubunun **ortak çip havuzu**, birden fazla telefondan **canlı senkron**
masa, gerçek bahis turları (preflop → river) ve oyuncu **istatistikleri**.

Yazılan mantık katmanı (`src/lib/`):

| Dosya | Durum | İçerik |
| --- | --- | --- |
| `types.ts` | ✅ | Yeni veri modeli: `Group`, `Member` (havuz bakiyesi, PIN), `Room`, `RoomState`, `Seat`, `HandRecord`, `LedgerEntry` |
| `engine.ts` | ✅ | Saf bahis motoru: blind/ante, fold/check/call/raise/all-in, min-raise, sokak ilerletme, ana+yan pot (`computePots`), showdown dağıtımı, artık çip, el iptali, heads-up kuralı, koltuk ekle/çıkar/taşı. Her aksiyonda çip korunumu kontrolü |
| `firebase.ts` | ✅ | Firestore senkron katmanı; config yoksa `localStorage` + `BroadcastChannel` ile sekmeler arası senkron. Grup, üye, oda, el geçmişi, ledger için kaydet/abone ol |
| `stats.ts` | ✅ | VPIP, PFR, all-in sayısı, showdown kazanma oranı, net kâr/zarar, en büyük pot |
| `sound.ts` | ✅ | Ses efektleri (`sound`) ve titreşim (`vibrate`) |

Diğer değişiklikler:
- `package.json`: `firebase` ve `esbuild` eklendi, kullanılmayan `tailwindcss` / `@tailwindcss/vite` çıkarıldı.
- v1 arayüzü ve v1'e özel mantık dosyaları silindi (git geçmişinde duruyor):
  `src/App.tsx`, `src/main.tsx`, `src/store.tsx`, `src/index.css`, `src/components/*`,
  `src/lib/{chips,table,store,presets,hooks,a11y}.ts`, `public/*`, `scripts/selftest.ts`.

---

## 2. Nerede kalındı

Mantık katmanı bitti, **arayüz katmanına hiç başlanmadı.**

## 3. Sıradaki adımlar (öncelik sırasıyla)

1. [ ] `src/main.tsx` + `src/App.tsx` + `index.css` (tasarım sistemi, koyu tema)
2. [ ] Uygulama durumu / context (`src/store.tsx`): aktif grup, üye oturumu (PIN), abonelikler
3. [ ] Ekranlar:
   - [ ] Grup oluştur / katıl (davet linki)
   - [ ] Üye seçimi + PIN girişi
   - [ ] Lobi: açık odalar, havuz bakiyeleri
   - [ ] Canlı masa: koltuk halkası, sıra göstergesi, aksiyon çubuğu (fold/check/call/raise/all-in), pot + yan potlar, showdown'da kazanan seçimi
   - [ ] Buy-in / cash-out (havuz ↔ masa, `LedgerEntry` yazımı)
   - [ ] İstatistikler (`stats.ts`) ve el geçmişi
   - [ ] Ayarlar: Firebase config girişi
4. [ ] `scripts/selftest.ts`'yi `engine.ts` için yeniden yaz (çip korunumu fuzz testi)
5. [ ] PWA: `public/manifest.webmanifest`, ikonlar (SW'siz veya güvenli SW)
6. [ ] `vite.config.ts` kontrolü (tailwind plugin kalmışsa kaldır), `npm run build` temiz geçsin
7. [ ] Firestore güvenlik kuralları
8. [ ] `README.md`'yi v2 mimarisine göre güncelle

## 4. Bilinen riskler / notlar
- Bu commit `master`'a gittiği için Netlify build'i **başarısız** olacaktır; Netlify son başarılı
  deploy'u (v1) yayında tutar, canlı site bozulmaz.
- Oda durumu tek doküman olarak yazılıyor (`version` alanı var); eşzamanlı yazımlar için
  transaction / sürüm kontrolü henüz eklenmedi.
- `HandRecord` ve ledger local modda 1000 kayıtla sınırlı.
