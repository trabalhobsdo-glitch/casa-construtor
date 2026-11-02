import type { VercelRequest, VercelResponse } from "@vercel/node";

// Recebe notificações dos dois gateways:
//   Unipay (PIX):  { type: "transaction", objectId, data: { id, status, amount, ... } }
//   Pagou (cartão): { id, data: { event_type, id, status, amount, ... } }
// Por enquanto só registra nos Logs da Vercel. O site confirma o pagamento consultando /api/pix-status.
// Aqui você pode, no futuro, avisar por e-mail/WhatsApp ou salvar o pedido.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  let b: any = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const d = b?.data;
  if (b?.type === "transaction") {
    console.log("[webhook Unipay]", b?.objectId ?? d?.id, d?.status, d?.amount, d?.paymentMethod, d?.customer?.email);
  } else {
    console.log("[webhook Pagou]", b?.id, d?.event_type, d?.id, d?.status, d?.amount, d?.customer?.email);
  }
  return res.status(200).json({ received: true });
}
