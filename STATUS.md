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
forge (/Users/akif/.foundry/bin/forge) -> 1.8.0, commit 61ae26af36
forge build --force -> Compiling 23 files with Solc 0.8.35
                       (evm_version = prague, network = monad)
                       Compiler run successful with warnings
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

### Foundry surumu - COZULDU

Resmi dagitimdan (`~/.foundry/bin/foundryup --install v1.8.0`) kuruldu.
Homebrew kurulumu KALDIRILMADI; yalnizca PATH sirasi degistirildi.

`~/.zshrc` sonuna eklendi: `export PATH="$HOME/.foundry/bin:$PATH"`
(dosyada onceden `export PATH="/opt/homebrew/bin:$PATH"` satiri vardi ve
homebrew'u one aliyordu; yeni satir ondan SONRA geldigi icin resmi dagitim
kazaniyor.)

Yeni login shell'de cozumleme dogrulandi:

| Binary | Yol | Surum |
| ------ | --- | ----- |
| forge | `/Users/akif/.foundry/bin/forge` | 1.8.0 (61ae26af36) |
| cast | `/Users/akif/.foundry/bin/cast` | 1.8.0 |
| anvil | `/Users/akif/.foundry/bin/anvil` | 1.8.0 |
| chisel | `/Users/akif/.foundry/bin/chisel` | 1.8.0 |

PATH ilk uc girdi: `~/.foundry/bin`, `~/.nvm/.../bin`, `/opt/homebrew/bin`.
Eski 1.7.1 hala `/opt/homebrew/bin` altinda duruyor ama one gecmiyor.

### Monad yurutme ortami etkin

`foundry.toml` icine `network = "monad"` eklendi. Etkin oldugunun kaniti:
`forge build --sizes` kontrat marjini 24.576 bayt yerine **128.089 / 259.073**
bayt gosteriyor; bunlar Monad'in 128 KB runtime / 256 KB initcode limitleri.

**Hardfork:** Resmi dokumana gore yerel yurutme varsayilan olarak en guncel
hardfork'u (`MonadTen`) kullanir ve canli ag fork'lanirsa Foundry dogru
hardfork'u kendisi secer. Acik bir `hardfork` satiri YAZILMADI; varsayilan
MonadTen kullaniliyor. **DOGRULANMADI:** testnet'in su an hangi hardfork'ta
oldugu canli olarak kontrol edilmedi (zincir islemi yapilmadi). Ilk gercek
deploy sirasinda dogrulanacak.

### Foundry 1.8 davranis degisikligi - testler duzeltildi

Yukseltmeden sonra butun testler `setUp()` icinde su hatayla patladi:
`vm.prank: cannot overwrite a prank until it is applied at least once`

Sebep (trace ile bulundu): Foundry 1.8 test kontrati icindeki `new X()`
ifadesini `VM::deployCode` cheatcode'una ceviriyor; cheatcode ise tek
seferlik prank'i TUKETMIYOR. Ardindan gelen ikinci `vm.prank` "uzerine
yazma" sayiliyor. Bu Monad'a ozgu DEGIL - `network` kapaliyken de oluyor.

Duzeltme: deploy + deposit blogu `vm.startPrank` / `vm.stopPrank` arasina
alindi. 52/52 test geciyor.

Ayni degisiklik gas olcumunu de bozmustu: `new TugraVault()` deployCode'a
cevrildigi icin olculen deploy gas'i 20.527 gibi gercek disi cikiyordu.
`test/Gas.t.sol` artik `vm.getCode` + ham `create` opcode'u kullaniyor.

### Gas tablosu - Monad ortaminda OLCULDU

Iki ayri olcum var ve ayri tutulmalari gerekiyor.

**(a) Yurutme gas'i** - `forge test --match-path test/Gas.t.sol -vv`,
`network = "monad"`. Yalnizca cagri icindeki yurutme; intrinsic ve calldata
HARIC. Test harness'inin cagri cercevesi de iceride oldugu icin bu degerler
zincirdeki gercek maliyetin USTUNDE kalir, butce icin kullanilmaz.

