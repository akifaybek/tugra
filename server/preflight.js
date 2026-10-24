// Gonderim oncesi siniflandirma.
//
// Monad ucreti gas LIMITINE gore keser ve revert edecegi bilinen islemde
// estimateGas hata dondurur. Demo'nun kaniti tam olarak bu revert'tir, bu
// yuzden bazi durumlarda tahmini atlayip sabit limitle gondermek gerekir.
//
// AMA: "estimateGas hata verdi" tek basina "revert edecek" demek DEGILDIR.
// Timeout, baglanti hatasi, rate limit, yetersiz bakiye ve cozulemeyen
// hatalar da ayni yere duser. Bu durumlarda ISLEM GONDERILMEZ.
//
// Sabit limitle gonderim YALNIZCA ayni cagridan alinan revert verisi ABI
// ile cozulup beklenen kontrat hatasi dogrulandiginda yapilir.

/** Sabit limitle gonderime izin verilen kontrat hatalari. */
export const ALLOWED_REVERT_ERRORS = [
  "PayeeMismatch",
  "AmountMismatch",
  "AlreadyUsed",
  "Expired",
  "Revoked",
  "NotAgent",
];

export const PREFLIGHT = {
  OK: "ok", // tahmin alindi, normal gonderim
  REVERT_CONFIRMED: "revert_confirmed", // revert verisi cozuldu
  REVERT_UNEXPECTED: "revert_unexpected", // cozuldu ama izin listesinde yok
  UNRESOLVED: "unresolved", // cozulemedi / ag hatasi / bakiye
};

/**
 * Preflight sonucunu gonderim kararina cevirir.
 * @param {{kind: string, gas?: bigint, errorName?: string|null, reason?: string}} result
 * @param {{gasRevertLimit: number, gasMultiplierNum: number, gasMultiplierDen: number,
 *          allowedRevertErrors?: string[]}} config
 */
export function decideGas(result, config) {
  const allowed = config.allowedRevertErrors ?? ALLOWED_REVERT_ERRORS;

  if (result.kind === PREFLIGHT.OK) {
    return {
      send: true,
      gasLimit:
        (result.gas * BigInt(config.gasMultiplierNum)) / BigInt(config.gasMultiplierDen),
      preflight: PREFLIGHT.OK,
    };
  }

  if (result.kind === PREFLIGHT.REVERT_CONFIRMED) {
    if (!result.errorName || !allowed.includes(result.errorName)) {
      return {
        send: false,
        preflight: PREFLIGHT.REVERT_UNEXPECTED,
        errorName: result.errorName ?? null,
        reason:
          `preflight revert'i cozuldu (${result.errorName ?? "bilinmeyen"}) ` +
          `ancak izinli demo hatalari arasinda degil; islem GONDERILMEDI.`,
      };
    }
    return {
      send: true,
      gasLimit: BigInt(config.gasRevertLimit),
      preflight: PREFLIGHT.REVERT_CONFIRMED,
      errorName: result.errorName,
    };
  }

  // UNRESOLVED: timeout, baglanti, rate limit, yetersiz bakiye, cozulemeyen hata
  return {
    send: false,
    preflight: PREFLIGHT.UNRESOLVED,
    reason:
      `preflight sonucu belirsiz (${result.reason ?? "sebep yok"}); ` +
      `revert oldugu DOGRULANAMADI, islem GONDERILMEDI.`,
  };
}
