Proje kararı kesin: Tuğra. Yeni fikir veya özellik önerme.

1. AMAÇ VE VAAT
- Monad Blitz için tek kişi, AI yardımıyla yaklaşık 6 saatte çalışan bir son kullanıcı uygulaması geliştireceğiz.
- Öncelik: çalışan ürün, anlaşılır fayda, 90 saniyelik etkili demo.
- Ürün adı Tuğra; verilen yetkinin ve mekanizmanın adı vekâlet.
- Vaat: “AI’a bütün paranı yönetme yetkisi verme. Yapacağı iş kadar yetki ver.”
- Tagline: “Ajanına cüzdanını değil, tuğranı ver.”
- Hikâye: “Tuğrasız belge geçmez; tuğra sadece belgede yazanı onaylar.”
- Senaryo: AI ajanı, rapor hazırlamak için ücretli veri satın alıyor.
- Demo sağlayıcı kurgusal; gerçek marka yok. Ödeme Monad testnet üzerinde native MON.
- Mekanizmanın benzersiz olduğunu, prompt injection’ı çözdüğümüzü veya yalnızca Monad’da mümkün olduğunu iddia etmiyoruz.
1. GÜVEN SINIRI
- Güvenilir girdi: kullanıcının doğruladığı sağlayıcı adresi, tam ödeme tutarı, yetkili ajan ve geçerlilik süresi.
- Güvensiz içerik: ajanın okuyacağı sağlayıcı açıklaması ve seyircinin eklediği not.
- Vekâletin alıcısı ve koşulları güvensiz içerikten türetilmez.
- Sıra:
    1. Kullanıcı vekâleti onaylar.
    2. Vekâlet zincirde kesinleşir; ekranda “Vekâlete tuğra basıldı” görünür.
    3. Seyirci notu eklenir.
    4. Ajan içeriği okur ve ödeme aracı çağrısı üretir.
    5. Kontrat çağrıyı mevcut vekâlete göre kabul veya reddeder.
- Para kasadadır; ajan anahtarında yalnızca işlem gas’ı bulunur.
- Güvence, kasa varlıkları ve verilen vekâlet kapsamındadır. Modelin bütün davranışlarının güvenli olduğunu söylemeyiz.
1. KONTRAT KURALLARI
- Kontrat adı: TugraVault.
- Sahip: para yatırır, geri çeker, vekâlet oluşturur ve iptal eder.
- Vekâlet: yetkili ajan, sabit alıcı, tam pozitif tutar, son geçerlilik zamanı, tek kullanım.
- Ajanın tek ödeme yetkisi: execute(mandateId, payee, amount).
- Hatalar:
    - NotAgent: çağıran yetkili ajan değil.
    - PayeeMismatch: alıcı eşleşmiyor.
    - AmountMismatch: tutar tam eşleşmiyor; sıfır ve kısmi ödeme de reddedilir.
    - Expired: süre dolmuş.
    - Revoked: sahip vekâleti iptal etmiş.
    - AlreadyUsed: vekâlet daha önce başarıyla kullanılmış.
