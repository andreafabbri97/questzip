import { describe, expect, it } from "vitest";
import { pulisciNumeriStatBlock, pulisciTestoOcr, quotaIlleggibile } from "./ocr-cleanup";

describe("pulisciTestoOcr", () => {
  it("ripara l'intestazione ricorrente degli incantesimi", () => {
    expect(pulisciTestoOcr("Ai LireJ1i Superiori. Quando")).toBe("Ai Livelli Superiori. Quando");
    expect(pulisciTestoOcr("Ai Live1li Superiori.")).toBe("Ai Livelli Superiori.");
  });

  it("NON tocca la notazione dei dadi, che è il caso più frequente in assoluto", () => {
    const testo = "infligge 8d6 danni da fuoco, poi 1d4 e infine 2d10+3";
    expect(pulisciTestoOcr(testo)).toBe(testo);
  });

  it("riconosce l'articolo elidato letto come cifra", () => {
    expect(pulisciTestoOcr("raggiunge 1'11° livello")).toBe("raggiunge l'11° livello");
    expect(pulisciTestoOcr("1'incantatore")).toBe("l'incantatore");
  });

  it("stacca la congiunzione incollata a un dado", () => {
    expect(pulisciTestoOcr("(2d8o 2d12)")).toBe("(2d8 o 2d12)");
    expect(pulisciTestoOcr("1d4 lupi o1d4 ragni")).toBe("1d4 lupi o 1d4 ragni");
  });

  it("collassa gli spazi doppi ma lascia stare gli a capo", () => {
    expect(pulisciTestoOcr("una  parola")).toBe("una parola");
    expect(pulisciTestoOcr("riga uno\n\nriga due")).toBe("riga uno\n\nriga due");
  });
});

describe("quotaIlleggibile", () => {
  it("dà quota bassa a un testo italiano normale", () => {
    const buono =
      "Ogni creatura entro un raggio di 6 metri deve effettuare un tiro salvezza su Destrezza, subendo danni da fuoco se lo fallisce.";
    expect(quotaIlleggibile(buono)).toBeLessThan(0.1);
  });

  it("riconosce il rumore OCR puro", () => {
    const rumore = "647 Gfo7lf *+f 94 1397F sF9] Qfas] Fowìf fí. LPisld JFr7ipc colIvF EFdf_E";
    expect(quotaIlleggibile(rumore)).toBeGreaterThan(0.5);
  });

  it("ignora i frammenti troppo corti per giudicare", () => {
    expect(quotaIlleggibile("Ok")).toBe(0);
  });
});

describe("pulisciTestoOcr — altri pattern trovati nell'audit", () => {
  it("ripara la barra verticale letta al posto della elle", () => {
    expect(pulisciTestoOcr("Quando |'incantatore lancia")).toBe("Quando l'incantatore lancia");
  });

  it("ricompone i numeri spezzati davanti a un'unità di tempo", () => {
    expect(pulisciTestoOcr("Gemme 1 0 minuti")).toBe("Gemme 10 minuti");
    expect(pulisciTestoOcr("cristallo 1 2 ore")).toBe("cristallo 12 ore");
  });

  it("NON ricompone due numeri che non sono una durata", () => {
    expect(pulisciTestoOcr("colpisce 2 3 creature")).toBe("colpisce 2 3 creature");
  });

  it("riconosce la elle isolata usata al posto della cifra uno", () => {
    expect(pulisciTestoOcr("vegetale l giorno")).toBe("vegetale 1 giorno");
    expect(pulisciTestoOcr("preziosi l ora")).toBe("preziosi 1 ora");
  });

  it("non tocca la elle quando è un vero articolo davanti a una parola", () => {
    expect(pulisciTestoOcr("l'ora del giudizio")).toBe("l'ora del giudizio");
  });
});
describe("refusi OCR trovati nell'audit sui mostri e sugli oggetti", () => {
  it("ricostruisce la cifra 1 nella notazione dei dadi", () => {
    expect(pulisciTestoOcr("7 (ld6 + 4) danni")).toBe("7 (1d6 + 4) danni");
    expect(pulisciTestoOcr("recupera Id4 cariche")).toBe("recupera 1d4 cariche");
  });

  it("non tocca parole che finiscono davvero per ld/Id", () => {
    expect(pulisciTestoOcr("Il vecchio Idè rimasto")).toBe("Il vecchio Idè rimasto");
  });

  it("ripristina gli apostrofi persi", () => {
    expect(pulisciTestoOcr("Se lattacco va a segno")).toBe("Se l'attacco va a segno");
    expect(pulisciTestoOcr("una testa dariete spettrale")).toBe("una testa d'ariete spettrale");
    expect(pulisciTestoOcr("Leffetto termina")).toBe("L'effetto termina");
  });

  it("corregge lo zero letto come lettera O", () => {
    expect(pulisciTestoOcr("velocità pari a O.")).toBe("velocità pari a 0.");
    expect(pulisciTestoOcr("portata O m")).toBe("portata 0 m");
    expect(pulisciTestoOcr("entro 1O metri")).toBe("entro 10 metri");
  });

  it("stacca la preposizione dal numero", () => {
    expect(pulisciTestoOcr("spendere da 1 a3 cariche")).toBe("spendere da 1 a 3 cariche");
  });

  it("ricuce le parole spezzate a fine riga", () => {
    expect(pulisciTestoOcr("danni perforan ti.")).toBe("danni perforanti.");
    expect(pulisciTestoOcr("può colpi re il bersaglio")).toBe("può colpire il bersaglio");
  });

  it("non ricuce parole italiane che finiscono per re o no", () => {
    expect(pulisciTestoOcr("oppure no, il re decide")).toBe("oppure no, il re decide");
  });

  it("toglie gli underscore residui dell'OCR", () => {
    expect(pulisciTestoOcr("ogni _ giorno all'alba")).toBe("ogni giorno all'alba");
  });
});

