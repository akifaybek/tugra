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
# kullanilamaz ve ters bolu ile kacis YAPILMAZ: \" seklinde yazilan sey
# Python kaynagina oldugu gibi gecer ve f-string icinde sozdizimi hatasi
# verir. Bu yuzden degerler once degiskene alinir, f-string icinde
# tirnakli anahtar erisimi yapilmaz.
import json, os, pathlib, sys

n = os.environ["N"]
raw = json.load(sys.stdin)
w = raw[0] if isinstance(raw, list) else raw

# cast surumleri anahtar adlarini farkli yazabiliyor; ikisini de kabul et.
def pick(d, names):
    for k in names:
        if k in d:
            return d[k]
    sys.exit("beklenmeyen cast wallet new ciktisi: " + ",".join(sorted(d)))

address = pick(w, ["address", "Address"])
secret = pick(w, ["private_key", "privateKey", "secret_key"])

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
