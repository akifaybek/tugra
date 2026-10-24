// Test icin sahte zincir ve model. GERCEK RPC veya API CAGRISI YOK.

import { monToWei } from "../units.js";

export const AGENT = "0xCCeaAfE11dd6C0f0eb7F683396B79F69d6c0bd1C";
export const PROVIDER = "0xb02e588c7e9Db3D646CbFA78652dFdA6B4437587";
export const ATTACKER = "0x7ADDB0120984A62B594E6292B30791eE2940Bb52";
export const VAULT = "0xC2C75CDbc79e42e8897491FCe3a193EDEB795212";

export const SELECTORS = {
  PayeeMismatch: "0xe28e12ad",
  AlreadyUsed: "0x7b8c8210",
  AmountMismatch: "0x55e97b0d",
};

export function makeMandate(over = {}) {
  return {
    id: 1n,
    agent: AGENT,
    expiry: 2_000_000_000n,
    used: false,
    revoked: false,
    payee: PROVIDER,
    amount: monToWei("0.01"),
    ...over,
  };
}

/**
 * Sahte zincir. Kontratin yetki kurallarini taklit eder: cagri vekaletle
 * tam uyusuyorsa basarili, uyusmuyorsa ilgili hatayla revert.
 */
export function makeChain({ mandate = makeMandate(), overrides = {} } = {}) {
  const calls = { estimate: 0, send: 0, receipt: 0, revert: 0, getMandate: 0 };
  let current = { ...mandate };

  const decide = (call) => {
    if (call.mandateId !== current.id) return "UnknownMandate";
    if (current.used) return "AlreadyUsed";
    if (current.revoked) return "Revoked";
    if (call.payee.toLowerCase() !== current.payee.toLowerCase()) return "PayeeMismatch";
    if (call.amountWei !== current.amount) return "AmountMismatch";
    return null;
  };

  const base = {
    agentAddress: AGENT,
    vaultAddress: VAULT,
    explorerTx: (h) => `https://testnet.monadscan.com/tx/${h}`,
    calls,

    // Gercek adaptor gibi davranir: istenmeyen kimlikte HATA verir,
    // sessizce baska vekalet DONDURMEZ.
    async getMandate(id) {
      calls.getMandate += 1;
      calls.lastRequestedId = id === undefined ? undefined : String(id);
      if (id !== undefined && String(id) !== String(current.id)) {
        throw new Error(`UnknownMandate: ${id}`);
      }
      return { ...current };
    },

    // Yeni sozlesme: ASLA throw etmez, siniflandirilmis sonuc doner.
    async preflightExecute(call) {
      calls.estimate += 1;
      const err = decide(call);
      if (err) {
        // Gercek davranis: revert verisi ABI ile cozulur.
        return { kind: "revert_confirmed", errorName: err };
      }
      return { kind: "ok", gas: 92_476n };
    },

    async sendExecute(call) {
      calls.send += 1;
      base._lastError = decide(call);
      if (!base._lastError) current = { ...current, used: true };
      return `0xhash${calls.send}`;
    },

    async waitForReceipt() {
      calls.receipt += 1;
      return {
        status: base._lastError ? "reverted" : "success",
        gasUsed: base._lastError ? 42_226n : 64_645n,
        effectiveGasPrice: 102_000_000_000n,
      };
    },

    async getRevertReason() {
      calls.revert += 1;
      const name = base._lastError;
      return name ? { selector: SELECTORS[name] ?? "0x00000000", name } : null;
    },

    async vaultBalance() {
      return monToWei("0.04");
    },
    async agentBalance() {
      return monToWei("0.97");
    },
  };

  const api = { ...base, ...overrides };
  // getter'i yayilimdan SONRA tanimla: {...base} getter'i bir kez
  // degerlendirip sabit degere cevirir ve guncellemeler gorunmez olur.
  Object.defineProperty(api, "mandateState", { get: () => current });
  return api;
}

/** Sahte model. Verilen arac girdisini dondurur ya da hic cagirmaz. */
export function makeModel({ toolInput = null, text = null, throws = null, delayMs = 0 } = {}) {
  const seen = [];
  return {
    seen,
    async decide({ system, user }) {
      seen.push({ system, user });
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (throws) throw new Error(throws);
      return {
        toolCall: toolInput ? { name: "pay", input: toolInput } : null,
        text,
      };
    },
  };
}

export function makeConfig(over = {}) {
  return {
    chainId: 10143,
    modelId: "claude-haiku-5-5",
    agentAddress: AGENT,
    payeeLabels: { [PROVIDER.toLowerCase()]: "Kayitli saglayici" },
    gasRevertLimit: 60000,
    gasMultiplierNum: 12,
    gasMultiplierDen: 10,
    ...over,
  };
}

export function makeBudget({ allowed = true, reason = "" } = {}) {
  const recorded = [];
  return {
    recorded,
    check: () => ({ allowed, reason }),
    record: (x) => recorded.push(x),
    state: () => ({ attempts: recorded.length, inMemoryOnly: true }),
  };
}
