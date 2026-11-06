import { STORE, OFFERS, SHIPPING, BUMPS } from "./config.js";

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const brl = (c) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const digits = (v) => String(v ?? "").replace(/\D/g, "");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const maskCPF = (v) => digits(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const maskPhone = (v) => {
  const d = digits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return d.replace(/(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d)/, "$1-$2");
};
const maskCEP = (v) => digits(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");
function isValidCPF(value) {
  const c = digits(value);
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(c[9]) && calc(10) === parseInt(c[10]);
}

/* ---------- oferta (vem da página do produto) ---------- */
function resolveOfferId() {
  const q = new URLSearchParams(location.search);
  const p = q.get("p");
  if (p === "luminaria") {
    const n = parseInt(q.get("qtd") || "1", 10);
    return "luminaria-" + ([1, 2, 3, 4].includes(n) ? n : 1);
  }
  return p === "ferramenta" ? "ferramenta" : null;
}
const offerId = resolveOfferId();
if (!offerId || !OFFERS[offerId]) { location.replace("/"); throw new Error("sem produto"); }
const offer = OFFERS[offerId];

/* ---------- estado ---------- */
const S = {
  stage: 1, view: "form", method: "pix",
  shipping: "correios", bumps: [],
  cardCfg: null, cardReady: false, els: null,
  pix: null, waitId: "", paidAmount: null, paidWith: "pix", loading: false,
};
const FIELDS = ["cep", "street", "number", "complement", "neighborhood", "city", "state", "name", "email", "cpf", "phone"];
const val = (k) => $("#" + k).value;
const ship = () => SHIPPING[S.shipping];
const bumpsCents = () => S.bumps.reduce((t, b) => t + BUMPS[b].priceCents, 0);
const totalCents = () => offer.priceCents + ship().priceCents + bumpsCents();
const cepOk = () => digits(val("cep")).length === 8;

/* ---------- telas ---------- */
function showView(name) {
  S.view = name;
  $$("[data-view]").forEach((el) => (el.hidden = el.dataset.view !== name));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- resumo do pedido ---------- */
function renderSummary() {
  const html = `
    <h2>Seu pedido</h2>
    <div class="sprod"><img src="${esc(offer.img)}" alt=""><div><b>${esc(offer.name)}</b><span class="mut small">${esc(offer.short)}</span></div></div>
    <dl>
      <div><dt>Subtotal</dt><dd>${brl(offer.priceCents)}</dd></div>
      ${S.bumps.map((b) => `<div><dt>${esc(BUMPS[b].title.replace("Leve também ", ""))}</dt><dd>${brl(BUMPS[b].priceCents)}</dd></div>`).join("")}
      <div><dt>Frete (${esc(ship().name)})</dt><dd class="${ship().priceCents ? "" : "free"}">${ship().priceCents ? brl(ship().priceCents) : "Grátis"}</dd></div>
      <div class="tot"><dt>Total</dt><dd>${brl(totalCents())}</dd></div>
    </dl>
    <p class="snote"><svg class="ic"><use href="#i-lock"/></svg><span>Pagamento seguro. Frete grátis pelos Correios para todo o Brasil.</span></p>`;
  $$("[data-summary]").forEach((el) => (el.innerHTML = html));
  updateButton();
}

function updateButton() {
  const b = $("#next");
  if (S.stage !== 3) b.textContent = "Continuar";
  else if (S.method === "card" && S.cardCfg) b.textContent = S.loading ? "Processando…" : `Pagar ${brl(totalCents())} no cartão`;
  else b.textContent = S.loading ? "Gerando PIX…" : `Pagar ${brl(totalCents())} com PIX`;
  b.disabled = S.loading;
}

/* ---------- cronômetro (apenas visual) ---------- */
const timerEnd = Date.now() + 10 * 60 * 1000;
function tick() {
  const total = Math.ceil(Math.max(0, timerEnd - Date.now()) / 1000);
  $("#tm").textContent = String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
}
tick(); setInterval(tick, 250);

/* ---------- pixels ---------- */
const pixelBase = (cents) => ({ content_name: offer.name, content_type: "product", num_items: offer.qty, value: cents / 100, currency: "BRL" });
const ttqContents = (cents) => ({
  content_type: "product",
  contents: [{ content_id: offerId, content_name: offer.name, quantity: 1, price: cents / 100 }],
  value: cents / 100, currency: "BRL",
});
function trackInitiate() {
  window.fbq?.("track", "InitiateCheckout", pixelBase(offer.priceCents));
  window.ttq?.track("InitiateCheckout", ttqContents(offer.priceCents));
}
let purchaseSent = false;
function trackPurchase(cents) {
  if (purchaseSent) return; purchaseSent = true;
  // eventID igual ao enviado pelo servidor (Conversions API) para o Meta não contar 2x
  window.fbq?.("track", "Purchase", pixelBase(cents), { eventID: "purchase_" + (S.waitId || offerId) });
  window.ttq?.track("CompletePayment", ttqContents(cents)); // CompletePayment = compra no TikTok
}
function trackPaymentInfo(cents) {
  window.fbq?.("track", "AddPaymentInfo", pixelBase(cents));
  window.ttq?.track("AddPaymentInfo", ttqContents(cents));
}
trackInitiate();

/* ---------- campos, máscaras e validação ---------- */
const masks = { cpf: maskCPF, phone: maskPhone, cep: maskCEP, state: (v) => v.toUpperCase().slice(0, 2) };
FIELDS.forEach((k) => {
  $("#" + k).addEventListener("input", (e) => {
    if (masks[k]) e.target.value = masks[k](e.target.value);
    setError(k, "");
    if (k === "cep") onCep();
  });
});
function setError(k, msg) {
  const f = $("#" + k).closest(".f");
  f.classList.toggle("bad", !!msg);
  $(".e", f).textContent = msg;
}
const STAGE_KEYS = { 1: ["cep", "street", "number", "neighborhood", "city", "state"], 2: ["name", "email", "cpf", "phone"] };
function validate(st) {
  const all = {};
  if (val("name").trim().split(/\s+/).length < 2) all.name = "Informe nome e sobrenome";
  if (!/^\S+@\S+\.\S+$/.test(val("email"))) all.email = "E-mail inválido";
  if (!isValidCPF(val("cpf"))) all.cpf = "CPF inválido";
  if (digits(val("phone")).length < 10) all.phone = "Telefone inválido";
  if (!cepOk()) all.cep = "CEP inválido";
  if (!val("street").trim()) all.street = "Obrigatório";
  if (!val("number").trim()) all.number = "Obrigatório";
  if (!val("neighborhood").trim()) all.neighborhood = "Obrigatório";
  if (!val("city").trim()) all.city = "Obrigatório";
  if (val("state").length !== 2) all.state = "UF";
  let ok = true;
  STAGE_KEYS[st].forEach((k) => { setError(k, all[k] || ""); if (all[k]) ok = false; });
  return ok;
}

/* ---------- CEP (ViaCEP) ---------- */
let cepReq = 0;
function onCep() {
  const ok = cepOk();
  $("#shipBox").hidden = !ok;
  if (!ok) return;
  const cep = digits(val("cep")), my = ++cepReq;
  $("#cepBusy").hidden = false;
  fetch(`https://viacep.com.br/ws/${cep}/json/`)
    .then((r) => r.json())
    .then((d) => {
      if (my !== cepReq || d.erro) return;
      const set = (k, v) => { if (v) $("#" + k).value = v; };
      set("street", d.logradouro); set("neighborhood", d.bairro); set("city", d.localidade); set("state", d.uf);
      $("#number").focus();
    })
    .catch(() => {})
    .finally(() => { if (my === cepReq) $("#cepBusy").hidden = true; });
}

/* ---------- frete ---------- */
function renderShipping() {
  $("#shipList").innerHTML = Object.values(SHIPPING).map((o) => `
    <label class="opt ${S.shipping === o.id ? "on" : ""}">
      <input type="radio" name="shipping" value="${o.id}" ${S.shipping === o.id ? "checked" : ""}>
      <img class="lg" src="${esc(o.logo)}" alt="Correios" width="48" height="48">
      <span class="t">${esc(o.name)}<small>Entrega em ${esc(o.days)}</small></span>
      <span class="pr">${o.priceCents ? brl(o.priceCents) : "Grátis"}</span>
    </label>`).join("");
  $$("#shipList input").forEach((i) => i.addEventListener("change", () => { S.shipping = i.value; renderShipping(); renderSummary(); }));
}

/* ---------- order bumps ---------- */
function renderBumps() {
  const list = Object.values(BUMPS);
  $("#bumpBox").hidden = list.length === 0;
  $("#bumpList").innerHTML = list.map((b) => `
    <label class="opt ${S.bumps.includes(b.id) ? "on" : ""}">
      <input type="checkbox" value="${b.id}" ${S.bumps.includes(b.id) ? "checked" : ""}>
      <img class="bp" src="${esc(b.img)}" alt="" loading="lazy">
      <span class="t">${esc(b.title)}<small>${esc(b.text)}</small></span>
      <span class="pr">+ ${brl(b.priceCents)}</span>
    </label>`).join("");
  $$("#bumpList input").forEach((i) => i.addEventListener("change", () => {
    S.bumps = i.checked ? [...S.bumps, i.value] : S.bumps.filter((x) => x !== i.value);
    renderBumps(); renderSummary();
  }));
}

/* ---------- etapas ---------- */
function goStage(n) {
  S.stage = n;
  window.fbq?.("trackCustom", "CheckoutStep", { step: n });
  $("#apiError").hidden = true;
  $$("[data-stage]").forEach((el) => (el.hidden = Number(el.dataset.stage) !== n));
  $$("#steps li").forEach((li) => {
    const k = Number(li.dataset.n);
    li.classList.toggle("done", k < n);
    li.classList.toggle("cur", k === n);
    $(".num", li).textContent = k < n ? "✓" : k;
  });
  $("#back").hidden = n === 1;
  $("#agree").hidden = n !== 3;
  if (n === 3) fillReview();
  syncMethodUI();
  updateButton();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function fillReview() {
  const s = ship();
  $("#rvShip").textContent = `Entrega · ${s.name} (${s.days})`;
  $("#rvAddr1").textContent = `${val("street")}, ${val("number")}${val("complement") ? " – " + val("complement") : ""}`;
  $("#rvAddr2").textContent = `${val("neighborhood")} · ${val("city")}/${val("state")} · CEP ${val("cep")}`;
  $("#rvName").textContent = val("name");
  $("#rvContact").textContent = `${val("email")} · ${val("phone")}`;
  $("#rvCpf").textContent = `CPF ${val("cpf")}`;
}
$$("[data-go]").forEach((b) => b.addEventListener("click", () => goStage(Number(b.dataset.go))));
$("#back").addEventListener("click", () => goStage(S.stage - 1));
const showError = (msg) => { const e = $("#apiError"); e.textContent = msg; e.hidden = !msg; };

/* ---------- forma de pagamento / cartão (Pagou) ---------- */
let pagouLoader = null;
function loadPagou() {
  if (window.Pagou) return Promise.resolve(window.Pagou);
  if (!pagouLoader) {
    pagouLoader = new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      sc.src = "https://js.pagou.ai/payments/v3.js?v=3.0.0";
      sc.async = true;
      sc.onload = () => (window.Pagou ? resolve(window.Pagou) : reject(new Error("Pagou indisponível")));
      sc.onerror = () => { pagouLoader = null; reject(new Error("Falha ao carregar")); };
      document.head.appendChild(sc);
    });
  }
  return pagouLoader;
}

// O cartão só aparece se a chave pública da Pagou estiver configurada na Vercel.
fetch("/api/create-card")
  .then((r) => r.json())
  .then((c) => { S.cardCfg = c && c.enabled && c.publishableKey ? c : null; $("#methods").hidden = !S.cardCfg; syncMethodUI(); })
  .catch(() => { S.cardCfg = null; });

$$("#methods input").forEach((i) => i.addEventListener("change", () => {
  S.method = i.value; showError(""); syncMethodUI(); updateButton();
}));

let cardEl = null, cardSeq = 0;
function setCardMsg(m) { const e = $("#cardMsg"); e.textContent = m; e.hidden = !m; }
function unmountCard() {
  cardSeq++;
  try { (cardEl?.unmount ?? cardEl?.destroy)?.call(cardEl); } catch { /* ignora */ }
  cardEl = null; S.els = null; S.cardReady = false;
}
async function mountCard() {
  unmountCard();
  const my = ++cardSeq;
  setCardMsg(""); $("#cardLoading").hidden = false;
  try {
    const Pagou = await loadPagou();
    if (my !== cardSeq) return;
    if (S.cardCfg.sandbox) Pagou.setEnvironment("sandbox");
    let els;
    try { els = Pagou.elements({ publicKey: S.cardCfg.publishableKey, locale: "pt-BR" }); }
    catch { els = Pagou.elements({ publicKey: S.cardCfg.publishableKey }); }
    cardEl = els.create("card", { theme: "default" });
    cardEl.mount("#card-element");
    cardEl.on?.("change", (ev) => setCardMsg(ev?.errors?.length ? String(ev.errors[0].message ?? "") : ""));
    S.els = els; S.cardReady = true;
    $("#cardLoading").hidden = true;
  } catch {
    if (my === cardSeq) { $("#cardLoading").hidden = true; setCardMsg("Não foi possível carregar o formulário do cartão. Tente novamente ou pague com PIX."); }
  }
}
function syncMethodUI() {
  const card = S.method === "card" && !!S.cardCfg;
  $$("#methods .m").forEach((l) => l.classList.toggle("on", l.dataset.m === S.method));
  $("#pixNote").hidden = card;
  $("#cardBox").hidden = !card;
  if (S.stage === 3 && S.view === "form" && card) { if (!cardEl) mountCard(); }
  else unmountCard();
}

/* ---------- envio do pedido ---------- */
const orderBody = () => ({
  offerId, shipping: S.shipping, bumps: S.bumps,
  fbp: (document.cookie.match(/(?:^|; )_fbp=([^;]+)/) || [])[1] || "",
  fbc: (document.cookie.match(/(?:^|; )_fbc=([^;]+)/) || [])[1] || "",
  sourceUrl: location.href,
  utm: (() => { try { return sessionStorage.getItem("cc_utm") || location.search.replace(/^\?/, ""); } catch { return location.search.replace(/^\?/, ""); } })(),
  customer: { name: val("name"), email: val("email"), cpf: val("cpf"), phone: val("phone") },
  address: { cep: val("cep"), street: val("street"), number: val("number"), complement: val("complement"), neighborhood: val("neighborhood"), city: val("city"), state: val("state") },
});
function setLoading(v) { S.loading = v; updateButton(); }

async function payCard() {
  if (!S.els || !S.cardReady) { showError("O formulário do cartão ainda está carregando. Aguarde um instante."); return; }
  trackPaymentInfo(totalCents());
  setLoading(true);
  let txId = "", txAmount = null;
  try {
    const result = await S.els.submit({
      mode: "payment",
      createTransaction: async (tokenData) => {
        const r = await fetch("/api/create-card", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...orderBody(), token: tokenData?.token }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || "Não foi possível processar o cartão.");
        txId = j?.data?.id ?? "";
        txAmount = typeof j?.amount === "number" ? j.amount : null;
        return j.data ?? j;
      },
    });
    const st = String(result?.status ?? "").toLowerCase();
    const id = String(result?.id ?? txId);
    S.paidWith = "card"; S.paidAmount = txAmount ?? totalCents();
    if (["paid", "captured", "succeeded", "completed"].includes(st)) { trackPurchase(S.paidAmount); showPaid(); }
    else if (["authorized", "processing", "pending", "processed"].includes(st) && id) { S.waitId = id; unmountCard(); showView("cardwait"); startPolling("cardwait"); }
    else if (st === "canceled" || st === "cancelled") showError("Pagamento cancelado. Você pode tentar de novo.");
    else showError("Cartão não aprovado. Confira os dados, tente outro cartão ou pague com PIX.");
  } catch (e) {
    showError(e instanceof Error && e.message ? e.message : "Cartão não aprovado. Tente outro cartão ou pague com PIX.");
  } finally { setLoading(false); }
}

async function payPix() {
  setLoading(true);
  try {
    const r = await fetch("/api/create-pix", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(orderBody()) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || "Não foi possível gerar o PIX.");
    S.pix = data; S.waitId = data.id; S.paidWith = "pix"; S.paidAmount = data?.amount ?? totalCents();
    unmountCard();
    renderPix();
    showView("pix");
    startPolling("pix");
    // PIX gerado = dados de pagamento enviados (AddPaymentInfo). A venda (Purchase) só é marcada quando o pagamento é confirmado.
    trackPaymentInfo(S.paidAmount);
    trackPurchase(S.paidAmount); // marca a venda no Facebook assim que o PIX é gerado
  } catch (e) {
    showError(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
  } finally { setLoading(false); }
}

$("#form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  showError("");
  if (S.stage !== 3) {
    if (!validate(S.stage)) { setTimeout(() => $(".f.bad")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0); return; }
    goStage(S.stage + 1);
    return;
  }
  if (!validate(1)) return goStage(1);
  if (!validate(2)) return goStage(2);
  if (S.method === "card" && S.cardCfg) payCard(); else payPix();
});

/* ---------- tela do PIX ---------- */
function drawQR(canvas, text) {
  try {
    const qr = qrcode(0, "M");
    qr.addData(text); qr.make();
    const n = qr.getModuleCount(), margin = 2, cell = Math.max(2, Math.floor(280 / (n + margin * 2)));
    const px = cell * (n + margin * 2);
    canvas.width = canvas.height = px;
    const c = canvas.getContext("2d");
    c.fillStyle = "#fff"; c.fillRect(0, 0, px, px);
    c.fillStyle = "#000";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) c.fillRect((x + margin) * cell, (y + margin) * cell, cell, cell);
  } catch { canvas.hidden = true; }
}
function renderPix() {
  $("#pixAmount").textContent = brl(S.pix.amount);
  $("#pixCode").value = S.pix.qrcode;
  $("#qr").hidden = false;
  drawQR($("#qr"), S.pix.qrcode);
  $("#pixExp").textContent = S.pix.expirationDate ? "Válido até " + new Date(S.pix.expirationDate).toLocaleString("pt-BR") : "";
}
$("#pixCode").addEventListener("focus", (e) => e.currentTarget.select());
$("#copy").addEventListener("click", async () => {
  const b = $("#copy");
  try { await navigator.clipboard.writeText(S.pix.qrcode); }
  catch { const ta = $("#pixCode"); ta.select(); document.execCommand("copy"); }
  b.textContent = "✓ Código copiado!";
  setTimeout(() => (b.textContent = "Copiar código PIX"), 2500);
});

