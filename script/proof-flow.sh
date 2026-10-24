#!/usr/bin/env bash
# Tugra - testnet kanit akisi. ALTI islem, her biri AYRI adim.
#
# Kullanim:        ./script/proof-flow.sh <adim>
# Gondermek icin:  TUGRA_CONFIRM=1 ./script/proof-flow.sh <adim>
#
# TUGRA_CONFIRM yalnizca kaza eseri gonderimi engelleyen teknik bir kapidir;
# kullanicinin onayinin YERINE GECMEZ. Her adim icin ayrica sozlu onay alinir.
#
# Adimlar:
#   1 deploy       (sahip)  TugraVault deploy edilir
#   2 deposit      (sahip)  kasaya native MON yatirilir
#   3 mandate      (sahip)  tek kullanimlik vekalet olusturulur
#   4 wrong-payee  (ajan)   yanlis alici -> PayeeMismatch ile REVERT
#   5 pay          (ajan)   mesru odeme -> BASARILI
#   6 repeat       (ajan)   ayni vekalet -> AlreadyUsed ile REVERT
#
# GAS POLITIKASI (bkz. config.sh):
#   Basarili adimlar (1,2,3,5) -> estimateGas x 1,2
#   Revert bekleyen adimlar (4,6) -> olculmus sabit limit $GAS_REVERT
#
# Adim 4 ve 6 neden sabit limit kullanir: `cast send` gas limiti verilmezse
# once eth_estimateGas cagirir; bu revert'te hata dondurur ve islem HIC
# gonderilmez. Yerel Monad ortaminda dogrulandi:
#   "Error: Failed to estimate gas: ... execution reverted: PayeeMismatch"
# --gas-limit verildiginde tahmin atlanir, islem zincire gider ve orada
# revert eder (status 0). Yerel dogrulamada revertReason dogru okundu:
#   0xe28e12ad = PayeeMismatch, 0x7b8c8210 = AlreadyUsed

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

STEP="${1:-}"
[[ -z "$STEP" ]] && { sed -n '2,30p' "$0"; exit 1; }

require_var MONAD_RPC_URL
require_var OWNER_PRIVATE_KEY
require_var AGENT_PRIVATE_KEY
require_var PROVIDER_ADDRESS
require_var ATTACKER_ADDRESS

RPC=(--rpc-url "$MONAD_RPC_URL")
OWNER=(--private-key "$OWNER_PRIVATE_KEY")
AGENT=(--private-key "$AGENT_PRIVATE_KEY")
EXEC_SIG="execute(uint256,address,uint256)"

tx_hash() { python3 -c "import sys,json;print(json.load(sys.stdin)['transactionHash'])"; }

report() {
  local hash="$1" beklenen="$2" status gas
  status=$(cast receipt "${RPC[@]}" "$hash" status)
  gas=$(cast receipt "${RPC[@]}" "$hash" gasUsed)
  show_tx "$hash"
  echo "status: $status   gasUsed: $gas   (beklenen status: $beklenen)"
  [[ "$status" != "$beklenen" ]] && { echo "UYARI: beklenen sonuc alinmadi." >&2; exit 1; }
  return 0
}

# Revert bekleyen islemi tahmin yapmadan gonderir.
send_expecting_revert() {
  local key="$1"; shift
  local out hash
  set +e
  out=$(cast send "${RPC[@]}" --private-key "$key" --gas-limit "$GAS_REVERT" "$@" --json 2>&1)
  set -e
  hash=$(printf '%s' "$out" | tx_hash 2>/dev/null || true)
  if [[ -z "$hash" ]]; then
    echo "Islem gonderilemedi:" >&2; printf '%s\n' "$out" | head -5 >&2; exit 1
  fi
  report "$hash" "false"
  echo "revert sebebi: $(cast receipt "${RPC[@]}" "$hash" --json \
    | python3 -c "import sys,json;print(json.load(sys.stdin).get('revertReason','(yok)'))")"
}