| # | Islem | Yurutme gas (Monad) | Onceki (Monad disi) |
| - | ----- | ------------------- | ------------------- |
| 1 | deploy (ham CREATE) | 774.094 | 696.597 |
| 2 | deposit | 39.897 | 8.846 |
| 3 | createMandate | 117.306 | 97.383 |
| 4 | revert PayeeMismatch | 42.728 | 2.179 |
| 5 | execute basarili | 90.385 | 39.538 |
| 6 | revert AlreadyUsed | 42.424 | 1.875 |

**(b) Toplam islem gas'i** - `anvil --network monad` uzerinde GERCEK islem
makbuzlarindan okunan `gasUsed`. Intrinsic 21.000 ve calldata DAHIL.
Butce ve gas limiti bu sutundan turetilir.

| # | Islem | Toplam islem gas (makbuz) | Gonderilecek limit | Limit nasil belirlendi |
| - | ----- | ------------------------- | ------------------ | ---------------------- |
| 1 | deploy | 741.873 | ~890.248 | estimateGas x 1,2 |
| 2 | deposit | 22.694 | ~27.233 | estimateGas x 1,2 |
| 3 | createMandate | 99.329 | ~119.195 | estimateGas x 1,2 |
| 4 | revert PayeeMismatch | 42.226 | **60.000** | olculen x 1,42 (sabit) |
| 5 | execute basarili | 64.645 (estimate 66.831) | ~80.197 | estimateGas x 1,2 |
| 6 | revert AlreadyUsed | 41.910 | **60.000** | olculen x 1,42 (sabit) |

Not: (a) ve (b) ayni sey degil. (a)'daki dusus/yukselis tek basina ucreti
degistirmez - **ucreti belirleyen yalnizca gonderilen gas LIMITIDIR.**
Daha dusuk yurutme gas'i ancak estimateGas'i ve dolayisiyla limiti
dusurdugu olcude tasarruf saglar.

**Ucret tahmini** (base fee tabani 100 MON-gwei = 1e-7 MON/gas, oncelik
ucreti HARIC; base fee bu tabanin uzerine cikarsa oransal artar):

| Kalem | Gas limiti toplami | Ucret |
| ----- | ------------------ | ----- |
| Ilk kanit akisi (6 islem) | 1.236.873 | ~0,1237 MON |
| Her ek prova (adim 3-6) | 319.392 | ~0,0319 MON |

**Revert limitinin gerekcesi:** olculen en yuksek revert maliyeti 42.226.
Secilen 60.000 (x1,42). Limit yetersiz kalirsa islem out-of-gas ile revert
eder ve makbuzdaki sebep `PayeeMismatch` yerine OOG olur - yani KANIT yok
olur. Fazladan ~17.800 gas ise taban base fee'de ~0,0018 MON. Hata tarafi
pahali, guvenlik tarafi ucuz.

### Revert eden islemlerin gonderimi - YERELDE DOGRULANDI

Eski plandaki `cast mktx` + `cast publish --async` zincirine GEREK YOK.
`anvil --network monad` uzerinde dogrulandi:

- Gas limiti VERILMEDEN: islem hic gonderilmiyor.
  `Error: Failed to estimate gas: ... execution reverted: PayeeMismatch`
- `--gas-limit 120000` ile: islem zincire gidiyor, orada revert ediyor.
  Makbuz `status: false`, `gasUsed: 42226`,
  `revertReason: custom error 0xe28e12ad`

Revert sebepleri selector ile eslestirildi:

| Selector | Hata | Hangi adim |
| -------- | ---- | ---------- |
| `0xe28e12ad` | `PayeeMismatch()` | 4 |
| `0x7b8c8210` | `AlreadyUsed()` | 6 |

Yerel akisin tamami gecti: deploy -> deposit -> mandate -> revert ->
basarili odeme -> revert. Adim 5 `estimateGas = 66.831`, limit x1,2 = 80.197,
gercek `gasUsed = 64.645`, `status: true`.

**Yerel basari testnet kaniti DEGILDIR.** anvil Monad yapilandirmasiyla
calisir ama gercek Monad testnet'i degildir; sira, ucretlendirme ve ag
davranisi birebir ayni olmayabilir.

