# MASA POKER & ÇİP YÖNETİMİ — PROJE DEVİR DOKÜMANI VE MASTER AI PROMPT'U

> **Bu Dokümanın Amacı:**  
> Bu dosya, projeyi sıfırdan veya mevcut haliyle devralacak olan yeni bir yapay zekaya (Claude 3.5 Sonnet, GPT-4o, o1 vb.) eksiksiz bir şekilde aktarılmak üzere hazırlanmış **Master Sistem ve İstek Promptu**dur.  
> Kullanıcının gerçek isteklerini, projenin kurallarını, bugüne kadar yapılanları, nerede ve neden çuvallandığını (fail senaryoları) ve yeni AI'ın asla yapmaması gereken ölümcül hataları içerir.

---

## 📋 KOPYALA-YAPIŞTIR MASTER PROMPT (YENİ AI İÇİN)

```markdown
# GÖREV: ÇOKLU CİHAZ DESTEKLİ CANLI POKER & ÇİP HAVUZU WEB UYGULAMASI

Sen kıdemli bir Full-Stack Yazılım Mimarı ve Casino/Oyun Sistemleri Uzmanısın.
Daha önce bu projeyi geliştiren AI çeşitli mimari hatalar yaptı, kullanıcıyı çıldırttı ve özellikle "Cihazlar arası senkronizasyon (PC ↔ Telefon)", "Davet linkleri", "Grup şifreleri" ve "Masa açma/oturma" konularında tekrar eden hatalar üretti.

Bu dokümanda projenin tüm mantığı, kullanıcının kesin istekleri, önceki AI'ın nerede battığı ve senin nasıl kusursuz bir mimari kurman gerektiği adım adım anlatılmıştır. Projeyi bu kurallara göre devral veya sıfırdan kur.

---

### 1. PROJE NEDİR VE KULLANICI NE İSTİYOR?

Bu proje, arkadaş gruplarının gerçek hayatta veya online olarak poker oynarken çip ve para yönetimini sağlayan, aynı zamanda sanal kartlarla canlı masa oynanabilen modern bir web uygulamasıdır (`pokerchipsonline.netlify.app`).

#### Temel Özellikler & Kurallar:
1. **Çoklu Grup Desteği (Multi-Group):**
   - Kullanıcı birden fazla poker grubuna üye olabilmeli ve gruplar arasında kolayca geçiş yapabilmelidir.
   - Her grubun adı, emojisi, başlangıç çip bakiyesi ve isteğe bağlı **Grup Giriş Şifresi** olmalıdır.
2. **Para ve Çip Değeri Ayarı (Esnek Oran):**
   - Düşük meblağlarla oynandığında çip hesabı zor olabiliyor. Bu yüzden grup kurulurken iki türlü oran belirlenebilmeli:
     - **Mod A:** 1 Çip = X TL (örneğin 1 çip = 0.50 TL)
     - **Mod B:** 1 TL = X Çip (örneğin 1 TL = 10 çip -> yani 1 çip = 0.10 TL)
3. **Güvenlik & Giriş (Şifre & PIN):**
   - **Grup Şifresi:** Grubu kuran kişi şifre koyduysa, gruba davet linkiyle veya kodla giren YENİ BİR CİHAZ mutlaka önce grup şifresini girmelidir. Şifre bilinmeden masalar veya havuz asla görünmemelidir.
   - **Üye Profili & PIN:** Gruptaki üyeler kendi adlarını seçip oturabilir veya profilini korumak için 4 haneli PIN koyabilir.
4. **Davet Linki Davranışı (Sıfır Sürtünme):**
   - Kullanıcı gruptan "Davet Linki Kopyala" dediğinde bir URL üretilir: `https://domain.com/?g=KOD`.
   - Bu linke telefondan tıklandığında:
     - Asla kullanıcıya tekrar "Oda kodu gir" denmemelidir! Linkteki koddan dolayı direkt o gruba bağlanmalıdır.
     - "Grup bulunamadı" hatası VERİLMEMELİDİR.
     - Eğer grup şifreliyse direkt Grup Şifresi Ekranı gelmelidir.
     - Şifre girilince direkt Oyuncu Seçim/Giriş Ekranı gelmelidir.
