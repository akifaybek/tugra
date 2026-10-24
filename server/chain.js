// Zincir adaptoru (viem).
//
// ONEMLI: Bu surec OWNER anahtarini HIC YUKLEMEZ. Sunucu kendi basina
// vekalet olusturamaz, kasaya fon yatiramaz, para cekemez. Elindeki tek
// yetki AGENT anahtariyla `execute` cagirmaktir - o da kontratin
// vekalet kontrolune tabidir.

import { createPublicClient, createWalletClient, http, defineChain } from "viem";
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

  async function estimateExecuteGas({ mandateId, payee, amountWei }) {
    return publicClient.estimateContractGas({
      address: vaultAddress,
      abi: VAULT_ABI,
      functionName: "execute",
      args: [mandateId, payee, amountWei],
      account,
    });
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
    estimateExecuteGas,
    sendExecute,
    waitForReceipt,
    getRevertReason,
    vaultBalance,
    agentBalance,
    explorerTx: (h) => `${monadTestnet.blockExplorers.default.url}/tx/${h}`,
  };
}
