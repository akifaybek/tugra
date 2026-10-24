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

# Butun akisin gas limiti toplami uzerinden en kotu durum maliyeti.
TOTAL_GAS=$((GAS_DEPLOY + GAS_DEPOSIT + GAS_CREATE + GAS_PAY + 2 * GAS_REVERT))
WORST_WEI=$((TOTAL_GAS * BASEFEE))
echo "Akis gas limiti toplami : $TOTAL_GAS"
echo "Mevcut base fee ile ucret: $(cast from-wei "$WORST_WEI") MON"
echo "  (Monad gas LIMITINE gore keser; oncelik ucreti bu hesaba dahil degil.)"
echo
echo "Hazirlik kontrolu bitti. Hicbir islem gonderilmedi."
