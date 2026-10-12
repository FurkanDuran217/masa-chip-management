# Çalışma tarzı

- Kullanıcıya gereksiz soru sorma. Belirsizlik varsa en makul seçeneği seç, uygula ve sonunda kısaca ne varsaydığını yaz.
- Yalnızca geri alınamaz/veri kaybettiren işlemlerde (ör. git geçmişini silme, force push, veritabanı silme) onay iste.
- Seçenek listesi sunup beklemek yerine önerilen seçeneği doğrudan uygula.
- Her önemli iş adımından sonra `DURUM.md` dosyasını güncelle (ne yapıldı, nerede kalındı, sıradaki adımlar).
- İş bitince değişiklikleri anlamlı bir mesajla commit edip `origin`'e push et.
- Yanıtları Türkçe ve kısa yaz.

## Kota / yarıda kalma güvenliği
- İşi küçük, kendi başına derlenebilen adımlara böl. Her adım bitince commit + push yap.
- Bir adıma başlamadan önce `DURUM.md` > "Şu anki adım" bölümüne ne yapılacağını yaz; bitince işaretle.
- Yeni bir oturum `DURUM.md`'yi okuyarak kaldığı yerden devam edebilmeli.
