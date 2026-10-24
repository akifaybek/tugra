// Zincir adaptoru (viem).
//
// ONEMLI: Bu surec OWNER anahtarini HIC YUKLEMEZ. Sunucu kendi basina
// vekalet olusturamaz, kasaya fon yatiramaz, para cekemez. Elindeki tek
// yetki AGENT anahtariyla `execute` cagirmaktir - o da kontratin
// vekalet kontrolune tabidir.

import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  ContractFunctionRevertedError,
} from "viem";
import { PREFLIGHT } from "./preflight.js";
import { privateKeyToAccount } from "viem/accounts";

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "MonadScan", url: "https://testnet.monadscan.com" },
  },
});

export const VAULT_ABI = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "mandateId", type: "uint256" },
      { name: "payee", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getMandate",
    stateMutability: "view",
    inputs: [{ name: "mandateId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "agent", type: "address" },
          { name: "expiry", type: "uint64" },
          { name: "used", type: "bool" },
          { name: "revoked", type: "bool" },
          { name: "payee", type: "address" },
          { name: "amount", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "mandateCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  { type: "error", name: "NotAgent", inputs: [] },
  { type: "error", name: "PayeeMismatch", inputs: [] },
  { type: "error", name: "AmountMismatch", inputs: [] },
  { type: "error", name: "Expired", inputs: [] },
  { type: "error", name: "Revoked", inputs: [] },
  { type: "error", name: "AlreadyUsed", inputs: [] },
  { type: "error", name: "InsufficientBalance", inputs: [] },
  { type: "error", name: "UnknownMandate", inputs: [] },
  { type: "error", name: "Reentrancy", inputs: [] },
  { type: "error", name: "TransferFailed", inputs: [] },
];

// Zincirde olculmus selector -> hata adi eslemesi (Asama 2 kanitlarindan).
export const REVERT_SELECTORS = {
  "0xe28e12ad": "PayeeMismatch",
  "0x7b8c8210": "AlreadyUsed",
  "0x0d9ab13f": "NotAgent",
  "0x203d82d8": "Expired",
  "0x55e97b0d": "AmountMismatch",
  "0x44825a4b": "Revoked",
};

export function createChain({ rpcUrl, agentPrivateKey, vaultAddress, feeCapWei, priorityFeeWei }) {
  const account = privateKeyToAccount(agentPrivateKey);
  const transport = http(rpcUrl);
  const publicClient = createPublicClient({ chain: monadTestnet, transport });
  const walletClient = createWalletClient({ account, chain: monadTestnet, transport });

  async function getMandate(mandateId) {
    const id = BigInt(mandateId);
    const m = await publicClient.readContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "getMandate",
      args: [id],
    });
    return {
      id,
      agent: m.agent,
      expiry: BigInt(m.expiry),
      used: m.used,
      revoked: m.revoked,
      payee: m.payee,
      amount: BigInt(m.amount),
    };
  }

  /**
   * Gonderim oncesi siniflandirma. ASLA throw ETMEZ.
   *
   * Donen `kind`:
   *   ok               -> tahmin alindi
   *   revert_confirmed -> AYNI cagridan gelen revert verisi ABI ile cozuldu
   *   unresolved       -> timeout / baglanti / rate limit / yetersiz bakiye /
   *                       cozulemeyen hata. Bu durumda gonderim YAPILMAZ.
   */
  async function preflightExecute({ mandateId, payee, amountWei }) {
    try {
      const gas = await publicClient.estimateContractGas({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: "execute",
        args: [mandateId, payee, amountWei],
        account,
      });
      return { kind: PREFLIGHT.OK, gas };
    } catch (err) {
      // Revert verisini ayni cagrinin hata zincirinden cozmeye calis.
      const reverted =
        typeof err?.walk === "function"
          ? err.walk((e) => e instanceof ContractFunctionRevertedError)
          : null;

      if (reverted instanceof ContractFunctionRevertedError) {
        const errorName = reverted.data?.errorName ?? null;
        if (errorName) {
          return {
            kind: PREFLIGHT.REVERT_CONFIRMED,
            errorName,
            raw: reverted.raw ?? reverted.signature ?? null,
          };
        }
        // Revert oldugu belli ama ABI ile cozulemedi -> gonderme.
        return {
          kind: PREFLIGHT.UNRESOLVED,
          reason: "revert verisi ABI ile cozulemedi",
        };
      }

      return {
        kind: PREFLIGHT.UNRESOLVED,
        reason: classifyError(err),
      };
    }
  }

  async function sendExecute({ mandateId, payee, amountWei }, { gasLimit }) {
    return walletClient.writeContract({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "execute",
      args: [mandateId, payee, amountWei],
      gas: gasLimit,
      maxFeePerGas: feeCapWei,
      maxPriorityFeePerGas: priorityFeeWei,
    });
  }

  async function waitForReceipt(txHash) {
    return publicClient.waitForTransactionReceipt({ hash: txHash });
  }

  /**
   * Revert nedenini GERCEK islemden okur.
   * Monad testnet makbuzunda revertReason alani yoktur; bu yuzden
   * debug_traceTransaction (callTracer) kullanilir.
   */
  async function getRevertReason(txHash) {
    const trace = await publicClient.request({
      method: "debug_traceTransaction",
      params: [txHash, { tracer: "callTracer" }],
    });
    const data = trace?.output ?? null;
    if (!data) return { selector: null, name: null, raw: trace?.error ?? null };
    const selector = data.slice(0, 10).toLowerCase();
    return { selector, name: REVERT_SELECTORS[selector] ?? null, raw: data };
  }

  async function vaultBalance() {
    return publicClient.getBalance({ address: vaultAddress });
  }

  async function agentBalance() {
    return publicClient.getBalance({ address: account.address });
  }

  return {
    agentAddress: account.address,
    vaultAddress,
    getMandate,
    preflightExecute,
    sendExecute,
    waitForReceipt,
    getRevertReason,
    vaultBalance,
    agentBalance,
    explorerTx: (h) => `${monadTestnet.blockExplorers.default.url}/tx/${h}`,
  };
}

/** Ag/istemci hatalarini insan okunur tek satira indirger. */
function classifyError(err) {
  const name = err?.name ?? "Error";
  const msg = String(err?.shortMessage ?? err?.message ?? "");
  if (/timeout|timed out/i.test(msg)) return `timeout (${name})`;
  if (/insufficient funds/i.test(msg)) return `yetersiz bakiye (${name})`;
  if (/rate ?limit|429|too many requests/i.test(msg)) return `rate limit (${name})`;
  if (/ECONNREFUSED|ENOTFOUND|socket|network|fetch failed/i.test(msg))
    return `baglanti hatasi (${name})`;
  return `${name}: ${msg.slice(0, 200)}`;
}
