import type { VercelRequest, VercelResponse } from "@vercel/node";

// Teste rápido: abra /api/meta-test no navegador. Mostra se o token existe e o que o Facebook respondeu.
// Opcional: /api/meta-test?code=TEST12345 (código da aba "Testar eventos") para ver o evento lá na hora.
const clean = (v?: string) => (v ?? "").trim().replace(/^[\"']|[\"']$/g, "");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = clean(process.env.META_CAPI_TOKEN);
  const pixel = clean(process.env.META_PIXEL_ID) || "1118077487471166";
  const out: Record<string, unknown> = { pixel, tokenConfigurado: !!token, tamanhoDoToken: token.length };
  if (!token) {
    out.resultado = "ERRO: a variável META_CAPI_TOKEN não chegou no site. Crie na Vercel e faça Redeploy.";
    return res.status(200).json(out);
  }
  const code = String(req.query.code ?? "").trim();
  const body: any = {
    data: [{
      event_name: "Purchase", event_time: Math.floor(Date.now() / 1000), event_id: "teste_" + Date.now(),
      action_source: "website", event_source_url: "https://casadoconstrutor.site/checkout/",
      user_data: { client_ip_address: String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || undefined, client_user_agent: String(req.headers["user-agent"] ?? "") },
      custom_data: { currency: "BRL", value: 97.9 },
    }],
    ...(code ? { test_event_code: code } : {}),
  };
  try {
    const r = await fetch(`https://graph.facebook.com/v21.0/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    out.statusFacebook = r.status;
    out.respostaFacebook = await r.json().catch(() => ({}));
    out.resultado = r.status === 200 ? "OK: o Facebook aceitou. Veja o Purchase no Gerenciador de Eventos." : "ERRO: o Facebook recusou. Veja respostaFacebook.";
  } catch (e) { out.resultado = "ERRO de conexão com o Facebook"; }
  return res.status(200).json(out);
}
