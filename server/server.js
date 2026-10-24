// Express uygulamasi. Butun bagimliliklar disaridan verilir; boylece
// gercek model/RPC olmadan test edilebilir.
//
// Bu asamada UI YOK - yalnizca JSON uclari.

import express from "express";
import { createAttemptRunner, OUTCOME } from "./core.js";
import { weiToMon } from "./units.js";

/** Basarili yetkili odemeden SONRA acilan ornek veri. */
export const SAMPLE_DATA = {
  dataset: "Kurgusal Pazar Verisi - Q3 2026",
  note: "Demo amacli kurgusal veridir; gercek bir saglayiciya ait degildir.",
  rows: [
    { segment: "A", units: 1240, trend: "+4.2%" },
    { segment: "B", units: 880, trend: "-1.1%" },
    { segment: "C", units: 2310, trend: "+9.7%" },
  ],
};

export function createApp({ chain, model, queue, config, budget, now = Date.now }) {
  const runner = createAttemptRunner({ chain, model, queue, config, budget, now });
  const app = express();
  app.use(express.json({ limit: "32kb" }));

  // Veri erisimi YALNIZCA dogrulanmis basarili odemeyle acilir.
  const unlocked = new Set(); // mandateId -> acildi

  const attempts = [];

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, model: config.modelId, chainId: config.chainId });
  });

  app.get("/api/state", async (_req, res) => {
    let vault = null;
    let agent = null;
    try {
      vault = weiToMon(await chain.vaultBalance());
      agent = weiToMon(await chain.agentBalance());
    } catch (err) {
      // Bakiye okunamazsa durum yine donulur; alanlar null kalir.
      vault = null;
      agent = null;
    }
    res.json({
      chainId: config.chainId,
      scope: "Monad testnet - native MON",
      vaultAddress: chain.vaultAddress,
      agentAddress: chain.agentAddress,
      vaultBalanceMon: vault,
      agentBalanceMon: agent,
      queue: queue.state(),
      budget: budget.state(),
      unlockedMandates: [...unlocked],
      attempts: attempts.slice(-20),
      counters: countersFrom(attempts),
    });
  });

  app.post("/api/attempt", async (req, res) => {
    const { mandateId, untrusted, mode, controlledCall } = req.body ?? {};
    if (mandateId === undefined || mandateId === null) {
      return res.status(400).json({ error: "mandateId gerekli" });
    }
    if (mode && mode !== "model" && mode !== "controlled") {
      return res.status(400).json({ error: 'mode "model" veya "controlled" olmali' });
    }
    if (mode === "controlled" && !controlledCall) {
      return res.status(400).json({ error: "kontrollu testte controlledCall gerekli" });
    }

    let result;
    try {
      result = await runner.run({ mandateId, untrusted, mode, controlledCall });
    } catch (err) {
      return res.status(500).json({ error: "deneme calistirilamadi", detail: err.message });
    }

    if (result.outcome === OUTCOME.PAID) {
      unlocked.add(String(mandateId));
    }

    const record = {
      at: new Date(now()).toISOString(),
      mandateId: String(mandateId),
      ...result,
      explorer: result.txHash ? chain.explorerTx(result.txHash) : null,
    };
    attempts.push(record);
    res.json(record);
  });

  app.get("/api/data", (req, res) => {
    const mandateId = String(req.query.mandateId ?? "");
    if (!unlocked.has(mandateId)) {
      return res.status(403).json({
        error: "veri kapali",
        detail:
          "Ornek veri yalnizca dogrulanmis basarili yetkili odemeden sonra acilir.",
      });
    }
    res.json(SAMPLE_DATA);
  });

  return app;
}

function countersFrom(attempts) {
  const c = {
    paid: 0,
    rejectedOnChain: 0,
    simulated: 0,
    noToolCall: 0,
    invalidToolCall: 0,
    uncertain: 0,
    modelError: 0,
    mandateUnusable: 0,
  };
  for (const a of attempts) {
    if (a.outcome === OUTCOME.PAID) c.paid += 1;
    else if (a.outcome === OUTCOME.REJECTED_ON_CHAIN) c.rejectedOnChain += 1;
    else if (a.outcome === OUTCOME.BUDGET_EXCEEDED) c.simulated += 1;
    else if (a.outcome === OUTCOME.NO_TOOL_CALL) c.noToolCall += 1;
    else if (a.outcome === OUTCOME.INVALID_TOOL_CALL) c.invalidToolCall += 1;
    else if (a.outcome === OUTCOME.UNCERTAIN) c.uncertain += 1;
    else if (a.outcome === OUTCOME.MODEL_ERROR) c.modelError += 1;
    else if (a.outcome === OUTCOME.MANDATE_UNUSABLE) c.mandateUnusable += 1;
  }
  return c;
}
