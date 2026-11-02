// Configuração do checkout da Casa do Construtor.
// ⚠️ Os preços também existem em api/create-pix.ts e api/create-card.ts:
// o SERVIDOR é quem manda no valor cobrado. Se mudar um preço, mude nos 3 lugares.

export const STORE = {
  name: "Casa do Construtor",
  whatsapp: "", // Ex.: "5518999999999". Se vazio, o botão de WhatsApp não aparece.
  email: "",    // E-mail de atendimento (opcional)
};

// Ofertas. O id é o que a página do produto manda: /checkout/?p=ferramenta  ou  /checkout/?p=luminaria&qtd=1..4
export const OFFERS = {
  ferramenta: {
    id: "ferramenta", name: "Kit 4 em 1 Ferramentas 48V", short: "1 kit com maleta",
    priceCents: 14790, qty: 1, img: "/ferramenta/assets/p1.webp", back: "/ferramenta/",
  },
  "luminaria-1": {
    id: "luminaria-1", name: "Kit 2 Luminárias Poste Solar 2200W", short: "Compre 1 Leve 2 · 2 luminárias",
    priceCents: 9700, qty: 2, img: "/luminaria/assets/p1.webp", back: "/luminaria/",
  },
  "luminaria-2": {
    id: "luminaria-2", name: "Kit 4 Luminárias Poste Solar 2200W", short: "Compre 2 Leve 4 · 4 luminárias",
    priceCents: 13790, qty: 4, img: "/luminaria/assets/p1.webp", back: "/luminaria/",
  },
  "luminaria-3": {
    id: "luminaria-3", name: "Kit 6 Luminárias Poste Solar 2200W", short: "Compre 3 Leve 6 · 6 luminárias",
    priceCents: 15790, qty: 6, img: "/luminaria/assets/p1.webp", back: "/luminaria/",
  },
  "luminaria-4": {
    id: "luminaria-4", name: "Kit 8 Luminárias Poste Solar 2200W", short: "Compre 4 Leve 8 · 8 luminárias",
    priceCents: 17790, qty: 8, img: "/luminaria/assets/p1.webp", back: "/luminaria/",
  },
};

// Frete grátis pelos Correios. Confirme o prazo real antes de publicar.
export const SHIPPING = {
  correios: { id: "correios", name: "Correios", priceCents: 0, days: "5 a 8 dias úteis", logo: "/ferramenta/assets/correios.png" },
};

// Order bumps ("Aproveite e leve também"). Vazio = a seção não aparece.
// Para ativar, adicione aqui e em api/create-pix.ts e api/create-card.ts. Exemplo:
//   acessorio: { id: "acessorio", title: "Leve também ...", text: "Descrição curta.", priceCents: 1500, img: "/assets/acessorio.webp" },
export const BUMPS = {};
