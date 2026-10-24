// Tutar birimleri.
//
// KURAL: MON <-> wei donusumunde kayan noktali sayi KULLANILMAZ.
// Number/parseFloat 1e18 olceginde sessizce hassasiyet kaybeder.
// Butun ara degerler string ya da BigInt'tir.
//
// Sistemdeki tek "dogru" temsil WEI'dir (BigInt). MON yalnizca insan
// arayuzu icindir ve her zaman ondalik STRING olarak tasinir.

export const WEI_PER_MON = 10n ** 18n;
export const MON_DECIMALS = 18;

export class UnitError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnitError";
  }
}

const MON_PATTERN = /^(0|[1-9]\d{0,12})(\.\d{1,18})?$/;

/**
 * Ondalik MON string'ini wei BigInt'e cevirir.
 * Girdi STRING olmak zorundadir; number kabul edilmez (kayan nokta riski).
 */
export function monToWei(value) {
  if (typeof value !== "string") {
    throw new UnitError(
      `MON tutari string olmali, ${typeof value} geldi. ` +
        `Kayan noktali sayi hassasiyet kaybettirir.`,
    );
  }
  const trimmed = value.trim();
  if (!MON_PATTERN.test(trimmed)) {
    throw new UnitError(
      `Gecersiz MON tutari: ${JSON.stringify(trimmed)}. ` +
        `Beklenen bicim: "0.01" (en fazla 18 ondalik, us gosterimi yok).`,
    );
  }
  const [whole, frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(MON_DECIMALS)).slice(0, MON_DECIMALS);
  return BigInt(whole) * WEI_PER_MON + BigInt(padded);
}

/** wei BigInt -> ondalik MON string. Sondaki sifirlar kirpilir. */
export function weiToMon(wei) {
  if (typeof wei !== "bigint") {
    throw new UnitError(`wei degeri BigInt olmali, ${typeof wei} geldi.`);
  }
  if (wei < 0n) throw new UnitError("wei negatif olamaz.");
  const whole = wei / WEI_PER_MON;
  const frac = (wei % WEI_PER_MON).toString().padStart(MON_DECIMALS, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** Tam sayi string'i (wei) -> BigInt. Modelden gelen degerler icin. */
export function parseWeiString(value) {
  if (typeof value !== "string" || !/^\d{1,30}$/.test(value.trim())) {
    throw new UnitError(`Gecersiz wei degeri: ${JSON.stringify(value)}.`);
  }
  return BigInt(value.trim());
}
