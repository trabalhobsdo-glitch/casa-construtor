/* ====== CONFIGURE AQUI ====== */
const CONFIG = {
  // checkout da Zedy, um link por opção: Compre 1 Leve 2, Compre 2 Leve 4, Compre 3 Leve 6, Compre 4 Leve 8
  checkoutUrls: [
    "https://seguro.casadoconstrutor.site/api/public/shopify?product=68040052146485&store=40661",
    "https://seguro.casadoconstrutor.site/api/public/shopify?product=68040052179253&store=40661",
    "https://seguro.casadoconstrutor.site/api/public/shopify?product=68040052212021&store=40661",
    "https://seguro.casadoconstrutor.site/api/public/shopify?product=68040052244789&store=40661"
  ],
  precos: [109.90, 137.90, 157.90, 177.90], // preço de cada opção: Compre 1 Leve 2, Compre 2 Leve 4, Compre 3 Leve 6, Compre 4 Leve 8
  precoDeKit: 450.02,         // preço "de" de 1 kit (riscado); nas outras opções é multiplicado pela quantidade
  parcelas: 10,
  prazoMinDiasUteis: 5,       // entrega mais rápida (em dias úteis) -> TROQUE pelo seu prazo real
  prazoMaxDiasUteis: 8        // entrega mais demorada (em dias úteis) -> TROQUE pelo seu prazo real
};
/* ============================ */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const brl = n => n.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

// Estrelas em SVG (sem emoji nem caractere de estrela)
$$(".stars").forEach(el=>{
  const n = +el.dataset.n;
  el.innerHTML = Array.from({length:5},(_,i)=>`<svg class="${i<n?"":"off"}"><use href="#st"/></svg>`).join("");
});

// Galeria
const imgs = Array.from({length:10},(_,i)=>`assets/p${i+1}.webp`);
let cur = 0;
$("#thumbs").innerHTML = imgs.map((s,i)=>`<button class="${i?"":"on"}" data-i="${i}" aria-label="Foto ${i+1}"><img src="${s}" alt="" loading="lazy"></button>`).join("");
function show(i){
  cur = (i+imgs.length)%imgs.length;
  $("#mainImg").src = imgs[cur];
  $("#count").textContent = (cur+1)+" / "+imgs.length;
  $$("#thumbs button").forEach((b,k)=>b.classList.toggle("on",k===cur));
}
$("#thumbs").addEventListener("click",e=>{const b=e.target.closest("button"); if(b) show(+b.dataset.i);});
$("#thumbs").addEventListener("mouseover",e=>{const b=e.target.closest("button"); if(b && matchMedia("(hover:hover)").matches) show(+b.dataset.i);});
$("#prev").onclick = ()=>show(cur-1);
$("#next").onclick = ()=>show(cur+1);

// Fotos de clientes + ampliar
const fotos = ["1.1","1.2","2.1","3.1","4.1","5.1","6.1","7.1","8.1","9.1"].map(n=>`assets/r${n}.webp`);
$("#rphotos").innerHTML = fotos.map(s=>`<img src="${s}" alt="Foto de cliente" loading="lazy">`).join("");
const lb = $("#lb");
$("#rphotos").addEventListener("click",e=>{ if(e.target.tagName!=="IMG") return; lb.querySelector("img").src = e.target.src; lb.showModal(); });
lb.addEventListener("click",()=>lb.close());

// Kits
let kits = 1;
$("#tiers").innerHTML = [1,2,3,4].map(n=>`<button data-n="${n}" class="${n===1?"on":""}"><b>Compre ${n}</b><span>Leve ${n*2}</span><em style="display:block;font-style:normal;font-weight:700;font-size:.82rem;color:var(--gr);margin-top:3px">${brl(CONFIG.precos[n-1])}</em></button>`).join("");
function update(){
  const total = CONFIG.precos[kits-1];
  const de = CONFIG.precoDeKit*kits;
  const pct = Math.round((1-total/de)*100)+"% OFF";
  $(".price s").textContent = brl(de);
  $(".sticky s").textContent = brl(de);
  $(".flag").textContent = pct;
  $(".now em").textContent = pct;
  $("#price").textContent = brl(total);
  $("#parc").textContent = brl(total/CONFIG.parcelas);
  $$(".pr").forEach(e=>e.textContent = brl(total));
  $("#qtyTxt").textContent = kits*2+" luminárias";
}
$("#tiers").onclick = e=>{ const b=e.target.closest("button"); if(!b) return; kits=+b.dataset.n;
  $$("#tiers button").forEach(x=>x.classList.toggle("on",x===b)); update(); };

// Botões
const oferta = $("#comprar");
const irParaOferta = ()=>oferta.scrollIntoView({behavior:"smooth",block:"start"});
function irParaCheckout(){
  const url = CONFIG.checkoutUrls[kits-1];
  if(!url) return irParaOferta();
  location.href = url;
}
$$("[data-buy]").forEach(b=>b.addEventListener("click",e=>{ e.preventDefault();
  // o botão do final da página volta para a oferta; o da oferta vai ao checkout
  const r = oferta.getBoundingClientRect();
  (r.top < innerHeight*0.6 && r.bottom > innerHeight*0.2) ? irParaCheckout() : irParaOferta(); }));
$$("[data-sticky]").forEach(b=>b.addEventListener("click",e=>{ e.preventDefault();
  const r = oferta.getBoundingClientRect();
  (r.top < innerHeight*0.6 && r.bottom > innerHeight*0.2) ? irParaCheckout() : irParaOferta(); }));

// Previsão de entrega: soma dias úteis a partir de hoje
function somaDiasUteis(inicio,n){
  const d = new Date(inicio);
  while(n>0){ d.setDate(d.getDate()+1); const w=d.getDay(); if(w!==0&&w!==6) n--; }
  return d;
}
const fmtData = d => d.toLocaleDateString("pt-BR",{weekday:"short"}).replace(".","")+", "+d.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"});
const hoje = new Date();
$("#entrega").innerHTML = "Chega entre <b>"+fmtData(somaDiasUteis(hoje,CONFIG.prazoMinDiasUteis))+"</b> e <b>"+fmtData(somaDiasUteis(hoje,CONFIG.prazoMaxDiasUteis))+"</b>.";
update();