// I campi numerici degli stat block sono in colonne strettissime nel PDF e l'OCR li spezza in modo
// sistematico. Non è solo un fastidio di estrazione: quei valori finiscono tali e quali nella
// scheda del mostro, quindi si leggeva "CA 1 4" al posto di "CA 14".
describe("pulisciNumeriStatBlock", () => {
  it("ricompone le cifre spezzate dalla colonna del PDF", () => {
    expect(pulisciNumeriStatBlock("1 4  (armatura naturale)")).toBe("14 (armatura naturale)");
    expect(pulisciNumeriStatBlock("304 (32d10 + 1 28)")).toBe("304 (32d10 + 128)");
  });

  it("ricostruisce la cifra 1 letta come lettera", () => {
    expect(pulisciNumeriStatBlock("l 5 (armatura naturale)")).toBe("15 (armatura naturale)");
    expect(pulisciNumeriStatBlock("136 (l 6d8 + 64)")).toBe("136 (16d8 + 64)");
    expect(pulisciNumeriStatBlock("51 (6dl 0  + 1 8)")).toBe("51 (6d10 + 18)");
  });

  it("lascia intatto un valore già corretto", () => {
    expect(pulisciNumeriStatBlock("12")).toBe("12");
    expect(pulisciNumeriStatBlock("27 (6d8)")).toBe("27 (6d8)");
    expect(pulisciNumeriStatBlock("9 (2d6 + 2)")).toBe("9 (2d6 + 2)");
  });
});

// Trovati completando l'abbinamento dei mostri: un ESC dentro "DRAGO D'ARGENTO ADULTO" rendeva la
// scheda irrintracciabile persino cercando "DGENTO", e nei punti ferita lo zero era letto come "O".
describe("caratteri di controllo e zeri letti come lettera", () => {
  it("elimina i caratteri di controllo lasciati dall'OCR", () => {
    expect(pulisciTestoOcr("DRAGO D\u001bGENTO")).toBe("DRAGO DGENTO");
    expect(pulisciTestoOcr("testo\u0000con\u0007rumore")).toBe("testoconrumore");
  });

  it("conserva gli a capo, che portano la struttura del testo", () => {
    expect(pulisciTestoOcr("prima\nseconda")).toBe("prima\nseconda");
  });

  it("converte in zero la O dentro un valore numerico", () => {
    expect(pulisciNumeriStatBlock("65 (10d1 O + l O)")).toBe("65 (10d10 + 10)");
    expect(pulisciNumeriStatBlock("6 5  (l Odl O + l O)")).toBe("65 (10d10 + 10)");
  });
});

// La congiunzione "o" letta come cifra zero: 98 oggetti magici dicevano "scegliere liberamente 0
// determinare a caso" o "di livello pari 0 inferiore al 7°". Uno zero vero, in queste schede, è
// sempre preceduto da "a" o seguito da un'unità di misura — ed è così che si distinguono.
describe("zero letto al posto della congiunzione o", () => {
  it("ripristina la congiunzione fra due parole", () => {
    expect(pulisciTestoOcr("scegliere liberamente 0 determinare a caso")).toBe(
      "scegliere liberamente o determinare a caso",
    );
    expect(pulisciTestoOcr("di livello pari 0 inferiore al 7°")).toBe("di livello pari o inferiore al 7°");
    expect(pulisciTestoOcr("una creatura di taglia Media 0 inferiore")).toBe(
      "una creatura di taglia Media o inferiore",
    );
  });

  it("ripristina la congiunzione anche dopo parentesi o virgola", () => {
    expect(pulisciTestoOcr("molto raro (bronzo) 0 leggendario (ferro)")).toBe(
      "molto raro (bronzo) o leggendario (ferro)",
    );
    expect(pulisciTestoOcr("guarigione (1 carica) 0 resurrezione")).toBe("guarigione (1 carica) o resurrezione");
  });

  it("non tocca uno zero vero", () => {
    expect(pulisciTestoOcr("quando scende a 0 punti ferita")).toBe("quando scende a 0 punti ferita");
    expect(pulisciTestoOcr("la verga possiede 0 cariche rimaste")).toBe("la verga possiede 0 cariche rimaste");
    expect(pulisciTestoOcr("velocità pari a 0 metri")).toBe("velocità pari a 0 metri");
  });
});
