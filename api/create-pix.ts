import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";

// PIX via Duttyfy. O CARTÃO continua na Pagou (api/create-card.ts) e não é afetado por este arquivo.
//
// Variável de ambiente na Vercel (obrigatória):
//   DUTTYFY_API_URL -> a URL ENCRIPTADA gerada em Duttyfy > Chaves API > "Gerar URL encriptada".
//                      Use a URL inteira (não a chave bruta). Ela é secreta: nunca coloque no código nem no navegador.
// Opcionais (Meta Conversions API): META_CAPI_TOKEN e META_PIXEL_ID
const clean = (v?: string) => (v ?? "").trim().replace(/^[\"']|[\"']$/g, "");
const getUrl = () => clean(process.env.DUTTYFY_API_URL || process.env.DUTTYFY_URL);

// ⚠️ Preços ficam no SERVIDOR: o cliente só envia o id da oferta.
// Mantenha em sincronia com checkout/config.js e api/create-card.ts
const OFFERS: Record<string, { title: string; priceCents: number }> = {
  ferramenta: { title: "Kit 4 em 1 Ferramentas 48V com Maleta", priceCents: 9790 },
  "serra-marmore": { title: "Serra Mármore Vonder SMV 1300S 1300W - Leve 2", priceCents: 9790 },
  "luminaria-1": { title: "Kit 2 Luminárias Poste Solar 2200W (Compre 1 Leve 2)", priceCents: 9700 },
  "luminaria-2": { title: "Kit 4 Luminárias Poste Solar 2200W (Compre 2 Leve 4)", priceCents: 13790 },
  "luminaria-3": { title: "Kit 6 Luminárias Poste Solar 2200W (Compre 3 Leve 6)", priceCents: 15790 },
  "luminaria-4": { title: "Kit 8 Luminárias Poste Solar 2200W (Compre 4 Leve 8)", priceCents: 17790 },
};

// Frete grátis pelos Correios (se um dia tiver valor, ele é somado ao total).
const SHIPPING: Record<string, { name: string; priceCents: number }> = {
  correios: { name: "Frete Correios", priceCents: 0 },
};

// Order bumps: vazio por enquanto. Para ativar, adicione aqui E em checkout/config.js.
const BUMPS: Record<string, { title: string; priceCents: number }> = {};

// Envia a compra ao Meta direto do servidor (Conversions API) assim que o PIX é gerado.
// Variáveis na Vercel: META_CAPI_TOKEN (obrigatória) e META_PIXEL_ID (opcional).
const sha = (v: unknown) => createHash("sha256").update(String(v ?? "").trim().toLowerCase()).digest("hex");
async function sendMetaPurchase(id: string, amountCents: number, offerId: string, c: any, m: any) {
  const token = clean(process.env.META_CAPI_TOKEN);
  const pixel = clean(process.env.META_PIXEL_ID) || "1474529167889526";
  if (!token) { console.log("[meta] META_CAPI_TOKEN ausente — Purchase NÃO enviado pelo servidor"); return; }
  const ph = String(c?.phone ?? "").replace(/\D/g, "");
  const body = { data: [{
    event_name: "Purchase", event_time: Math.floor(Date.now() / 1000), event_id: "purchase_" + id,
    action_source: "website", event_source_url: m.url || undefined,
    user_data: {
      em: c?.email ? [sha(c.email)] : undefined,
      ph: ph ? [sha(ph.startsWith("55") ? ph : "55" + ph)] : undefined,
      fn: c?.name ? [sha(String(c.name).split(" ")[0])] : undefined,
      fbp: m.fbp || undefined, fbc: m.fbc || undefined,
      client_ip_address: m.ip || undefined, client_user_agent: m.ua || undefined,
    },
    custom_data: { currency: "BRL", value: amountCents / 100, content_type: "product", content_ids: [offerId] },
  }] };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    console.log("[meta] Purchase (PIX gerado)", id, r.status, (await r.text()).slice(0, 300));
  } catch (e) { console.error("[meta] falha", e); }
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// Query string de rastreamento (utm_*, fbclid, ttclid, click_id...) no formato "a=1&b=2", sem "?".
// Vem do navegador (body.utm); se faltar, tenta extrair da URL de origem.
function buildUtm(rawUtm: unknown, sourceUrl: unknown): string {
  let s = String(rawUtm ?? "").trim().replace(/^\?/, "");
  if (!s) {
    try { s = new URL(String(sourceUrl ?? "")).search.replace(/^\?/, ""); } catch { s = ""; }
  }
  // Remove parâmetros internos do próprio checkout (não são de rastreamento).
  const p = new URLSearchParams(s);
  ["p", "qtd"].forEach((k) => p.delete(k));
  return p.toString().slice(0, 1500);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = getUrl();

  // Diagnóstico: abra /api/create-pix?diag=1 no navegador. Só confere se a variável existe; nunca mostra a URL.
  if (req.method === "GET" && req.query?.diag) {
    let host = "";
    try { host = new URL(url).host; } catch { /* url inválida */ }
    return res.status(200).json({ gateway: "duttyfy", urlConfigured: !!url, urlValida: !!host, host });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  if (!url) return res.status(500).json({ error: "Pagamento não configurado (DUTTYFY_API_URL ausente)." });

  const { offerId, shipping, bumps, customer, address, fbp, fbc, sourceUrl, utm } = (req.body ?? {}) as any;
  const offer = OFFERS[offerId];
  if (!offer) return res.status(400).json({ error: "Oferta inválida." });

  const cpf = digits(customer?.cpf);
  let phone = digits(customer?.phone);
  if (phone.startsWith("55") && phone.length > 11) phone = phone.slice(2);
  const zip = digits(address?.cep);
  if (!customer?.name || !customer?.email || cpf.length !== 11 || phone.length < 10 || zip.length !== 8 ||
      !address?.street || !address?.number || !address?.neighborhood || !address?.city || !address?.state) {
    return res.status(400).json({ error: "Preencha todos os dados obrigatórios." });
  }

  const ship = SHIPPING[shipping];
  if (!ship) return res.status(400).json({ error: "Escolha uma opção de frete." });
  const bumpIds: string[] = Array.isArray(bumps) ? [...new Set<string>(bumps.map(String))].filter((b) => b in BUMPS) : [];

  // O valor total é calculado AQUI no servidor (em centavos): oferta + extras + frete.
  const amount = offer.priceCents + bumpIds.reduce((t, b) => t + BUMPS[b].priceCents, 0) + ship.priceCents;
  if (amount < 100) return res.status(400).json({ error: "Valor inválido." });

  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();

  // O Duttyfy aceita UM item por cobrança: o título resume o pedido e o preço é o total.
  const title = [offer.title, ...bumpIds.map((b) => BUMPS[b].title)].join(" + ").slice(0, 200);

  const utmStr = buildUtm(utm, sourceUrl);
  const payload = {
    amount,
    customer: {
      name: String(customer.name).trim(),
      document: cpf,
      email: String(customer.email).trim(),
      phone,
    },
    item: { title, price: amount, quantity: 1 },
    paymentMethod: "PIX",
    // Só envia utm quando existe: campo vazio pode causar erro 500 no gateway.
    ...(utmStr ? { utm: utmStr } : {}),
  };

  try {
    const ctrl = new AbortController();
    const t0 = Date.now();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(timer));
    const raw = await r.text();
    let json: any = {};
    try { json = JSON.parse(raw); } catch { /* resposta não-JSON */ }
    console.log("Duttyfy resp", r.status, Date.now() - t0 + "ms", raw.slice(0, 300));
    if (!r.ok) {
      // Log sem dados pessoais: ajuda a diagnosticar (formato do telefone, tamanho do CPF, se tinha utm).
      console.error("Duttyfy error", r.status, JSON.stringify(json), JSON.stringify({
        amount, phoneLen: phone.length, phoneDDD: phone.slice(0, 2), cpfLen: cpf.length, temUtm: !!utmStr, titleLen: title.length,
      }));
      const detail = String(json?.error ?? json?.message ?? "");
      const msg = r.status === 401 || r.status === 403 || /chave api/i.test(detail)
        ? "Pagamento temporariamente indisponível. Tente novamente em instantes."
        : /cpf/i.test(detail)
          ? "CPF inválido. Confira e tente novamente."
          : r.status === 400 || r.status === 422
            ? `Confira os dados informados${detail ? ` (${detail.slice(0, 120)})` : ""}.`
            : "Não foi possível gerar o PIX. Tente novamente.";
      return res.status(502).json({ error: msg });
    }
    const tx = json?.data ?? json;
    const qrcode = tx?.pixCode ?? tx?.qrcode ?? tx?.qrCode;
    const id = tx?.transactionId ?? tx?.id;
    if (!id || !qrcode) {
      console.error("Resposta inesperada da Duttyfy", JSON.stringify(json));
      return res.status(502).json({ error: "Resposta inesperada do gateway de pagamento." });
    }
    await sendMetaPurchase(String(id), amount, String(offerId), customer, { fbp: String(fbp ?? ""), fbc: String(fbc ?? ""), url: String(sourceUrl ?? ""), ua: String(req.headers["user-agent"] ?? ""), ip });
    // Mesmo formato que o checkout já espera (id, qrcode, amount, status).
    return res.status(200).json({
      id: String(id),
      qrcode: String(qrcode),
      expirationDate: null,
      amount,
      status: "waiting_payment",
    });
  } catch (e) {
    const timeout = e instanceof Error && e.name === "AbortError";
    console.error(timeout ? "Duttyfy TIMEOUT (sem resposta em 9s)" : "Duttyfy falha de rede", e);
    return res.status(502).json({ error: timeout ? "O gateway de pagamento demorou para responder. Tente novamente." : "Falha de comunicação com o gateway de pagamento." });
  }
}
