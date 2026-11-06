import type { VercelRequest, VercelResponse } from "@vercel/node";

// Recebe notificações dos dois gateways:
//   Duttyfy (PIX): { _id: { $oid }, transactionId?, status: "PENDING" | "COMPLETED", amount, customer, utm, ... }
//   Pagou (cartão): { id, data: { event_type, id, status, amount, ... } }
// Por enquanto só registra nos Logs da Vercel. O site confirma o pagamento consultando /api/pix-status.
// Aqui você pode, no futuro, avisar por e-mail/WhatsApp ou salvar o pedido.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  let b: any = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const d = b?.data;
  if (b?._id || (b?.transactionId && b?.paymentMethod)) {
    // Duttyfy: em COMPLETED pode não vir transactionId, então a chave da transação é _id.$oid.
    const txId = String(b?._id?.$oid ?? b?.transactionId ?? "");
    const status = String(b?.status ?? "").toUpperCase();
    console.log("[webhook Duttyfy]", txId, status, b?.amount, b?.customer?.email);
    // A compra já é enviada ao Meta quando o PIX é gerado (api/create-pix.ts, event_id "purchase_<id>").
    // Aqui só registramos. Para salvar pedido / avisar por e-mail ou WhatsApp, use status === "COMPLETED"
    // e processe UMA vez por txId (o Duttyfy pode reenviar o mesmo webhook).
  } else {
    console.log("[webhook Pagou]", b?.id, d?.event_type, d?.id, d?.status, d?.amount, d?.customer?.email);
  }
  return res.status(200).json({ received: true });
}
