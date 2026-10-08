import { describe, expect, it } from "vitest";
import {
  cuciPagine,
  eMaiuscoletto,
  ordineDiLettura,
  righeDiPagina,
  sfondoDi,
  unisciRighe,
  type Blocco,
  type PaginaOcr,
  type ParolaOcr,
} from "./ordine-di-lettura";

// Una pagina a due colonne come quelle dei manuali: lettere alte 28, righe ogni 42.
const ALTEZZA = 28;
const PASSO = 42;
const SINISTRA = 200;
const DESTRA = 1300;
const RIENTRO = 34;
const FINE_SINISTRA = 1100;
const FINE_DESTRA = 2200;
const CARTA: [number, number, number] = [250, 250, 250];
const TINTA: [number, number, number] = [246, 244, 231];
const CARTINA: [number, number, number] = [205, 224, 232];

interface Opzioni {
  /** Allunga l'ultima parola fino a qui: una riga piena. */
  fino?: number;
  h?: number;
  f?: [number, number, number];
  /** Ha il pallino di un elenco a sinistra. */
  p?: boolean;
}

function riga(testo: string, x: number, y: number, opzioni: Opzioni = {}): { parole: ParolaOcr[] } {
  const h = opzioni.h ?? ALTEZZA;
  const parole: ParolaOcr[] = [];
  let cursore = x;
  for (const t of testo.split(" ")) {
    const w = t.length * h * 0.5;
    parole.push({ t, x: cursore, y, w, h, f: opzioni.f ?? CARTA });
    cursore += w + h * 0.3;
  }
  const ultima = parole[parole.length - 1];
  if (opzioni.fino) ultima.w = opzioni.fino - ultima.x;
  if (opzioni.p) parole[0].p = 1;
  return { parole };
}

const pagina = (...righe: { parole: ParolaOcr[] }[]): PaginaOcr => ({ larghezza: 2400, altezza: 3200, righe });
const testi = (blocchi: Blocco[]) => blocchi.map((b) => b.testo);

