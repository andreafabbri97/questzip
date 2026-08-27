import { describe, expect, it } from "vitest";

import {
  correggiSottotitoloIncantesimo,
  normalizzaGradoSfida,
  ricomponiParoleSpezzate,
  titoloItaliano,
} from "./compendio-ocr";

// Ogni caso qui sotto è una scheda che era davvero sparita dal Compendio (o ci era finita con il
// nome sbagliato): sono i controesempi trovati confrontando il Compendio con i manuali italiani.

describe("titoloItaliano", () => {
  it("lascia minuscoli articoli e preposizioni, come li stampa il manuale", () => {
    expect(titoloItaliano("BANCHETTO DEGLI EROI")).toBe("Banchetto degli Eroi");
    expect(titoloItaliano("INTERDIZIONE ALLE LAME")).toBe("Interdizione alle Lame");
    expect(titoloItaliano("CAMMINARE NEL VENTO")).toBe("Camminare nel Vento");
    expect(titoloItaliano("TEMPIO DEGLI DÈI")).toBe("Tempio degli Dèi");
  });

  it("tiene minuscolo anche l'articolo eliso e maiuscola la parola dopo l'apostrofo", () => {
    expect(titoloItaliano("CAMMINARE SULL'ACQUA")).toBe("Camminare sull'Acqua");
    expect(titoloItaliano("PROTEZIONE DALL'ENERGIA")).toBe("Protezione dall'Energia");
    expect(titoloItaliano("EVOCA BESTIA D'OMBRA")).toBe("Evoca Bestia d'Ombra");
  });

  it("la prima parola resta maiuscola anche se è una preposizione", () => {
    expect(titoloItaliano("IN CATENE")).toBe("In Catene");
  });

  it("mette la maiuscola dopo il trattino", () => {
    expect(titoloItaliano("GUSCIO ANTI-VITA")).toBe("Guscio Anti-Vita");
  });
});

describe("correggiSottotitoloIncantesimo", () => {
  it("rimette la I della scuola letta come 1, l o J", () => {
    // "Illusione Programmata", "Immagine Proiettata" e "Sembrare" mancavano tutte per questo
    expect(correggiSottotitoloIncantesimo("1llusione di 5° livello")).toBe("Illusione di 5° livello");
    expect(correggiSottotitoloIncantesimo("Jllusione di 5° livello")).toBe("Illusione di 5° livello");
  });

  it("rimette la cifra del livello letta come lettera", () => {
    // "Fuorviare"/Mislead: il grado esce come punto mediano e il 5 come "s"
    expect(correggiSottotitoloIncantesimo("Illusione di s· livello")).toBe("Illusione di 5· livello");
  });

  it("riconosce il livello anche quando 'livello' esce come 'livelJo'", () => {
    // "Orrido Avvizzimento di Abi-Dalzim", unico incantesimo mancante della Guida di Xanathar
    expect(correggiSottotitoloIncantesimo("Necromanzia di s° livelJo")).toBe("Necromanzia di 5° livelJo");
  });

  it("non tocca un sottotitolo già corretto", () => {
    expect(correggiSottotitoloIncantesimo("Abiurazione di 1° livello")).toBe("Abiurazione di 1° livello");
    expect(correggiSottotitoloIncantesimo("Trucchetto di Invocazione")).toBe("Trucchetto di Invocazione");
  });

  it("non trasforma una frase di prosa che comincia per l", () => {
    expect(correggiSottotitoloIncantesimo("l'incantatore evoca uno spirito")).toBe("l'incantatore evoca uno spirito");
  });
});

describe("normalizzaGradoSfida", () => {
  it("ricompone le cifre separate da uno spazio spurio", () => {
    expect(normalizzaGradoSfida("1 7")).toBe("17"); // Nagpa
    expect(normalizzaGradoSfida("2 4")).toBe("24");
  });

  it("lascia intatti i gradi già corretti, frazioni comprese", () => {
    expect(normalizzaGradoSfida("1/4")).toBe("1/4");
    expect(normalizzaGradoSfida("30")).toBe("30");
    expect(normalizzaGradoSfida("5")).toBe("5");
  });

  it("non inventa un grado che non esiste: tiene solo la prima cifra", () => {
    // "3 5" non è il grado 35: uno dei due numeri appartiene a un'altra colonna
    expect(normalizzaGradoSfida("3 5")).toBe("3");
  });
});

describe("ricomponiParoleSpezzate", () => {
  it("ricuce la parola spezzata dal maiuscoletto", () => {
    expect(ricomponiParoleSpezzate("I Mbottita")).toBe("Imbottita");
    expect(ricomponiParoleSpezzate("G Iaco di Maglia")).toBe("Giaco di Maglia");
    expect(ricomponiParoleSpezzate("Armatura Com Pleta")).toBe("Armatura Completa");
    expect(ricomponiParoleSpezzate("Martello da G Uerra")).toBe("Martello da Guerra");
  });

  it("non tocca un nome già intero", () => {
    expect(ricomponiParoleSpezzate("Ascia da Battaglia")).toBe("Ascia da Battaglia");
    expect(ricomponiParoleSpezzate("Corazza di Piastre")).toBe("Corazza di Piastre");
  });

  it("non fonde due parole vere che stanno bene così", () => {
    // "Kit" è corta ma la parola dopo è minuscola: nessuna fusione
    expect(ricomponiParoleSpezzate("Kit da Erborista")).toBe("Kit da Erborista");
  });
});
