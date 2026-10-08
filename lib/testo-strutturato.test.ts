import { describe, expect, it } from "vitest";
import { classificaBlocchi, siApreConTitolo } from "./testo-strutturato";

const tipi = (blocchi: string[], nomiVoce?: string[]) => classificaBlocchi(blocchi, { nomiVoce }).map((b) => b.tipo);

describe("classificaBlocchi: le schede a etichette", () => {
  // Il caso dello screenshot: «Abitante della Magia Morta», cinque titoli uno sotto l'altro.
  const background = [
    "Abitante della Magia Morta",
    "Caratteristiche: Forza, Costituzione, Saggezza",
    "Talento: Guaritore",
    "Competenze nelle Abilità: Medicina e Sopravvivenza",
    "Competenze negli Strumenti: Utensili da conciatore",
    "Equipaggiamento: Scegli A o B: (A) Bastone ferrato, utensili da conciatore, sacco a pelo, coperta, kit da guaritore; oppure (B) 50 mo",
  ];

  it("rende etichetta e valore, non cinque titoli", () => {
    const blocchi = classificaBlocchi(background, { nomiVoce: ["Abitante della Magia Morta", "Dead Magic Dweller"] });
    expect(blocchi.map((b) => b.tipo)).toEqual(["etichetta", "etichetta", "etichetta", "etichetta", "etichetta"]);
    expect(blocchi[0]).toEqual({ tipo: "etichetta", etichetta: "Caratteristiche", valore: "Forza, Costituzione, Saggezza" });
    // La riga lunga ha la stessa forma delle altre: prima restava l'unica senza grassetto.
    expect(blocchi[4]).toMatchObject({ tipo: "etichetta", etichetta: "Equipaggiamento" });
  });

  it("toglie il nome della voce ripetuto in apertura, in qualunque lingua sia scritto", () => {
    expect(tipi(background, ["Abitante della Magia Morta"])[0]).toBe("etichetta");
    expect(tipi(["Dead Magic Dweller", ...background.slice(1)], ["Abitante", "Dead Magic Dweller"])[0]).toBe("etichetta");
    expect(tipi(["ACCOLITO", "Linguaggi: Due a scelta", "Tratto: Rifugio dei Fedeli"], ["Accolito"])).toEqual([
      "etichetta",
      "etichetta",
    ]);
  });

  it("senza sapere il nome della voce lo lascia come titolo", () => {
    expect(tipi(background)[0]).toBe("titolo");
  });

  it("non toglie un titolo uguale al nome se non è la prima riga", () => {
    expect(tipi(["Un paragrafo che spiega qualcosa.", "Accolito", "Altro testo che segue il titolo."], ["Accolito"])).toEqual([
      "paragrafo",
      "titolo",
      "paragrafo",
    ]);
  });

  // 126 voci hanno in cima il nome scritto in un altro modo rispetto al titolo mostrato: non lo
  // si riconosce dal confronto, ma dal fatto che l'originale inglese non si apre con un titolo.
  it("toglie il nome scritto diversamente quando l'originale non si apre con un titolo", () => {
    const anarchico = ["Anarca Gruul", ...background.slice(1)];
    expect(tipi(anarchico, ["Anarchico Gruul", "Gruul Anarch"])[0]).toBe("titolo");
    expect(
      classificaBlocchi(anarchico, { nomiVoce: ["Anarchico Gruul", "Gruul Anarch"], originaleApreConTitolo: false })[0],
    ).toMatchObject({ tipo: "etichetta", etichetta: "Caratteristiche" });

    const stivali = ["[Stivali della Rapidità]", "Mentre indossi questi stivali puoi usare un'azione bonus per battere i talloni."];
    expect(classificaBlocchi(stivali, { originaleApreConTitolo: false }).map((b) => b.tipo)).toEqual(["paragrafo"]);
  });

  it("lascia il titolo d'apertura quando anche l'originale si apre con un titolo, o non lo si sa", () => {
    const razza = ["Età", "Gli aasimar maturano alla stessa velocità degli umani."];
    expect(classificaBlocchi(razza, { originaleApreConTitolo: true }).map((b) => b.tipo)).toEqual(["titolo", "paragrafo"]);
    expect(classificaBlocchi(razza).map((b) => b.tipo)).toEqual(["titolo", "paragrafo"]);
  });

  // Trovato in revisione: «in apertura» non è «il primo blocco». Un rimando crudo in testa viene
  // scartato, e il nome che lo segue è comunque la prima cosa che si leggerebbe.
  it("riconosce il nome in apertura anche dopo un rimando crudo", () => {
    const blocchi = classificaBlocchi(["{#itemEntry Ring of Resistance|DMG}", "Anello della Resistenza", "Hai resistenza a un tipo di danno."], {
      originaleApreConTitolo: false,
    });
    expect(blocchi).toEqual([{ tipo: "paragrafo", testo: "Hai resistenza a un tipo di danno." }]);
  });

  // 128 voci hanno in cache SOLO il nome: il risultato vuoto è il segnale con cui chi disegna
  // ricade sulla traduzione al volo invece di mostrare un riquadro senza testo.
  it("di una traduzione fatta del solo nome non resta niente", () => {
    expect(classificaBlocchi(["Animare Oggetti"], { nomiVoce: ["Animare Oggetti", "Animate Objects"] })).toEqual([]);
    expect(classificaBlocchi(["Modificare sé Stessi"], { nomiVoce: ["Alterare Se Stesso"], originaleApreConTitolo: false })).toEqual([]);
  });

  it("toglie solo la prima riga: un titolo più avanti resta", () => {
    const blocchi = classificaBlocchi(["Pietra del Cuore", "Proprietà Casuali", "La pietra pulsa debolmente quando la si tiene in mano."], {
      originaleApreConTitolo: false,
    });
    expect(blocchi.map((b) => b.tipo)).toEqual(["titolo", "paragrafo"]);
    expect(blocchi[0]).toEqual({ tipo: "titolo", testo: "Proprietà Casuali" });
  });

  // Una riga isolata con i due punti può essere un titolo vero: serve che siano più d'una.
  it("lascia titolo una riga con i due punti rimasta da sola", () => {
    expect(tipi(["Parte 1: Creare un Personaggio", "Il primo passo per giocare è immaginare un personaggio tutto tuo."])).toEqual([
      "titolo",
      "paragrafo",
    ]);
  });

  it("riconosce anche da sole le etichette che i manuali stampano sopra la descrizione", () => {
    const blocchi = classificaBlocchi(["Prerequisiti: artefice di 6° livello", "Questo anello accumula incantesimi."]);
    expect(blocchi[0]).toEqual({ tipo: "etichetta", etichetta: "Prerequisiti", valore: "artefice di 6° livello" });
  });

  it("non scambia per scheda i titoli di capitolo in maiuscolo", () => {
    expect(tipi(["CAPITOLO 9: COMBATTIMENTO", "PARTE 2: GIOCARE"])).toEqual(["titolo", "titolo"]);
  });

  it("ripulisce i due punti seguiti da un punto lasciati dalla conversione", () => {
    const blocchi = classificaBlocchi(["Abilità:. Saggezza", "Utilizzare:. Discernere se qualcuno sta imbrogliando (CD 10)"]);
    expect(blocchi).toEqual([
      { tipo: "etichetta", etichetta: "Abilità", valore: "Saggezza" },
      { tipo: "etichetta", etichetta: "Utilizzare", valore: "Discernere se qualcuno sta imbrogliando (CD 10)" },
    ]);
  });

  // Un'azione di mostro comincia con «Nome.»: i due punti vengono dopo un punto, non è un'etichetta.
  it("non prende per etichetta una frase che ha un punto prima dei due punti", () => {
    const riga = "Morso. Attacco con Arma da Mischia: +4 al tiro per colpire, portata 1,5 m, un bersaglio.";
    expect(tipi([riga, riga])).toEqual(["paragrafo", "paragrafo"]);
  });
});