describe("ordineDiLettura", () => {
  it("legge prima la colonna di sinistra, poi quella di destra", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("Zeta eta theta", DESTRA, 300, { fino: FINE_DESTRA }),
        riga("Alfa beta gamma", SINISTRA, 300, { fino: FINE_SINISTRA }),
        riga("iota kappa.", DESTRA, 300 + PASSO),
        riga("delta epsilon.", SINISTRA, 300 + PASSO),
      ),
    );
    expect(testi(blocchi)).toEqual(["Alfa beta gamma delta epsilon.", "Zeta eta theta iota kappa."]);
    expect(blocchi.map((b) => b.colonna)).toEqual([0, 1]);
  });

  it("una riga a tutta larghezza divide la pagina in fasce", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("Sopra a sinistra.", SINISTRA, 300),
        riga("Sopra a destra.", DESTRA, 300),
        riga("CAPITOLO SECONDO LA COSTA DELLA SPADA E IL NORD", 400, 500, { h: 56 }),
        riga("Sotto a sinistra.", SINISTRA, 700),
        riga("Sotto a destra.", DESTRA, 700),
      ),
    );
    expect(testi(blocchi)).toEqual(["Sopra a sinistra.", "Sopra a destra.", "CAPITOLO SECONDO LA COSTA DELLA SPADA E IL NORD", "Sotto a sinistra.", "Sotto a destra."]);
    expect(blocchi[2]).toMatchObject({ tipo: "titolo", colonna: -1, grandezza: 2 });
  });

  it("apre un capoverso dove la riga è rientrata", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("Primo capoverso che", SINISTRA + RIENTRO, 300, { fino: FINE_SINISTRA }),
        riga("continua qui.", SINISTRA, 300 + PASSO),
        riga("Secondo capoverso che", SINISTRA + RIENTRO, 300 + PASSO * 2, { fino: FINE_SINISTRA }),
        riga("finisce.", SINISTRA, 300 + PASSO * 3),
      ),
    );
    expect(testi(blocchi)).toEqual(["Primo capoverso che continua qui.", "Secondo capoverso che finisce."]);
    expect(blocchi.every((b) => b.rientrato)).toBe(true);
  });

  it("tiene insieme le voci appese: prima riga al margine, le altre rientrate", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("Linguaggi: Nanico o un altro", SINISTRA, 300, { fino: FINE_SINISTRA }),
        riga("linguaggio a scelta", SINISTRA + RIENTRO, 300 + PASSO),
        riga("Equipaggiamento: Strumenti da", SINISTRA, 300 + PASSO * 2, { fino: FINE_SINISTRA }),
        riga("artigiano", SINISTRA + RIENTRO, 300 + PASSO * 3),
      ),
    );
    expect(testi(blocchi)).toEqual(["Linguaggi: Nanico o un altro linguaggio a scelta", "Equipaggiamento: Strumenti da artigiano"]);
  });

  it("due capoversi rientrati di seguito restano due, anche se il primo è di una riga sola", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("Riga piena del capoverso che viene prima", SINISTRA, 300, { fino: FINE_SINISTRA }),
        riga("e finisce qui.", SINISTRA, 300 + PASSO),
        riga("Ma lui non è uno di loro di certo.", SINISTRA + RIENTRO, 300 + PASSO * 2, { fino: FINE_SINISTRA - 150 }),
        riga("Proviene da un luogo talmente lontano che", SINISTRA + RIENTRO, 300 + PASSO * 3, { fino: FINE_SINISTRA }),
        riga("pochi lo conoscono.", SINISTRA, 300 + PASSO * 4),
      ),
    );
    expect(testi(blocchi)).toEqual([
      "Riga piena del capoverso che viene prima e finisce qui.",
      "Ma lui non è uno di loro di certo.",
      "Proviene da un luogo talmente lontano che pochi lo conoscono.",
    ]);
  });

  it("una riga corta che resta in sospeso non chiude il capoverso", () => {
    // Accanto a una figura le righe sono strette: «dedicati a» è corta, ma la frase continua.
    const blocchi = ordineDiLettura(
      pagina(
        riga("Riga piena che dà la misura della colonna", SINISTRA, 300, { fino: FINE_SINISTRA }),
        riga("Non esistono templi dedicati a", SINISTRA, 300 + PASSO),
        riga("Jergal, se si eccettuano alcuni luoghi.", SINISTRA, 300 + PASSO * 2),
      ),
    );
    expect(testi(blocchi)).toEqual(["Riga piena che dà la misura della colonna Non esistono templi dedicati a Jergal, se si eccettuano alcuni luoghi."]);
  });

  it("ogni voce di un elenco puntato è un blocco a sé, e il seguito resta con la sua voce", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("Il consiglio è composto da questi individui:", SINISTRA, 300, { fino: FINE_SINISTRA }),
        riga("Laeral Silverhand, Lord Svelato", SINISTRA + RIENTRO, 300 + PASSO, { p: true }),
        riga("Ulder Ravengard, Granduca di Baldur's Gate e", SINISTRA + RIENTRO, 300 + PASSO * 2, { p: true, fino: FINE_SINISTRA }),
        riga("Maresciallo dei Pugni Fiammanti", SINISTRA + RIENTRO, 300 + PASSO * 3),
        riga("• Morwen Daggerford, Duchessa", SINISTRA + RIENTRO, 300 + PASSO * 4),
      ),
    );
    expect(testi(blocchi)).toEqual([
      "Il consiglio è composto da questi individui:",
      "Laeral Silverhand, Lord Svelato",
      "Ulder Ravengard, Granduca di Baldur's Gate e Maresciallo dei Pugni Fiammanti",
      "Morwen Daggerford, Duchessa",
    ]);
    expect(blocchi.map((b) => b.puntato)).toEqual([false, true, true, true]);
  });

  it("riconosce i titoli dal maiuscolo, e dall'altezza solo se richiesto", () => {
    const righe = [
      riga("BALDUR'S GATE", SINISTRA, 300, { h: 44 }),
      riga("Sulla Strada della Costa sorge la città.", SINISTRA, 380),
      riga("Riga Alta Ma Non In Maiuscolo", SINISTRA, 600, { h: 44 }),
      riga("Testo normale che segue quella riga.", SINISTRA, 700),
      riga("Altro testo normale di questa pagina.", SINISTRA, 700 + PASSO),
    ];
    const titoli = (blocchi: Blocco[]) => blocchi.filter((b) => b.tipo === "titolo").map((b) => b.testo);
    expect(titoli(ordineDiLettura(pagina(...righe)))).toEqual(["BALDUR'S GATE", "Riga Alta Ma Non In Maiuscolo"]);
    expect(titoli(ordineDiLettura(pagina(...righe), { altoComeTitolo: Infinity }))).toEqual(["BALDUR'S GATE"]);
  });

  it("una citazione composta più ariosa resta un capoverso solo", () => {
    const largo = 58;
    const blocchi = ordineDiLettura(
      pagina(
        riga("Primo rigo del testo normale", SINISTRA, 300, { fino: FINE_SINISTRA }),
        riga("secondo rigo del testo", SINISTRA, 300 + PASSO, { fino: FINE_SINISTRA }),
        riga("terzo rigo del testo", SINISTRA, 300 + PASSO * 2, { fino: FINE_SINISTRA }),
        riga("quarto rigo del testo", SINISTRA, 300 + PASSO * 3, { fino: FINE_SINISTRA }),
        riga("e qui finisce.", SINISTRA, 300 + PASSO * 4),
        riga("Per un secolo e mezzo", SINISTRA, 600, { fino: FINE_SINISTRA }),
        riga("la citazione continua", SINISTRA, 600 + largo, { fino: FINE_SINISTRA }),
        riga("fino in fondo.", SINISTRA, 600 + largo * 2),
      ),
    );
    expect(testi(blocchi)).toEqual([
      "Primo rigo del testo normale secondo rigo del testo terzo rigo del testo quarto rigo del testo e qui finisce.",
      "Per un secolo e mezzo la citazione continua fino in fondo.",
    ]);
  });

  it("la firma di una citazione sta su una riga sua", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("e soppresse l'incantesimo senza fatica", SINISTRA, 300, { fino: FINE_SINISTRA }),
        riga("alcuna.", SINISTRA, 300 + PASSO),
        riga("—Keith Francis Strohm, Bladesinger", SINISTRA + 400, 300 + PASSO * 2),
      ),
    );
    expect(testi(blocchi)).toEqual(["e soppresse l'incantesimo senza fatica alcuna.", "—Keith Francis Strohm, Bladesinger"]);
  });

  it("scarta ciò che sta sopra un'immagine e ciò che chi chiama non vuole", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("Testo vero della pagina.", SINISTRA, 300),
        riga("Bosco dei Denti Aguzzi", DESTRA, 300, { f: CARTINA }),
        riga("CAPITOLO 2 | LA COSTA DELLA SPADA", SINISTRA, 3050, { h: 22 }),
      ),
      { daScartare: (r, p) => r.y0 > p.altezza * 0.94 },
    );
    expect(testi(blocchi)).toEqual(["Testo vero della pagina."]);
  });

  it("riconosce un riquadro dal fondo tinto, se comincia col suo titolo", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("Testo prima del riquadro.", SINISTRA, 300),
        riga("NOTA PER IL DM", SINISTRA, 400, { f: TINTA }),
        riga("Le informazioni di questo capitolo", SINISTRA, 400 + PASSO, { f: TINTA, fino: FINE_SINISTRA }),
        riga("sono generiche di proposito", SINISTRA, 400 + PASSO * 2, { f: TINTA, fino: FINE_SINISTRA }),
        riga("e vanno adattate.", SINISTRA, 400 + PASSO * 3, { f: TINTA }),
        riga("Testo dopo il riquadro.", SINISTRA, 700),
      ),
    );
    expect(blocchi.map((b) => [b.testo, b.sfondo])).toEqual([
      ["Testo prima del riquadro.", "carta"],
      ["NOTA PER IL DM", "riquadro"],
      ["Le informazioni di questo capitolo sono generiche di proposito e vanno adattate.", "riquadro"],
      ["Testo dopo il riquadro.", "carta"],
    ]);
  });

  it("righe tinte senza un titolo in testa sono una macchia della carta, non un riquadro", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("Il capoverso comincia sulla carta bianca", SINISTRA, 300, { fino: FINE_SINISTRA }),
        riga("e prosegue dove la pagina è macchiata", SINISTRA, 300 + PASSO, { f: TINTA, fino: FINE_SINISTRA }),
        riga("per altre due righe intere", SINISTRA, 300 + PASSO * 2, { f: TINTA, fino: FINE_SINISTRA }),
        riga("fino al punto.", SINISTRA, 300 + PASSO * 3, { f: TINTA }),
      ),
    );
    expect(blocchi).toHaveLength(1);
    expect(blocchi[0].sfondo).toBe("carta");
  });

  it("un riquadro largo quanto la pagina ha il titolo su una riga sua e due colonne sotto", () => {
    const sinistra = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => riga(`riga ${n} della prima colonna`, SINISTRA, 400 + PASSO * n, { f: TINTA, fino: FINE_SINISTRA }));
    const destra = [0, 1, 2, 3, 4, 5, 6, 7].map((n) => riga(`riga ${n} della seconda colonna`, DESTRA, 400 + PASSO * n, { f: TINTA, fino: FINE_DESTRA }));
    // Il titolo attraversa il centro della pagina: è una riga larga, non di una colonna.
    const titolo = riga("LA LEGGENDA DEGLI ALIOSSI E DEL TRONO VUOTO DI JERGAL", 300, 320, { f: TINTA, fino: 2100 });
    const blocchi = ordineDiLettura(pagina(titolo, ...sinistra, ...destra, riga("Testo sotto, sulla carta.", SINISTRA, 900)));
    expect(blocchi.map((b) => [b.colonna, b.sfondo])).toEqual([
      [-1, "riquadro"],
      [0, "riquadro"],
      [0, "carta"],
      [1, "riquadro"],
    ]);
    expect(blocchi[3].testo).toContain("della seconda colonna");
  });

  it("senza il suo riquadro sotto, un titolo largo su fondo tinto è solo un titolo", () => {
    const titolo = riga("CAPITOLO SECONDO LA COSTA DELLA SPADA E IL NORD", 300, 320, { f: TINTA, fino: 2100 });
    const blocchi = ordineDiLettura(pagina(titolo, riga("Testo sulla carta bianca.", SINISTRA, 500)));
    expect(blocchi.map((b) => b.sfondo)).toEqual(["carta", "carta"]);
  });

  it("in un testo a tutta pagina i capoversi si riconoscono come in una colonna", () => {
    const larga = (testo: string, y: number, rientro = 0) => riga(testo, SINISTRA + rientro, y, { fino: FINE_DESTRA });
    const blocchi = ordineDiLettura(
      pagina(
        larga("Primo capoverso della pagina a una colonna sola, che occupa tutta la larghezza", 300),
        larga("e continua sulla riga dopo fino a chiudere la frase proprio in fondo alla riga.", 300 + PASSO),
        larga("Secondo capoverso, che si riconosce dal rientro e non dal punto che lo precede", 300 + PASSO * 2, RIENTRO),
        larga("perché anche questo riempie la riga fino al margine destro della pagina", 300 + PASSO * 3),
        riga("e finisce qui.", SINISTRA, 300 + PASSO * 4),
      ),
    );
    expect(testi(blocchi).slice(0, 2)).toEqual([
      "Primo capoverso della pagina a una colonna sola, che occupa tutta la larghezza e continua sulla riga dopo fino a chiudere la frase proprio in fondo alla riga.",
      "Secondo capoverso, che si riconosce dal rientro e non dal punto che lo precede perché anche questo riempie la riga fino al margine destro della pagina",
    ]);
    // L'ultima riga, corta, non attraversa il centro: esce a parte, e la riattacca cuciPagine.
    const pezzi = cuciPagine([{ pagina: 1, blocchi }]);
    expect(pezzi).toHaveLength(2);
    expect(pezzi[1].testo).toMatch(/^Secondo capoverso.*finisce qui\.$/);
  });

  it("la riga indicata da chi chiama apre comunque un capoverso", () => {
    const righe = [
      riga("Competenze nelle Abilità: Intuizione e Storia, più una", SINISTRA, 300, { fino: FINE_SINISTRA }),
      riga("Linguaggi: Nanico o un altro a scelta del giocatore", SINISTRA, 300 + PASSO, { fino: FINE_SINISTRA }),
    ];
    expect(ordineDiLettura(pagina(...righe))).toHaveLength(1);
    expect(testi(ordineDiLettura(pagina(...righe), { apreCapoverso: (r) => r.testo.startsWith("Linguaggi:") }))).toEqual([
      "Competenze nelle Abilità: Intuizione e Storia, più una",
      "Linguaggi: Nanico o un altro a scelta del giocatore",
    ]);
  });

  it("la firma sta su una riga sua anche se la riga sopra è piena e lei non è rientrata", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("e così soppresse l'incantesimo senza alcuna fatica.", SINISTRA, 300, { fino: FINE_SINISTRA }),
        riga("—Keith Francis Strohm, Bladesinger", SINISTRA, 300 + PASSO),
      ),
    );
    expect(testi(blocchi)).toEqual(["e così soppresse l'incantesimo senza alcuna fatica.", "—Keith Francis Strohm, Bladesinger"]);
  });

  it("una lineetta seguita da uno spazio è un inciso, non una firma", () => {
    const blocchi = ordineDiLettura(
      pagina(
        riga("dopo molti anni la fortezza dei nani che tutti credevano perduta", SINISTRA, 300, { fino: FINE_SINISTRA }),
        riga("— Mithral Hall — fu riconquistata dal suo re.", SINISTRA, 300 + PASSO),
      ),
    );
    expect(blocchi).toHaveLength(1);
  });
});