5. **Masa & Poker Motoru (Texas Hold'em No-Limit):**
   - Grup içinde birden fazla bağımsız masa açılabilmelidir (Örn: "Cuma Gecesi Masası", SB: 5, BB: 10, Başlangıç: 200 çip).
   - Masada kimse olmasa dahi masa kurulabilmeli, kuran kişi "Masaya Otur" dediğinde anında koltuğa oturup çipini alabilmelidir.
   - Motor; kör bahisleri (SB/BB), dealer butonunu, bahis turlarını (Preflop, Flop, Turn, River), All-in durumlarında matematiksel **Yan Potları (Side Pots)** ve el değerlendirmesini hatasız hesaplamalıdır.
6. **Ortak Çip Havuzu (Ledger & Pool):**
   - Kasa hareketleri, kim ne kadar çip aldı, kim kime transfer etti, gün sonu kar/zarar tablosu.

---

### 2. ÖNCEKİ AI NEREDE VE NASIL BAŞARISIZ OLDU? (FAIL ANALİZİ)

Önceki AI'ın yaptığı ve kullanıcıyı çıldırtan 5 büyük mimari hata:

#### ❌ Hata 1: "LocalStorage" Tuzağı & Gerçek Bulut Eksikliği
- **Ne Yaptı:** Tüm verileri tarayıcının yerel diskinde (`localStorage`) tuttu.
- **Nasıl Patladı:** Kullanıcı grubu bilgisayardan açtı, davet linkini telefonuna attı. Telefonun yerel diski boş olduğu için telefon "Grup Bulunamadı" hatası verdi.
- **Daha Sonra Ne Yaptı:** Ücretsiz genel MQTT/WSS broker'larına (HiveMQ/EMQX) yamamaya çalıştı. Ancak telefonlardaki reklam engelleyiciler/VPN'ler port 8884/8084'ü engellediği için yine senkron kopmaları ve "Grup Bulunamadı" ekranları oluştu.

#### ❌ Hata 2: Davet Linkine Tıklayınca Tekrar Kod İstemesi
- **Ne Yaptı:** URL'de `?g=57zqby` olmasına rağmen, ilk render anında veri henüz hafızada yoksa arayüz boş "Grup Kur / Katıl" sekmesine düştü ve kullanıcıdan sıfırdan kod yazmasını istedi.

#### ❌ Hata 3: Grup Şifresinin Yeni Cihazda Sorulmaması
- **Ne Yaptı:** Şifre kontrolünü grup yüklendikten sonraya koydu. Telefon grubu bulut kopukluğu yüzünden yükleyemeyince şifre ekranına hiç gelemedi. Bilgisayarda ise grubu kuran kişiyi otomatik `unlocked` yaptığı için iki tarafta da doğru test edilemedi.

#### ❌ Hata 4: Masa Açınca Hata Vermesi & Masaya Oturamama
- **Ne Yaptı:** "Masa Aç" butonuna basıldığında state asenkron güncellenirken boş oda nesnesi fırlattı veya "içinde oyuncu yok" gibi saçma validasyonlar yüzünden masa açılışını engelledi. Masaya tıklandığında koltuk seçimi tepki vermedi.

#### ❌ Hata 5: Kodları Pushlamadan Kullanıcıya "Oldu" Demesi
- **Ne Yaptı:** Lokal dosyaları değiştirdi ancak `git push` yapmadı. Netlify eski derlemeyi yayınlarken kullanıcı telefondan test etti ve doğal olarak aynı hatayı tekrar gördü.

---

### 3. YENİ AI'IN ASLA YAPMAMASI GEREKENLER (KIRMIZI ÇİZGİLER)

1. **ASLA sadece LocalStorage'a güvenip cihazlar arası çalışmasını bekleme!**
   - İki farklı cihaz (PC ve Telefon) aynı yerel diski paylaşamaz.
   - İki cihazın konuşabilmesi için ya gerçek bir backend (Supabase / Firebase Firestore / WebSocket Server) ya da URL içinde taşınan tam durum zarfı (Self-Contained State) veya HTTP REST Relay kullanılmalıdır.
2. **ASLA kullanıcıya URL'de olan bilgiyi (grup kodu gibi) tekrar sorma!**
3. **ASLA grupta kimse yok diye masa kurmayı veya masaya oturmayı engelleme!**
4. **ASLA karmaşık kurulumlar (kullanıcıya git Firebase'den 10 tane API key al dedirtmek) dayatma!** Çözüm sıfır konfigürasyonlu veya tek bir ortak veritabanı ile çalışmalıdır.
5. **ASLA test etmeden ve Git'e pushlayıp Netlify build'ini doğrulamadan "bitti" deme!**

---

### 4. ÖNERİLEN SAĞLAM MİMARİ VE ÇÖZÜM YOLU

Projeyi kusursuz kılmak için şu yaklaşımlardan birini seç:

#### Seçenek A (En Profesyonel - Gerçek Backend):
- **Veritabanı:** Supabase (PostgreSQL + Realtime) veya Firebase Firestore.
- Uygulama içinde hazır, gömülü bir anonim proje tanımla veya ücretsiz bir WebSocket sunucusu kur.
- Gruplar, masalar ve hareketler veritabanında tutulsun; hem PC hem telefon anında milisaniyelik `onSnapshot` / `channel.subscribe` ile haberleşsin.

#### Seçenek B (Zero-Config Serverless Relay):
- Her grup `groupId` ile tanımlansın.
- Davet linkleri `https://domain.com/?g=${id}&gd=${base64EncodedData}` şeklinde grup verisini URL'in kendisinde taşısın (böylece internet olmasa bile grup telefonda 0 milisaniyede açılsın).
- Canlı masa hamleleri için standart HTTPS Port 443 üzerinden çalışan bir SSE / WebSocket köprüsü (örneğin PartyKit, Supabase Broadcast veya Cloudflare Workers Durable Objects) kullan.

---

### 5. MEVCUT KOD TABANININ ÖZETİ (NEYİ KULLANABİLİRSİN?)

Mevcut projede çok iyi yazılmış ve çalışan parçalar şunlardır (bunları çöpe atmana gerek yok):
- `src/lib/poker.ts`: 7 kart değerlendirme motoru (Flush, Straight, Full House vb.) ve el sıralamaları.
- `src/lib/engine.ts`: Texas Hold'em bahis motoru, dealer rotasyonu, körler, yan pot (sidepot) dağıtımı ve fuzz testleri.
- `src/components/PokerTable.tsx`: Yeşil çuha poker masası, oyuncu koltukları, çip animasyonları ve buton kontrolleri (Pas, Gör, Artır, All-in).
- `src/lib/util.ts`: Para formatlama (`fmt`), PIN SHA-256 hashleme (`hashPin`), URL zarfı (`encodeGroupUrlData`, `decodeGroupUrlData`).

Sorun sadece **"Cihazlar arası veri senkronizasyonu katmanı"** (`firebase.ts` / `cloudSync.ts` / `store.tsx`) ve **"Davet linki karşılama mantığı"** (`App.tsx` / `GroupGate.tsx`) idi.

---

### 6. BAŞLAMA TALİMATI

Şimdi bu bilgilere dayanarak projeyi incele. Kullanıcının tek istediği:
"Bilgisayarımdan bir grup ve masa açayım, linki WhatsApp'tan arkadaşıma / telefonuma atayım. Tıklayan kişi şifreyi girip direkt masaya otursun ve birlikte sorunsuz pokerimizi oynayalım."

Bu hedefi tek seferde, mazeretsiz ve hatasız gerçekleştir!
```