case "$STEP" in

  1|deploy)
    confirm_gate "TugraVault deploy (sahip, gas: estimateGas x1,2)"
    forge create src/TugraVault.sol:TugraVault "${RPC[@]}" "${OWNER[@]}" --broadcast
    echo
    echo "Ciktidaki 'Deployed to' adresini .env icine VAULT_ADDRESS olarak yazin."
    ;;

  2|deposit)
    require_var VAULT_ADDRESS
    OWNER_ADDRESS=$(cast wallet address --private-key "$OWNER_PRIVATE_KEY")
    LIM=$(est_limit --from "$OWNER_ADDRESS" --value "$VAULT_FUNDING" "$VAULT_ADDRESS" "deposit()")
    confirm_gate "Kasaya $VAULT_FUNDING yatir (sahip, gas limiti $LIM)"
    report "$(cast send "${RPC[@]}" "${OWNER[@]}" --gas-limit "$LIM" \
      --value "$VAULT_FUNDING" "$VAULT_ADDRESS" "deposit()" --json | tx_hash)" "true"
    echo "Kasa bakiyesi: $(cast from-wei "$(cast balance "${RPC[@]}" "$VAULT_ADDRESS")") MON"
    ;;

  3|mandate)
    require_var VAULT_ADDRESS
    OWNER_ADDRESS=$(cast wallet address --private-key "$OWNER_PRIVATE_KEY")
    AGENT_ADDRESS=$(cast wallet address --private-key "$AGENT_PRIVATE_KEY")
    NOW=$(cast block "${RPC[@]}" latest --field timestamp)
    EXPIRY=$((NOW + MANDATE_TTL_SECONDS))
    ARGS=("$VAULT_ADDRESS" "createMandate(address,address,uint256,uint64)"
          "$AGENT_ADDRESS" "$PROVIDER_ADDRESS" "$MANDATE_AMOUNT_WEI" "$EXPIRY")
    LIM=$(est_limit --from "$OWNER_ADDRESS" "${ARGS[@]}")
    confirm_gate "Vekalet olustur: $MANDATE_AMOUNT_ETHER MON -> $PROVIDER_ADDRESS, son $EXPIRY (gas limiti $LIM)"
    report "$(cast send "${RPC[@]}" "${OWNER[@]}" --gas-limit "$LIM" "${ARGS[@]}" --json | tx_hash)" "true"
    echo "Vekalet sayisi: $(cast call "${RPC[@]}" "$VAULT_ADDRESS" "mandateCount()(uint256)")"
    echo "Bu kimligi .env icine MANDATE_ID olarak yazin."
    ;;

  4|wrong-payee)
    require_var VAULT_ADDRESS; require_var MANDATE_ID
    confirm_gate "YANLIS ALICI (ajan) -> PayeeMismatch beklenir, sabit gas limiti $GAS_REVERT"
    send_expecting_revert "$AGENT_PRIVATE_KEY" \
      "$VAULT_ADDRESS" "$EXEC_SIG" "$MANDATE_ID" "$ATTACKER_ADDRESS" "$MANDATE_AMOUNT_WEI"
    echo "Vekalet tukenmedi mi (used alani false olmali):"
    cast call "${RPC[@]}" "$VAULT_ADDRESS" \
      "getMandate(uint256)((address,uint64,bool,bool,address,uint256))" "$MANDATE_ID"
    ;;

  5|pay)
    require_var VAULT_ADDRESS; require_var MANDATE_ID
    AGENT_ADDRESS=$(cast wallet address --private-key "$AGENT_PRIVATE_KEY")
    ARGS=("$VAULT_ADDRESS" "$EXEC_SIG" "$MANDATE_ID" "$PROVIDER_ADDRESS" "$MANDATE_AMOUNT_WEI")
    LIM=$(est_limit --from "$AGENT_ADDRESS" "${ARGS[@]}")
    confirm_gate "MESRU odeme (ajan) -> basarili beklenir, gas limiti $LIM"
    report "$(cast send "${RPC[@]}" "${AGENT[@]}" --gas-limit "$LIM" "${ARGS[@]}" --json | tx_hash)" "true"
    echo "Kasa      : $(cast from-wei "$(cast balance "${RPC[@]}" "$VAULT_ADDRESS")") MON"
    echo "Saglayici : $(cast from-wei "$(cast balance "${RPC[@]}" "$PROVIDER_ADDRESS")") MON"
    ;;

  6|repeat)
    require_var VAULT_ADDRESS; require_var MANDATE_ID
    confirm_gate "TEKRAR odeme (ajan) -> AlreadyUsed beklenir, sabit gas limiti $GAS_REVERT"
    send_expecting_revert "$AGENT_PRIVATE_KEY" \
      "$VAULT_ADDRESS" "$EXEC_SIG" "$MANDATE_ID" "$PROVIDER_ADDRESS" "$MANDATE_AMOUNT_WEI"
    ;;

  *) echo "Bilinmeyen adim: $STEP" >&2; exit 1 ;;
esac
