// Tugra - masaustu islem ekrani.
// Duz JS, derleme yok. Butun degerler /api/state ve /api/attempt'ten gelir;
// hicbir tarih, bakiye, sure, sayac veya hash sabit yazilmaz.

const $ = (id) => document.getElementById(id);

// Operator oturumu YALNIZCA bellekte. localStorage, cerez, URL ve log yok.
// Sayfa yenilenince kaybolur ve yeniden giris gerekir.
let session = null;

let mandateId = new URLSearchParams(location.search).get("mandateId") || "";
let busy = false;
let last = null;

// ------------------------------------------------------------------ yardim

function fmtMon(v) {
  return v === null || v === undefined ? "—" : `${String(v).replace(".", ",")} MON`;
}

function shortHash(h) {
  return h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "";
}

function fmtMs(ms) {
  return typeof ms === "number" ? `${ms.toLocaleString("tr-TR")} ms` : "—";
}

function fmtWhen(unixSeconds) {
  const d = new Date(Number(unixSeconds) * 1000);
  return d.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

function remaining(unixSeconds, nowMs) {
  const left = Number(unixSeconds) * 1000 - nowMs;
  if (left <= 0) return "süresi doldu";
  const m = Math.floor(left / 60000);
  if (m < 60) return `${m} dk kaldı`;
  return `${Math.floor(m / 60)} sa ${m % 60} dk kaldı`;
}

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body) headers["content-type"] = "application/json";
  if (session) headers["x-operator-session"] = session;
  const res = await fetch(path, { ...opts, headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, ok: res.ok, body };
}

// ------------------------------------------------------------------- giris

