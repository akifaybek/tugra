# Tuğra

**Ajanına cüzdanını değil, tuğranı ver.**

Canlı demo: **https://tugra.onrender.com/?mandateId=3**
Kontrat: `0xC2C75CDbc79e42e8897491FCe3a193EDEB795212` · Monad Testnet, chainId **10143**

> Tuğrasız belge geçmez; tuğra sadece belgede yazanı onaylar.

---

## Problem

Bir AI ajanına ödeme yaptırmak istediğinde pratikte tek seçenek sunuluyor:
ajana bir cüzdan vermek. O andan sonra ajanın neyi, kime, ne kadar
ödeyeceğini belirleyen tek şey modelin o anki kararı oluyor. Ajanın
okuduğu içerik — bir sağlayıcı açıklaması, bir web sayfası, bir not —
güvenilmez olduğu hâlde ödemenin hedefini değiştirebilecek konumda
kalıyor.

Tuğra bunu tersine çeviriyor: para ajanın cüzdanında değil, bir kasada
duruyor. Ajanın elindeki tek yetki, kullanıcının önceden onayladığı tek
bir satın alma için verilmiş bir **vekâlet**. Ajanın anahtarında yalnızca
işlem gas'ı var.

## Vekâletin sınırları

Vekâlet dört şeyi aynı anda sabitler. Dördü de kullanıcının onayladığı
değerlerdir ve ajanın okuduğu içerikten türetilmez:

| Sınır | Anlamı |
| --- | --- |
| **Sabit alıcı** | Ödeme yalnızca vekâlette yazan adrese gider. Başka adrese `PayeeMismatch` ile reddedilir. |
| **Tam tutar** | Tutar birebir eşleşmek zorunda. Eksik, fazla ve sıfır ödeme `AmountMismatch` ile reddedilir. |
| **Süre** | `block.timestamp <= expiry` ise geçerli. Sonrası `Expired`. |
| **Tek kullanım** | Başarılı ödemeden sonra vekâlet tükenir. İkinci deneme `AlreadyUsed` ile reddedilir. |

Buna ek olarak: sahip vekâleti iptal edebilir (`Revoked`), yetkisiz çağıran
reddedilir (`NotAgent`), başarısız deneme vekâleti **tüketmez**, ve
reentrancy koruması vardır.

Ajanın kasadan para çıkarabileceği tek yol `execute(mandateId, payee, amount)`.
Approval, keyfi çağrı, upgrade veya başka bir çıkış yolu yok.

## Monad'ın rolü

Yetkiyi uygulayan şey prompt değil, kontrat. Vekâletin kapsamı Monad
testnet'inde `TugraVault` tarafından kontrol ediliyor; yetki dışı bir
çağrı zincirde revert ediyor ve bunun kanıtı makbuz ile trace'te duruyor.

Monad'ın iki somut etkisi oldu:

- **Ücret gas limitine göre kesiliyor**, kullanılan gas'a göre değil
  (`gas_paid = gas_limit × price_per_gas`). Bu yüzden gas limitleri
  ölçülerek belirlendi, tahminle şişirilmedi.
- **Revert edecek işlemde `estimateGas` hata veriyor.** Demo'nun kanıtı
  tam olarak o revert olduğu için, yalnızca revert verisi ABI ile
  çözülüp beklenen kontrat hatası doğrulandığında sabit limitle gönderim
  yapılıyor. Timeout, bağlantı hatası, rate limit veya yetersiz bakiye
  durumunda **işlem gönderilmiyor**, belirsizlik olarak raporlanıyor.

## Son provanın kanıtları

Üç işlem de **public sunucu** (`tugra.onrender.com`) üzerinden, Vekâlet
**#3** ile yapıldı. Hepsi gerçek Monad testnet işlemi:

