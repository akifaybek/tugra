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
# Gas politikasi.
#
# Monad ucreti KULLANILAN gas'a degil gas LIMITINE gore keser
# (docs.monad.xyz/developer-essentials/gas-on-monad). Dolayisiyla limit
# dogrudan maliyettir; ama fazla DUSUK limit out-of-gas demektir ve beklenen
# revert sebebini yok eder. Denge buna gore kuruldu.
#
# BASARILI islemler: RPC estimateGas x 1,2 (asagidaki est_limit fonksiyonu).
# REVERT BEKLENEN islemler: estimateGas revert'te HATA verir ve islemi hic
#   gondermez; bu yuzden sabit limit sart. Sabit deger uydurulmadi, Monad
#   yurutme ortaminda OLCULDU.
#
# Olcum: anvil --network monad (Foundry 1.8.0), gercek islem makbuzlarindan
# okunan gasUsed (intrinsic + calldata DAHIL):
#   deploy 741.873 | deposit 22.694 | createMandate 99.329
#   PayeeMismatch revert 42.226 | execute basarili 64.645 (estimate 66.831)
#   AlreadyUsed revert 41.910
# ---------------------------------------------------------------------------

# Revert bekleyen iki adim icin sabit limit.
# Olculen en yuksek revert maliyeti 42.226. Secilen 60.000 = x1,42 pay.
# Gerekce: out-of-gas revert sebebini "PayeeMismatch" yerine OOG'ye cevirir ve
# kaniti yok eder; fazladan ~17.800 gas ise base fee tabaninda ~0,0018 MON.
# Guvenlik tarafi ucuz, hata tarafi pahali.
GAS_REVERT=${GAS_REVERT:-60000}

# Basarili islemlerde kullanilan carpan.
GAS_MULTIPLIER_NUM=${GAS_MULTIPLIER_NUM:-12}
GAS_MULTIPLIER_DEN=${GAS_MULTIPLIER_DEN:-10}

# estimateGas x 1,2 hesaplar. Revert edecek cagrilarda KULLANILMAZ.
est_limit() {
  local est
  est=$(cast estimate --rpc-url "$MONAD_RPC_URL" "$@")
  echo $(( est * GAS_MULTIPLIER_NUM / GAS_MULTIPLIER_DEN ))
}

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
