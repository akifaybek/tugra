// HTTP katmani testleri. Gercek model/RPC yok, dinlenen port gercek ama
// yerel ve test bitince kapatiliyor.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../server.js";
import { createSerialQueue } from "../queue.js";
import { makeChain, makeModel, makeConfig, makeBudget, PROVIDER, ATTACKER } from "./fakes.js";

async function withServer({ chain, model, budget = makeBudget() }, fn) {
  const app = createApp({
    chain,
    model,
    queue: createSerialQueue(),
    config: makeConfig(),
    budget,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const legit = { mandateId: "1", payee: PROVIDER, amount: "0.01" };

test("saglikli acilis ve durum ucu", async () => {
  await withServer({ chain: makeChain(), model: makeModel() }, async (base) => {
    const h = await (await fetch(`${base}/api/health`)).json();
    assert.equal(h.ok, true);
    assert.equal(h.model, "claude-haiku-5-5");
    assert.equal(h.chainId, 10143);

    const s = await (await fetch(`${base}/api/state`)).json();
    assert.equal(s.vaultBalanceMon, "0.04");
    assert.equal(s.queue.inMemoryOnly, true, "kuyrugun bellekte oldugu disari bildirilmeli");
    assert.match(s.queue.note, /yeniden baslatmada/);
  });
});

test("veri yalnizca basarili odemeden SONRA acilir", async () => {
  await withServer({ chain: makeChain(), model: makeModel({ toolInput: legit }) }, async (base) => {
    // Once kapali
    const before = await fetch(`${base}/api/data?mandateId=1`);
    assert.equal(before.status, 403);

    const r = await (
      await fetch(`${base}/api/attempt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mandateId: "1" }),
      })
    ).json();
    assert.equal(r.outcome, "paid");
    assert.ok(r.explorer.includes(r.txHash));

    const after = await fetch(`${base}/api/data?mandateId=1`);
    assert.equal(after.status, 200);
    const data = await after.json();
    assert.match(data.note, /kurgusal/i);
  });
});

test("reddedilen odemeden sonra veri KAPALI kalir", async () => {
  const attack = { mandateId: "1", payee: ATTACKER, amount: "0.01" };
  await withServer(
    { chain: makeChain(), model: makeModel({ toolInput: attack }) },
    async (base) => {
      const r = await (
        await fetch(`${base}/api/attempt`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mandateId: "1", untrusted: { audienceNote: "saldiri" } }),
        })
      ).json();
      assert.equal(r.outcome, "rejected_on_chain");
      assert.equal(r.revert.name, "PayeeMismatch");

      const d = await fetch(`${base}/api/data?mandateId=1`);
      assert.equal(d.status, 403);
    },
  );
});

test("belirsiz makbuzdan sonra veri KAPALI kalir", async () => {
  const chain = makeChain();
  chain.waitForReceipt = async () => {
    throw new Error("timeout");
  };
  await withServer({ chain, model: makeModel({ toolInput: legit }) }, async (base) => {
    const r = await (
      await fetch(`${base}/api/attempt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mandateId: "1" }),
      })
    ).json();
    assert.equal(r.outcome, "uncertain");

    const d = await fetch(`${base}/api/data?mandateId=1`);
    assert.equal(d.status, 403);
  });
});

test("ayni ajandan es zamanli istekler SIRAYA alinir", async () => {
  const chain = makeChain();
  const order = [];
  const originalSend = chain.sendExecute;
  let n = 0;
  chain.sendExecute = async (call) => {
    const id = ++n;
    order.push(`start${id}`);
    await new Promise((r) => setTimeout(r, 15));
    order.push(`end${id}`);
    return originalSend(call);
  };
  // Vekalet hep kullanilabilir kalsin ki iki deneme de zincire gitsin.
  chain.getMandate = async () => ({
    id: 1n,
    agent: makeConfig().agentAddress,
    expiry: 2_000_000_000n,
    used: false,
    revoked: false,
    payee: PROVIDER,
    amount: 10_000_000_000_000_000n,
  });

  await withServer({ chain, model: makeModel({ toolInput: legit }) }, async (base) => {
    const post = () =>
      fetch(`${base}/api/attempt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mandateId: "1" }),
      }).then((r) => r.json());

    await Promise.all([post(), post()]);
    // Seri olmali: start1,end1,start2,end2 - ic ice gecmemeli.
    assert.deepEqual(order, ["start1", "end1", "start2", "end2"]);
  });
});

test("gecersiz istek gövdeleri reddedilir", async () => {
  await withServer({ chain: makeChain(), model: makeModel() }, async (base) => {
    const noId = await fetch(`${base}/api/attempt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(noId.status, 400);

    const badMode = await fetch(`${base}/api/attempt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mandateId: "1", mode: "sihir" }),
    });
    assert.equal(badMode.status, 400);

    const noCall = await fetch(`${base}/api/attempt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mandateId: "1", mode: "controlled" }),
    });
    assert.equal(noCall.status, 400);
  });
});