- Başarısız işlem vekâleti tüketmez.
- Kullanılmış durum dış ödeme çağrısından önce işlenir: checks-effects-interactions.
- Yeniden giriş (reentrancy) koruması bulunur.
- Dış ödeme başarısızsa işlem bütünüyle geri alınır; vekâlet tüketilmez.
- Aynı vekâletle ikinci başarılı ödeme yapılamaz. Aynı satın alma için başka vekâlet oluşturulmasını engellediğimizi iddia etmeyiz.
- Yönetici fonksiyonları yalnızca sahip tarafından çağrılır.
- Approval, keyfi çağrı, upgrade veya ajanın kullanabileceği başka para çıkarma yolu yok.
1. UYGULAMA
- Tek Node servisi, gerçek LLM ve tek ödeme aracı.
- Tek ajan anahtarı için nonce/gönderim kuyruğu.
- Gerçek model çağrısı olduğu gibi kaydedilir; kontrollü test ayrı etiketlenir.
- Zincire giden denemeler sayı ve toplam gas bütçesiyle sınırlandırılır.
- Limit sonrası denemeler yalnızca simülasyondur; ayrı gösterilir.
- Simülasyonda ret ile zincirde revert eden gerçek işlem karıştırılmaz.
- Model süresi ve zincir süresi ayrı ölçülür; zincir süresi gönderimden kesinleşmeye kadardır.
- Başarılı yetkili ödeme sonrasında örnek veri erişimi açılır.
- Her prova için yeni vekâlet oluşturulur.
1. EKRANLAR
- Telefon:
    - Cüzdan gerektirmez; yalnızca sağlayıcı notu gönderilir.
    - Telefon başına bekleme süresi ve uygunsuz içerik filtresi bulunur.
    - Notlar kuyruğa girer; operatör çalıştırılacak notu seçer.
- Büyük ekran:
    - Vekâlet kartı: sağlayıcı, güvenilir alıcı kaynağı, tutar, süre, durum ve oluşturma tx’i.
    - Sağlayıcı içeriği ve filtrelenmiş, kısaltılmış seyirci notu.
    - Okunabilir çağrı: “250 MON → Bilinmeyen adres · Vekâlet #1”.
    - Kayıtlı alıcı isimle gösterilir; ham JSON ve uzun adresler yalnızca “ayrıntı” altında.
    - “Gerçek model kararı”, “Kontrollü test” ve “Simülasyon” açıkça ayrılır.
    - Kuyruktaki/işlenen denemeler gri ve “beklemede” görünür.
    - Zincirde kesinleşmemiş hiçbir deneme başarılı veya yeşil gösterilmez.
    - İşlem sonucu, explorer bağlantısı, kasa bakiyesi ve ayrı model/zincir süreleri.
    - “Zincirde revert eden tx” ve “Simülasyon” sayaçları ayrı.
    - “Monad testnet · native MON” kapsamı görünür.
1. 90 SANİYELİK DEMO
- 0–15 sn: “Tuğra: Ajanına cüzdanını değil, tuğranı ver. Ajanım rapor için ücretli veri alacak. Ona cüzdanımı değil, bu satın alma için yetki verdim.” Kesinleşmiş vekâlet kartı ve “Vekâlete tuğra basıldı” gösterilir.
- 15–45 sn: seçilmiş seyirci notuyla saldırı denenir.
    - Model yetki dışı ödeme isterse gerçek işlem gönderilir ve ret kanıtıyla “Tuğra dışı ödeme reddedildi” gösterilir.
    - Model saldırıyı reddederse bu dürüstçe gösterilir; ardından “Kontrollü test” etiketiyle kötü niyetli çağrı denenir. Gerçek işlemde ret doğrulanınca “Tuğra dışı ödeme reddedildi” gösterilir.
