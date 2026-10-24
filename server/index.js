// Giris noktasi. Tek Node surecidir.
//
// OWNER_PRIVATE_KEY BU SUREC TARAFINDAN OKUNMAZ. Sunucu kendi basina
// vekalet olusturamaz veya kasaya fon yatiramaz; bunlar operatorun
// script/proof-flow.sh ile elle yaptigi islerdir.

import "dotenv/config";
import { createChain } from "./chain.js";
import { createModel, MODEL_ID } from "./model.js";
import { createSerialQueue } from "./queue.js";
import { createBudget } from "./budget.js";
import { createApp } from "./server.js";

function required(name) {
  const v = process.env[name];
  if (!v) {
    // Deger ASLA yazdirilmaz; yalnizca eksik oldugu bildirilir.
    console.error(`HATA: ${name} tanimli degil.`);
    process.exit(1);
  }
  return v;
}

const config = {
  chainId: 10143,
  modelId: MODEL_ID,
  // Asama 2'de zincirde olculen degerler.
  gasRevertLimit: Number(process.env.GAS_REVERT ?? 60000),
  gasMultiplierNum: 12,
  gasMultiplierDen: 10,
  payeeLabels: {},
};

const chain = createChain({
  rpcUrl: required("MONAD_RPC_URL"),
  agentPrivateKey: required("AGENT_PRIVATE_KEY"),
  vaultAddress: required("VAULT_ADDRESS"),
  feeCapWei: BigInt(process.env.FEE_CAP_WEI ?? 200_000_000_000n),
  priorityFeeWei: BigInt(process.env.PRIORITY_FEE_WEI ?? 2_000_000_000n),
});

config.agentAddress = chain.agentAddress;
if (process.env.PROVIDER_ADDRESS) {
  config.payeeLabels[process.env.PROVIDER_ADDRESS.toLowerCase()] = "Kayitli saglayici";
}

const model = createModel({ apiKey: required("ANTHROPIC_API_KEY") });
const queue = createSerialQueue();
const budget = createBudget({
  maxAttempts: Number(process.env.MAX_CHAIN_ATTEMPTS ?? 40),
  maxTotalGas: Number(process.env.MAX_TOTAL_GAS ?? 6_000_000),
});

const app = createApp({ chain, model, queue, config, budget });

const port = Number(process.env.PORT ?? 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Tugra sunucusu dinliyor: 0.0.0.0:${port}`);
  console.log(`Model: ${MODEL_ID} | Zincir: ${config.chainId} | Kasa: ${chain.vaultAddress}`);
  console.log(`Ajan: ${chain.agentAddress}`);
  console.log("Kuyruk ve butce BELLEKTE; yeniden baslatmada sifirlanir.");
});
