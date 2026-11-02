import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";

// Cartão de crédito via Pagou (API v2) com o Payment Element (formulário seguro da Pagou).
// Os dados do cartão NUNCA passam pelo seu servidor: o navegador troca o cartão por um token "pgct_..."
// e só esse token chega aqui.
// Variáveis de ambiente na Vercel:
//   PAGOU_API_KEY          -> token secreto (já usado no PIX)
//   PAGOU_PUBLISHABLE_KEY  -> chave pública (pk_live_... ou pk_test_...) do painel da Pagou. Sem ela, o cartão fica oculto.
//   PAGOU_ENV              -> opcional: "sandbox" para testar
const getBase = () => (String(process.env.PAGOU_ENV ?? "").trim().toLowerCase() === "sandbox" ? "https://api.sandbox.pagou.ai" : "https://api.pagou.ai");
const clean = (v?: string) => (v ?? "").trim().replace(/^[\"']|[\"']$/g, "");
const getToken = () => clean(process.env.PAGOU_API_KEY || process.env.PAGOU_TOKEN || process.env.PAGOU_SECRET_KEY);
const getPublishable = () => clean(process.env.PAGOU_PUBLISHABLE_KEY || process.env.PAGOU_PUBLIC_KEY);

// ⚠️ Mantenha em sincronia com api/create-pix.ts e checkout/config.js
const OFFERS: Record<string, { title: string; priceCents: number }> = {
  ferramenta: { title: "Kit 4 em 1 Ferramentas 48V com Maleta", priceCents: 14790 },
  "luminaria-1": { title: "Kit 2 Luminárias Poste Solar 2200W (Compre 1 Leve 2)", priceCents: 9700 },
  "luminaria-2": { title: "Kit 4 Luminárias Poste Solar 2200W (Compre 2 Leve 4)", priceCents: 13790 },
  "luminaria-3": { title: "Kit 6 Luminárias Poste Solar 2200W (Compre 3 Leve 6)", priceCents: 15790 },
  "luminaria-4": { title: "Kit 8 Luminárias Poste Solar 2200W (Compre 4 Leve 8)", priceCents: 17790 },
};

// Frete grátis pelos Correios (o item de frete só entra na cobrança se o valor for maior que zero).
const SHIPPING: Record<string, { name: string; priceCents: number }> = {
  correios: { name: "Frete Correios", priceCents: 0 },
};

// Order bumps: vazio por enquanto. Para ativar, adicione aqui E em checkout/config.js.
const BUMPS: Record<string, { title: string; priceCents: number }> = {};

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = getToken();
  const base = getBase();
  const pk = getPublishable();

  // O site pergunta aqui se o cartão está disponível e qual a chave pública (ela é segura para o navegador).
  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({
      enabled: !!(token && pk),
      publishableKey: pk || null,
      sandbox: base.includes("sandbox") || pk.startsWith("pk_test"),
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });
  if (!token) return res.status(500).json({ error: "Pagamento não configurado (PAGOU_API_KEY ausente)." });

  const { offerId, shipping, bumps, customer, address, token: cardToken } = (req.body ?? {}) as any;
  if (typeof cardToken !== "string" || !/^pg(ct|pm)_[A-Za-z0-9_-]+$/.test(cardToken)) {
    return res.status(400).json({ error: "Não foi possível ler os dados do cartão. Confira e tente de novo." });
  }
  const offer = OFFERS[offerId];
  if (!offer) return res.status(400).json({ error: "Oferta inválida." });

  const cpf = digits(customer?.cpf);
  const phone = digits(customer?.phone);
  const zip = digits(address?.cep);
  if (!customer?.name || !customer?.email || cpf.length !== 11 || phone.length < 10 || zip.length !== 8 ||
      !address?.street || !address?.number || !address?.neighborhood || !address?.city || !address?.state) {
    return res.status(400).json({ error: "Preencha todos os dados obrigatórios." });
  }
  const ship = SHIPPING[shipping];
  if (!ship) return res.status(400).json({ error: "Escolha uma opção de frete." });
  const bumpIds: string[] = Array.isArray(bumps) ? [...new Set<string>(bumps.map(String))].filter((b) => b in BUMPS) : [];

  // O valor é calculado AQUI no servidor (o navegador só diz qual oferta, frete e extras).
  const products = [
    { name: offer.title, price: offer.priceCents, quantity: 1, tangible: true, sku: offerId },
    ...bumpIds.map((b) => ({ name: BUMPS[b].title, price: BUMPS[b].priceCents, quantity: 1, tangible: true, sku: `bump-${b}` })),
    ...(ship.priceCents > 0 ? [{ name: ship.name, price: ship.priceCents, quantity: 1, tangible: false, sku: `frete-${shipping}` }] : []),
  ];
  const amount = products.reduce((t, p) => t + p.price * p.quantity, 0);

  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  const notifyUrl = host && !/localhost|127\.0\.0\.1/.test(host) ? `https://${host}/api/webhook` : undefined;

  const payload = {
    external_ref: `cc-${randomUUID()}`,
    amount,
    currency: "BRL",
    method: "credit_card",
    token: cardToken,
    installments: 1,
    ...(notifyUrl ? { notify_url: notifyUrl } : {}),
    buyer: {
      name: String(customer.name).trim(),
      email: String(customer.email).trim(),
      phone: phone.startsWith("55") && phone.length > 11 ? `+${phone}` : `+55${phone}`,
      document: { type: "CPF", number: cpf },
      address: {
        street: String(address.street),
        number: String(address.number),
        ...(address.complement ? { complement: String(address.complement) } : {}),
        neighborhood: String(address.neighborhood),
        city: String(address.city),
        state: String(address.state).toUpperCase(),
        zipCode: zip,
        country: "BR",
      },
    },
    products,
    traceable: true,
    ...(ip && isIP(ip) ? { ip_address: ip } : {}),
    informations: [
      { key: "oferta", value: String(offerId) },
      { key: "frete", value: String(shipping) },
      { key: "pagamento", value: "cartao" },
      ...(bumpIds.length ? [{ key: "adicionais", value: bumpIds.join(",") }] : []),
    ],
  };

  try {
    const r = await fetch(`${base}/v2/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const json: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Pagou card error", r.status, JSON.stringify(json));
      const first = Array.isArray(json?.errors) && json.errors[0] ? `${json.errors[0].field ?? ""}: ${json.errors[0].message ?? ""}`.trim() : "";
      const msg = r.status === 401 || r.status === 403
        ? "Pagamento temporariamente indisponível. Tente novamente em instantes."
        : r.status === 422
          ? `Confira os dados informados${first ? ` (${first})` : ""}.`
          : json?.detail || json?.message || "Não foi possível processar o cartão. Tente outro cartão ou pague com PIX.";
      return res.status(502).json({ error: msg });
    }
    const tx = json?.data ?? json;
    if (!tx?.id) {
      console.error("Resposta inesperada da Pagou (cartão)", JSON.stringify(json));
      return res.status(502).json({ error: "Resposta inesperada do gateway de pagamento." });
    }
    // O navegador (SDK da Pagou) usa id/status/next_action para continuar a confirmação 3D Secure, se houver.
    return res.status(200).json({
      data: { id: tx.id, status: tx.status, next_action: tx.next_action ?? null },
      amount: tx.amount ?? amount,
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Falha de comunicação com o gateway de pagamento." });
  }
}