### Organizator API'si - salt okunur kontroller yapildi

Taban: `https://agents.devnads.com` (belge: https://devnads.com/agents)

`GET /health` -> `HTTP 200` `{"status":"ok"}`

`GET /v1/faucet/status/10143` -> `HTTP 200`

| Alan | Deger |
| ---- | ----- |
| chainId / ag | 10143 / Monad Testnet |
| enabled | `true` |
| amountPerRequest | 1 MON |
| rateLimits | adres 10/gun, IP 50/gun, ASN 200/gun |
| faucet bakiyesi | ~2.950,58 MON |
| dailyBudget | 2.000 MON/gun |

**Faucet POST GONDERILMEDI.**

Dikkat: IP limiti 50/gun ve ASN limiti 200/gun ortak salon agi uzerinden
paylasilir. Salonda ayni agdaki baska ekipler de kullanirsa limit erken
dolabilir. Fon alma isi salona varmadan, ayri bir agdan yapilmali.

### Fon ihtiyaci - olculen rakamlardan hesaplandi

Olculen degerler: ilk akis 1.236.873 gas limiti, her prova 319.392.
Taban base fee (100 MON-gwei) ile:

| Taraf | Kalem | Tutar |
| ----- | ----- | ----- |
| Sahip | deploy + deposit + ilk vekalet | ~0,1037 MON |
| Sahip | 15 prova vekaleti (15 x 119.195) | ~0,1788 MON |
| Sahip | kasaya yatirilan fon (geri cekilebilir) | 0,5 MON |
| Ajan | ilk akistaki 3 deneme | ~0,0200 MON |
| Ajan | 15 prova x 3 deneme | ~0,3003 MON |

Yani **olculen gas ihtiyaci sahip icin ~0,28 MON, ajan icin ~0,32 MON**
(kasa fonu haric). Faucet istek basina 1 MON verdigi icin her iki adrese
BIRER istek bile bu hesaba gore yeter.

Onceki rapordaki "sahip >= 2 MON / ajan >= 1 MON" ifadesi olculmus bir
zorunluluk DEGILDI; tahmindi. Olcum sonrasi onerilen pay:
her adrese 2 faucet istegi (2 MON). Gerekce - olcum degil, pay:
base fee tabanin uzerine cikabilir, oncelik ucreti eklenebilir, prova
sayisi artabilir ve salon IP'sinde limit dolarsa ikinci istek sansi olmaz.

### Kaynak dogrulama plani (POST /v1/verify) - HAZIR, GONDERILMEDI

`script/verify.sh` hazirlandi. Derleyici kimligi elle yazilmaz; derleme
artifact'indaki metadata'dan OKUNUR.

| Alan | Deger | Kaynak |
| ---- | ----- | ------ |
| chainId | 10143 | config |
| contractAddress | deploy sonrasi `.env` | - |
| contractName | `src/TugraVault.sol:TugraVault` | - |
| compilerVersion | `v0.8.35+commit.47b9dedd` | `out/TugraVault.sol/TugraVault.json` metadata |
| optimizationUsed | `true` | metadata |
| runs | 200 | metadata |
| evmVersion | `prague` | metadata |
| standardJsonInput | `forge verify-contract --show-standard-json-input` | uretildi; tek kaynak dosya `src/TugraVault.sol` |
| constructorArgs | **gonderilmez** | TugraVault constructor parametre almaz |

`./script/verify.sh payload` govdeyi uretir ve GONDERMEZ.
Gonderim yalnizca `send` alt komutuyla ve onayla olur.

**Kaynak dogrulama guvenlik denetimi degildir.** Yalnizca "zincirdeki
bytecode bu kaynaktan derlenmistir" demektir; kodun dogru veya guvenli
oldugunu soylemez. Scriptin basinda da bu not duruyor.

### Hazirlanan scriptler (hicbiri zincire/faucet'e istek gondermedi)

| Dosya | Isi |
| ----- | --- |
| `script/config.sh` | `.env` yukler, gas politikasi, `est_limit()` (estimateGas x1,2), `TUGRA_CONFIRM` kapisi |
| `script/preflight.sh` | SALT OKUNUR: chainId 10143, base fee, bakiyeler, ucret tahmini, faucet durumu |
| `script/proof-flow.sh` | Alti adim ayri ayri; basarili adimlar estimateGas x1,2, revert adimlari sabit 60.000 |
| `script/verify.sh` | `/v1/verify` govdesini uretir; gondermek ayri komut |
| `test/Gas.t.sol` | Yurutme gas'i olcumu (ham CREATE ile) |

Dogrulandi: dort script de `.env` yokken hicbir ag cagrisi yapmadan cikiyor.

**`TUGRA_CONFIRM` kullanicinin onayinin yerine gecmez.** Yalnizca kaza
eseri gonderimi engelleyen teknik bir kapidir; her adim icin ayrica onay
alinir.

### Demo tutari - KARARLASTIRILDI

Demo odeme tutari **0,01 MON**. CLAUDE.md'deki "250 MON" metni sabit bir
gereksinim degildi, ornekti.

Kural: **ekrandaki butun tutarlar gercek cagridan gelir.** Ekranda yazan
tutar, vekalette duran ve zincire giden tutarla birebir ayni olmali;
sabit metin olarak yazilmamali.

Saglayici ve saldirgan AYRI, operator kontrolundeki adreslerdir
(`PROVIDER_ADDRESS`, `ATTACKER_ADDRESS`). `script/preflight.sh` ikisinin
birbirinden ve sahip/ajandan farkli oldugunu kontrol eder.

## Asama 2 SONUC - Testnet kanit akisi TAMAMLANDI

Tarih: 2026-10-24. Ag: **Monad Testnet, chainId 10143**.
Alti islem gonderildi, hepsi dogrulandi.

| | |
| --- | --- |
| Kontrat | `0xC2C75CDbc79e42e8897491FCe3a193EDEB795212` |
| Vekalet ID | `1` |
| OWNER | `0x74F2e006a010535E22D3f95355EdD4fA4d1050f4` |
| AGENT | `0xCCeaAfE11dd6C0f0eb7F683396B79F69d6c0bd1C` |
| PROVIDER (guvenilir alici) | `0xb02e588c7e9Db3D646CbFA78652dFdA6B4437587` |
| ATTACKER ("Bilinmeyen adres") | `0x7ADDB0120984A62B594E6292B30791eE2940Bb52` |

Vekalet: AGENT yetkili, PROVIDER alici, 0,01 MON, expiry `1792837675`
(olusturma blogu + 3600 sn), tek kullanim.

### Alti islem - hash ve explorer

| # | Adim | tx |
| - | ---- | -- |
| 1 | deploy | [`0x4e95ad0d...08dc14`](https://testnet.monadscan.com/tx/0x4e95ad0d0189501b47fce2a5e0bf34fbd33830364054399202cec30ace08dc14) |
| 2 | deposit 0,05 MON | [`0x90bd79a0...8321dc`](https://testnet.monadscan.com/tx/0x90bd79a09130f0a93c7f90dca362a1f4fb5926c0a67f7710196c479de28321dc) |
| 3 | createMandate | [`0x5ff9c619...662af9`](https://testnet.monadscan.com/tx/0x5ff9c61959a9dcf3dbd68e7f3666cfd488a453de265848e39838f54ef8662af9) |
| 4 | yanlis alici (revert) | [`0x3d24e759...9be81e`](https://testnet.monadscan.com/tx/0x3d24e759e7952502f8e94c6058e0b01ba854e7aee0e3ee18952a5e52399be81e) |
| 5 | mesru odeme | [`0xaf660a86...41a1a5`](https://testnet.monadscan.com/tx/0xaf660a8691e6d38800d8e3be5083b27a9222f98d45675e2c5f45a74c7241a1a5) |
| 6 | tekrar odeme (revert) | [`0x8cbd9df1...f530f1`](https://testnet.monadscan.com/tx/0x8cbd9df13f1832e87371f64997aae2db18979b9cf6f01e5b01c81e31fef530f1) |

Tam hash'ler yukaridaki baglantilarin icinde.

### Gerceklesen maliyetler - makbuzlardan okundu

Butun degerler `cast tx` / `cast receipt` ile zincirden alindi. Tahmin ya da
ucret tavani DEGIL; `ucret = gasUsed x effectiveGasPrice`.

| # | Adim | Gonderen | gasLimit | gasUsed | effGasPrice | maxFeePerGas | Ucret (MON) | value | status |
| - | ---- | -------- | -------- | ------- | ----------- | ------------ | ----------- | ----- | ------ |
| 1 | deploy | OWNER | 898.713 | 898.713 | 102 gwei | 200 gwei | 0,091668726 | 0 | 1 |
| 2 | deposit | OWNER | 27.636 | 27.636 | 102 gwei | 200 gwei | 0,002818872 | 0,05 | 1 |
| 3 | mandate | OWNER | 120.381 | 120.381 | 102 gwei | 200 gwei | 0,012278862 | 0 | 1 |
| 4 | yanlis alici | AGENT | 60.000 | 60.000 | 102 gwei | 200 gwei | 0,006120000 | 0 | **0** |
| 5 | odeme | AGENT | 110.971 | 110.971 | 102 gwei | 200 gwei | 0,011319042 | 0 | 1 |
| 6 | tekrar | AGENT | 60.000 | 60.000 | 102 gwei | 200 gwei | 0,006120000 | 0 | **0** |

Her islemde **gasUsed = gasLimit**. Monad'in ucreti kullanilan gas'a degil
LIMITE gore kestigi zincirde dogrulandi. Ucret tavani (200 gwei) hicbir
islemde devreye girmedi; hepsi 102 gwei (base 100 + priority 2) odedi.

### Uzlastirma - sapma 0 wei

| Taraf | Makbuz toplami (ucret + value) | Bakiye farki | Sapma |
| ----- | ------------------------------ | ------------ | ----- |
| OWNER | 0,156766460 | 0,156766460 | **0 wei** |
| AGENT | 0,023559042 | 0,023559042 | **0 wei** |

**ONCEKI RAPORDA HATA VARDI, DUZELTILDI:** 6. islemin maliyeti 0,012 MON
diye yazilmisti; bu gerceklesen ucret degil, gas limiti x ucret TAVANI idi.
Gerceklesen 0,006120 MON. Bu hata AGENT toplamini da 0,029439 gosteriyordu;
dogrusu **0,023559042 MON**.

### Son bakiyeler

| Hesap | Bakiye (MON) | Harcanan | Sinir | Durum |
| ----- | ------------ | -------- | ----- | ----- |
| OWNER | 0,843233540 | 0,156766460 (0,05'i kasa fonu) | 0,27 | sinir altinda |
| AGENT | 0,976440958 | 0,023559042 | 0,045 | sinir altinda |
| PROVIDER | 0,010000000 | - | | tek odemeyi aldi |
| ATTACKER | 0,000000000 | - | | **hic odeme almadi** |
| KASA | 0,040000000 | - | | 4 odeme daha yeter |

### Ret nedeni kanitlari - trace ile

Monad testnet makbuzunda **`revertReason` alani YOK** (yerel anvil'de vardi).
`status = 0` tek basina hangi hatanin dondugunu gostermez. Bu yuzden revert
nedeni salt okunur `debug_traceTransaction` (callTracer) ile GERCEK islemden
okundu.

**Adim 4** - `error: execution reverted`, `output: 0xe28e12ad` =
**`PayeeMismatch()`**. Trace'teki calldata: `execute(1, 0x7ADDB...Bb52,
0x2386f26fc10000)` - alici ATTACKER, tutar 0,01 MON.

**Adim 6** - `error: execution reverted`, `output: 0x7b8c8210` =
**`AlreadyUsed()`**. Calldata: `execute(1, 0xb02e...7587, 0x2386f26fc10000)` -
alici PROVIDER, ayni vekalet.

### Davranis dogrulamalari

- Adim 4 sonrasi vekalet `used = false` kaldi, kasa 0,05 MON, PROVIDER ve
  ATTACKER 0 MON. **Basarisiz deneme vekaleti tuketmedi.**
- Adim 5: PROVIDER 0 -> **0,01 MON**, kasa 0,05 -> 0,04, vekalet
  `used = true`.
- Adim 6 sonrasi PROVIDER **hala 0,01 MON**. Ek odeme olmadi.
- ATTACKER akis boyunca **hicbir zaman MON almadi**.

### Dogrulama kapsami - AYRIMI ONEMLI

**(a) Zincirde dogrulanan:** yukaridaki alti islem, `script/proof-flow.sh`'in
o anki haliyle gonderildi. Deploy, deposit, mandate ve pay adimlari
scriptten uctan uca calisti.

**(b) Zincirde DOGRULANMAYAN:** adim 4 ve 6'da islemler dogru gonderildi ve
revert etti, ama scriptin cikti isleme kismi iki kusurla patladi:

1. `cast send` ciktisi `2>&1` ile aliniyordu; cast'in stderr'e bastigi dotenv
   uyarisi JSON'a karisip ayristirmayi bozdu ("Islem gonderilemedi" yanlis
   mesaji). Islem yine de zincire gitmisti.
2. `verify_revert` iki parametre bekliyordu, tek parametreyle cagriliyordu:
   `$2: unbound variable`.

Ikisi de duzeltildi ve **zincire islem gondermeden** dogrulandi:

- stdout/stderr ayrimi: dotenv uyarisi basan sahte bir komutla eski yontemin
  ayristirmayi bozdugu yeniden uretildi; yeni yontem hash'i dogru okudu,
  uyari ayri dosyaya dustu.
- `verify_revert` fonksiyonu scriptten cikarilip bes senaryoyla kosuldu:
  adim 4'un GERCEK trace ciktisi (gecti), adim 6'nin gercek ciktisi (gecti),
  yanlis selector (DUR), bilinmeyen selector (DUR), trace alinamadi (DUR).

**Duzeltilmis script henuz zincirde kosulmadi.** Bir sonraki provada
dogrulanacak.

### Acik belirsizlikler

- `cast logs` ile `MandatePaid` olayini cekmeye calistim, bos dondu
  (muhtemelen blok araligi/RPC log limiti). Odeme kanitini bakiye degisimi ve
  `getMandate` durumundan aldim; **olay logu dogrulanmadi.**
- Testnet'in guncel hardfork'u hala **DOGRULANMADI**; deploy ve cagrilar
  sorunsuz calisti ama hardfork adi ayrica sorgulanmadi.
- Kaynak dogrulama (`POST /v1/verify`) **henuz gonderilmedi**.

## Anthropic model erisimi - DOGRULANDI

Tarih: 2026-10-24.

### Model kimligi dogrulamasi

Briften gelen `claude-haiku-5-5` kimligi **GECERLI**.

Kaynak: https://platform.claude.com/docs/en/models/haiku-5-5/overview

| Alan | Deger |
| ---- | ----- |
| Model ID (Claude API) | `claude-haiku-5-5` |
| Durum | Active (latest) |
| Cikis | 7 Ekim 2026 |
| Emeklilik | 7 Ekim 2027'den once degil |
| Baglam | 1M token |
| Maks. cikti | 128K token |
| Girdi fiyati | $0,10/MTok (<=100K prompt), $0,50/MTok (>100K) |
| Cikti fiyati | $0,50/MTok (<=100K prompt), $2,50/MTok (>100K) |
| Thinking | Adaptive, varsayilan acik |
| Varsayilan effort | `medium` |
| Bilgi kesimi | Haziran 2026 |

**Ara adimda yapilan hata:** Yerel model tablosu 2026-06-24 onbellegindendi ve
7 Ekim cikisli bu modeli icermiyordu; kimlik "gecersiz" diye raporlanip
Haiku 4.5 alternatifi onerilmisti. Resmi sayfa kontrol edilince duzeltildi.
Model bilgisi bundan sonra onbellekten degil resmi model sayfalarindan
alinacak. (Ayni onbellek Fable 5.1 / Opus 5.5 / Sonnet 5.5'i de bilmiyordu.)

### Tek minimal erisim testi

Tek bir `POST /v1/messages` istegi gonderildi. Odeme araci, zincir
baglantisi, otomatik tekrar YOK. `temperature`, `top_p`, `top_k`
gonderilmedi (resmi sayfa bunlarin atlanmasini soyluyor).

Istek: `model=claude-haiku-5-5`, `max_tokens=32`,
tek kullanici mesaji ("Reply with exactly: OK").

| Alan | Sonuc |
| ---- | ----- |
| HTTP | **200** |
| id | `msg_011CgLs6YL2yMtVxSMwuizKo` |
| model (yanitta) | `claude-haiku-5-5` |
| stop_reason | `end_turn` |
| input_tokens | 18 |
| output_tokens | 4 (thinking_tokens 0) |
| cache read / write | 0 / 0 |
| service_tier | standard |
| inference_geo | global |
| speed | standard |
| Yanit metni | `OK` |

**Sonuc: erisim calisiyor.** Model kimligi dogru, anahtar gecerli, yanit
beklendigi gibi dondu. `max_tokens=32` yeterli oldu; adaptive thinking acik
olmasina ragmen bu istekte thinking token harcanmadi.

### Asama 3 icin not

- Isteklerde `temperature`, `top_p`, `top_k` **gonderilmeyecek**.
- Adaptive thinking varsayilan acik; derinlik `output_config.effort` ile
  ayarlanir (varsayilan `medium`). Demo'da model suresi ayri olculdugu icin
  `low` effort degerlendirilecek - **henuz karar verilmedi.**
- Minimum onbelleklenebilir prompt 512 token; bizim promptlarimiz muhtemelen
  bunun altinda kalacagi icin prompt caching devreye girmeyecek.

Anahtar yalnizca kimlik dogrulamada kullanildi; deger, `.env` icerigi ve
yetkilendirme basliklari hicbir ciktiya veya loga yazilmadi.

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

- Kaynak dogrulama (`POST /v1/verify`) gonderilmedi.
- Duzeltilmis `proof-flow.sh` (stdout/stderr ayrimi + `verify_revert`)
  zincirde kosulmadi; yalnizca kayitli/sahte veriyle dogrulandi.
- `MandatePaid` olay logu `cast logs` ile cekilemedi (RPC log araligi).
- Testnet hardfork'u **DOGRULANMADI**.
- Barindirma hesabi (Render) acilmadi, servis deploy edilmedi.
- Kasada 0,04 MON var; yalnizca 4 odeme daha yeter. Daha fazla prova icin
  ek deposit gerekir (ayri onay).

## Kullanicidan beklenen en kucuk hazirlik

Hicbir adim ozel anahtari terminale, sohbete veya log'a dusurmez.

**1.** `./script/make-wallets.sh`
   Dort cuzdani uretir ve dogrudan `.env`'e yazar. Ekrana YALNIZCA adresler
   basilir. Var olan dolu alanlarin uzerine yazmaz.

**2.** `.env` icine RPC'yi yaz:
   `MONAD_RPC_URL=https://testnet-rpc.monad.xyz`

**3.** Fon al - **salona varmadan, ayri bir agdan.**
   https://faucet.monad.xyz. Istek basina 1 MON, adres basina 10/gun.
   Yalnizca SAHIP ve AJAN adreslerine; ikiser istek onerilir.
   Saglayici ve saldirgan adreslerine fon GEREKMEZ.

**4.** Doluluk kontrolu (deger yazdirmadan):

```
for v in MONAD_RPC_URL OWNER_PRIVATE_KEY AGENT_PRIVATE_KEY PROVIDER_ADDRESS ATTACKER_ADDRESS; do
  grep -q "^$v=." .env && echo "$v dolu" || echo "$v BOS"
done
```

**5.** `./script/preflight.sh`
   Salt okunur. ChainId 10143 mi, base fee ne, bakiyeler yeterli mi,
   faucet durumu ne - hepsini gosterir. Islem gondermez.

## Siradaki adim

Asama 3 - ajan servisi. Zincir tarafi ve model erisimi kanitlandi.

Beklemede: `verify.sh send` ile kaynak dogrulama, public GitHub repo,
Render hesabi + bos Node servisinin bir kez deploy edilmesi.
