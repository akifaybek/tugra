// Express uygulamasi. Butun bagimliliklar disaridan verilir; boylece
// gercek model/RPC olmadan test edilebilir.
//
// Bu asamada UI YOK - yalnizca JSON uclari.

import express from "express";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAttemptRunner, OUTCOME, MODE } from "./core.js";
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

  // Duz HTML/JS ekran. Derleme adimi yok.
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");
  app.use(express.static(publicDir));

  // Veri erisimi YALNIZCA dogrulanmis basarili odemeyle acilir.
  const unlocked = new Set(); // mandateId -> acildi

  // Kontrollu tekrar yolunun yeniden gonderebilecegi TEK sey: sunucunun
  // daha once GERCEKTEN gonderdigi ve basarili olan odeme cagrisi.
  // Boylece bu uc keyfi harcama ucuna donusemez.
  const lastPaidCall = new Map(); // mandateId -> {mandateId, payee, amount}

  const attempts = [];

  // ---------------------------------------------------------------------
  // Operator oturumu
  //
  // Uzun omurlu OPERATOR_TOKEN tarayiciya HIC gonderilmez. Operator token'i
  // bir kez gonderir, sunucu karsiliginda kisa omurlu bir OTURUM KIMLIGI
  // doner. Istemci bunu yalnizca bellekte (JS degiskeni) tutar; localStorage,
  // cerez, URL ve log kullanilmaz. Sayfa yenilenince oturum kaybolur.
  //
  // MODEL CAGRISI VEYA ZINCIR ISLEMI BASLATAN HER YOL bu oturumu ister -
  // `mode: "model"` dahil. Butonu gizlemek yeterli degildir.
  // ---------------------------------------------------------------------
  const sessions = new Map(); // oturumId -> sonGecerlilik (ms)
  const SESSION_TTL_MS = Number(config.sessionTtlMs ?? 2 * 60 * 60 * 1000);

  function sweepSessions(nowMs) {
    for (const [id, exp] of sessions) if (exp <= nowMs) sessions.delete(id);
  }

  function sameSecret(a, b) {
    const ba = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  }

  /** Oturum zorunlu. Gecersizse istek model ve zincire HIC dokunmadan biter. */
  function requireOperator(req, res, next) {
    if (!config.operatorToken) {
      return res.status(503).json({
        error: "operator girisi kapali",
        detail: "OPERATOR_TOKEN tanimli degil; model ve zincir yollari kullanilamaz.",
      });
    }
    const id = req.get("x-operator-session");
    const exp = id ? sessions.get(id) : undefined;
    if (!exp || exp <= now()) {
      if (id) sessions.delete(id);
      return res.status(401).json({ error: "operator oturumu gerekli" });
    }
    sessions.set(id, now() + SESSION_TTL_MS); // kullanimda uzat
    next();
  }

  app.post("/api/operator/login", (req, res) => {
    if (!config.operatorToken) {
      return res.status(503).json({ error: "operator girisi kapali" });
    }
    const given = req.body?.token;
    // Token hicbir yere YAZDIRILMAZ.
    if (typeof given !== "string" || !sameSecret(given, config.operatorToken)) {
      return res.status(401).json({ error: "token gecersiz" });
    }
    sweepSessions(now());
    const id = crypto.randomBytes(32).toString("base64url");
    sessions.set(id, now() + SESSION_TTL_MS);
    res.json({ session: id, expiresInMs: SESSION_TTL_MS });
  });

  app.post("/api/operator/logout", (req, res) => {
    const id = req.get("x-operator-session");
    if (id) sessions.delete(id);
    res.json({ ok: true });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, model: config.modelId, chainId: config.chainId });
  });

  app.get("/api/state", async (req, res) => {
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
    // Tek bir vekaletin zincirdeki durumu (salt okunur).
    // Oncelik: URL sorgusu > yapilandirilan varsayilan. Ikisi de yoksa null.
    // Istenen kimlik okunamazsa BASKA bir vekalete gecilmez; hata donulur.
    let mandate = null;
    const q = req.query.mandateId;
    const wanted = q !== undefined && q !== "" ? q : config.defaultMandateId;
    if (wanted !== undefined && wanted !== null && wanted !== "") {
      try {
        const m = await chain.getMandate(wanted);
        mandate = {
          id: m.id.toString(),
          agent: m.agent,
          payee: m.payee,
          payeeLabel: config.payeeLabels?.[m.payee.toLowerCase()] ?? null,
          amountMon: weiToMon(m.amount),
          expiry: m.expiry.toString(),
          used: m.used,
          revoked: m.revoked,
        };
      } catch (err) {
        mandate = {
          error: "vekalet okunamadi",
          requestedId: String(wanted),
          detail: err.shortMessage || err.message || "bilinmeyen hata",
        };
      }
    }

    res.json({
      chainId: config.chainId,
      scope: "Monad testnet - native MON",
      mandate,
      defaultMandateId: config.defaultMandateId ?? null,
      explorerBase: chain.explorerTx ? chain.explorerTx("").replace(/\/$/, "") : null,
      serverTime: new Date(now()).toISOString(),
      vaultAddress: chain.vaultAddress,
      agentAddress: chain.agentAddress,
      vaultBalanceMon: vault,
      agentBalanceMon: agent,
      queue: queue.state(),
      budget: budget.state(),
      unlockedMandates: [...unlocked],
      operatorLoginEnabled: Boolean(config.operatorToken),
      attackerAddress: config.attackerAddress ?? null,
      fixtures: Boolean(config.fixtures),
      replayableMandates: [...lastPaidCall.keys()],
      attempts: attempts.slice(-20),
      counters: countersFrom(attempts),
    });
  });

  app.post("/api/attempt", requireOperator, async (req, res) => {
    const { mandateId, untrusted, mode = MODE.MODEL, controlledCall } = req.body ?? {};
    if (mandateId === undefined || mandateId === null) {
      return res.status(400).json({ error: "mandateId gerekli" });
    }
    const known = [MODE.MODEL, MODE.CONTROLLED, MODE.CONTROLLED_REPEAT];
    if (!known.includes(mode)) {
      return res.status(400).json({ error: `mode su degerlerden biri olmali: ${known.join(", ")}` });
    }

    // Oturum yukaridaki requireOperator ile zaten dogrulandi; buradan
    // sonrasi yalnizca mod'a ozgu kontroller. Normal akis (mode === "model")
    // kontrollu yollara asla gecemez; kullanilabilir vekalet kontrolu orada
    // her zaman uygulanir.
    let replayCall = null;
    if (mode !== MODE.MODEL) {
      if (mode === MODE.CONTROLLED && !controlledCall) {
        return res.status(400).json({ error: "kontrollu testte controlledCall gerekli" });
      }
      if (mode === MODE.CONTROLLED_REPEAT) {
        replayCall = lastPaidCall.get(String(mandateId)) ?? null;
        if (!replayCall) {
          return res.status(400).json({
            error: "kontrollu tekrar icin bu vekaletle daha once BASARILI bir odeme kaydi yok",
            detail:
              "Bu yol yalnizca sunucunun daha once gonderdigi odemeyi ayni parametrelerle " +
              "yeniden gonderir; istek govdesinden parametre almaz.",
          });
        }
      }
    }

    let result;
    try {
      result = await runner.run({ mandateId, untrusted, mode, controlledCall, replayCall });
    } catch (err) {
      return res.status(500).json({ error: "deneme calistirilamadi", detail: err.message });
    }

    if (result.outcome === OUTCOME.PAID) {
      unlocked.add(String(mandateId));
      // Kontrollu tekrarin yeniden gonderebilmesi icin gercekten gonderilmis
      // cagriyi sakla. Yalnizca basarili odeme kaydedilir.
      if (result.requested) {
        lastPaidCall.set(String(mandateId), {
          mandateId: result.requested.mandateId,
          payee: result.requested.payee,
          amount: result.requested.amountMon,
        });
      }
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
    preflightBlocked: 0,
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
    else if (a.outcome === OUTCOME.PREFLIGHT_BLOCKED) c.preflightBlocked += 1;
  }
  return c;
}
