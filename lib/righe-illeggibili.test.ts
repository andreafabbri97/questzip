import { describe, expect, it } from "vitest";
import { togliRigheIllegibili } from "./righe-illeggibili";

// Un dizionario finto: la regola non dipende da quale elenco si usa.
const PAROLE = new Set(
  (
    "emergere costa azioni lo zaratan riemerge dal guscio ed effettua un attacco può usare questa opzione solo se si trova " +
    "all interno del proprio il la creatura subisce soltanto metà di quei danni perforanti taglienti colpito condizioni " +
    "accecato affascinato privo incapacitato non è produrre fiamma multiattacco drago due attacchi con artigli percezione " +
    "passiva esegue azione disimpegno xvart bassa scaltrezza tiro salvezza incantesimo per fuggire afferrato statistiche " +
    "sue le magia studiare praticare vita a mago variante mind flayer arcanista oggetto magico bardatura opportunità " +
    "mummia nessuno chi sono io visto una lince esistenza cose che ne ti re arpione fino metri suo verso bersaglio"
  ).split(" "),
);
const nota = (p: string) => PAROLE.has(p);
const pulisci = (righe: string[]) => togliRigheIllegibili(righe.join("\n"), nota);

describe("togliRigheIllegibili: ciò che toglie", () => {
  // Lo Zaratan: tre righe di glifi dopo l'ultima azione leggendaria.
  it("i glifi di una citazione decorativa in coda alla sezione", () => {
    const esito = pulisci([
      "Emergere (costa 2 azioni). Lo zaratan riemerge dal guscio ed",
      "effettua un attacco. Può usare questa opzione",
      "solo se si trova all'interno del proprio guscio.",
      " 1",
      "• g;:e, 54",
      "§1 'i§ - ±'!:S: g+g!fW",
      "ifS",
    ]);
    expect(esito.testo.split("\n")).toHaveLength(3);
    expect(esito.tolte).toHaveLength(4);
  });

  it("le didascalie in maiuscolo e i nomi storpiati sotto le illustrazioni", () => {
    const esito = pulisci([
      "Multiattacco. Il drago effettua due attacchi con artigli.",
      "MUMMIA.",
      "BULETTR",
      "SaSS",
      "ATEVI AVANTI, STOLTI, SACCHEGGIATE I MIEI TESORI",
      "SAl.AMANDRA",
    ]);
    expect(esito.testo).toBe("Multiattacco. Il drago effettua due attacchi con artigli.");
  });

  it("il font calligrafico, riconoscibile dalla punteggiatura dentro le parole", () => {
    const esito = pulisci([
      "la creatura subisce soltanto la metà di quei danni.",
      "esistenza, uria,na,, 11orJe.nka,inen e io a,bbia,rio",
      "visto una, lince ia,nte. \"Eta, h, a, tissa, il",
      "0i\\>issi, chi sono io fe.r 10il'le.nC0it\"f'li ti un",
    ]);
    expect(esito.testo).toBe("la creatura subisce soltanto la metà di quei danni.");
  });

  // Fra una riga di glifi e l'altra restano mozziconi che da soli sembrerebbero innocui.
  it("le righe deboli solo quando stanno accanto al rumore", () => {
    const esito = pulisci([
      "la creatura subisce soltanto la metà di quei danni.",
      "ton Cùcce. 1e. cose. ser0ine. che. nùoC0ino ne.",
      "1i",
      "0i\\>issi, chi sono io fe.r 10il'le.nC0it\"f'li ti un",
      "rOito",
      "ti re.srin",
      "e.cco t 0icq.ùOi",
    ]);
    expect(esito.testo).toBe("la creatura subisce soltanto la metà di quei danni.");
  });

  it("un numero rimasto in fondo alla sezione, dopo l'ultima frase", () => {
    const esito = pulisci(["il bersaglio afferrato dal suo", "arpione fino a 6 metri.", "13,"]);
    expect(esito.testo).toBe("il bersaglio afferrato dal suo\narpione fino a 6 metri.");
  });

  it("la coda di glifi attaccata a una riga buona, lasciando la riga", () => {
    const esito = pulisci(["Bassa scaltrezza. Lo xvart esegue l'azione Disimpegno.::s zsq", "ec24J>;p e< q"]);
    expect(esito.testo).toBe("Bassa scaltrezza. Lo xvart esegue l'azione Disimpegno.");
    expect(esito.accorciate).toEqual([
      ["Bassa scaltrezza. Lo xvart esegue l'azione Disimpegno.::s zsq", "Bassa scaltrezza. Lo xvart esegue l'azione Disimpegno."],
    ]);
    expect(pulisci(["Colpito: 6 danni taglienti. i=========="]).testo).toBe("Colpito: 6 danni taglienti.");
  });
});

