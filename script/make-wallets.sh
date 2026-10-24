#!/usr/bin/env bash
# Dort cuzdani uretir ve DOGRUDAN .env'e yazar.
#
# Ozel anahtarlar terminale, sohbete veya log'a DUSMEZ; yalnizca adresler
# yazdirilir. .env zaten .gitignore'da.
#
# Kullanim: ./script/make-wallets.sh
# Var olan dolu alanlarin uzerine yazmaz.

set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[[ -f .env ]] || { cp .env.example .env; echo ".env olusturuldu (.env.example'dan)."; }

for N in OWNER AGENT PROVIDER ATTACKER; do
  if grep -q "^${N}_ADDRESS=." .env 2>/dev/null; then
    echo "$N zaten dolu, atlandi: $(grep "^${N}_ADDRESS=" .env | cut -d= -f2)"
    continue
  fi
  cast wallet new --json | N="$N" ENV_FILE="${ENV_FILE:-.env}" python3 -c '
# NOT: Bu blok shell icinde TEK TIRNAK ile sarili. Icinde tek tirnak
# kullanilamaz ve ters bolu ile kacis YAPILMAZ: ters bolu + tirnak yazilirsa
# Python kaynagina oldugu gibi gecer ve sozdizimi hatasi verir.
#
# Beklenen cikti (Foundry 1.8.0 ile DOGRULANDI):
#   {"schema_version":1,"success":true,
#    "data":[{"address":"0x..","public_key":"0x..","private_key":"0x.."}],
#    "errors":[],"warnings":[]}
# Zarf kurulu binary ile uretilip dogrulandi (ornegin: cast sig ... --json).
# data icerigi foundry-rs/foundry v1.8.0 kaynagindan dogrulandi:
#   crates/cast/src/cmd/wallet/mod.rs -> json!({address, public_key, private_key})
# Zarfsiz (eski) bicim de kabul edilir.
#
# Dosyaya YALNIZCA tum alanlar dogrulandiktan sonra yazilir.
import json, os, pathlib, sys

n = os.environ["N"]

def bail(msg):
    # Yalnizca tanilama; ozel anahtar asla yazdirilmaz.
    sys.exit(n + ": " + msg)

text = sys.stdin.read()
if not text.strip():
    bail("cast wallet new hic cikti vermedi (stderr i kontrol edin)")
try:
    raw = json.loads(text)
except ValueError:
    bail("cast wallet new ciktisi JSON degil")

# --- zarfi soy ---
if isinstance(raw, dict) and "schema_version" in raw:
    if raw.get("success") is not True:
        errs = raw.get("errors") or ["(ayrinti yok)"]
        bail("cast basarisiz dondu: " + "; ".join(str(e) for e in errs))
    payload = raw.get("data")
else:
    payload = raw

if isinstance(payload, list):
    if not payload:
        bail("cast ciktisindaki data listesi bos")
    w = payload[0]
else:
    w = payload
if not isinstance(w, dict):
    bail("cast ciktisindaki data beklenen nesne degil")

def pick(d, names):
    for k in names:
        v = d.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    bail("eksik alan; gelen alanlar: " + ",".join(sorted(d)))

address = pick(w, ["address", "Address"])
secret = pick(w, ["private_key", "privateKey", "secret_key"])

# --- dogrulama bittikten SONRA yaz ---
p = pathlib.Path(os.environ["ENV_FILE"])
lines = p.read_text().splitlines()
for var, val in ((n + "_PRIVATE_KEY", secret), (n + "_ADDRESS", address)):
    prefix = var + "="
    for i, l in enumerate(lines):
        if l.startswith(prefix):
            lines[i] = prefix + val
            break
    else:
        lines.append(prefix + val)
p.write_text("\n".join(lines) + "\n")

# YALNIZCA adres yazdirilir; secret hicbir zaman cikti olmaz.
print(n + " adresi: " + address)
'
done

echo
echo "Yazildi. Ozel anahtarlar yalnizca .env icinde."
echo "Siradaki: .env icine MONAD_RPC_URL=https://testnet-rpc.monad.xyz"
echo "Sonra SAHIP ve AJAN adreslerine faucet'ten fon alin."
