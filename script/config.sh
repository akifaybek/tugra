#!/usr/bin/env bash
# Tugra - kanit akisi ortak yapilandirmasi.
# Bu dosya tek basina islem gondermez; digerleri tarafindan source edilir.
# Gizli degerler yalnizca .env'den okunur ve ASLA yazdirilmaz.

set -euo pipefail

TUGRA_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$TUGRA_ROOT"

# ---------------------------------------------------------------------------
# .env yuklemesi (degerler yazdirilmaz)
# ---------------------------------------------------------------------------
if [[ ! -f .env ]]; then
  echo "HATA: .env bulunamadi. .env.example'i kopyalayip doldurun." >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

require_var() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "HATA: .env icinde $name bos." >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Ag - resmi Monad dokumanindan (docs.monad.xyz/developer-essentials/testnet)
# ---------------------------------------------------------------------------
MONAD_CHAIN_ID=10143
EXPLORER_BASE="https://testnet.monadscan.com/tx"

# ---------------------------------------------------------------------------
# Gas limitleri.
# Monad ucreti KULLANILAN gas'a degil gas LIMITINE gore keser
# (docs.monad.xyz/developer-essentials/gas-on-monad), bu yuzden limitler
# yerel olcume dayanir ve gereksiz sisirilmez.
#
# Yerel olcum kaynagi: forge test --match-path test/Gas.t.sol -vv
# (evm_version = prague, Foundry 1.7.1 VARSAYILAN gas modeli - Monad DEGIL)
#   deploy 696.597 | deposit 8.846 | createMandate 97.383
#   PayeeMismatch 2.179 | execute 39.538 | AlreadyUsed 1.875
# Bunlara intrinsic 21.000 + calldata maliyeti eklenir, sonra pay konur.
# ---------------------------------------------------------------------------
GAS_DEPLOY=${GAS_DEPLOY:-900000}   # ~772.000 tahmini + pay
GAS_DEPOSIT=${GAS_DEPOSIT:-60000}  # ~30.000 tahmini + pay
GAS_CREATE=${GAS_CREATE:-160000}   # ~120.500 tahmini + pay
GAS_PAY=${GAS_PAY:-90000}          # ~61.700 tahmini + pay
GAS_REVERT=${GAS_REVERT:-60000}    # ~24.600 tahmini + pay (revert yollari)

# ---------------------------------------------------------------------------
# Tutarlar. Ekranda gosterilen tutar BURADAKI tutarla ayni olmak zorundadir.
# ---------------------------------------------------------------------------
VAULT_FUNDING=${VAULT_FUNDING:-0.05ether}
MANDATE_AMOUNT_ETHER=${MANDATE_AMOUNT_ETHER:-0.01}
MANDATE_AMOUNT_WEI=$(cast to-wei "$MANDATE_AMOUNT_ETHER" ether)
MANDATE_TTL_SECONDS=${MANDATE_TTL_SECONDS:-3600}

# ---------------------------------------------------------------------------
# Onay kapisi: hicbir islem TUGRA_CONFIRM=1 olmadan gonderilmez.
# ---------------------------------------------------------------------------
confirm_gate() {
  local what="$1"
  echo "ISLEM: $what"
  if [[ "${TUGRA_CONFIRM:-0}" != "1" ]]; then
    echo "Gonderilmedi. Calistirmak icin: TUGRA_CONFIRM=1 $0 $*" >&2
    exit 2
  fi
}

show_tx() {
  local hash="$1"
  echo "tx: $hash"
  echo "explorer: $EXPLORER_BASE/$hash"
}
