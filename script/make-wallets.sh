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
  cast wallet new --json | N="$N" python3 -c '
import json, os, pathlib, sys
n = os.environ["N"]
w = json.load(sys.stdin)[0]
p = pathlib.Path(".env")
lines = p.read_text().splitlines()
vals = {f"{n}_PRIVATE_KEY": w["private_key"], f"{n}_ADDRESS": w["address"]}
for var, val in vals.items():
    for i, l in enumerate(lines):
        if l.startswith(f"{var}="):
            lines[i] = f"{var}={val}"
            break
    else:
        lines.append(f"{var}={val}")
p.write_text("\n".join(lines) + "\n")
print(f"{n} adresi: {w[\"address\"]}")   # yalnizca ADRES yazdirilir
'
done

echo
echo "Yazildi. Ozel anahtarlar yalnizca .env icinde."
echo "Siradaki: .env icine MONAD_RPC_URL=https://testnet-rpc.monad.xyz"
echo "Sonra SAHIP ve AJAN adreslerine faucet'ten fon alin."
