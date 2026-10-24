// Zincire giden denemeler icin sayi ve gas limiti butcesi.
//
// Limit asildiktan sonra deneme ZINCIRE GITMEZ; sonuc "Simulasyon" olarak
// etiketlenir ve ekranda gercek islemden AYRI gosterilir.
//
// Butce de bellektedir; yeniden baslatmada sifirlanir.

export function createBudget({ maxAttempts, maxTotalGas }) {
  let attempts = 0;
  let totalGas = 0n;

  return {
    check() {
      if (attempts >= maxAttempts) {
        return {
          allowed: false,
          reason: `deneme limiti doldu (${attempts}/${maxAttempts})`,
        };
      }
      if (totalGas >= BigInt(maxTotalGas)) {
        return {
          allowed: false,
          reason: `gas butcesi doldu (${totalGas}/${maxTotalGas})`,
        };
      }
      return { allowed: true };
    },
    record({ gas }) {
      attempts += 1;
      totalGas += BigInt(gas ?? 0);
    },
    state() {
      return {
        attempts,
        maxAttempts,
        totalGas: totalGas.toString(),
        maxTotalGas: String(maxTotalGas),
        inMemoryOnly: true,
      };
    },
  };
}