describe("righeDiPagina", () => {
  it("divide una riga che scavalca lo spazio fra le colonne", () => {
    const unite = { parole: [...riga("fine della sinistra", 800, 300).parole, ...riga("inizio della destra", DESTRA, 300).parole] };
    expect(righeDiPagina(pagina(unite)).map((r) => r.testo)).toEqual(["fine della sinistra", "inizio della destra"]);
  });

  it("ricuce la maiuscola iniziale letta come una riga a sé", () => {
    const iniziale = { parole: [{ t: "c", x: 234, y: 296, w: 14, h: 32, f: CARTA }] };
    const resto = riga("ome nel Player's Handbook", 249, 300);
    expect(righeDiPagina(pagina(iniziale, resto)).map((r) => r.testo)).toEqual(["Come nel Player's Handbook"]);
  });

  it("non restituisce due volte una riga quando un frammento le sta sopra", () => {
    // Un frammento stretto che comincia dove comincia la riga: non deve riattaccarsela in coda.
    const frammento = { parole: [{ t: "x", x: SINISTRA + 2, y: 302, w: 6, h: 28, f: CARTA }] };
    const righe = righeDiPagina(pagina(riga("Riga intera del testo", SINISTRA, 300), frammento));
    expect(righe.filter((r) => r.testo.includes("Riga intera del testo"))).toHaveLength(1);
  });

  it("non attacca alla riga un segno grande il doppio che le sta accanto", () => {
    const segno = { parole: [{ t: "qll))", x: 700, y: 250, w: 120, h: 110, f: CARTA }] };
    const righe = righeDiPagina(pagina(riga("tentare di", SINISTRA, 300), segno));
    expect(righe.map((r) => r.testo).sort()).toEqual(["qll))", "tentare di"]);
  });

  it("toglie il pallino letto come parola e segna la riga come voce di elenco", () => {
    const [letta] = righeDiPagina(pagina(riga("• Ulder Ravengard", SINISTRA, 300)));
    expect(letta).toMatchObject({ testo: "Ulder Ravengard", puntata: true });
    expect(righeDiPagina(pagina(riga("•", SINISTRA, 300)))).toEqual([]);
  });

  it("un pallino visto una volta sola sulla pagina è una macchiolina, non un elenco", () => {
    const [sola] = righeDiPagina(pagina(riga("lui compare un efreeti", SINISTRA, 300, { p: true })));
    expect(sola.puntata).toBe(false);
    const due = righeDiPagina(pagina(riga("Laeral Silverhand", SINISTRA, 300, { p: true }), riga("Dagult Neverember", SINISTRA, 342, { p: true })));
    expect(due.map((r) => r.puntata)).toEqual([true, true]);
    // Letto come parola dall'OCR, invece, basta da solo.
    expect(righeDiPagina(pagina(riga("• Ulder Ravengard", SINISTRA, 300)))[0].puntata).toBe(true);
    // Due macchioline incolonnate ma ai due capi della pagina non fanno un elenco.
    const lontane = righeDiPagina(pagina(riga("Un capoverso in cima", SINISTRA, 300, { p: true }), riga("Un altro in fondo", SINISTRA, 2800, { p: true })));
    expect(lontane.map((r) => r.puntata)).toEqual([false, false]);
  });

  it("toglie dalla riga la parola che sta a un'altra altezza", () => {
    const sporca = riga("può usare solo l'azione di Scatto", SINISTRA, 300);
    sporca.parole.push({ t: "qll", x: 1000, y: 180, w: 60, h: 28, f: CARTA });
    const [letta] = righeDiPagina(pagina(sporca));
    expect(letta.testo).toBe("può usare solo l'azione di Scatto");
    expect(letta.y0).toBe(300);
  });
});

