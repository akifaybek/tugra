// Deneme akisinin cekirdegi.
//
// Butun bagimliliklar disaridan verilir (chain, model, clock, budget) - bu
// sayede gercek model ve RPC olmadan test edilebilir.
//
// AKIS SIRASI (guven siniri burada korunur):
//   1. Butce kontrolu
//   2. Vekaleti ZINCIRDEN oku ve kullanilabilirligini dogrula
//   3. ANCAK bundan sonra guvensiz not modele verilir
//   4. Modelin urettigi cagri BICIMSEL olarak dogrulanir
//   5. Bicimsel olarak gecerli cagri OLDUGU GIBI kontrata gonderilir
//   6. Yetki karari KONTRATIN; makbuz dogrulanmadan basari sayilmaz

import { monToWei, weiToMon } from "./units.js";
import { buildSystemPrompt, buildUserMessage } from "./trust.js";

export const OUTCOME = {
  MANDATE_UNUSABLE: "mandate_unusable",
  BUDGET_EXCEEDED: "budget_exceeded",
  MODEL_ERROR: "model_error",
  NO_TOOL_CALL: "no_tool_call",
  INVALID_TOOL_CALL: "invalid_tool_call",
  PAID: "paid",
  REJECTED_ON_CHAIN: "rejected_on_chain",
  UNCERTAIN: "uncertain",
};

/** Veri erisimini AC diyebilecegimiz tek sonuc. */
export const UNLOCKING_OUTCOME = OUTCOME.PAID;

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * Modelin urettigi arac girdisini BICIMSEL olarak dogrular.
 *
 * Burada yetki kontrolu YAPILMAZ. Alici veya tutar vekaletle uyusmuyorsa
 * duzeltilmez ve engellenmez - karari kontrat verir. Yalnizca kontrata
 * gonderilemeyecek kadar bozuk girdiler elenir.
 */
