import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isIP } from "node:net";

// PIX via Unipay (plataforma FastSoft White Label; adquirente: Pagar.me).
// Docs: https://developers.fastsoftbrasil.com
// O CARTÃO fica na Pagou (api/create-card.ts) e não é afetado por este arquivo.
//
// Variáveis de ambiente na Vercel:
//   UNIPAY_API_KEY  -> chave secreta (Painel Unipay > Configurações > Chave de API) (obrigatória)
//   UNIPAY_API_URL  -> opcional. Padrão: https://api.unipaybr.com
//                      Se o diagnóstico (/api/create-pix?diag=1) mostrar 401/404, troque para https://api.fastsoftbrasil.com
const clean = (v?: string) => (v ?? "").trim().replace(/^[\"']|[\"']$/g, "");
const getToken = () => clean(process.env.UNIPAY_API_KEY || process.env.UNIPAY_SECRET_KEY);
const getBase = () => clean(process.env.UNIPAY_API_URL).replace(/\/+$/, "").replace(/\/api$/, "") || "https://api.unipaybr.com";
// Autenticação Basic: base64("x:CHAVE_SECRETA")
const authHeader = (token: string) => ({ Authorization: `Basic ${Buffer.from(`x:${token}`).toString("base64")}` });

// ⚠️ Preços ficam no SERVIDOR: o cliente só envia o id da oferta.
// Mantenha em sincronia com checkout/config.js e api/create-card.ts
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

  // Diagnóstico: abra /api/create-pix?diag=1 no navegador. Nunca mostra a chave.
  if (req.method === "GET" && req.query?.diag) {
    const out: Record<string, unknown> = {
      gateway: "unipay",
      baseUrl: base,
      tokenConfigured: !!token,
      tokenLength: token.length,
    };
    if (token) {
      // Testa o endereço configurado e o alternativo. 200 = chave OK | 401 = chave errada ou endereço errado
      const probe = async (b: string) => {
        try {
          const r = await fetch(`${b}/api/user/wallet/balance`, { headers: authHeader(token) });
          return r.status;
        } catch { return "sem_conexao"; }
      };
      out.authStatus = await probe(base);
      const alt = base.includes("fastsoftbrasil") ? "https://api.unipaybr.com" : "https://api.fastsoftbrasil.com";
      out.alternativo = { baseUrl: alt, authStatus: await probe(alt) };
    }
    return res.status(200).json(out);
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido" });

  if (!token) return res.status(500).json({ error: "Pagamento não configurado (UNIPAY_API_KEY ausente)." });

  const { offerId, shipping, bumps, customer, address } = (req.body ?? {}) as any;
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

  // O valor total é a soma dos itens; o frete entra como um item (e shipping.fee fica 0
  // para o frete nunca ser cobrado duas vezes).
  const items = [
    { title: offer.title, unitPrice: offer.priceCents, quantity: 1, tangible: true, externalRef: String(offerId) },
    ...bumpIds.map((b) => ({ title: BUMPS[b].title, unitPrice: BUMPS[b].priceCents, quantity: 1, tangible: true, externalRef: `bump-${b}` })),
    ...(ship.priceCents > 0 ? [{ title: ship.name, unitPrice: ship.priceCents, quantity: 1, tangible: false, externalRef: `frete-${shipping}` }] : []),
  ];
  const amount = items.reduce((t, p) => t + p.unitPrice * p.quantity, 0);

  const ip = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0].trim();
  const postbackUrl = host && !/localhost|127\.0\.0\.1/.test(host) ? `https://${host}/api/webhook` : undefined;

  const payload = {
    amount,
    paymentMethod: "PIX",
    customer: {
      name: String(customer.name).trim(),
      email: String(customer.email).trim(),
      document: { number: cpf, type: "CPF" },
      phone,
    },
    shipping: {
      fee: 0,
      address: {
        street: String(address.street),
        streetNumber: String(address.number),
        ...(address.complement ? { complement: String(address.complement) } : {}),
        zipCode: zip,
        neighborhood: String(address.neighborhood),
        city: String(address.city),
        state: String(address.state).toUpperCase(),
        country: "br",
      },
    },
    items,
    traceable: true,
    ...(ip && isIP(ip) ? { ip } : {}),
    ...(postbackUrl ? { postbackUrl } : {}),
    metadata: {
      oferta: String(offerId),
      frete: String(shipping),
      ...(bumpIds.length ? { adicionais: bumpIds.join(",") } : {}),
    },
    pix: { expiresInDays: 1 },
  };

  try {
    const r = await fetch(`${base}/api/user/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeader(token) },
      body: JSON.stringify(payload),
    });
    const json: any = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error("Unipay error", r.status, JSON.stringify(json));
      const detail = Array.isArray(json?.message) ? json.message.join("; ") : json?.message;
      const msg = r.status === 401 || r.status === 403
        ? "Pagamento temporariamente indisponível. Tente novamente em instantes."
        : r.status === 400 || r.status === 422
          ? `Confira os dados informados${detail ? ` (${String(detail).slice(0, 120)})` : ""}.`
          : "Não foi possível gerar o PIX. Tente novamente.";
      return res.status(502).json({ error: msg });
    }
    const tx = json?.data ?? json;
    const qrcode = tx?.pix?.qrcode ?? tx?.pix?.qrCode ?? tx?.pix?.qr_code;
    if (!tx?.id || !qrcode) {
      console.error("Resposta inesperada da Unipay", JSON.stringify(json));
      return res.status(502).json({ error: "Resposta inesperada do gateway de pagamento." });
    }
    return res.status(200).json({
      id: tx.id,
      qrcode,
      expirationDate: tx.pix?.expirationDate ?? null,
      amount: tx.amount ?? amount,
      status: String(tx.status ?? "waiting_payment").toLowerCase(),
    });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Falha de comunicação com o gateway de pagamento." });
  }
}
