import type { VercelRequest, VercelResponse } from "@vercel/node";

// Registra a movimentação do site (entrou / clicou / saiu) nos Logs da Vercel.
// Não guarda dados pessoais: só evento, página, origem e tipo de aparelho.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  let b: any = req.body;
  if (typeof b === "string") { try { b = JSON.parse(b); } catch { b = {}; } }
  const cut = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const ua = String(req.headers["user-agent"] ?? "");
  const aparelho = /mobile|android|iphone|ipad/i.test(ua) ? "celular" : "computador";
  const extra = b?.texto ? ` botão="${cut(b.texto, 40)}"` : b?.segundos != null ? ` ficou=${Number(b.segundos) || 0}s` : "";
  const origem = b?.origem ? ` origem=${cut(b.origem, 80)}` : "";
  console.log(`[site] ${cut(b?.evento, 12)} página=${cut(b?.pagina, 80)}${extra}${origem} aparelho=${aparelho}`);
  return res.status(204).end();
}