| # | Ne | Kaynak | Sonuç | Explorer |
| - | -- | ------ | ----- | -------- |
| 1 | Yanlış alıcıya ödeme | **Kontrollü test** — model kararı değil | `status 0`, trace `0xe28e12ad` = **`PayeeMismatch`** | [`0x55bd932b…593676`](https://testnet.monadscan.com/tx/0x55bd932bd66bc7d9cb2f0a11a93b260e6dead118c99d59ede034596f73593676) |
| 2 | Meşru ödeme | **Gerçek model çağrısı** (`claude-haiku-5-5`) | `status 1`, alıcı +0,01 MON, vekâlet tükendi, veri açıldı | [`0xec3032dd…5bfbfc`](https://testnet.monadscan.com/tx/0xec3032dd36dab4f0895389791f8164d76e972b3de6a4040fa2f396d1105bfbfc) |
| 3 | Aynı vekâletle tekrar | **Kontrollü test** — model kararı değil | `status 0`, trace `0x7b8c8210` = **`AlreadyUsed`** | [`0x8eaf93b4…1afb60`](https://testnet.monadscan.com/tx/0x8eaf93b4e2a8e34a2e99b03418e991081e40edeb9a7ddfe44e6c1392421afb60) |

Vekâlet #3'ü oluşturan işlem (sahip anahtarıyla, yerelde):
[`0x30ce0599…ee4209`](https://testnet.monadscan.com/tx/0x30ce0599dd7b1efb57055ebea450b13bbb64b93865328efc15653e80b6ee4209)

**Ayrım önemli.** 1 ve 3 numaralı işlemler operatörün açıkça tetiklediği
**kontrollü testlerdir**; model çağrılmaz, çağrı elle üretilir ve ekranda
ayrı etiketlenir. 2 numaralı işlem **gerçek bir model çağrısının** sonucudur
— model `pay` aracını vekâletteki doğru alıcıyla çağırdı.

Saldırgan adresi akış boyunca **hiç MON almadı**. Ölçülen süreler: model
1.378 ms, zincir 120 ms (ayrı ölçülür).

### Ne iddia etmiyoruz

Prompt injection'ı çözdüğümüzü, mekanizmanın benzersiz olduğunu veya
yalnızca Monad'da mümkün olduğunu söylemiyoruz. Modelin her davranışının
güvenli olduğunu da söylemiyoruz — güvence yalnızca kasa varlıkları ve
verilen vekâletin kapsamıyla sınırlı. Kontratın vekâlet içindeki her
hatayı veya yanlış kullanıcı niyetini anlayabildiğini de iddia etmiyoruz.

## Demo kapsamı ve sınırlar

- **Sağlayıcı kurgusal**, gerçek marka yok. Açılan örnek veri uydurmadır.
- **Ödeme Monad testnet'te native test MON** ile yapılır. Gerçek para yok.
- **Telefon not kuyruğu uygulanmadı.** Güvensiz not şu an operatör
  tarafından ekrandan girilir ve kaynağı "operatör notu" olarak belirtilir.
- **Kalıcı veri yok.** Deneme geçmişi, sayaçlar, gönderim kuyruğu, gas
  bütçesi, operatör oturumu ve açılmış veri erişimi **bellekte** tutulur;
  sunucu yeniden başladığında (deploy, uykudan uyanma) hepsi sıfırlanır.
  Kalıcı olan tek şey zincirdeki durumdur. Ödeme zincirde durur ama ekran
  yeniden kilitlenir.
- **Demo işlemleri operatör girişi gerektirir.** Model çağrısı veya zincir
  işlemi başlatan bütün yollar sunucuda oturum ister; oturumsuz istek
  model ve zincire hiç dokunmadan `401` döner. Belirteç tarayıcıda
  saklanmaz, oturum yalnızca bellekte tutulur ve sayfa yenilenince kaybolur.
  `/api/state` ve `/api/data` okuma uçları açıktır.

## Mimari

```
TugraVault (Solidity)      Monad testnet, native MON
        │
        ├── sahip: deposit / withdraw / createMandate / revoke
        └── ajan : execute(mandateId, payee, amount)   ← tek çıkış yolu

Tek Node.js süreci (Express)
        ├── güven sınırı: vekâlet zincirden doğrulanmadan güvensiz not
        │   modele verilmez; alıcı/tutar/süre yalnızca zincirden gelir
        ├── model: claude-haiku-5-5, tek araç pay(mandateId, payee, amount)
        ├── seri gönderim kuyruğu (ajan hesabı için nonce çakışması önlenir)
        └── düz HTML/JS ekran (derleme adımı yok)
```

Model farklı bir alıcı veya tutar isterse bu **sessizce düzeltilmez** ve
engellenmez: çağrı olduğu gibi kontrata gider, reddi kontrat verir.
Ödeme ancak makbuz `status: success` ile doğrulandıktan sonra başarılı
sayılır ve örnek veri açılır.

## Yerel kurulum

Gerekenler: Node 22, Foundry 1.8+ (Monad yürütme desteği için).

```bash
npm ci
cp .env.example .env     # değerleri siz doldurun
./script/make-wallets.sh # cüzdanları üretir, özel anahtarı ekrana basmaz
npm start                # PORT üzerinden 0.0.0.0 dinler
```

Testler:

```bash
npm test          # sunucu: 57 test
forge test        # kontrat: 52 test
```

Salt okunur hazırlık kontrolü (işlem göndermez):

```bash
./script/preflight.sh
```

Zincir işlemleri `script/proof-flow.sh` ile adım adım yapılır; her adım
ayrı onay ister. Sunucu sahip anahtarını **okumaz**, bu yüzden kendi
başına vekâlet oluşturamaz veya kasaya fon yatıramaz.

## Ortam değişkenleri

Yalnızca adlar. Değerler depoya girmez; `.env` `.gitignore` içindedir.

**Zorunlu**

| Ad | Gizli |
| -- | ----- |
| `MONAD_RPC_URL` | hayır |
| `VAULT_ADDRESS` | hayır |
| `AGENT_PRIVATE_KEY` | **evet** |
| `ANTHROPIC_API_KEY` | **evet** |

**Demo için gerekli**

| Ad | Gizli | Eksikse |
| -- | ----- | ------- |
| `OPERATOR_TOKEN` | **evet** | model ve zincir yolları `503` |
| `ATTACKER_ADDRESS` | hayır | kontrollü test kullanılamaz |
| `PROVIDER_ADDRESS` | hayır | alıcı adı görünmez |
| `MANDATE_ID` | hayır | ekran `?mandateId=…` bekler |

**İsteğe bağlı:** `PORT`, `GAS_REVERT`, `FEE_CAP_WEI`, `PRIORITY_FEE_WEI`,
`MAX_CHAIN_ATTEMPTS`, `MAX_TOTAL_GAS`.

`OWNER_PRIVATE_KEY` yalnızca yerel scriptler içindir ve **üretim sunucusuna
konmaz**; sunucu kodu bu değişkeni okumaz.

## Depo düzeni

```
src/TugraVault.sol      kontrat
test/                   Foundry testleri (52)
script/                 deploy ve kanıt akışı scriptleri
server/                 tek Node süreci + düz HTML/JS ekran
server/test/            sunucu testleri (57)
STATUS.md               ayrıntılı çalışma kaydı, ölçümler ve belirsizlikler
```

Ölçümler, doğrulanmamış noktalar ve kalan işler `STATUS.md` içinde.

## Lisans

MIT