/* ---------- confirmação de pagamento (consulta a cada 5s) ---------- */
let pollTimer = null;
function startPolling(mode) {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    try {
      const r = await fetch(`/api/pix-status?id=${encodeURIComponent(S.waitId)}${mode === "pix" ? "&m=pix" : ""}`);
      const { status } = await r.json();
      if (status === "paid" || status === "captured" || (mode === "pix" && status === "authorized")) {
        clearInterval(pollTimer);
        trackPurchase(S.paidAmount ?? totalCents()); // PIX e cartão em análise
        showPaid();
      } else if (["refused", "canceled", "cancelled", "expired"].includes(status)) {
        clearInterval(pollTimer);
        showFailed();
      }
    } catch { /* tenta de novo no próximo ciclo */ }
  }, 5000);
}

function showPaid() {
  clearInterval(pollTimer);
  $("#paidWith").textContent = S.paidWith === "card" ? "pagamento no cartão" : "PIX";
  $("#paidAmount").textContent = brl(S.paidAmount ?? S.pix?.amount ?? totalCents());
  $("#paidEmail").textContent = val("email");
  const w = $("#paidWhats");
  if (STORE.whatsapp) { w.href = "https://wa.me/" + STORE.whatsapp; w.hidden = false; }
  showView("paid");
}
function showFailed() {
  const card = S.paidWith === "card";
  $("#failTitle").textContent = card ? "Pagamento não aprovado" : "PIX expirado ou cancelado";
  $("#failText").textContent = card ? "O cartão não foi aprovado. Você pode tentar outro cartão ou pagar com PIX." : "Não identificamos o pagamento. Você pode gerar um novo PIX.";
  $("#retry").textContent = card ? "Tentar novamente" : "Gerar novo PIX";
  showView("failed");
}
$("#retry").addEventListener("click", () => { S.pix = null; showView("form"); goStage(3); });

/* ---------- início ---------- */
renderShipping();
renderBumps();
renderSummary();
goStage(1);
