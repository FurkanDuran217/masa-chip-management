# Proje Durumu — Masa · Çip Yönetimi

_Son güncelleme: 12.10.2026 (v2.5 Kendinden Zarflı Davet Linki & Çoklu Bulut Rölesi Kalıcı Çözüm)_

> [!NOTE]
> Proje **v2.5 (Kendinden Veri Zarflı URL Davet Linki + HiveMQ/EMQX/Mosquitto Grup Ağacı + Şifre Kapısı + Çoklu Cihaz Canlı Senkron)** tamamlandı.
> Tüm motor fuzz testleri (`npm run selftest`) ve üretim derlemesi (`npm run build`) 0 hata ile çalışmaktadır.

---

## 1. Yaşanan "57zqby Kodlu Grup Bulunamadı" Hatasının Kök Nedeni & Kalıcı Çözüm

### 1.1. Kök Neden (Netlify Dağıtımı & Eski Tekil MQTT Konusu)
1. **GitHub / Netlify Dağıtım Senkronu**:
   - PC üzerinde oluşturulan `57zqby` grubu tarayıcı yerel hafızasındaydı.
   - Önceki oturumda hazırlanan bulut rölesi kodları git üzerinde henüz `push` edilmediği için, Netlify üzerindeki canlı site eski sürümü (yalnızca yerel depolama) çalıştırmaya devam ediyordu.
   - Telefondan `pokerchipsonline.netlify.app/?g=57zqby` linki açıldığında, telefonun yerel hafızası boş olduğu ve Netlify'da henüz bulut rölesi bulunmadığı için doğrudan "Grup Bulunamadı" hatası oluştu.
2. **Global Konu vs Grup Ağacı**:
   - MQTT protokolünde tek bir konuya (`topics`) gönderilen `retained` mesajlar birbirinin üzerine yazar. Dolayısıyla tüm grupların tek bir konu üzerinden yayınlanması farklı grupların ezilmesine yol açabiliyordu.

### 1.2. Uygulanan Kalıcı Mühendislik Çözümleri
1. **Kendinden Zarflı URL (URL Group Envelope — `&gd=...`)**:
   - `src/lib/util.ts` içine `encodeGroupUrlData` ve `decodeGroupUrlData` fonksiyonları entegre edildi.
   - Lobide "Daveti Kopyala" butonuna basıldığında veya tarayıcı adres çubuğundaki link kopyalandığında link artık şu biçimde üretilir:
     `https://pokerchipsonline.netlify.app/?g=57zqby&gd=<SIKISTIRILMIS_GRUP_VERISI>`
   - Telefondan bu link tıklandığında, **0 milisaniyede**, internet sunucusuna veya bulut gecikmesine bile ihtiyaç duymadan grup verisi anında çözülür, yerel hafızaya işlenir ve grup açılır!
2. **Grup Bazlı MQTT Konu Ağacı (Isolated Group Topic Tree)**:
   - `src/lib/cloudSync.ts` tamamen yenilendi.
   - Her grup kendi izole konu ağacına sahiptir:
     - `masa_poker_v2/g/{groupId}/group` (Grup meta verisi, retained: true)
     - `masa_poker_v2/g/{groupId}/members` (Üye listesi, retained: true)
     - `masa_poker_v2/g/{groupId}/rooms` (Masalar/Odalar, retained: true)
     - `masa_poker_v2/g/{groupId}/hands` (El geçmişi, retained: true)
     - `masa_poker_v2/g/{groupId}/ledger` (Havuz kayıtları, retained: true)
     - `masa_poker_v2/req/{groupId}` (Eşler arası senkronizasyon tetikleyici)
   - Telefondan sadece kod girilerek (`57zqby`) açılsa dahi, telefon `masa_poker_v2/g/57zqby/#` konusuna abone olur ve HiveMQ/EMQX/Mosquitto sunucularında kalıcı tutulan grup verisini milisaniyeler içinde çeker.
3. **Üç Katmanlı Yedekli WSS Broker Altyapısı**:
   - `broker.hivemq.com:8884` (Birincil)
   - `broker.emqx.io:8084` (Yedek)
   - `test.mosquitto.org:8081` (Üçüncül)
   - Herhangi bir sunucuda veya portta kesinti olması durumunda sistem otomatik olarak diğer sunucuya geçer.
4. **Grup Şifresi Koruması (`GroupLockGate`)**:
   - Telefondan gruba girildiğinde, grup şifreliyse doğrudan `GroupLockGate` açılır. Şifre doğrulanmadan lobideki masalara ve çiplere erişilemez.

---

## 2. Test ve Doğrulama
- `npm run selftest`: 500 iterasyonluk fuzz bahis motoru testi başarıyla tamamlandı (0 çip kaybı).
- `npm run build`: TypeScript ve Vite derlemesi 0 hata ile tamamlandı.
