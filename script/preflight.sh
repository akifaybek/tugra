#!/usr/bin/env bash
# Salt okunur hazirlik kontrolu. HICBIR islem gondermez, yalnizca RPC okur.
# Calistirmadan once .env doldurulmus olmali.

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

require_var MONAD_RPC_URL
require_var OWNER_PRIVATE_KEY
require_var AGENT_PRIVATE_KEY
require_var PROVIDER_ADDRESS
require_var ATTACKER_ADDRESS

OWNER_ADDRESS=$(cast wallet address --private-key "$OWNER_PRIVATE_KEY")
AGENT_ADDRESS=$(cast wallet address --private-key "$AGENT_PRIVATE_KEY")

echo "Sahip adresi    : $OWNER_ADDRESS"
echo "Ajan adresi     : $AGENT_ADDRESS"
echo "Saglayici (alici): $PROVIDER_ADDRESS"
echo "Saldirgan adresi : $ATTACKER_ADDRESS"
echo

if [[ "$OWNER_ADDRESS" == "$AGENT_ADDRESS" ]]; then
  echo "HATA: sahip ve ajan ayni adres. Iki AYRI cuzdan gerekli." >&2
  exit 1
fi
if [[ "$PROVIDER_ADDRESS" == "$ATTACKER_ADDRESS" ]]; then
  echo "HATA: saglayici ve saldirgan ayni adres olamaz." >&2
  exit 1
fi

CHAIN_ID=$(cast chain-id --rpc-url "$MONAD_RPC_URL")
echo "Zincir kimligi  : $CHAIN_ID (beklenen $MONAD_CHAIN_ID)"
if [[ "$CHAIN_ID" != "$MONAD_CHAIN_ID" ]]; then
  echo "HATA: yanlis ag." >&2
  exit 1
fi

BLOCK=$(cast block-number --rpc-url "$MONAD_RPC_URL")
BASEFEE=$(cast base-fee --rpc-url "$MONAD_RPC_URL")
echo "Blok            : $BLOCK"
echo "Base fee (wei)  : $BASEFEE"

OWNER_BAL=$(cast balance "$OWNER_ADDRESS" --rpc-url "$MONAD_RPC_URL")
AGENT_BAL=$(cast balance "$AGENT_ADDRESS" --rpc-url "$MONAD_RPC_URL")
echo "Sahip bakiyesi  : $(cast from-wei "$OWNER_BAL") MON"
echo "Ajan bakiyesi   : $(cast from-wei "$AGENT_BAL") MON"
echo

# Akisin gas LIMITI toplami. Rakamlar yerel Monad ortaminda (anvil --network
# monad) olculen gasUsed degerlerinden turetildi; basarili adimlar icin
# olculen degerin x1,2'si, revert adimlari icin sabit GAS_REVERT.
#   deploy 741.873 -> ~890.248   deposit 22.694 -> ~27.233
#   createMandate 99.329 -> ~119.195   execute 66.831 (estimate) -> ~80.197
#   iki revert adimi -> 2 x GAS_REVERT
TOTAL_GAS=$((890248 + 27233 + 119195 + 80197 + 2 * GAS_REVERT))
REHEARSAL_GAS=$((119195 + 80197 + 2 * GAS_REVERT))

echo "Ilk kanit akisi gas limiti toplami : $TOTAL_GAS"
echo "  mevcut base fee ile ucret        : $(cast from-wei "$((TOTAL_GAS * BASEFEE))") MON"
echo "Her ek prova (adim 3-6)            : $REHEARSAL_GAS"
echo "  mevcut base fee ile ucret        : $(cast from-wei "$((REHEARSAL_GAS * BASEFEE))") MON"
echo "  (Monad gas LIMITINE gore keser; oncelik ucreti bu hesaba dahil degil.)"
echo

echo "--- Organizator faucet durumu (salt okunur) ---"
curl -sS -m 15 https://agents.devnads.com/v1/faucet/status/10143 \
  | python3 -c "
import sys,json
d=json.load(sys.stdin)
w=lambda x:int(x)/1e18
print('ag           :', d['name'], '(chainId', str(d['chainId'])+')')
print('acik mi      :', d['enabled'])
print('istek basina :', w(d['amountPerRequest']), 'MON')
print('limitler     :', d['rateLimits'])
print('faucet bakiye:', round(w(d['balance']),2), 'MON')
" || echo "(faucet durumu okunamadi)"
echo
echo "Hazirlik kontrolu bitti. Hicbir islem gonderilmedi."
