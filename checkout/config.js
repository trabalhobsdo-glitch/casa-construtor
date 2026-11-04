/* ====== CONFIGURE AQUI ====== */
const CONFIG = {
  checkoutUrl: "/checkout/?p=ferramenta", // checkout próprio da loja
  precoKit: 97.90
};
/* ============================ */
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// Galeria principal
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

// 12 fotos exibidas junto das opiniões
const fotos = Array.from({length:12},(_,i)=>`assets/kit-foto-${i+1}.webp`);
$("#rphotos").innerHTML = fotos.map((s,i)=>`<img src="${s}" alt="Foto de comprador ${i+1}" loading="lazy">`).join("");
const lb = $("#lb");
$("#rphotos").addEventListener("click",e=>{if(e.target.tagName!=="IMG") return; lb.querySelector("img").src=e.target.src; lb.showModal();});
lb.addEventListener("click",e=>{if(e.target===lb || e.target.tagName==="BUTTON") lb.close();});

// Oferta fixa: somente 1 kit por R$ 97,90
const preco = CONFIG.precoKit.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const price = $("#price");
if(price) price.textContent = preco;
$$(".pr").forEach(e=>e.textContent=preco);

// Botões de compra
const oferta=$("#comprar");
const irParaOferta=()=>oferta.scrollIntoView({behavior:"smooth",block:"start"});
function irParaCheckout(){
  if(!CONFIG.checkoutUrl) return irParaOferta();
  location.href=CONFIG.checkoutUrl;
}
$$("[data-buy]").forEach(b=>b.addEventListener("click",e=>{
  e.preventDefault();
  const r=oferta.getBoundingClientRect();
  (r.top<innerHeight*.6 && r.bottom>innerHeight*.2) ? irParaCheckout() : irParaOferta();
}));
$$("[data-sticky]").forEach(b=>b.addEventListener("click",e=>{
  e.preventDefault();
  const r=oferta.getBoundingClientRect();
  (r.top<innerHeight*.6 && r.bottom>innerHeight*.2) ? irParaCheckout() : irParaOferta();
}));