// Ogni caso qui sotto è una riga VERA che una versione precedente della regola toglieva.
// Una settantina di schede finivano così: dopo l'ultima frase, il nome del mostro stampato a piè
// di pagina (letto male) o due glifi, su una riga che da sola non sembra rumore.
describe("togliRigheIllegibili: la coda della sezione", () => {
  it("due glifi su una riga a sé, anche se uno è una parola", () => {
    const esito = pulisci(["la creatura subisce soltanto la metà di quei danni.", "e ez"]);
    expect(esito.testo).toBe("la creatura subisce soltanto la metà di quei danni.");
    expect(esito.tolte).toEqual(["e ez"]);
  });

  it("i glifi sulla stessa riga dell'ultima frase", () => {
    const esito = pulisci(["Colpito: 7 (2d6) danni perforanti. CRl1L.L"]);
    expect(esito.testo).toBe("Colpito: 7 (2d6) danni perforanti.");
    expect(esito.accorciate).toEqual([["Colpito: 7 (2d6) danni perforanti. CRl1L.L", "Colpito: 7 (2d6) danni perforanti."]]);
  });

  it("il nome del mostro in maiuscolo attaccato al punto", () => {
    expect(pulisci(["pari ai danni subiti dalla creatura..DRAGO"]).testo).toBe("pari ai danni subiti dalla creatura.");
    expect(pulisci(["fino al suo bersaglio.", "NO e.ON"]).testo).toBe("fino al suo bersaglio.");
  });

  it("la punteggiatura rimasta dopo una parentesi", () => {
    expect(pulisci(["taglienti (non è incapacitato)..d: ai t"]).testo).toBe("taglienti (non è incapacitato).");
  });

  // Il Goblin: la coda è corta solo dopo che la riga di glifi sotto è stata tolta. In una passata
  // sola deve venire lo stesso testo che in due.
  it("la coda che resta dopo aver tolto le righe di glifi sotto", () => {
    const righe = ["Colpito: 7 (2d6) danni perforanti., •. REE..", "§1 'i§ - ±'!:S: g+g!fW ifS §§ ±±"];
    const unaPassata = pulisci(righe).testo;
    expect(unaPassata).toBe("Colpito: 7 (2d6) danni perforanti.");
    expect(togliRigheIllegibili(unaPassata, nota).testo).toBe(unaPassata);
  });

  // Controesempi della revisione del codice: code corte senza una parola lunga, ma che sono dati.
  it("non una coda che ha la forma di un dato di gioco", () => {
    const base = "Il bersaglio subisce danni perforanti.";
    for (const coda of [" (CD 15)", "\n(CD 15)", " 7 (2d6)", " La CD è 15.", " +5", " 3 m", " 9/18 m"]) {
      expect(togliRigheIllegibili(base + coda, nota).testo).toBe(base + coda);
    }
  });

  it("non le virgolette che chiudono l'ultima frase", () => {
    const testo = 'Il drago effettua un attacco. "Xy!"';
    expect(togliRigheIllegibili(testo, nota).testo).toBe(testo);
  });

  it("non l'ultima voce di un elenco, che ha parole vere", () => {
    const righe = ["Il drago può usare le sue azioni.", "1/giorno: produrre fiamma"];
    expect(pulisci(righe).testo).toBe(righe.join("\n"));
  });

  it("non il titolo di un riquadro in fondo alla sezione", () => {
    const righe = ["Il drago effettua due attacchi.", "VARIANTE: MIND FLAYER ARCANISTA"];
    expect(pulisci(righe).testo).toBe(righe.join("\n"));
  });

  it("non una frase che continua senza punto", () => {
    const righe = ["Il drago effettua due attacchi con", "artigli"];
    expect(pulisci(righe).testo).toBe(righe.join("\n"));
  });

  // «creatura. 3. Blu»: la cifra di un elenco numerato non chiude una frase.
  it("non taglia dopo il numero di una voce d'elenco", () => {
    const righe = ["la creatura subisce danni.", "10. Re"];
    expect(pulisci(righe).tolte).toEqual(["10. Re"]);
    const elenco = ["la creatura subisce danni.", "10. Arpione fino al bersaglio"];
    expect(pulisci(elenco).testo).toBe(elenco.join("\n"));
  });
});

describe("togliRigheIllegibili: ciò che lascia", () => {
  it("una riga vera con un refuso dentro: va corretta, non tolta", () => {
    const righe = [
      "condizioni di accecato, affascinato, ac;c;ordato, privo di c;ensi.",
      "A volontà: produrre fiammo",
      "provocare att.icchi di opportunità.",
    ];
    expect(pulisci(righe)).toEqual({ testo: righe.join("\n"), tolte: [], accorciate: [] });
  });

  it("la parola sconosciuta che chiude la frase della riga prima", () => {
    const righe = ["finché la creatura non è", "lncapacitato."];
    expect(pulisci(righe).testo).toBe(righe.join("\n"));
    const prove = ["tiro salvezza con una prova di Saggezza", "(Percetione)."];
    expect(pulisci(prove).testo).toBe(prove.join("\n"));
  });

  it("la punteggiatura che chiude una riga: la prima versione tagliava dopo ogni parentesi", () => {
    const righe = [
      "(CD del tiro salvezza sull'incantesimo 20):",
      "il bersaglio è afferrato (CD 16 per fuggire); se la",
      "la magia. I",
    ];
    expect(pulisci(righe)).toEqual({ testo: righe.join("\n"), tolte: [], accorciate: [] });
  });

  it("i titoli dei riquadri che fanno parte della scheda", () => {
    const righe = ["VARIANTE: MIND FLAYER ARCANISTA", "OGGETTO MAGICO: BARDATURA"];
    expect(pulisci(righe).tolte).toEqual([]);
  });

  // Se il titolo di una sezione è rimasto dentro un'altra, la scheda va risuddivisa: toglierlo
  // nasconderebbe l'unico segno del guasto.
  it("i titoli di sezione rimasti nel testo", () => {
    expect(pulisci(["Bassa scaltrezza. Lo xvart esegue l'azione.", "AZIONI", "AZIONI BONUS"]).tolte).toEqual([]);
  });

  it("un numero da solo, se non è in fondo e non ha rumore accanto", () => {
    const righe = ["un tiro salvezza con CD", "13,", "il bersaglio subisce danni."];
    expect(pulisci(righe).testo).toBe(righe.join("\n"));
  });

  it("un testo pulito, per intero", () => {
    const testo = "Multiattacco. Il drago effettua due attacchi con artigli.\nColpito: 7 (2d6) danni taglienti.";
    expect(togliRigheIllegibili(testo, nota)).toEqual({ testo, tolte: [], accorciate: [] });
  });
});
