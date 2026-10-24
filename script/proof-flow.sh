#!/usr/bin/env bash
# Tugra - testnet kanit akisi. ALTI islem, her biri AYRI adim.
#
# Kullanim:  ./script/proof-flow.sh <adim>
# Gondermek icin:  TUGRA_CONFIRM=1 ./script/proof-flow.sh <adim>
# Onay olmadan hicbir islem gonderilmez.
#
# Adimlar:
#   1  deploy          (sahip)  TugraVault deploy edilir
#   2  deposit         (sahip)  kasaya native MON yatirilir
#   3  mandate         (sahip)  tek kullanimlik vekalet olusturulur
#   4  wrong-payee     (ajan)   yanlis alici -> PayeeMismatch ile REVERT
#   5  pay             (ajan)   mesru odeme -> BASARILI
#   6  repeat          (ajan)   ayni vekalet -> AlreadyUsed ile REVERT
#
# REVERT BEKLENEN ADIMLAR (4 ve 6):
#   estimateGas revert'te hata verir ve islemi ag oncesi engeller. Bu yuzden
#   bu adimlar `cast mktx` ile OFFLINE imzalanir (sabit --gas-limit verildigi
#   icin tahmin yapilmaz), sonra `cast publish --async` ile yayinlanir.
#   Boylece islem gercekten zincire gider ve orada revert eder.

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

STEP="${1:-}"
[[ -z "$STEP" ]] && { sed -n '2,25p' "$0"; exit 1; }

require_var MONAD_RPC_URL
require_var OWNER_PRIVATE_KEY
require_var AGENT_PRIVATE_KEY
require_var PROVIDER_ADDRESS
require_var ATTACKER_ADDRESS

RPC=(--rpc-url "$MONAD_RPC_URL")
OWNER=(--private-key "$OWNER_PRIVATE_KEY")
AGENT=(--private-key "$AGENT_PRIVATE_KEY")

EXEC_SIG="execute(uint256,address,uint256)"

# Revert bekleyen islemi tahmin yapmadan gonderir.
send_expecting_revert() {
  local who_key="$1"; shift
  local raw hash status
  raw=$(cast mktx "$@" --gas-limit "$GAS_REVERT" --private-key "$who_key" "${RPC[@]}")
  hash=$(cast publish --async "$raw" "${RPC[@]}")
  show_tx "$hash"
  echo "Makbuz bekleniyor..."
  cast receipt "$hash" "${RPC[@]}" >/dev/null
  status=$(cast receipt "$hash" status "${RPC[@]}")
  echo "status: $status  (0 = zincirde revert etti = BEKLENEN)"
  if [[ "$status" == "1" ]]; then
    echo "UYARI: islem BASARILI oldu, oysa revert bekleniyordu." >&2
    exit 1
  fi
}

case "$STEP" in

  1|deploy)
    confirm_gate "TugraVault deploy (sahip, gas limiti $GAS_DEPLOY)"
    forge create src/TugraVault.sol:TugraVault \
      "${RPC[@]}" "${OWNER[@]}" --broadcast --gas-limit "$GAS_DEPLOY"
    echo
    echo "Ciktidaki 'Deployed to' adresini .env icine VAULT_ADDRESS olarak yazin."
    ;;

  2|deposit)
    require_var VAULT_ADDRESS
    confirm_gate "Kasaya $VAULT_FUNDING yatir (sahip, gas limiti $GAS_DEPOSIT)"
    hash=$(cast send "$VAULT_ADDRESS" "deposit()" \
      --value "$VAULT_FUNDING" --gas-limit "$GAS_DEPOSIT" \
      "${RPC[@]}" "${OWNER[@]}" --json | grep -o '"transactionHash":"[^"]*"' | cut -d'"' -f4)
    show_tx "$hash"
    echo "Kasa bakiyesi: $(cast from-wei "$(cast balance "$VAULT_ADDRESS" "${RPC[@]}")") MON"
    ;;

  3|mandate)
    require_var VAULT_ADDRESS
    NOW=$(cast block latest timestamp "${RPC[@]}")
    EXPIRY=$((NOW + MANDATE_TTL_SECONDS))
    confirm_gate "Vekalet olustur: ajan -> $PROVIDER_ADDRESS, $MANDATE_AMOUNT_ETHER MON, son $EXPIRY"
    AGENT_ADDRESS=$(cast wallet address --private-key "$AGENT_PRIVATE_KEY")
    hash=$(cast send "$VAULT_ADDRESS" \
      "createMandate(address,address,uint256,uint64)" \
      "$AGENT_ADDRESS" "$PROVIDER_ADDRESS" "$MANDATE_AMOUNT_WEI" "$EXPIRY" \
      --gas-limit "$GAS_CREATE" "${RPC[@]}" "${OWNER[@]}" --json \
      | grep -o '"transactionHash":"[^"]*"' | cut -d'"' -f4)
    show_tx "$hash"
    echo "Vekalet sayisi: $(cast call "$VAULT_ADDRESS" "mandateCount()(uint256)" "${RPC[@]}")"
    echo "Bu kimligi .env icine MANDATE_ID olarak yazin."
    ;;

  4|wrong-payee)
    require_var VAULT_ADDRESS; require_var MANDATE_ID
    confirm_gate "YANLIS ALICI denemesi (ajan) -> PayeeMismatch beklenir, gas limiti $GAS_REVERT"
    send_expecting_revert "$AGENT_PRIVATE_KEY" \
      "$VAULT_ADDRESS" "$EXEC_SIG" "$MANDATE_ID" "$ATTACKER_ADDRESS" "$MANDATE_AMOUNT_WEI"
    echo "Vekalet tukenmedi mi? used = $(cast call "$VAULT_ADDRESS" \
      "getMandate(uint256)((address,uint64,bool,bool,address,uint256))" "$MANDATE_ID" "${RPC[@]}")"
    ;;

  5|pay)
    require_var VAULT_ADDRESS; require_var MANDATE_ID
    confirm_gate "MESRU odeme (ajan) -> basarili beklenir, gas limiti $GAS_PAY"
    hash=$(cast send "$VAULT_ADDRESS" "$EXEC_SIG" \
      "$MANDATE_ID" "$PROVIDER_ADDRESS" "$MANDATE_AMOUNT_WEI" \
      --gas-limit "$GAS_PAY" "${RPC[@]}" "${AGENT[@]}" --json \
      | grep -o '"transactionHash":"[^"]*"' | cut -d'"' -f4)
    show_tx "$hash"
    echo "Kasa bakiyesi : $(cast from-wei "$(cast balance "$VAULT_ADDRESS" "${RPC[@]}")") MON"
    echo "Saglayici     : $(cast from-wei "$(cast balance "$PROVIDER_ADDRESS" "${RPC[@]}")") MON"
    ;;

  6|repeat)
    require_var VAULT_ADDRESS; require_var MANDATE_ID
    confirm_gate "TEKRAR odeme (ajan) -> AlreadyUsed beklenir, gas limiti $GAS_REVERT"
    send_expecting_revert "$AGENT_PRIVATE_KEY" \
      "$VAULT_ADDRESS" "$EXEC_SIG" "$MANDATE_ID" "$PROVIDER_ADDRESS" "$MANDATE_AMOUNT_WEI"
    ;;

  *)
    echo "Bilinmeyen adim: $STEP" >&2
    exit 1
    ;;
esac
