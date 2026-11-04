import type { VercelRequest, VercelResponse } from "@vercel/node";

// Recebe notificações dos dois gateways:
//   Unipay (PIX):  { type: "transaction", objectId, data: { id, status, amount, ... } }
//   Pagou (cartão): { id, data: { event_type, id, status, amount, ... } }
// Por enquanto só registra nos Logs da Vercel. O site confirma o pagamento consultando /api/pix-status.
// Aqui você pode, no futuro, avisar por e-mail/WhatsApp ou salvar o pedido.
import { createHash } from "node:crypto";
const sha = (v: unknown) => createHash("sha256").update(String(v ?? "").trim().toLowerCase()).digest("hex");

// Envia a COMPRA direto do servidor para o Meta (Conversions API). Funciona mesmo se o cliente fechar a página.
// Variáveis na Vercel: META_PIXEL_ID e META_CAPI_TOKEN (token gerado no Gerenciador de Eventos > Configurações > API de Conversões)
async function sendMetaPurchase(d: any, id: string) {
  const pixel = (process.env.META_PIXEL_ID || "1620017232920631").trim();
  const token = (process.env.META_CAPI_TOKEN || "").trim();
  if (!token) { console.log("[meta] META_CAPI_TOKEN ausente — compra não enviada pelo servidor"); return; }
  const m = d?.metadata ?? {};
  const phone = String(d?.customer?.phone ?? "").replace(/\D/g, "");
  const user: any = {
    em: d?.customer?.email ? [sha(d.customer.email)] : undefined,
    ph: phone ? [sha(phone.startsWith("55") ? phone : "55" + phone)] : undefined,
    fn: d?.customer?.name ? [sha(String(d.customer.name).split(" ")[0])] : undefined,
    external_id: d?.customer?.document?.number ? [sha(d.customer.document.number)] : undefined,
    fbp: m.fbp || undefined, fbc: m.fbc || undefined,
    client_ip_address: m.ip || undefined, client_user_agent: m.ua || undefined,
  };
  const body = {
    data: [{
      event_name: "Purchase", event_time: Math.floor(Date.now() / 1000),
      event_id: "purchase_" + id, action_source: "website", event_source_url: m.url || undefined,
      user_data: user,
      custom_data: { currency: "BRL", value: Number(d?.amount ?? 0) / 100, content_type: "product", content_ids: m.oferta ? [m.oferta] : undefined },
    }],
  };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    console.log("[meta] Purchase", id, r.status, (await r.text()).slice(0, 200));
  } catch (e) { console.error("[meta] falha", e); }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  let b: any = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const d = b?.data;
  if (b?.type === "transaction") {
    console.log("[webhook Unipay]", b?.objectId ?? d?.id, d?.status, d?.amount, d?.paymentMethod, d?.customer?.email);
    if (String(d?.status ?? "").toLowerCase() === "paid") await sendMetaPurchase(d, String(b?.objectId ?? d?.id));
  } else {
    console.log("[webhook Pagou]", b?.id, d?.event_type, d?.id, d?.status, d?.amount, d?.customer?.email);
  }
  return res.status(200).json({ received: true });
}
