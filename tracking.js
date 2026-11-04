// Pixels (Meta e TikTok) + registro de movimentação do site (/api/track).
// Cole os IDs abaixo. Se um ID ficar vazio, aquele pixel simplesmente não carrega.
(function () {
  var META_PIXEL_ID = "1620017232920631";   // ex.: "1234567890123456"
  var TIKTOK_PIXEL_ID = ""; // ex.: "ABCDEF1234567890"

  if (META_PIXEL_ID) {
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', META_PIXEL_ID);
    fbq('track', 'PageView');
  }

  if (TIKTOK_PIXEL_ID) {
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
      var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
      ;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
      ttq.load(TIKTOK_PIXEL_ID);
      ttq.page();
    }(window, document, 'ttq');
  }

  // ---- Eventos extras do Meta Pixel: páginas, produto e todos os cliques ----
  function fb() { if (window.fbq) window.fbq.apply(null, arguments); }
  var path = location.pathname;
  var produto = null;
  if (path.indexOf("/ferramenta") === 0) produto = { content_name: "Kit 4 em 1 Ferramentas 48V", content_ids: ["ferramenta"], value: 97.9 };
  else if (path.indexOf("/luminaria") === 0) produto = { content_name: "Kit Luminárias Poste Solar", content_ids: ["luminaria"] };
  if (produto) fb("track", "ViewContent", Object.assign({ content_type: "product", currency: "BRL" }, produto));

  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest && e.target.closest("button, a, [role=button], label");
    if (!el) return;
    var texto = ((el.innerText || el.getAttribute("aria-label") || el.id || "") + "").trim().replace(/\s+/g, " ").slice(0, 60);
    if (!texto) return;
    fb("trackCustom", "ButtonClick", { button_text: texto, page: path });
    // Botões de compra viram AddToCart (na página do produto)
    if (produto && (el.hasAttribute("data-buy") || el.hasAttribute("data-sticky") || /comprar|quero|levar/i.test(texto))) {
      fb("track", "AddToCart", Object.assign({ content_type: "product", currency: "BRL" }, produto));
    }
  }, true);

  // Avisa o servidor (aparece nos Logs da Vercel): entrou, clicou, saiu. Nunca atrapalha o site.
  function send(data) {
    try {
      var body = JSON.stringify(data);
      var ok = navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }));
      if (!ok) fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  send({ evento: "entrou", pagina: location.pathname, origem: document.referrer || location.search || "direto" });
  var t0 = Date.now();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") send({ evento: "saiu", pagina: location.pathname, segundos: Math.round((Date.now() - t0) / 1000) });
  });
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest && e.target.closest("button, a");
    var texto = el && el.innerText && el.innerText.trim().replace(/\s+/g, " ");
    if (texto) send({ evento: "clicou", pagina: location.pathname, texto: texto });
  }, true);
})();