async function login() {
  const input = $("tokenInput");
  const token = input.value;
  $("loginErr").textContent = "";
  if (!token) {
    $("loginErr").textContent = "Belirteç girin.";
    return;
  }
  const r = await api("/api/operator/login", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  // Belirteci hemen alandan sil; hicbir yerde saklanmaz.
  input.value = "";
  if (!r.ok) {
    $("loginErr").textContent =
      r.status === 503 ? "Operatör girişi kapalı (sunucuda belirteç tanımlı değil)." : "Belirteç geçersiz.";
    return;
  }
  session = r.body.session;
  $("sessionState").textContent = "Oturum açık";
  $("loginBand").hidden = true; // ekran demo akisina yer acar
  refreshControls();
}

async function logout() {
  await api("/api/operator/logout", { method: "POST" });
  session = null;
  $("sessionState").textContent = "Oturum kapalı";
  $("loginBand").hidden = false;
  $("tokenInput").value = "";
  refreshControls();
}

function refreshControls() {
  const can = Boolean(session) && !busy && Boolean(mandateId);
  $("runModel").disabled = !can;
  $("runControlled").disabled = !can;
  $("runRepeat").disabled = !can || !(last && last.replayable);
  $("controlHint").textContent = !session
    ? "Giriş yapılana dek sunucu bu yolların hiçbirini kabul etmez."
    : !mandateId
      ? "Vekâlet numarası yok. Adrese ?mandateId=… ekleyin."
      : busy
        ? "Deneme sürüyor. Sonuç zincirde kesinleşene dek yeni gönderim yok."
        : "Kontrollü yollar model çağırmaz; sonuç ayrı etiketlenir.";
}

// ------------------------------------------------------------------- belge

function paintMandate(m, serverTimeMs) {
  const raw = $("mandateRaw");
  if (!m || m.error) {
    $("docId").textContent = mandateId ? `#${mandateId}` : "—";
    $("payeeLabel").textContent = "—";
    $("amount").textContent = "—";
    $("expiry").innerHTML = '—<span class="sub" id="expiryLeft"></span>';
    $("docState").hidden = true;
    $("seal").hidden = true;
    $("sealCap").textContent = "";
    raw.innerHTML = m && m.error ? "<dt>durum</dt><dd>vekâlet okunamadı</dd>" : "";
    return;
  }

  $("docId").textContent = `#${m.id}`;
  $("payeeLabel").textContent = m.payeeLabel || "Kayıtlı alıcı";
  $("amount").textContent = fmtMon(m.amountMon);

  const expired = Number(m.expiry) * 1000 <= serverTimeMs;
  $("expiry").innerHTML =
    `${fmtWhen(m.expiry)}<span class="sub">${remaining(m.expiry, serverTimeMs)}</span>`;

  const st = $("docState");
  st.hidden = false;
  if (m.used) {
    st.textContent = "Kullanıldı";
    st.dataset.k = "used";
  } else if (m.revoked) {
    st.textContent = "İptal edildi";
    st.dataset.k = "revoked";
  } else if (expired) {
    st.textContent = "Süresi doldu";
    st.dataset.k = "expired";
  } else {
    st.textContent = "Geçerli";
    st.dataset.k = "valid";
  }

  // Ham adresler ve zaman damgalari ayrintida.
  raw.innerHTML =
    `<dt>alıcı</dt><dd>${m.payee}</dd>` +
    `<dt>ajan</dt><dd>${m.agent}</dd>` +
    `<dt>expiry</dt><dd>${m.expiry}</dd>` +
    `<dt>used / revoked</dt><dd>${m.used} / ${m.revoked}</dd>`;

  // Muhur yalnizca vekalet zincirden okunabildiginde gorunur.
  // Tukenmis, iptal edilmis veya suresi dolmus vekalette uzeri cizilir.
  const seal = $("seal");
  const void_ = Boolean(m.used) || Boolean(m.revoked) || expired;
  seal.hidden = false;
  seal.classList.add("stamped");
  seal.classList.toggle("cancelled", void_);
  $("sealCap").textContent = m.used
    ? "Kullanıldı"
    : m.revoked
      ? "İptal edildi"
      : expired
        ? "Süresi doldu"
        : "Vekâlete tuğra basıldı";
}

// ------------------------------------------------------------------ deneme

const SOURCE = {
  "Gercek model karari": ["model", "GERÇEK MODEL KARARI"],
  "Kontrollu test": ["controlled", "KONTROLLÜ TEST"],
  "Kontrollu test - tekrar odeme": ["controlled", "KONTROLLÜ TEST · TEKRAR ÖDEME"],
  Simulasyon: ["sim", "SİMÜLASYON"],
};

/** Gozlenen cagriyi anlatir. Modelin ic muhakemesi hakkinda iddia YOK. */
function observedLine(r) {
  if (r.outcome === "no_tool_call") return "Model ödeme aracını çağırmadı.";
  if (r.outcome === "invalid_tool_call") return `Çağrı biçimsel olarak geçersiz: ${r.reason}`;
  if (r.outcome === "mandate_unusable") return `Deneme başlamadı: ${r.reason}`;
  if (r.outcome === "budget_exceeded") return `Bütçe doldu: ${r.reason}`;
  if (r.outcome === "model_error") return r.reason;
  if (!r.requested) return r.reason || "—";
  return r.matchesMandate
    ? "İstenen ödeme vekâletle eşleşiyor."
    : "İstenen ödeme vekâletle eşleşmiyor.";
}

function paintCall(r) {
  const badge = $("sourceBadge");
  const src = SOURCE[r.label];
  if (src) {
    badge.hidden = false;
    badge.dataset.k = src[0];
    $("sourceText").textContent = src[1];
  } else {
    badge.hidden = true;
  }

  const ct = $("callText");
  ct.classList.toggle("idle", !r.requested);
  if (r.requested) {
    const known = r.matchesMandate;
    ct.innerHTML =
      `${fmtMon(r.requested.amountMon)}<span class="arrow">→</span>` +
      (known
        ? "Kayıtlı sağlayıcı"
        : '<span class="unknown">Bilinmeyen adres</span>') +
      `<span class="arrow">·</span>Vekâlet #${r.requested.mandateId}`;
  } else {
    ct.textContent = "Ödeme çağrısı üretilmedi";
  }
  $("observedText").textContent = observedLine(r);
}

function paintResult(r) {
  const chip = $("resultChip");
  const band = $("resultBand");
  band.classList.remove("is-waiting", "is-reject", "is-unknown");
  $("progress").hidden = true;

  let note = "";
  if (r.outcome === "paid") {
    chip.dataset.k = "ok";
    chip.textContent = "Ödendi";
    note = "Makbuz doğrulandı.";
  } else if (r.outcome === "rejected_on_chain") {
    chip.dataset.k = "reject";
    chip.textContent = "Tuğra dışı ödeme reddedildi";
    band.classList.add("is-reject");
    note = r.revert?.name
      ? `Kontrat ${r.revert.name} ile reddetti.`
      : "Kontrat reddetti; sebep çözülemedi.";
  } else if (r.outcome === "uncertain" || r.outcome === "preflight_blocked") {
    chip.dataset.k = "unknown";
    chip.textContent = "Belirsiz";
    band.classList.add("is-unknown");
    note = "Veri açılmadı, otomatik tekrar yok.";
  } else if (r.outcome === "budget_exceeded") {
    chip.dataset.k = "unknown";
    chip.textContent = "Simülasyon";
    note = "Zincire gönderilmedi.";
  } else {
    chip.dataset.k = "idle";
    chip.textContent = "Zincire gidilmedi";
    note = "";
  }
  $("resultNote").textContent = note;

  // Hash, gas ve teknik gerekce ayrintida.
  const rows = [];
  if (r.txHash) {
    rows.push(["tx", `<a href="${r.explorer}" target="_blank" rel="noopener">${r.txHash}</a>`]);
  }
  if (r.gasUsed) rows.push(["gasUsed", Number(r.gasUsed).toLocaleString("tr-TR")]);
  if (r.gasLimit) rows.push(["gasLimit", Number(r.gasLimit).toLocaleString("tr-TR")]);
  if (r.preflight) rows.push(["preflight", r.preflight + (r.preflightError ? ` · ${r.preflightError}` : "")]);
  if (r.revert?.selector) rows.push(["revert", `${r.revert.name ?? "?"} ${r.revert.selector}`]);
  if (r.reason) rows.push(["gerekçe", r.reason]);
  if (r.detail) rows.push(["not", r.detail]);
  if (r.modelText) rows.push(["model metni", r.modelText]);

  const det = $("resultDetail");
  det.hidden = rows.length === 0;
  $("resultRaw").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");

  $("tModel").textContent = fmtMs(r.timings?.modelMs);
  $("tChain").textContent = fmtMs(r.timings?.chainMs);
}

function paintWaiting(labelText) {
  busy = true;
  refreshControls();
  const badge = $("sourceBadge");
  badge.hidden = false;
  const src = SOURCE[labelText] || ["model", labelText];
  badge.dataset.k = src[0];
  $("sourceText").textContent = src[1];
  $("callText").textContent = "—";
  $("observedText").textContent = "Çağrı bekleniyor.";

  const chip = $("resultChip");
  chip.dataset.k = "wait";
  chip.textContent = "Beklemede";
  $("resultBand").classList.remove("is-reject", "is-unknown");
  $("resultBand").classList.add("is-waiting");
  $("resultDetail").hidden = true;
  $("resultNote").textContent = "Zincirde kesinleşmedi. Bu sonuç başarı değildir.";
  $("progress").hidden = false;
}

async function run(mode) {
  if (!session || busy || !mandateId) return;
  const labels = {
    model: "Gercek model karari",
    controlled: "Kontrollu test",
    controlled_repeat: "Kontrollu test - tekrar odeme",
  };
  paintWaiting(labels[mode]);

  const body = {
    mandateId,
    mode,
    untrusted: {
      providerDescription: $("providerDesc").value,
      audienceNote: $("audienceNote").value,
    },
  };
  if (mode === "controlled") {
    // Kontrollu testte cagri operator tarafindan ELLE uretilir; model karari degildir.
    const st = await api(`/api/state?mandateId=${encodeURIComponent(mandateId)}`);
    const m = st.body?.mandate;
    const attacker = st.body?.attackerAddress;
    if (!attacker) {
      // Dogru aliciya SESSIZCE dusmeyiz; o zaman test anlamini yitirirdi.
      busy = false;
      $("progress").hidden = true;
      $("resultBand").classList.remove("is-waiting");
      $("resultChip").dataset.k = "unknown";
      $("resultChip").textContent = "Yapılandırma eksik";
      $("resultNote").textContent =
        "ATTACKER_ADDRESS tanımlı değil; kontrollü test çalıştırılamaz.";
      refreshControls();
      return;
    }
    body.controlledCall = {
      mandateId: String(mandateId),
      payee: attacker,
      amount: m ? m.amountMon : "0",
    };
  }

  const r = await api("/api/attempt", { method: "POST", body: JSON.stringify(body) });
  busy = false;

  if (!r.ok) {
    const chip = $("resultChip");
    chip.dataset.k = "unknown";
    chip.textContent = r.status === 401 ? "Oturum gerekli" : "İstek reddedildi";
    $("progress").hidden = true;
    $("resultBand").classList.remove("is-waiting");
    $("resultDetail").hidden = true;
    $("resultNote").textContent = r.body?.error || `HTTP ${r.status}`;
    if (r.status === 401) await logout();
    refreshControls();
    return;
  }

  paintCall(r.body);
  paintResult(r.body);
  await refreshState();
  refreshControls();
}

// -------------------------------------------------------------------- veri

async function refreshData() {
  if (!mandateId) return;
  const r = await api(`/api/data?mandateId=${encodeURIComponent(mandateId)}`);
  if (r.ok && r.body?.rows) {
    $("dataLocked").hidden = true;
    const rows = $("dataRows");
    rows.hidden = false;
    rows.innerHTML = r.body.rows
      .map((x) => `<span>${x.segment} <b>${x.units.toLocaleString("tr-TR")}</b> ${x.trend}</span>`)
      .join("");
  } else {
    $("dataLocked").hidden = false;
    $("dataRows").hidden = true;
  }
}

// ------------------------------------------------------------------- durum

function paintHistory(attempts) {
  const list = $("historyList");
  if (!attempts || attempts.length === 0) {
    list.innerHTML = '<li class="empty">Kayıt yok.</li>';
    return;
  }
  list.innerHTML = attempts
    .slice()
    .reverse()
    .map((a) => {
      const src = SOURCE[a.label]?.[1] || a.label;
      const t = new Date(a.at).toLocaleTimeString("tr-TR");
      const hash = a.txHash ? `<span class="k">${shortHash(a.txHash)}</span>` : "";
      return `<li><span class="k">${t}</span><span>${src}</span><span>${a.outcome}</span>${hash}</li>`;
    })
    .join("");
}

async function refreshState() {
  const q = mandateId ? `?mandateId=${encodeURIComponent(mandateId)}` : "";
  const r = await api(`/api/state${q}`);
  if (!r.ok || !r.body) return;
  const s = r.body;

  $("vaultBal").textContent = fmtMon(s.vaultBalanceMon);
  $("fixtureBanner").hidden = !s.fixtures;
  $("scope").textContent = `chainId ${s.chainId}`;

  paintMandate(s.mandate, Date.parse(s.serverTime) || Date.now());

  const c = s.counters || {};
  $("cRevert").textContent = c.rejectedOnChain ?? 0;
  $("cSim").textContent = c.simulated ?? 0;
  $("cUnknown").textContent = (c.uncertain ?? 0) + (c.preflightBlocked ?? 0);

  paintHistory(s.attempts);
  last = { replayable: (s.replayableMandates || []).includes(String(mandateId)) };

  if (!session && s.operatorLoginEnabled === false) {
    $("loginErr").textContent = "Sunucuda operatör belirteci tanımlı değil.";
  }
  await refreshData();
  refreshControls();
}

// -------------------------------------------------------------------- baglama

$("loginBtn").addEventListener("click", login);
$("tokenInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
$("runModel").addEventListener("click", () => run("model"));
$("runControlled").addEventListener("click", () => run("controlled"));
$("runRepeat").addEventListener("click", () => run("controlled_repeat"));

refreshState();
setInterval(() => {
  if (!busy) refreshState();
}, 4000);
