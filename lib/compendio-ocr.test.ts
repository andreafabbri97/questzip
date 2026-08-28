import { describe, expect, it } from "vitest";

import {
  correggiSottotitoloIncantesimo,
  normalizzaGradoSfida,
  ricomponiParoleSpezzate,
  titoloItaliano,
  rigaIllegibile,
  unisciRigheDiScheda,
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

describe("rigaIllegibile", () => {
  it("riconosce le citazioni decorative in font non leggibile", () => {
    // la citazione di Bigby in fondo al capitolo dei talenti: finiva in coda al talento
    // "Vigore dei Giganti delle Colline", che risultava di 2.448 caratteri invece di 1.100
    expect(rigaIllegibile("Nuo'lo Cotro, nvo'I) (),'l'l)IJCu=! L(), rtil'I(), vo!C(), eh) ho inconCt(),Co")).toBe(true);
    expect(rigaIllegibile("n)t SoCC)tt(),n)i SoCCo !(), S(),!(), J)l sino= J)i tº(),nCt J)ll) collin).")).toBe(true);
  });

  it("non scarta prosa vera, nemmeno quella piena di numeri e simboli", () => {
    expect(rigaIllegibile("La CD del tiro salvezza è pari a 8 + il bonus di competenza")).toBe(false);
    expect(rigaIllegibile("Colpo delle colline. Il bersaglio subisce ld6 danni extra")).toBe(false);
    expect(rigaIllegibile("Incremento dei punteggi di caratteristica. Il suo punteggio")).toBe(false);
  });

  it("lascia stare le righe corte, dove non c'è abbastanza testo per giudicare", () => {
    expect(rigaIllegibile("·- t?iby")).toBe(false);
    expect(rigaIllegibile("massimo di 20.")).toBe(false);
  });
});

describe("unisciRigheDiScheda", () => {
  it("stacca il prerequisito dalla descrizione", () => {
    // Presagio di Sventura, supplica occulta: "Prerequisito: 5° livello Il warlock può lanciare…"
    expect(
      unisciRigheDiScheda([
        "Prerequisito: 5° livello",
        "Il warlock può lanciare scagliare maledizione una volta",
        "usando uno slot incantesimo da warlock.",
      ]),
    ).toBe(
      "Prerequisito: 5° livello\n\nIl warlock può lanciare scagliare maledizione una volta usando uno slot incantesimo da warlock.",
    );
  });

  it("tiene insieme un prerequisito andato a capo", () => {
    // sui manuali il prerequisito lungo si spezza, ma riprende sempre in minuscolo o con una ")"
    expect(
      unisciRigheDiScheda([
        "Prerequisito: talento Colpo dei giganti (Colpo del",
        "gelo) di 4° livello",
        "Il personaggio ha manifestato la potenza glaciale.",
      ]),
    ).toBe(
      "Prerequisito: talento Colpo dei giganti (Colpo del gelo) di 4° livello\n\nIl personaggio ha manifestato la potenza glaciale.",
    );
  });

  it("riattacca il grado del livello rimasto orfano sulla riga dopo", () => {
    // Tomba di Levistus (Guida di Xanathar): il PDF spezza "5° livello" fra due righe
    expect(
      unisciRigheDiScheda([
        "Prerequisito: 5",
        "° livello",
        "Come reazione, quando il warlock subisce danni,",
      ]),
    ).toBe("Prerequisito: 5 ° livello\n\nCome reazione, quando il warlock subisce danni,");
  });

  it("stacca anche l'oggetto richiesto dalle infusioni dell'Artefice", () => {
    expect(
      unisciRigheDiScheda([
        "Prerequisiti: artefice di 10° livello",
        "Oggetto: un elmo (richiede sintonia)",
        "Mentre indossa questo elmo, una creatura ha un vantaggio",
      ]),
    ).toBe(
      ["Prerequisiti: artefice di 10° livello", "Oggetto: un elmo (richiede sintonia)", "Mentre indossa questo elmo, una creatura ha un vantaggio"].join("\n\n"),
    );
  });

  it("lascia la prosa senza prerequisito in un paragrafo solo", () => {
    expect(unisciRigheDiScheda(["Il warlock può lanciare", "saltare a volontà."])).toBe(
      "Il warlock può lanciare saltare a volontà.",
    );
  });
});