- 45–70 sn: temiz akışta yetkili ödeme başarılı olur; örnek veri açılır, bakiye ve kullanılmış vekâlet gösterilir.
- 70–82 sn: aynı vekâletle tekrar ödeme AlreadyUsed ile reddedilir; ekranda “Bu tuğra kullanıldı” görünür.
- 82–90 sn: “Tuğrasız belge geçmez; tuğra sadece belgede yazanı onaylar. Yapacağı iş kadar yetki.” Ölçülen süreler gösterilir.
- Kontratın vekâlet içindeki her hatayı veya yanlış kullanıcı niyetini anlayabildiği söylenmez.
1. HATA DURUMLARINDA DÜRÜST TAMAMLAMA
- Model kandırılmazsa: gerçek ret gösterilir; etiketli kontrollü test yapılır.
- Model API’si çalışmazsa: erişilemediği açıklanır; kontrollü test ve yetkili ödeme gösterilir. Bunlar model çıktısı gibi sunulmaz.
- Katılımcı azsa/yoksa: operatörün hazırladığı not kullanılır; kaynağı açıkça belirtilir.
- Salon Wi-Fi’ı bozulursa: önceden test edilmiş mobil hotspot kullanılır.
- Dış bağlantı tamamen giderse: “prova kaydı” etiketli video ve önceden alınmış explorer tx kanıtları gösterilir.
- Yerel zincir veya geçmiş kayıt, canlı Monad işlemi gibi sunulmaz.
- Gas bütçesi dolarsa: yalnızca açıkça etiketlenmiş simülasyona geçilir.
1. KAPSAM DIŞI
- ERC-20, çoklu token, session key, zaman kilidi, 4337/7702.
- Genel entegrasyon platformu, çoklu vekâlet yönetim arayüzü, kısmi ödeme.
- Gerçek sağlayıcı entegrasyonu ve gerçek para.
- “Çalınan: 0”, “prompt injection çözüldü”, “benzersiz” iddiaları.
- Kural tabanlı çıktıyı gerçek model kararı gibi göstermek.
1. GELİŞTİRME SIRASI VE BİTTİ KRİTERLERİ
- Hazırlık:
    - node -v, forge --version, cloudflared --version çalışıyor; eksik olan kurulmuş.
    - Yeni Anthropic API anahtarı .env’de; doluluğu yalnızca izin verilen grep kontrolüyle doğrulanmış; tek test isteği başarılı.
    - Sahip ve ajan için iki ayrı cüzdan oluşturulmuş; ikisi de test MON ile fonlanmış.
    - Demo süresi, önceden kod getirme kuralı ve teslim yöntemi organizatörden öğrenilmiş.
    - Monad testnet ağ bilgileri resmi dokümandan doğrulanmış.
    - Mobil hotspot denenmiş.
- Kontrat + Foundry testleri:
    - Meşru ödeme, tüm hata yolları, iptal, yönetici erişimleri, başarısız denemenin vekâleti tüketmemesi, dış ödeme başarısızlığı ve reentrancy davranışı test edilmiş; testler geçmiş.
- Testnet deploy + kanıt akışı:
    - Kullanıcı onayları alınarak deploy, vekâlet oluşturma, yanlış alıcı ret’i, başarılı ödeme ve tekrar ödeme ret’i gerçek tx’lerle doğrulanmış; hash’ler kaydedilmiş.
- Ajan servisi:
    - Gerçek model çağrısı, kontrollü test, nonce kuyruğu, gas/deneme limiti ve ayrı süre ölçümleri uçtan uca çalışıyor.
- Ana ekran + örnek veri:
    - Beklemede/başarılı/başarısız ayrımı doğru; işlem kanıtları görünür; veri erişimi yalnızca başarılı yetkili ödeme sonrası açılıyor.
- Telefon:
    - Not gönderme, bekleme süresi, filtre, kuyruk ve operatör seçimi denenmiş.
- Prova:
    - 90 sn akış denenmiş; model/API/katılım/ağ yedekleri kontrol edilmiş; etiketli prova kaydı ve işlem kanıtları hazır.
