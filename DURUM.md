# Proje Durumu — Masa · Çip Yönetimi

_Son güncelleme: 12.10.2026 (v2.4 Cihazlar Arası Canlı Bulut Senkronu & Davet Linki Düzeltmeleri)_

> [!NOTE]
> Proje **v2.4 (Sıfır Kurulumlu Canlı Bulut Senkronu + Davet Linki Otomatik Bağlantı + Grup Şifresi Doğrulama + Çoklu Cihaz Desteği)** tamamlandı.
> Tüm motor fuzz testleri (`npm run selftest`) ve üretim derlemesi (`npm run build`) eksiksiz çalışmaktadır.

---

## 1. Çözülen Kritik Hatalar (Kök Neden & Düzeltmeler)

### 1.1. Bilgisayardan Açılan Gruba Telefondan Girilememe Sorunu (Kök Neden)
- **Kök Neden (Fiziksel Disk İzolasyonu & Eksik Bulut Servisi)**:
  - Bilgisayarda oluşturulan grup verisi, tarayıcının yerel disk belleğinde (`localStorage`) tutuluyordu. Projede varsayılan bir bulut veritabanı (Firebase / WebSocket sunucusu) tanımlı olmadığı için, telefon bilgisayarın yerel diskine internet üzerinden fiziksel olarak erişemiyordu.
  - Bu nedenle telefondan link açıldığında telefonun yerel hafızası boş kalıyor ve "Grup bulunamadı" durumuna düşüyordu.
- **Çözüm**:
  - `src/lib/cloudSync.ts` modülü oluşturuldu. Şifreli **WSS (MQTT over WebSockets)** üzerinden sıfır kurulumlu, hesap veya API key gerektirmeyen gerçek zamanlı bulut rölesi bağlandı.
  - Artık bilgisayarda kurulan grup ve masalar anında bulut üzerinden yayınlanır (`retain: true`).
  - Telefon davet linkine tıkladığı anda milisaniyeler içinde grubu, masaları ve çipleri buluttan çeker. Her iki cihaz da birbirinin hamlelerini (bahis, pas, oturma vb.) canlı izler.

### 1.2. "Linke tıklayınca yine kod istiyor" Hatası
- **Kök Neden**:
  - Linkteki `?g=KOD` parametresi varken, telefon yerel hafızasında grubu o milisaniye bulamadığında arayüz hemen pes edip varsayılan boş "Grup Kur / Katıl" formuna düşüyordu. Formdaki kod alanı boş bırakılıyordu.
  - Ayrıca kullanıcı panosundaki tam URL'yi (`https://.../?g=kod`) kutucuğa yapıştırdığında, URL parse edilmediği için geçersiz kod hatası veriyordu.
- **Çözüm**:
  - `src/components/GroupGate.tsx` içinde URL'deki `g` parametresi otomatik algılanıp kod alanına dolduruldu.
  - Yapıştırılan metin bir URL ise (`?g=kod`), kod regex/URL parser ile otomatik ayıklanır.
  - `src/App.tsx` içine bağlantı bekleme ekranı eklendi: Link tıklandığında *"Gruba Bağlanılıyor... (Kod: xyz)"* gösterilir; grup buluttan çekildiği anda otomatik olarak şifre veya üye ekranına geçilir.

### 1.3. "Gruba girerken şifre sormuyor" Hatası
- **Kök Neden**:
  - `GroupLockGate` (şifre sorma ekranı), grup verisi yüklendikten sonra çalışıyordu. Telefon grubu bulut bağlantısı olmadığı için hiç yükleyemediğinden, şifre sorma ekranına hiçbir zaman ulaşamıyordu.
  - Bilgisayarda ise grubu kuran tarayıcıya otomatik `unlockGroup(g.id)` yazıldığı için bilgisayarda da şifre sormuyordu.
- **Çözüm**:
  - Artık telefon bulut üzerinden grubu anında çeker.
  - Grupta `passwordHash` tanımlıysa ve o cihazda henüz açılmamışsa, `GroupLockGate` otomatik devreye girer ve şifreyi doğrulamadan lobiye/masalara girişe izin vermez.

---

## 2. Mevcut Özellik Seti

1. **Sıfır Kurulumlu Canlı Çoklu Cihaz Senkronu**:
   - PC, Android, iPhone, tablet arasında gerçek zamanlı WebSocket senkronizasyonu.
   - Herhangi bir API key veya Firebase hesabı gerektirmez.
2. **Akıllı Davet Linki & Şifre Koruma**:
   - `?g=GrupKodu` linki ile tek tıkla gruba bağlanma.
   - Şifreli gruplar için SHA-256 tabanlı PIN ve şifre kapısı.
3. **Casino Görselliği & Bahis Motoru**:
   - Matematiksel yan potlar, sokaklar (preflop, flop, turn, river, showdown), körler, otomatik bakiye tanımlama.
