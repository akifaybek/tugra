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
forge build --force -> Compiling 23 files with Solc 0.8.35 (evm_version = prague)
                       Compiler run successful with warnings; exit 0
forge test      -> 52 passed; 0 failed; 0 skipped (2 suite, 52 total tests)
                   TugraVault.t.sol 51 + Gas.t.sol 1
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

## Asama 2 - Testnet hazirligi (ZINCIRE HICBIR ISLEM GONDERILMEDI)

### Ag bilgileri - resmi Monad dokumanindan DOGRULANDI

Kaynak: https://docs.monad.xyz/developer-essentials/testnet

| Oge | Deger |
| --- | --- |
| Chain ID | `10143` |
| Native para | `MON` |
| RPC (QuickNode) | `https://testnet-rpc.monad.xyz` - 50 rps, eth_call/eth_estimateGas icin 25 rps |
| RPC (Ankr) | `https://rpc.ankr.com/monad_testnet` - 300 istek/10 sn |
| RPC (Monad Foundation) | `https://rpc-testnet.monadinfra.com` - 20 rps |
| WebSocket | `wss://testnet-rpc.monad.xyz`, `wss://rpc-testnet.monadinfra.com` |
| Explorer | `https://testnet.monadvision.com`, `https://testnet.monadscan.com` |
| Faucet | `https://faucet.monad.xyz` |

Kaynak: https://docs.monad.xyz/developer-essentials/summary

| Oge | Deger |
| --- | --- |
| Blok sikligi | 300 ms |
| Islem basina gas limiti | 30M |
| Blok gas limiti | 150M |

### Gas ucretlendirmesi - DOGRULANDI

Kaynak: https://docs.monad.xyz/developer-essentials/gas-on-monad

> "On Monad, the sender is charged for the **gas limit**, not the gas used."
> `gas_paid = gas_limit * price_per_gas`
> `price_per_gas = min(base_price_per_gas + priority_price_per_gas, max_price_per_gas)`

Base fee tabani: 100 MON-gwei. Kullanilmayan gas IADE EDILMEZ.
Sonuc: gas limitleri sisirilemez; her fazla limit dogrudan para demektir.

### EVM hedefi - DOGRULANDI ve DEGISTIRILDI

Kaynak: https://docs.monad.xyz/tooling-and-infra/toolkits/foundry
ve https://docs.monad.xyz/guides/deploy-smart-contract/hardhat

- Monad EVM'i Fusaka fork'una uyar; Osaka fork'una kadarki butun opcode ve
  precompile'lar desteklenir. Resmi doküman Hardhat icin `evmVersion: "prague"`
  onerir.
- `foundry.toml`: `evm_version` **"paris" -> "prague"** olarak degistirildi.
  Eski "paris" degeri de uyumluydu (alt kume) ama gereksiz pahaliydi.
- Degisiklik sonrasi yeniden dogrulandi: `forge build --force` basarili,
  `forge test` 52/52 gecti.