- Telefon katılımını temel ödeme akışı çalışmadan geliştirme.
- Son bir saati prova ve düzeltmeye ayır.
1. TEKNOLOJİ VE ALTYAPI
- Repo/klasör adı: tugra (ASCII). Kontrat adı: TugraVault.
- Kontrat: Solidity + Foundry (forge test). Sadece native MON.
- Sunucu: tek Node.js süreci (Express), zincir için viem. Ekranlar sunucudan servis edilen düz HTML+JS (Next.js/React yok).
- LLM: Anthropic API, model "claude-haiku-5-5", tek araç: pay(mandateId, payee, amount).
- Telefon erişimi: telefonlar Mac'teki sunucuya Cloudflare quick tunnel (cloudflared) ile ulaşır; salon Wi-Fi'ında cihazlar birbirini görmeyebilir. cloudflared kurulumu doğrulanmadı — hazırlıkta kontrol edilir.
- Gas: Monad ücreti kullanılan gas'a değil gas LİMİTİNE göre keser. Revert edeceği bilinen işlemlerde (yanlış alıcı, tekrar ödeme, kontrollü test) estimateGas revert'te hata verir; bu işlemlerde estimateGas atlanır, sabit ve sıkı bir gas limiti verilir. Başarılı işlemlerde estimateGas × 1,2.
- .env değişkenleri (değerler asla yazdırılmaz): MONAD_RPC_URL, OWNER_PRIVATE_KEY, AGENT_PRIVATE_KEY, ANTHROPIC_API_KEY, VAULT_ADDRESS (deploy sonrası). .env.example commit edilir, .env .gitignore'da.
- Saldırgan adresi: operatör kontrolündeki sabit, ayrı bir adres; ekranda "Bilinmeyen adres" olarak görünür. Sağlayıcı adresi: güvenilir kayıtlı alıcı olarak konfigürasyonda.
- Monad testnet ağ bilgileri (chain ID, RPC, explorer) yalnızca resmi Monad dokümanından alınır; ezberden yazılmaz.

1. ÇALIŞMA KURALLARI
- Küçük, çalışan ve doğrulanmış her adım sonunda sık sık commit alacağız.
- Sen hiçbir git komutunu çalıştırma. Commit ve push işlemlerini yalnızca ben yapacağım.
- Her adım sonunda “COMMIT ZAMANI” bloğu ver:
    1. Değişen dosyaları ve doğrulama sonucunu kısaca açıkla.
    2. Terminale kopyalayıp yapıştıracağım git komutlarını ver: yalnızca ilgili dosyaları ekleme ve açıklayıcı mesajla commit. İnceleme komutu (git status, git diff) ekleme.
- Dosya eklerken açık dosya yolları kullan. Asla git add . veya git add -A verme.
- .env, private key, API key veya başka gizli bilgi içeren dosyalar commit’e eklenmez.
- Commit mesajını sen hazırla; komutları çalıştırmak ve commit’i atmak benim görevim.
- Commit mesajı kısa olsun: tek satır başlık, gerekirse en fazla 2-3 satır gövde. Doğrulama çıktılarını, test listelerini ve gerekçeleri mesaja değil STATUS.md’ye yaz.
- Push komutunu yalnızca istediğimde ver; kendin çalıştırma.
- .env dosyasını okuma veya içeriğini yazdırma. Gerekli değişkenin doluluk kontrolü yalnızca şu biçimde yapılır: grep -q "^X=." .env && echo dolu
- Bu kontrolde X yerine gerekli değişken adını kullan; değerini gösterme.
- Private key veya API key’i sohbete yapıştırmamı isteme.
- Zincire tx gönderen her adımdan önce sor ve onayımı bekle. Script birden fazla tx içeriyorsa önce kapsamını açıkla.
- Ölçülen, varsayılan ve henüz doğrulanmamış bilgileri açıkça ayır. Doğrulanmamış komut, bayrak, URL veya ağ bilgisi için “doğrulanmadı” yaz.
- Her adımı çalıştırıp ilgili çıktısını göster; gizli değerleri çıktıya çıkarma. Çalıştıramadığını tamamlandı sayma.
- Bir engelde 15 dakika takılırsan dur; engeli, denediklerini ve ihtiyaç duyduğun kararı raporla.
- Her adım sonunda STATUS.md güncelle: tamamlananlar, doğrulama sonuçları, engeller ve sıradaki adım. Gizli bilgi ekleme.
- Kararlaştırılmış kapsamı büyütme; yeni fikir veya özellik önerme.

İlk yanıtında sadece kısa uygulama planını ve ilk uçtan uca akışı (kontrat + Foundry testleri) ver; onayımı bekle.