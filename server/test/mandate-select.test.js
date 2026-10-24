// Vekalet secimi: yapilandirilan varsayilan, URL onceligi ve gecersiz kimlik.
// Gercek model/RPC yok; sahte bagimliliklar kullanilir.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createApp } from "../server.js";
import { createSerialQueue } from "../queue.js";
import { makeChain, makeModel, makeConfig, makeBudget, makeMandate, PROVIDER } from "./fakes.js";

async function withServer({ chain, config }, fn) {
  const app = createApp({
    chain,
    model: makeModel(),
    queue: createSerialQueue(),
    config,
    budget: makeBudget(),
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const state = (base, q = "") => fetch(`${base}/api/state${q}`).then((r) => r.json());

// Zincirde yalnizca #2 var (canli durumla ayni: tukenmis vekalet).
const chainWith2 = () =>
  makeChain({ mandate: makeMandate({ id: 2n, used: true }) });

test("varsayilan yok: parametresiz istekte vekalet secilmez", async () => {
  const chain = chainWith2();
  await withServer({ chain, config: makeConfig() }, async (base) => {
    const s = await state(base);
    assert.equal(s.mandate, null);
    assert.equal(s.defaultMandateId, null);
    assert.equal(chain.calls.getMandate, 0, "zincir bosuna okunmamali");
  });
});

test("yapilandirilan varsayilan: parametresiz istek #2'yi zincirden okur", async () => {
  const chain = chainWith2();
  const config = makeConfig({ defaultMandateId: "2" });
  await withServer({ chain, config }, async (base) => {
    const s = await state(base);
    assert.equal(s.defaultMandateId, "2");
    assert.ok(s.mandate, "vekalet donmeli");
    assert.equal(s.mandate.id, "2");
    assert.equal(s.mandate.used, true, "Kullanildi olarak gorunmeli");
    assert.equal(s.mandate.payee.toLowerCase(), PROVIDER.toLowerCase());
    assert.equal(chain.calls.lastRequestedId, "2");
  });
});

test("URL onceligi: sorgu varsayilani EZER", async () => {
  // Zincirde #7 var, varsayilan #2 yapilandirilmis.
  const chain = makeChain({ mandate: makeMandate({ id: 7n }) });
  const config = makeConfig({ defaultMandateId: "2" });
  await withServer({ chain, config }, async (base) => {
    const s = await state(base, "?mandateId=7");
    assert.equal(chain.calls.lastRequestedId, "7", "sorgudaki kimlik kullanilmali");
    assert.equal(s.mandate.id, "7");
  });
});

test("gecersiz kimlik: sessizce baska vekalete GECILMEZ, acik hata doner", async () => {
  const chain = chainWith2();
  const config = makeConfig({ defaultMandateId: "2" });
  await withServer({ chain, config }, async (base) => {
    const s = await state(base, "?mandateId=99");

    assert.ok(s.mandate, "hata nesnesi donmeli");
    assert.equal(s.mandate.error, "vekalet okunamadi");
    assert.equal(s.mandate.requestedId, "99");
    assert.match(s.mandate.detail, /UnknownMandate/);

    // Kritik: varsayilan #2'ye DUSULMEMELI.
    assert.equal(s.mandate.id, undefined, "baska vekaletin alanlari donmemeli");
    assert.equal(s.mandate.payee, undefined);
    assert.equal(chain.calls.lastRequestedId, "99", "yalnizca istenen kimlik denenmeli");
  });
});

test("varsayilan gecersizse de baska vekalete gecilmez", async () => {
  const chain = chainWith2();
  const config = makeConfig({ defaultMandateId: "404" });
  await withServer({ chain, config }, async (base) => {
    const s = await state(base);
    assert.equal(s.mandate.error, "vekalet okunamadi");
    assert.equal(s.mandate.requestedId, "404");
    assert.equal(s.mandate.id, undefined);
  });
});

test("bos sorgu parametresi varsayilana duser", async () => {
  const chain = chainWith2();
  const config = makeConfig({ defaultMandateId: "2" });
  await withServer({ chain, config }, async (base) => {
    const s = await state(base, "?mandateId=");
    assert.equal(s.mandate.id, "2");
    assert.equal(chain.calls.lastRequestedId, "2");
  });
});