describe("classificaBlocchi: frasi che annunciano un elenco", () => {
  // L'Ascia dei Signori dei Nani: cinque titoli in fila, di cui uno era una frase intera.
  it("la frase con i due punti è un paragrafo e le righe brevi dopo sono il suo elenco", () => {
    const blocchi = classificaBlocchi([
      "Proprietà Casuali",
      "L'ascia possiede le seguenti proprietà determinate casualmente:",
      "2 proprietà benefiche minori",
      "1 proprietà benefica maggiore",
      "2 proprietà dannose minori",
      "Benedizioni di Moradin. Mentre sei in sintonia con l'ascia, la tua Costituzione aumenta di 2.",
      "Evoca Elementale",
    ]);
    expect(blocchi).toEqual([
      { tipo: "titolo", testo: "Proprietà Casuali" },
      { tipo: "paragrafo", testo: "L'ascia possiede le seguenti proprietà determinate casualmente:" },
      { tipo: "elenco", voci: ["2 proprietà benefiche minori", "1 proprietà benefica maggiore", "2 proprietà dannose minori"] },
      { tipo: "paragrafo", testo: "Benedizioni di Moradin. Mentre sei in sintonia con l'ascia, la tua Costituzione aumenta di 2." },
      // L'elenco è finito col paragrafo: questa riga breve è di nuovo un titolo.
      { tipo: "titolo", testo: "Evoca Elementale" },
    ]);
  });

  it("se dopo i due punti vengono frasi intere restano paragrafi", () => {
    expect(
      tipi(["Ottieni i seguenti benefici:", "Il tuo punteggio di Forza aumenta di 1, fino a un massimo di 20.", "Hai vantaggio alle prove di Forza."]),
    ).toEqual(["paragrafo", "paragrafo", "paragrafo"]);
  });

  // I casi che seguono vengono tutti dall'anteprima sui testi veri: la prima versione della
  // regola faceva dell'ultima riga una voce d'elenco anche quando era il titolo della sezione dopo.
  it("l'ultima riga, se comincia in modo diverso dalle altre, è il titolo di ciò che segue", () => {
    const blocchi = classificaBlocchi([
      "L'Artefatto possiede le seguenti proprietà casuali:",
      "2 proprietà benefiche minori",
      "1 proprietà deleteria maggiore",
      "Incantesimi",
      "Il libro possiede 8 cariche e recupera 1d8 cariche spese ogni giorno all'alba.",
    ]);
    expect(blocchi.map((b) => b.tipo)).toEqual(["paragrafo", "elenco", "titolo", "paragrafo"]);
    expect(blocchi[1]).toEqual({ tipo: "elenco", voci: ["2 proprietà benefiche minori", "1 proprietà deleteria maggiore"] });
    expect(blocchi[2]).toEqual({ tipo: "titolo", testo: "Incantesimi" });
  });

  it("una riga sola dopo i due punti, seguita dal suo testo, è un titolo", () => {
    expect(
      tipi([
        "Mentre l'armatura è attiva, ottenete i seguenti benefici:",
        "Fisicità Potenziata",
        "Avete vantaggio sui tiri salvezza di Forza e la vostra capacità di carico è raddoppiata.",
      ]),
    ).toEqual(["paragrafo", "titolo", "paragrafo"]);
  });

  it("un elenco di nomi tutti della stessa forma resta intero anche se dopo viene del testo", () => {
    const blocchi = classificaBlocchi([
      "Potete lanciare dal libro i seguenti incantesimi (CD del tiro salvezza 18):",
      "Animare Morti",
      "Cerchio della Morte",
      "Dito della Morte",
      "Una volta che usate il libro per lanciare un incantesimo, non potete lanciarlo di nuovo fino all'alba.",
    ]);
    expect(blocchi[1]).toEqual({ tipo: "elenco", voci: ["Animare Morti", "Cerchio della Morte", "Dito della Morte"] });
    expect(blocchi[2].tipo).toBe("paragrafo");
  });

  it("tiene nell'elenco le voci lunghe e quella finale col punto", () => {
    const zaino = classificaBlocchi(["Include:", "uno zaino", "2 giorni di razioni", "un otre."]);
    expect(zaino).toEqual([
      { tipo: "paragrafo", testo: "Include:" },
      { tipo: "elenco", voci: ["uno zaino", "2 giorni di razioni", "un otre."] },
    ]);

    const ristorare = classificaBlocchi([
      "Rimuovete magicamente uno dei seguenti effetti:",
      "1 livello di Spossatezza",
      "La condizione Affascinato o Pietrificato",
      "Una maledizione, inclusa la Sintonia del bersaglio con un oggetto magico maledetto",
    ]);
    expect(ristorare[1]).toMatchObject({ tipo: "elenco" });
    expect(ristorare).toHaveLength(2);
  });

  it("non attacca all'elenco la frase che lo segue, se comincia in un altro modo", () => {
    const blocchi = classificaBlocchi([
      "Il Rubino ha le seguenti proprietà casuali:",
      "1 proprietà benefica minore",
      "2 proprietà dannose maggiori",
      "Asmodeus è immune alle proprietà dannose dell'arma.",
    ]);
    expect(blocchi.map((b) => b.tipo)).toEqual(["paragrafo", "elenco", "paragrafo"]);
  });

  // Trovato in revisione: una frase breve dopo l'elenco finiva fra le voci, perché cominciava con
  // la maiuscola come loro. Con la maiuscola non c'è modo di distinguerla: resta fuori.
  it("non prende per ultima voce una frase breve che comincia con la maiuscola", () => {
    const blocchi = classificaBlocchi(["Ottieni i seguenti benefici:", "Visione Notturna", "Resistenza", "Questo non si somma."]);
    expect(blocchi).toEqual([
      { tipo: "paragrafo", testo: "Ottieni i seguenti benefici:" },
      { tipo: "elenco", voci: ["Visione Notturna", "Resistenza"] },
      { tipo: "paragrafo", testo: "Questo non si somma." },
    ]);
  });

  it("toglie il pallino rimasto davanti a una voce", () => {
    expect(classificaBlocchi(["Può lanciare uno degli incantesimi seguenti:", "• amicizia con gli animali", "• paura"])[1]).toEqual({
      tipo: "elenco",
      voci: ["amicizia con gli animali", "paura"],
    });
  });
});

