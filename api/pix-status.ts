import type { VercelRequest, VercelResponse } from "@vercel/node";

// Consulta de status de pagamento. Dois gateways:
//   ?m=pix  -> PIX na Duttyfy (GET {DUTTYFY_API_URL}?transactionId=ID)   [padrão do checkout para PIX]
//   (sem m) -> cartão em análise na Pagou (GET /v2/transactions/:id)
// Status normalizados em minúsculas: paid, waiting_payment, refused, canceled, refunded...
const clean = (v?: string) => (v ?? "").trim().replace(/^[\"']|[\"']$/g, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id ?? "");
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return res.status(400).json({ error: "ID inválido." });
  res.setHeader("Cache-Control", "no-store");

  if (String(req.query.m ?? "") === "pix") {
    // PIX na Duttyfy: GET {URL_ENCRIPTADA}?transactionId={ID} -> { status: "PENDING" | "COMPLETED" }
    const url = clean(process.env.DUTTYFY_API_URL || process.env.DUTTYFY_URL);
    if (!url) return res.status(500).json({ error: "Pagamento não configurado." });
    try {
      const u = new URL(url);
      u.searchParams.set("transactionId", id);
      const r = await fetch(u.toString());
      const json: any = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(502).json({ error: "Não foi possível consultar o pagamento." });
      const tx = json?.data ?? json;
      const st = String(tx?.status ?? "").toUpperCase();
      // Normaliza para o que o checkout entende: paid / waiting_payment
      const status = st === "COMPLETED" ? "paid" : st === "PENDING" ? "waiting_payment" : st.toLowerCase();
      return res.status(200).json({ status });
    } catch {
      return res.status(502).json({ error: "Falha ao consultar o pagamento." });
    }
  }

  // Cartão (Pagou) — comportamento original, sem alterações.
  const token = clean(process.env.PAGOU_API_KEY || process.env.PAGOU_TOKEN || process.env.PAGOU_SECRET_KEY);
  if (!token) return res.status(500).json({ error: "Pagamento não configurado." });
  const base = String(process.env.PAGOU_ENV ?? "").trim().toLowerCase() === "sandbox" ? "https://api.sandbox.pagou.ai" : "https://api.pagou.ai";
  try {
    const r = await fetch(`${base}/v2/transactions/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const json: any = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: "Não foi possível consultar o pagamento." });
    const tx = json?.data ?? json;
    return res.status(200).json({ status: String(tx?.status ?? "").toLowerCase() });
  } catch {
    return res.status(502).json({ error: "Falha ao consultar o pagamento." });
  }
}
