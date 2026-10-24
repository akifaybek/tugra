# Tugra - Durum

Son guncelleme: 2026-10-24

## Tamamlananlar

### Hazirlik (kismi, salt okunur kontrol)

| Oge | Durum | Kanit |
| --- | --- | --- |
| node | Kurulu | `node -v` -> v22.21.0 |
| forge | Kurulu | `forge --version` -> 1.7.1-Homebrew |
| cloudflared | **Kurulu degil** | `cloudflared --version` -> command not found |
| `.env` | **Yok** | Dosya mevcut degil; degisken doluluk kontrolu yapilamadi |

### Asama 1 - TugraVault + Foundry testleri (TAMAMLANDI)

- `src/TugraVault.sol` yazildi: sahip (immutable), para yatirma/cekme, vekalet
  olusturma/iptal, ajanin tek yetkisi olan `execute(mandateId, payee, amount)`.
- Checks-effects-interactions: `used = true` dis odeme cagrisindan once islenir.
- `nonReentrant` kilidi (1 = acik, 2 = kilitli) `execute` ve `withdraw` uzerinde.
- Approval, keyfi cagri, upgrade veya baska para cikis yolu yok.
- `test/TugraVault.t.sol` + `test/mocks/Receivers.sol` yazildi.

#### Dogrulama sonuclari (gercek calistirma, 2026-10-24)

```
forge --version -> 1.7.1-Homebrew
forge build --force -> Compiling 22 files with Solc 0.8.35
                       Solc 0.8.35 finished in 908.69ms
                       Compiler run successful with warnings; exit 0
forge test -vv -> 51 passed; 0 failed; 0 skipped (51 total tests)
```

Kalan derleme uyarisi: `forge lint` `block-timestamp` uyarisi (2 adet). Vekaletin
son gecerlilik mekanizmasi zaman karsilastirmasi gerektirdigi icin beklenen uyari.

#### Tanimlanan davranis kurallari

- **Expiry siniri:** `block.timestamp <= expiry` ise vekalet gecerlidir.
  Tam sinir aninda (`block.timestamp == expiry`) odeme BASARILI olur;
  `expiry + 1` saniyede `Expired`. Her iki sinir da test edilmistir.
- **Olusturma siniri:** `expiry > block.timestamp` sart. Esit veya gecmis deger
  `InvalidExpiry` ile reddedilir. Her iki durum test edilmistir.
- **Yeniden giris:**
  - Ic cagrinin hatasi disari yayilirsa dis odeme de basarisiz olur, islem
    butunuyle geri alinir, hicbir vekalet tukenmez.
  - Ic cagrinin hatasi yakalanirsa dis odeme basarili olabilir; ancak ikinci
    odeme gerceklesmez ve ikinci vekalet tukenmez.
  - Ikinci odemeyi engelleyen seyin `nonReentrant` kilidi oldugu dogrudan
    dogrulanir: mock ic cagrinin ham revert verisini saklar, test bunun
    `Reentrancy` selector'u oldugunu kontrol eder. Yani engel `used`
    bayragindan degil, kilitten gelir (taze vekalet durumunda da ayni).
- **Basarisiz deneme vekaleti tuketmez.** Kosul duzeltildiginde (alici odemeyi
  kabul etmeye baslayinca veya kasa yeniden fonlaninca) AYNI vekalet calisir.

#### Hata adlari

CLAUDE.md'de yazili olanlar: `NotAgent`, `PayeeMismatch`, `AmountMismatch`,
`Expired`, `Revoked`, `AlreadyUsed`.

Onayli ek hatalar: `NotOwner`, `TransferFailed`, `InsufficientBalance`.

Girdi dogrulamasi icin eklenen ve raporlanan hatalar: `ZeroAgent`, `ZeroPayee`,
`ZeroAmount`, `InvalidExpiry`, `UnknownMandate`, `Reentrancy`.

#### Teknoloji notlari

- solc 0.8.35'e sabitlendi. Onbellekteki 0.8.20 yalnizca x86_64 oldugu icin bu
  arm64 makinede calismiyor (`Bad CPU type in executable`).
- forge-std 1.9.7, git kullanmayan Soldeer ile kuruldu (`forge soldeer install`).
  `soldeer.lock` ve `remappings.txt` commit edilir, `dependencies/` edilmez.

## Organizator sartlari (slaytlardan, 2026-10-24)

- Teslim 16.30; hedef 16.00.
- Juri %80, topluluk %20.
- Agirliklar: execution %24, on-chain necessity/Monad fit %20, community %20,
  problem %16, originality %12, presentation %8.
- **Calisan, erisilebilir deploy + public GitHub repo zorunlu. Yerelde
  barindirilan projeler kabul edilmiyor.**
- Demo 90 saniye (mevcut plana uygun).

### Barindirma karari (henuz uygulanmadi)

Tek Node servisi Mac'ten bagimsiz barindirilacak. Secilen tek yol: **Render
Web Service** (GitHub repo'ya bagli, Node runtime, public HTTPS URL).

Gerekce: tek surecli Express + bellek ici kuyruk oldugu gibi calisir, surec
uzun omurlu kalir (SSE/WebSocket mumkun), ortam degiskenleri panelden girilir,
Dockerfile gerekmez.

Bu karar cloudflared'in yerini alir: quick tunnel hala Mac'te barindirma
demektir ve sart disi kalir. Telefonlar da ayni public URL'e baglanir.

Kod tarafinda gereken uyarlamalar:
- Sunucu `process.env.PORT` dinlemeli, `0.0.0.0`'a baglanmali.
- `.env` commit edilmez; degerler Render panelinden girilir.
- `package.json` icinde `start` scripti ve `engines.node` olmali.
- Statik ekranlar ayni Express surecinden servis edilir (ayri servis yok).

**DOGRULANMADI:** Render'in ucretsiz katman uyku/cold-start davranisi, fiyat
ve WebSocket limitleri resmi dokumandan kontrol edilmedi. Demo oncesi servisin
uyanik oldugu elle dogrulanacak.

## Engeller / eksikler

- Barindirma hesabi (Render) acilmadi, servis deploy edilmedi.
- `cloudflared` artik gerekli degil (barindirma kararina bakin); yalnizca
  yerel gelistirme sirasinda telefon denemesi icin istege bagli.
- `.env` yok; dort degiskenin hicbiri dogrulanmadi.
- Monad testnet ag bilgileri (chain ID, RPC, explorer) **DOGRULANMADI** -
  resmi Monad dokumanindan alinacak.
- `foundry.toml` icindeki `evm_version = "paris"` **DOGRULANMADI** - Monad'in
  destekledigi EVM surumu Asama 2'de resmi dokumandan dogrulanacak.
- Sahip/ajan cuzdanlari olusturulmadi, test MON fonlanmadi.
- Anthropic API'sine tek test istegi atilmadi.
- Git deposu durumu **DOGRULANMADI** (git komutu calistirilmadi).

## Siradaki adim

Asama 2 - Testnet deploy + kanit akisi. Baslamadan once: Monad ag bilgilerinin
resmi dokumandan dogrulanmasi, `.env` olusturulmasi, iki cuzdanin fonlanmasi.
Zincire tx gonderen her adim icin ayri onay alinacak.

Paralel ve erken yapilmasi gerekenler (teslim sarti oldugu icin son dakikaya
birakilmaz): public GitHub repo acilmasi ve Render hesabi + bos bir Node
servisinin bir kez deploy edilip public URL'in alinmasi.