describe("classificaBlocchi: ciò che non doveva cambiare", () => {
  it("un titolo seguito dal suo testo resta un titolo", () => {
    expect(tipi(["Scurovisione", "Puoi vedere nella luce fioca entro 18 metri da te come se fosse luce intensa."])).toEqual([
      "titolo",
      "paragrafo",
    ]);
  });

  it("riconosce tabelle, elenchi puntati e definizioni come prima", () => {
    const blocchi = classificaBlocchi([
      "Tabella — Incantesimi runici\nAmico — Parlare con gli animali\nCollina — Bacche benefiche\nriga senza trattino",
      "- Bonus di +5 all'iniziativa.",
      "ATTACCO — Effettua uno o più attacchi in mischia o a distanza.",
    ]);
    expect(blocchi[0]).toEqual({
      tipo: "tabella",
      titolo: "Incantesimi runici",
      righe: [
        { etichetta: "Amico", testo: "Parlare con gli animali" },
        { etichetta: "Collina", testo: "Bacche benefiche" },
        { etichetta: null, testo: "riga senza trattino" },
      ],
    });
    expect(blocchi[1]).toEqual({ tipo: "elenco", voci: ["Bonus di +5 all'iniziativa."] });
    expect(blocchi[2]).toEqual({ tipo: "definizione", termine: "ATTACCO", descrizione: "Effettua uno o più attacchi in mischia o a distanza." });
  });

  it("tiene insieme le righe di un paragrafo su più righe", () => {
    expect(classificaBlocchi(["A volontà: mano magica\n3/giorno ciascuno: scudo"])).toEqual([
      { tipo: "paragrafo", testo: "A volontà: mano magica\n3/giorno ciascuno: scudo" },
    ]);
  });

  it("non mostra un rimando di 5etools rimasto nel testo", () => {
    expect(tipi(["{#itemEntry Ring of Resistance|DMG}"])).toEqual([]);
    expect(tipi(["Un anello d'argento.", "{#itemEntry Ring of Resistance|DMG}"])).toEqual(["paragrafo"]);
  });

  it("siApreConTitolo: guarda come comincia l'originale", () => {
    expect(siApreConTitolo(["Age", "Aasimar mature at the same rate as humans."])).toBe(true);
    expect(siApreConTitolo(["While you wear these boots, you can click your heels together."])).toBe(false);
    // La scheda di un background: due righe a etichetta, non un titolo.
    expect(siApreConTitolo(["Skill Proficiencies: Insight, Religion", "Languages: Two of your choice"])).toBe(false);
    expect(siApreConTitolo(["Includes:", "a backpack"])).toBe(false);
    expect(siApreConTitolo([])).toBe(false);
  });

  it("regge un testo vuoto", () => {
    expect(classificaBlocchi([])).toEqual([]);
    expect(classificaBlocchi(["", "   "])).toEqual([]);
  });
});