- Olculen kazanc: runtime bytecode 3.030 -> 2.983 bayt, deploy yurutme gas'i
  696.597 (paris'te 705.829). Monad gas limit uzerinden kestigi icin bu
  dogrudan ucret tasarrufu.
- Kontrat boyutu 2.983 bayt; Monad limitleri 128 KB runtime / 256 KB initcode.
  Sorun yok.

### Foundry surumu - EKSIK, ONAY BEKLIYOR

Resmi doküman: "Foundry v1.8+ provides native support for Monad...
Versions before v1.8 lack Monad execution capabilities."

Yerel surum **1.7.1-Homebrew** -> v1.8 ALTINDA. Bu nedenle `network = "monad"`
secenegi kullanilamiyor ve yerel testler Monad'in gas modeli, opcode
fiyatlandirmasi ve MIP-8 depolama muhasebesi ALTINDA CALISMIYOR.

Sonuc: **yerel testlerin gecmesi ag uyumlulugu kanitı degildir.** Asagidaki
gas olcumleri Foundry'nin varsayilan modelinden gelir ve Monad gas modeliyle
DOGRULANMADI. Foundry 1.8+ kurulmadan once izin istenecek.

### Gas olcumu - YERELDE OLCULDU (Monad modeliyle dogrulanmadi)

Kaynak: `test/Gas.t.sol`, `forge test --match-path test/Gas.t.sol -vv`
Olculen deger yalnizca YURUTME gas'idir; intrinsic 21.000 + calldata haric.

| # | Islem | Gonderen | Olculen yurutme | Tahmini islem toplami | Script gas limiti |
| - | ----- | -------- | --------------- | --------------------- | ----------------- |
| 1 | deploy | sahip | 696.597 | ~772.000 | 900.000 |
| 2 | deposit | sahip | 8.846 | ~30.000 | 60.000 |
| 3 | createMandate | sahip | 97.383 | ~120.500 | 160.000 |
| 4 | execute yanlis alici (revert) | ajan | 2.179 | ~24.300 | 60.000 |
| 5 | execute mesru (basarili) | ajan | 39.538 | ~61.700 | 90.000 |
| 6 | execute tekrar (revert) | ajan | 1.875 | ~24.000 | 60.000 |

Akisin toplam gas LIMITI: **1.330.000**.
Base fee tabani 100 MON-gwei ile en kotu ucret: **0,133 MON** (oncelik ucreti
haric). Her prova icin yeni vekalet (adim 3-6) ~370.000 limit = ~0,037 MON.

### Hazirlanan scriptler (hicbiri calistirilmadi)

| Dosya | Isi |
| ----- | --- |
| `script/config.sh` | Ortak yapilandirma; `.env` yukler, gas limitleri ve tutarlar, `TUGRA_CONFIRM` onay kapisi. Tek basina islem gondermez. |
| `script/preflight.sh` | SALT OKUNUR. Chain ID'yi 10143 ile karsilastirir, base fee ve bakiyeleri okur, akis maliyetini hesaplar, sahip != ajan kontrolu yapar. |
| `script/proof-flow.sh` | Alti adimin her biri ayri. `TUGRA_CONFIRM=1` olmadan gondermez. |
| `test/Gas.t.sol` | Alti islemin gas'ini yerelde olcer. |

Dogrulandi: her iki script de `.env` yokken hicbir ag cagrisi yapmadan
cikiyor (exit 1). Sozdizimi `bash -n` ile kontrol edildi.

### Revert eden islemlerin ag oncesi engellenmemesi

Adim 4 ve 6 zincirde revert ETMELIDIR; kanit budur. `cast send` gas limiti
verilmezse `eth_estimateGas` cagirir, bu revert'te hata dondurur ve islem
hic gonderilmez.

Cozum: bu iki adimda islem `cast mktx` ile OFFLINE imzalanir (sabit
`--gas-limit` verildigi icin tahmin yapilmaz), sonra `cast publish --async`
ile yayinlanir. Ardindan `cast receipt <hash> status` okunur; beklenen `0`.
Script `status == 1` gelirse hata verip durur.

**DOGRULANMADI:** `cast mktx` + `cast publish --async` zincirinin bu Foundry
surumunde tam olarak bu bayraklarla calistigi canli olarak denenmedi.
Ilk gercek denemede dogrulanacak; calismazsa yedek yol `cast send --gas-limit`
(tahmin atlanir) olacak.

### Islem sirasi ve onay plani

Her adim ayri onay ister. Toplam 6 zincir islemi.

| Adim | Komut | Gonderen | Tutar | Beklenen sonuc |
| ---- | ----- | -------- | ----- | -------------- |
| 0 | `./script/preflight.sh` | - | - | Salt okunur, islem yok |
| 1 | `TUGRA_CONFIRM=1 ./script/proof-flow.sh deploy` | sahip | 0 | Kontrat adresi |
| 2 | `... deposit` | sahip | 0,05 MON | Kasa bakiyesi 0,05 |
| 3 | `... mandate` | sahip | 0 | Vekalet #1 |
| 4 | `... wrong-payee` | ajan | 0 | status 0, PayeeMismatch |
| 5 | `... pay` | ajan | 0,01 MON kasadan | status 1, saglayici +0,01 |
| 6 | `... repeat` | ajan | 0 | status 0, AlreadyUsed |

Butun tx hash'leri ve explorer baglantilari kaydedilecek.

### Tutar uyusmazligi - KARAR GEREKIYOR

CLAUDE.md'deki demo metni ekranda "250 MON -> Bilinmeyen adres" diyor.
Testnet faucet'inin verdigi MON miktari DOGRULANMADI ve 250 MON'un mumkun
olmasi beklenmiyor. Ekranda gosterilen tutar zincirdeki GERCEK tutarla ayni
olmak zorundadir; aksi halde dürüstlük kurali cignenir.
Scriptlerdeki varsayilan: vekalet tutari 0,01 MON, kasa fonu 0,05 MON.
Faucet miktari ogrenildikten sonra demo metni gercek tutara gore guncellenecek.

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
- `.env` yok; yedi degiskenin hicbiri dogrulanmadi. Kullanicinin olusturmasi
  gerekiyor (bkz. "Kullanicidan beklenen en kucuk hazirlik").
- Sahip/ajan cuzdanlari olusturulmadi, test MON fonlanmadi.
- Faucet'in verdigi MON miktari **DOGRULANMADI**; demo tutari buna bagli.
- Foundry **1.7.1**, Monad icin gereken **v1.8+** altinda. `network = "monad"`
  kullanilamiyor; yerel gas olcumleri Monad gas modeliyle dogrulanmadi.
  Kurulum icin onay bekleniyor.
- `cast mktx` + `cast publish --async` zinciri canli denenmedi **DOGRULANMADI**.
- Anthropic API'sine tek test istegi atilmadi.

## Kullanicidan beklenen en kucuk hazirlik

Asama 2'nin zincir kismi bunlar olmadan baslayamaz. Hicbir gizli deger
sohbete yazilmaz; hepsi yalnizca `.env` icinde kalir.

1. `cp .env.example .env`
2. Iki AYRI cuzdan olustur (sahip ve ajan). Ornegin `cast wallet new` iki kez
   calistirilir; ciktidaki ozel anahtarlar dogrudan `.env` icine yapistirilir,
   terminalde birakilmaz ve sohbete kopyalanmaz.
3. Saglayici ve saldirgan icin iki adres daha belirle (yeni cuzdan ya da
   mevcut adresler olabilir; ikisi birbirinden ve sahip/ajandan farkli olmali).
4. `.env` doldurulur: `MONAD_RPC_URL=https://testnet-rpc.monad.xyz`,
   `OWNER_PRIVATE_KEY`, `AGENT_PRIVATE_KEY`, `PROVIDER_ADDRESS`,
   `ATTACKER_ADDRESS`. (`VAULT_ADDRESS` ve `MANDATE_ID` sonra doldurulur.)
5. https://faucet.monad.xyz adresinden SAHIP ve AJAN adreslerine test MON
   alinir. Kaba ihtiyac: sahip >= 2 MON, ajan >= 1 MON.
6. Doluluk kontrolu (deger yazdirmadan):
   `for v in MONAD_RPC_URL OWNER_PRIVATE_KEY AGENT_PRIVATE_KEY PROVIDER_ADDRESS ATTACKER_ADDRESS; do grep -q "^$v=." .env && echo "$v dolu" || echo "$v BOS"; done`
7. `./script/preflight.sh` calistirilir (salt okunur, islem gondermez).

## Siradaki adim

Asama 2 - Testnet deploy + kanit akisi. Baslamadan once: Monad ag bilgilerinin
resmi dokumandan dogrulanmasi, `.env` olusturulmasi, iki cuzdanin fonlanmasi.
Zincire tx gonderen her adim icin ayri onay alinacak.

Onay bekleyen iki karar:
1. Foundry v1.8+ kurulsun mu? (`network = "monad"` ve gercek Monad gas modeli
   icin gerekli; yerel gas olcumlerini kanita cevirir.)
2. Yukaridaki "Kullanicidan beklenen en kucuk hazirlik" tamamlandiktan sonra
   adim adim zincir islemleri baslatilsin mi?

Paralel ve erken yapilmasi gerekenler (teslim sarti oldugu icin son dakikaya
birakilmaz): public GitHub repo acilmasi ve Render hesabi + bos bir Node
servisinin bir kez deploy edilip public URL'in alinmasi.
