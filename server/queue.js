// Tek ajan anahtari icin seri gonderim kuyrugu.
//
// Ayni hesaptan es zamanli gonderim nonce catismasi uretir. Butun zincir
// gonderimleri bu kuyruktan tek tek gecer.
//
// SINIR: Kuyruk YALNIZCA BELLEKTE tutulur. Surec yeniden baslarsa bekleyen
// isler kaybolur ve geri yuklenmez. Zaten gonderilmis bir islem zincirde
// devam eder; sunucu onu takip etmeyi birakir. Bu bilincli bir tercih -
// demo kapsaminda kalici kuyruk yok. /api/state bunu `inMemoryOnly` ile
// disari bildirir.

export function createSerialQueue({ onStateChange } = {}) {
  let tail = Promise.resolve();
  let pending = 0;
  let running = false;
  let completed = 0;

  const state = () => ({
    pending,
    running,
    completed,
    inMemoryOnly: true,
    note: "Kuyruk bellekte tutulur; yeniden baslatmada bekleyen isler kaybolur.",
  });

  function enqueue(task, label = "tx") {
    pending += 1;
    onStateChange?.(state());
    const run = tail.then(async () => {
      pending -= 1;
      running = true;
      onStateChange?.(state());
      try {
        return await task();
      } finally {
        running = false;
        completed += 1;
        onStateChange?.(state());
      }
    });
    // Bir isin hatasi kuyrugu kirmasin: zincir icin hatayi yutuyoruz.
    // Hata cagirana dondurulen `run` uzerinden yine ulasir.
    tail = run.then(
      () => undefined,
      () => undefined,
    );
    run.label = label;
    return run;
  }

  return { enqueue, state };
}
