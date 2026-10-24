// SAHTE VERI sunucusu - yalnizca UI durumlarini dogrulamak icin.
//
// Gercek model veya RPC KULLANMAZ. Ekranda "TEST VERISI" bandi gorunur.
// Uretimde calistirilmaz; `npm start` bu dosyayi kullanmaz.
//
// Kullanim:
//   SCENARIO=paid|reject|uncertain|notool|used|revoked [SLOW=1] \
//     OPERATOR_TOKEN=test PORT=4800 node server/dev-fixtures.js

import { createApp } from "./server.js";
import { createSerialQueue } from "./queue.js";
import { createBudget } from "./budget.js";
import { makeChain, makeModel, makeMandate, AGENT, PROVIDER, ATTACKER, VAULT } from "./test/fakes.js";

const SCENARIO = process.env.SCENARIO || "paid";
const SLOW = process.env.SLOW === "1";
const TOKEN = process.env.OPERATOR_TOKEN || "test";

const mandate = makeMandate({
  used: SCENARIO === "used",
  revoked: SCENARIO === "revoked",
  expiry: BigInt(Math.floor(Date.now() / 1000) + 3600),
});

const chain = makeChain({ mandate });

if (SCENARIO === "uncertain") {
  chain.waitForReceipt = async () => {
    throw new Error("makbuz zaman asimina ugradi");
  };
}
if (SLOW) {
  const send = chain.sendExecute;
  chain.sendExecute = async (c) => {
    await new Promise((r) => setTimeout(r, 6000));
    return send(c);
  };
}

const toolInput =
  SCENARIO === "notool"
    ? null
    : SCENARIO === "reject"
      ? { mandateId: "1", payee: ATTACKER, amount: "0.01" }
      : { mandateId: "1", payee: PROVIDER, amount: "0.01" };

const model = makeModel({
  toolInput,
  text: SCENARIO === "notour" ? null : null,
  delayMs: SLOW ? 2500 : 300,
});

const app = createApp({
  chain,
  model,
  queue: createSerialQueue(),
  budget: createBudget({ maxAttempts: 50, maxTotalGas: 9_000_000 }),
  config: {
    chainId: 10143,
    modelId: "claude-haiku-5-5",
    agentAddress: AGENT,
    attackerAddress: ATTACKER,
    payeeLabels: { [PROVIDER.toLowerCase()]: "Kayıtlı sağlayıcı" },
    gasRevertLimit: 60000,
    gasMultiplierNum: 12,
    gasMultiplierDen: 10,
    operatorToken: TOKEN,
    defaultMandateId: process.env.MANDATE_ID || null,
    fixtures: true,
  },
});

const port = Number(process.env.PORT ?? 4800);
app.listen(port, "127.0.0.1", () => {
  console.log(`SAHTE VERI sunucusu: http://127.0.0.1:${port}/?mandateId=1`);
  console.log(`senaryo=${SCENARIO} slow=${SLOW ? "evet" : "hayir"} kasa=${VAULT}`);
});