export function validateToolInput(input) {
  const errors = [];
  if (!input || typeof input !== "object") {
    return { ok: false, errors: ["arac girdisi nesne degil"] };
  }

  let mandateId = null;
  if (typeof input.mandateId !== "string" || !/^\d{1,20}$/.test(input.mandateId.trim())) {
    errors.push("mandateId tam sayi string olmali");
  } else {
    mandateId = BigInt(input.mandateId.trim());
  }

  let payee = null;
  if (typeof input.payee !== "string" || !ADDRESS_RE.test(input.payee.trim())) {
    errors.push("payee 0x ile baslayan 40 haneli hex olmali");
  } else {
    payee = input.payee.trim();
  }

  let amountWei = null;
  if (typeof input.amount !== "string") {
    // Sayi tipi kabul edilmez: kayan nokta hassasiyet kaybettirir.
    errors.push("amount MON cinsinden ondalik STRING olmali (sayi tipi kabul edilmez)");
  } else {
    try {
      amountWei = monToWei(input.amount);
    } catch (err) {
      errors.push(`amount cozulemedi: ${err.message}`);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, call: { mandateId, payee, amountWei } };
}

/** Vekaletin su an kullanilabilir olup olmadigini zincir verisinden karara baglar. */
export function assessMandate(mandate, { agentAddress, nowSeconds }) {
  if (!mandate) return { usable: false, reason: "vekalet bulunamadi" };
  if (mandate.agent.toLowerCase() !== agentAddress.toLowerCase()) {
    return { usable: false, reason: "vekalet baska bir ajana ait" };
  }
  if (mandate.revoked) return { usable: false, reason: "vekalet iptal edilmis" };
  if (mandate.used) return { usable: false, reason: "vekalet zaten kullanilmis" };
  if (nowSeconds > mandate.expiry) return { usable: false, reason: "vekaletin suresi dolmus" };
  return { usable: true };
}

/**
 * @param {object} deps
 * @param {object} deps.chain   getMandate, estimateExecuteGas, sendExecute, waitForReceipt, getRevertReason
 * @param {object} deps.model   decide({system, user}) -> {toolCall|null, text, raw}
 * @param {object} deps.queue   enqueue(task, label)
 * @param {object} deps.config  agentAddress, payeeLabels, gasRevertLimit, gasMultiplier
 * @param {object} deps.budget  check(), record({gas})
 * @param {() => number} deps.now  ms
 */
export function createAttemptRunner({ chain, model, queue, config, budget, now = Date.now }) {
  const timings = () => ({ modelMs: null, chainMs: null });

  /**
   * @param {object} params
   * @param {string} params.mandateId  hangi vekalet denenecek (operator secer, nottan gelmez)
   * @param {object} params.untrusted  { providerDescription, audienceNote }
   * @param {"model"|"controlled"} params.mode
   * @param {object} [params.controlledCall]  mode === "controlled" ise gonderilecek ham arac girdisi
   */
  async function run({ mandateId, untrusted = {}, mode = "model", controlledCall = null }) {
    const t = timings();
    const label = mode === "controlled" ? "Kontrollu test" : "Gercek model karari";

    // --- 1. Butce -------------------------------------------------------
    const budgetState = budget.check();
    if (!budgetState.allowed) {
      return {
        outcome: OUTCOME.BUDGET_EXCEEDED,
        label: "Simulasyon",
        simulated: true,
        dataUnlocked: false,
        reason: budgetState.reason,
        timings: t,
      };
    }

    // --- 2. Vekaleti ZINCIRDEN oku --------------------------------------
    // Guvenilir alanlarin TEK kaynagi burasidir. Guvensiz not henuz
    // modele verilmedi.
    let mandate;
    try {
      mandate = await chain.getMandate(mandateId);
    } catch (err) {
      return {
        outcome: OUTCOME.UNCERTAIN,
        label,
        dataUnlocked: false,
        reason: `vekalet zincirden okunamadi: ${err.message}`,
        timings: t,
      };
    }

    const nowSeconds = BigInt(Math.floor(now() / 1000));
    const verdict = assessMandate(mandate, { agentAddress: config.agentAddress, nowSeconds });
    if (!verdict.usable) {
      // Vekalet zincirde dogrulanmadan guvensiz not modele VERILMEZ.
      return {
        outcome: OUTCOME.MANDATE_UNUSABLE,
        label,
        dataUnlocked: false,
        reason: verdict.reason,
        modelCalled: false,
        timings: t,
      };
    }

    const trusted = {
      mandateId: String(mandate.id),
      payee: mandate.payee,
      payeeLabel: config.payeeLabels?.[mandate.payee.toLowerCase()] ?? "Kayitli saglayici",
      amountMon: weiToMon(mandate.amount),
      expiryIso: new Date(Number(mandate.expiry) * 1000).toISOString(),
    };

    // --- 3. Model karari (veya kontrollu test) --------------------------
    let toolInput = null;
    let modelText = null;

    if (mode === "controlled") {
      // Kontrollu test: model CAGRILMAZ. Cikti model karari gibi sunulmaz.
      toolInput = controlledCall;
    } else {
      const started = now();
      try {
        const decision = await model.decide({
          system: buildSystemPrompt(),
          user: buildUserMessage(trusted, untrusted),
        });
        t.modelMs = now() - started;
        toolInput = decision.toolCall?.input ?? null;
        modelText = decision.text ?? null;
      } catch (err) {
        t.modelMs = now() - started;
        return {
          outcome: OUTCOME.MODEL_ERROR,
          label,
          dataUnlocked: false,
          reason: `model cagrisi basarisiz: ${err.message}`,
          timings: t,
        };
      }

      if (!toolInput) {
        // Model saldiriyi reddetti ya da arac cagirmadi. Durustce boyle gosterilir.
        return {
          outcome: OUTCOME.NO_TOOL_CALL,
          label,
          dataUnlocked: false,
          modelText,
          reason: "model odeme araci cagirmadi",
          timings: t,
        };
      }
    }

    // --- 4. BICIMSEL dogrulama (yetki kontrolu DEGIL) -------------------
    const validated = validateToolInput(toolInput);
    if (!validated.ok) {
      return {
        outcome: OUTCOME.INVALID_TOOL_CALL,
        label,
        dataUnlocked: false,
        modelText,
        reason: `arac cagrisi bicimsel olarak gecersiz: ${validated.errors.join("; ")}`,
        rawToolInput: toolInput,
        timings: t,
      };
    }

    const call = validated.call;
    // Modelin istedigi alici/tutar vekaletle uyusmasa bile DUZELTILMEZ.
    const matchesMandate =
      call.mandateId === mandate.id &&
      call.payee.toLowerCase() === mandate.payee.toLowerCase() &&
      call.amountWei === mandate.amount;

    // --- 5. Zincire gonder ----------------------------------------------
    // Revert edecegi bilinen islemde estimateGas hata verir; o durumda
    // sabit olculmus limit kullanilir ve islem YINE DE gonderilir.
    let gasLimit;
    let preflight;
    try {
      const est = await chain.estimateExecuteGas(call);
      gasLimit = (est * BigInt(config.gasMultiplierNum)) / BigInt(config.gasMultiplierDen);
      preflight = "estimate_ok";
    } catch {
      gasLimit = BigInt(config.gasRevertLimit);
      preflight = "estimate_failed";
    }

    budget.record({ gas: gasLimit });

    const chainStarted = now();
    let txHash;
    try {
      txHash = await queue.enqueue(() => chain.sendExecute(call, { gasLimit }), "execute");
    } catch (err) {
      t.chainMs = now() - chainStarted;
      return {
        outcome: OUTCOME.UNCERTAIN,
        label,
        dataUnlocked: false,
        reason: `islem gonderilemedi: ${err.message}`,
        detail: "Islemin zincire ulasip ulasmadigi BELIRSIZ. Otomatik tekrar YOK.",
        preflight,
        gasLimit: gasLimit.toString(),
        matchesMandate,
        timings: t,
      };
    }

    // --- 6. Makbuz --------------------------------------------------------
    let receipt;
    try {
      receipt = await chain.waitForReceipt(txHash);
    } catch (err) {
      t.chainMs = now() - chainStarted;
      return {
        outcome: OUTCOME.UNCERTAIN,
        label,
        dataUnlocked: false,
        txHash,
        reason: `makbuz alinamadi: ${err.message}`,
        detail: "Islem gonderildi ama sonucu BILINMIYOR. Otomatik tekrar YOK.",
        preflight,
        gasLimit: gasLimit.toString(),
        matchesMandate,
        timings: t,
      };
    }
    t.chainMs = now() - chainStarted;

    if (!receipt || receipt.status === undefined || receipt.status === null) {
      return {
        outcome: OUTCOME.UNCERTAIN,
        label,
        dataUnlocked: false,
        txHash,
        reason: "makbuzda durum alani yok",
        detail: "Sonuc BELIRSIZ. Veri acilmaz, otomatik tekrar yok.",
        preflight,
        matchesMandate,
        timings: t,
      };
    }

    const base = {
      label,
      txHash,
      gasUsed: receipt.gasUsed?.toString() ?? null,
      effectiveGasPrice: receipt.effectiveGasPrice?.toString() ?? null,
      preflight,
      gasLimit: gasLimit.toString(),
      matchesMandate,
      modelText,
      requested: {
        mandateId: call.mandateId.toString(),
        payee: call.payee,
        amountMon: weiToMon(call.amountWei),
      },
      timings: t,
    };

    if (receipt.status === "success") {
      // Basari YALNIZCA dogrulanmis makbuzla ilan edilir.
      return { ...base, outcome: OUTCOME.PAID, dataUnlocked: true };
    }

    let revert = null;
    try {
      revert = await chain.getRevertReason(txHash);
    } catch {
      revert = null;
    }
    return {
      ...base,
      outcome: OUTCOME.REJECTED_ON_CHAIN,
      dataUnlocked: false,
      revert,
      reason: revert?.name
        ? `kontrat reddetti: ${revert.name}`
        : "kontrat reddetti (sebep cozulemedi)",
    };
  }

  return { run };
}