describe("sfondoDi", () => {
  it("distingue la carta, il riquadro e l'immagine dal colore", () => {
    expect(sfondoDi([CARTA])).toBe("carta");
    expect(sfondoDi([[236, 235, 233]])).toBe("carta"); // una zona grigia della scansione
    expect(sfondoDi([TINTA])).toBe("riquadro");
    expect(sfondoDi([CARTINA])).toBe("immagine");
    expect(sfondoDi([[174, 182, 173]])).toBe("immagine");
    expect(sfondoDi([])).toBe("carta");
  });

  it("guarda il colore mediano, non una parola sola", () => {
    expect(sfondoDi([CARTA, CARTA, CARTINA])).toBe("carta");
  });
});

describe("eMaiuscoletto", () => {
  it("riconosce il maiuscoletto anche con le lettere tonde lette minuscole", () => {
    expect(eMaiuscoletto("ROCCHE NANICHE DEL NORD")).toBe(true);
    expect(eMaiuscoletto("Gloco Dl GAMBE")).toBe(true);
  });

  it("non scambia per maiuscoletto una riga di testo", () => {
    expect(eMaiuscoletto("solo")).toBe(false);
    // Una riga cortissima con una sigla dentro è la coda di una frase; tutta maiuscola è un titolo.
    expect(eMaiuscoletto("i PNG")).toBe(false);
    expect(eMaiuscoletto("TYR")).toBe(true);
    expect(eMaiuscoletto("o così")).toBe(false);
    expect(eMaiuscoletto("Sulla Strada della Costa")).toBe(false);
  });
});

