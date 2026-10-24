#!/usr/bin/env bash
# Tugra - deploy SONRASI kaynak kod dogrulamasi (organizator API'si).
#
# Bu, explorer'da kaynak kodu gostermek icindir. GUVENLIK DENETIMI DEGILDIR:
# dogrulama yalnizca "zincirdeki bytecode bu kaynaktan derlenmistir" der,
# kodun dogru ya da guvenli oldugunu soylemez.
#
# Kullanim:
#   ./script/verify.sh payload          -> istek govdesini uretir, GONDERMEZ
#   TUGRA_CONFIRM=1 ./script/verify.sh send -> POST eder
#
# TUGRA_CONFIRM kullanicinin onayinin yerine gecmez.

source "$(dirname "${BASH_SOURCE[0]}")/config.sh"

API_BASE="https://agents.devnads.com"
CONTRACT="src/TugraVault.sol:TugraVault"
PAYLOAD="$TUGRA_ROOT/out/verify-payload.json"

# Derleyici kimligi artifact metadata'sindan OKUNUR, elle yazilmaz.
read_meta() {
  python3 -c "
import json
m = json.load(open('out/TugraVault.sol/TugraVault.json'))['metadata']
s = m['settings']
print(m['compiler']['version'])
print(str(s['optimizer']['enabled']).lower())
print(s['optimizer']['runs'])
print(s['evmVersion'])
"
}

build_payload() {
  require_var VAULT_ADDRESS
  [[ -f out/TugraVault.sol/TugraVault.json ]] || { echo "Once 'forge build' calistirin." >&2; exit 1; }

  mapfile -t META < <(read_meta)
  local solc="v${META[0]}" opt="${META[1]}" runs="${META[2]}" evm="${META[3]}"

  forge verify-contract --show-standard-json-input "$VAULT_ADDRESS" "$CONTRACT" \
    > "$TUGRA_ROOT/out/standard-json-input.json"

  VAULT_ADDRESS="$VAULT_ADDRESS" SOLC="$solc" OPT="$opt" RUNS="$runs" EVM="$evm" \
  CONTRACT="$CONTRACT" CHAIN="$MONAD_CHAIN_ID" python3 -c "
import json, os
sji = json.load(open('out/standard-json-input.json'))
body = {
    'chainId': int(os.environ['CHAIN']),
    'contractAddress': os.environ['VAULT_ADDRESS'],
    'contractName': os.environ['CONTRACT'],
    'compilerVersion': os.environ['SOLC'],
    'standardJsonInput': sji,
    'optimizationUsed': os.environ['OPT'] == 'true',
    'runs': int(os.environ['RUNS']),
    'evmVersion': os.environ['EVM'],
    # TugraVault constructor parametre ALMAZ; constructorArgs gonderilmez.
}
json.dump(body, open('out/verify-payload.json','w'), indent=2)
print('compilerVersion :', body['compilerVersion'])
print('evmVersion      :', body['evmVersion'])
print('optimizationUsed:', body['optimizationUsed'], 'runs:', body['runs'])
print('contractName    :', body['contractName'])
print('kaynak dosyalar :', list(sji['sources'].keys()))
"
  echo "Govde yazildi: $PAYLOAD"
}

case "${1:-payload}" in
  payload)
    build_payload
    echo
    echo "GONDERILMEDI. Gondermek icin: TUGRA_CONFIRM=1 $0 send"
    ;;
  send)
    build_payload
    confirm_gate "POST $API_BASE/v1/verify"
    curl -sS -X POST "$API_BASE/v1/verify" \
      -H "Content-Type: application/json" \
      --data @"$PAYLOAD" -w "\nHTTP %{http_code}\n"
    ;;
  *) echo "Kullanim: $0 [payload|send]" >&2; exit 1 ;;
esac