describe("unisciRighe", () => {
  it("ricuce la parola spezzata dalla sillabazione", () => {
    expect(unisciRighe("la storia conti-", "nua più avanti")).toBe("la storia continua più avanti");
  });

  it("lascia il trattino che fa parte della parola", () => {
    expect(unisciRighe("anche Mantol-", "Derith, un avamposto")).toBe("anche Mantol-Derith, un avamposto");
    expect(unisciRighe("gittata di 6-", "8 metri")).toBe("gittata di 6-8 metri");
  });

  it("negli altri casi mette uno spazio", () => {
    expect(unisciRighe("fine della riga", "inizio dell'altra")).toBe("fine della riga inizio dell'altra");
    expect(unisciRighe("un inciso -", "così")).toBe("un inciso - così");
  });
});

describe("cuciPagine", () => {
  const blocco = (testo: string, altro: Partial<Blocco> = {}): Blocco => ({
    tipo: "capoverso",
    testo,
    grandezza: 1,
    y: 0,
    colonna: 0,
    sfondo: "carta",
    puntato: false,
    rientrato: false,
    staccato: false,
    ...altro,
  });
  const riassunto = (pagine: { pagina: number; blocchi: Blocco[] }[]) => cuciPagine(pagine).map((p) => `${p.tipo}${p.riquadro ? "*" : ""}: ${p.testo}`);

  it("un capoverso rimasto a metà prosegue nella colonna o nella pagina dopo", () => {
    expect(
      riassunto([
        { pagina: 1, blocchi: [blocco("Il paese deve il suo nome al"), blocco("fiume che lo attraversa, e la frase non", { staccato: true })] },
        { pagina: 2, blocchi: [blocco("finisce che qui.", { staccato: true }), blocco("Poi un altro capoverso.", { rientrato: true })] },
      ]),
    ).toEqual(["capoverso: Il paese deve il suo nome al fiume che lo attraversa, e la frase non finisce che qui.", "capoverso: Poi un altro capoverso."]);
  });

  it("non attacca a un capoverso finito quello che comincia dopo", () => {
    expect(
      riassunto([{ pagina: 1, blocchi: [blocco("Una frase finita."), blocco("Un'altra, in cima alla colonna.", { staccato: true })] }]),
    ).toEqual(["capoverso: Una frase finita.", "capoverso: Un'altra, in cima alla colonna."]);
  });

  it("una parentesi chiusa non chiude la frase", () => {
    expect(
      riassunto([{ pagina: 1, blocchi: [blocco("colture rampicanti (come zucche e fragole)"), blocco("o come pascoli per le pecore.", { staccato: true })] }]),
    ).toEqual(["capoverso: colture rampicanti (come zucche e fragole) o come pascoli per le pecore."]);
  });

  it("il seguito rientrato di una voce appesa si riattacca, perché comincia in minuscolo", () => {
    expect(
      riassunto([{ pagina: 1, blocchi: [blocco("forgiato da Gond e un'interdizione luminescente"), blocco("evocata da Mystra.", { staccato: true, rientrato: true })] }]),
    ).toEqual(["capoverso: forgiato da Gond e un'interdizione luminescente evocata da Mystra."]);
  });

  it("un riquadro che cade in mezzo a un capoverso aspetta che sia finito", () => {
    expect(
      riassunto([
        {
          pagina: 1,
          blocchi: [
            blocco("I rampolli vanno a studiare"),
            blocco("REGIONI DEI REAMI", { tipo: "titolo", sfondo: "riquadro", staccato: true }),
            blocco("Il Nord descrive un'area.", { sfondo: "riquadro" }),
            blocco("presso un maestro.", { staccato: true }),
            blocco("Cormyr. Un altro capoverso.", { rientrato: true }),
          ],
        },
      ]),
    ).toEqual(["capoverso: I rampolli vanno a studiare presso un maestro.", "titolo*: REGIONI DEI REAMI", "capoverso*: Il Nord descrive un'area.", "capoverso: Cormyr. Un altro capoverso."]);
  });

  it("le due colonne di un riquadro largo tornano una di seguito all'altra", () => {
    expect(
      riassunto([
        {
          pagina: 1,
          blocchi: [
            blocco("LA LEGGENDA", { tipo: "titolo", sfondo: "riquadro", staccato: true }),
            blocco("Prima colonna del riquadro, che non", { sfondo: "riquadro" }),
            blocco("JERGAL", { tipo: "titolo", grandezza: 1.5 }),
            blocco("Testo della voce, colonna di sinistra."),
            blocco("finisce che nella seconda.", { sfondo: "riquadro", staccato: true }),
            blocco("Testo della voce, colonna di destra.", { staccato: true }),
          ],
        },
      ]),
    ).toEqual([
      "titolo*: LA LEGGENDA",
      "capoverso*: Prima colonna del riquadro, che non finisce che nella seconda.",
      "titolo: JERGAL",
      "capoverso: Testo della voce, colonna di sinistra.",
      "capoverso: Testo della voce, colonna di destra.",
    ]);
  });

  it("la seconda colonna di un riquadro largo può avere più capoversi, e tutti lo raggiungono", () => {
    expect(
      riassunto([
        {
          pagina: 1,
          blocchi: [
            blocco("LA LEGGENDA", { tipo: "titolo", sfondo: "riquadro", staccato: true }),
            blocco("Prima colonna, finita.", { sfondo: "riquadro" }),
            blocco("JERGAL", { tipo: "titolo", grandezza: 1.5 }),
            blocco("Testo della voce."),
            blocco("Seconda colonna, primo capoverso.", { sfondo: "riquadro", staccato: true }),
            blocco("Seconda colonna, secondo capoverso.", { sfondo: "riquadro", rientrato: true }),
            blocco("Ancora testo della voce.", { staccato: true }),
          ],
        },
      ]),
    ).toEqual([
      "titolo*: LA LEGGENDA",
      "capoverso*: Prima colonna, finita.",
      "capoverso*: Seconda colonna, primo capoverso.",
      "capoverso*: Seconda colonna, secondo capoverso.",
      "titolo: JERGAL",
      "capoverso: Testo della voce.",
      "capoverso: Ancora testo della voce.",
    ]);
  });

  it("un riquadro che continua nella pagina dopo tiene per ogni pezzo la sua pagina", () => {
    const pezzi = cuciPagine([
      { pagina: 3, blocchi: [blocco("Testo."), blocco("RIQUADRO", { tipo: "titolo", sfondo: "riquadro", staccato: true }), blocco("Comincia qui.", { sfondo: "riquadro" })] },
      { pagina: 4, blocchi: [blocco("E finisce qui.", { sfondo: "riquadro", rientrato: true, staccato: true }), blocco("Altro testo.", { rientrato: true })] },
    ]);
    expect(pezzi.filter((p) => p.riquadro).map((p) => p.pagina)).toEqual([3, 3, 4]);
  });

  it("la voce di un elenco rimasta a metà in fondo alla colonna si finisce in cima alla successiva", () => {
    expect(
      riassunto([
        {
          pagina: 1,
          blocchi: [
            blocco("La prima parola accende la gemma.", { puntato: true }),
            blocco("La terza parola sprigiona una luce accecante in un cono di 9 metri", { puntato: true }),
            blocco("originato dalla gemma.", { staccato: true }),
            blocco("Poi il testo riprende.", { rientrato: true }),
          ],
        },
      ]),
    ).toEqual([
      "elenco: - La prima parola accende la gemma.\n- La terza parola sprigiona una luce accecante in un cono di 9 metri originato dalla gemma.",
      "capoverso: Poi il testo riprende.",
    ]);
  });

  it("le voci puntate di seguito tornano un elenco solo", () => {
    expect(
      riassunto([
        {
          pagina: 1,
          blocchi: [blocco("Questi individui:"), blocco("Laeral Silverhand", { puntato: true }), blocco("Dagult Neverember", { puntato: true }), blocco("Poi il testo riprende.")],
        },
      ]),
    ).toEqual(["capoverso: Questi individui:", "elenco: - Laeral Silverhand\n- Dagult Neverember", "capoverso: Poi il testo riprende."]);
  });

  it("ricorda la pagina in cui ogni pezzo comincia", () => {
    const pezzi = cuciPagine([
      { pagina: 7, blocchi: [blocco("Comincia qui e")] },
      { pagina: 8, blocchi: [blocco("finisce nella pagina dopo.", { staccato: true }), blocco("Questo è della otto.", { rientrato: true })] },
    ]);
    expect(pezzi.map((p) => p.pagina)).toEqual([7, 8]);
  });
});
