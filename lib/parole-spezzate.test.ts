import { describe, expect, it } from "vitest";
import { ricuciParoleSpezzate, type Vocabolario } from "./parole-spezzate";

// Un dizionario finto: basta a provare la regola, che non dipende da quale elenco si usa.
const PAROLE = new Set(
  (
    "contundenti inferiore un attacco il bersaglio di taglia media immediatamente riposo lungo breve subito dopo se sei i " +
    "la creatura su fallisce in caso inoltre recupera incantesimi incantesimo lancia drow fulmine danni da più con del drago " +
    "grandine muove muore quando ogni entro metri è a e o al termine intelligenza ad ed ha lo le incapacitato non anche può " +
    "una vita invita dragonide questo me mo gittata portata azioni grande subisce vari divari massimo dislivello livello " +
    "conca classe armatura passiva percezione uni impugnata umano si li"
  ).split(" "),
);
const vocabolario: Vocabolario = { nota: (p) => PAROLE.has(p) };
const ricuci = (testo: string, v: Vocabolario = vocabolario) => ricuciParoleSpezzate(testo, v).testo;

describe("ricuciParoleSpezzate: ciò che deve unire", () => {
  it("due pezzi che insieme fanno una parola", () => {
    expect(ricuci("18 (3d6 + 8) danni contu ndenti più")).toBe("18 (3d6 + 8) danni contundenti più");
    expect(ricuci("una creatura di taglia media o i nferiore")).toBe("una creatura di taglia media o inferiore");
    expect(ricuci("su bito dopo u n attacco")).toBe("subito dopo un attacco");
  });

  it("anche tre, quattro e più pezzi", () => {
    expect(ricuci("un ri poso l u ngo")).toBe("un riposo lungo");
    expect(ricuci("lancia i m med iatamente")).toBe("lancia immediatamente");
    expect(ricuci("AZ I O N I")).toBe("AZIONI");
  });

  it("conserva maiuscole e punteggiatura attorno alla parola", () => {
    expect(ricuci("I n caso, I noltre recu pera.")).toBe("In caso, Inoltre recupera.");
    expect(ricuci("(i nferiore) e G randine")).toBe("(inferiore) e Grandine");
  });

  it("una lettera isolata che non è una parola si attacca: «i l» è «il», «d i» è «di»", () => {
    expect(ricuci("se i l bersaglio è d i taglia media")).toBe("se il bersaglio è di taglia media");
  });

  it("la parola andata a capo con il segno rimasto dentro", () => {
    expect(ricuci("lancia uno dei seguenti i ncan· tesimi")).toBe("lancia uno dei seguenti incantesimi");
    expect(ricuci("Se, imme- diatamente dopo")).toBe("Se, immediatamente dopo");
  });
});

// Ogni caso qui sotto viene dall'anteprima sui testi veri: la prima versione, che univa da
// sinistra il gruppo più lungo, li sbagliava tutti.
describe("ricuciParoleSpezzate: ciò che deve lasciare stare", () => {
  it("due parole vere che insieme ne farebbero una terza", () => {
    expect(ricuci("se i danni")).toBe("se i danni");
    expect(ricuci("a e o")).toBe("a e o");
  });

  it("sceglie il raggruppamento che unisce di meno: «in vita», non «invita»", () => {
    expect(ricuci("resta i n vita")).toBe("resta in vita");
    expect(ricuci("d i vari")).toBe("di vari");
    expect(ricuci("massimo d i")).toBe("massimo di");
  });

  it("non attacca l'articolo alla parola prima: «Il d ragonide» è «Il dragonide»", () => {
    expect(ricuci("Il d ragonide lancia")).toBe("Il dragonide lancia");
    expect(ricuci("e u n attacco")).toBe("e un attacco");
    expect(ricuci("a q uesto")).toBe("a questo");
    expect(ricuci("u n i ncantesimo")).toBe("un incantesimo");
  });

  it("l'unità di misura dopo un numero non è un pezzo di parola", () => {
    expect(ricuci("portata 1,5 m o gittata 9 m e un bersaglio")).toBe("portata 1,5 m o gittata 9 m e un bersaglio");
    // …ma la stessa lettera lontano da un numero lo è.
    expect(ricuci("se i m pugnata")).toBe("se impugnata");
  });

  it("una maiuscola dopo una minuscola è un'altra parola", () => {
    expect(ricuci("con C A")).toBe("con C A");
    expect(ricuci("Percezione passiva l O")).toBe("Percezione passiva l O");
    expect(ricuci("U mano La creatura")).toBe("Umano La creatura");
  });

  it("un nome proprio sconosciuto resta una parola: «Toril e» non diventa «Torile»", () => {
    const conTorile: Vocabolario = { nota: (p) => PAROLE.has(p) || p === "torile" };
    expect(ricuci("su Toril e in vita", conTorile)).toBe("su Toril e in vita");
  });

  it("«s·» è un «5°» letto male, non una parola andata a capo", () => {
    expect(ricuci("incantesimi di s· livello")).toBe("incantesimi di s· livello");
  });

  it("non unisce se il risultato non è una parola", () => {
    expect(ricuci("lo xvart muove")).toBe("lo xvart muove");
    expect(ricuci("il chuu l")).toBe("il chuu l");
  });

  it("non scavalca la punteggiatura né gli a-capo", () => {
    expect(ricuci("danni da ful, mine")).toBe("danni da ful, mine");
    expect(ricuci("danni da ful\nmine")).toBe("danni da ful\nmine");
  });

  // Le frequenze sono quelle misurate sui testi puliti del Compendio (1,1 milioni di parole).
  const FREQUENZE: Record<string, number> = {
    in: 15128, vita: 506, invita: 2, incantesimo: 7831, mo: 382, fino: 3323, fin: 22, o: 20000,
    riposo: 961, ri: 8, poso: 0.3, se: 11413, i: 10000, sei: 518, merce: 1, di: 45961, mercedi: 0.3,
    artigli: 709, artiglio: 705, fu: 55, ria: 1, furia: 195,
  };
  const conPesi: Vocabolario = {
    nota: (p) => PAROLE.has(p) || p in FREQUENZE,
    peso: (p) => FREQUENZE[p] ?? 0.3,
    totale: 1_136_537,
  };

  // Due raggruppamenti ugualmente puliti: decide quanto sono comuni le parole.
  it("fra due letture possibili sceglie quella fatta di parole più comuni", () => {
    expect(ricuci("resta i n vita", conPesi)).toBe("resta in vita");
    expect(ricuci("lancia un i ncantesi mo", conPesi)).toBe("lancia un incantesimo");
    expect(ricuci("fi n o a quando", conPesi)).toBe("fino a quando");
  });

  // I dizionari grandi conoscono «ri», «ria», «termi»: da soli non provano che siano parole usate.
  it("unisce due «parole» se insieme ne fanno una molto più comune della più rara delle due", () => {
    expect(ricuci("un ri poso breve", conPesi)).toBe("un riposo breve");
    expect(ricuci("la fu ria del drago", conPesi)).toBe("la furia del drago");
  });

  it("ma non se sono due parole che si vedono di continuo", () => {
    // «sei» è comune, ma «se» e «i» lo sono venti volte di più.
    expect(ricuci("se i danni", conPesi)).toBe("se i danni");
    // Il caso più frequente nelle schede dei mostri: «artigli o morso».
    expect(ricuci("con gli artigli o il morso", conPesi)).toBe("con gli artigli o il morso");
    // «merce» è rara, ma «mercedi» lo è ancora di più.
    expect(ricuci("la merce di contrabbando", conPesi)).toBe("la merce di contrabbando");
  });

  // Le due unioni sbagliate che l'anteprima mostrava ancora, entrambe su testo GIUSTO.
  it("due parole che nei testi si vedono entrambe restano due, anche se unite sono più comuni", () => {
    const v: Vocabolario = {
      ...conPesi,
      nota: (p) => conPesi.nota(p) || ["norma", "normale", "navi", "sala", "esala", "comune", "mensa"].includes(p),
      peso: (p) => ({ norma: 5, le: 40000, normale: 300, sala: 8, e: 40000, esala: 168 })[p] ?? conPesi.peso!(p),
    };
    expect(ricuci("ma di norma le Navi non", v)).toBe("ma di norma le Navi non");
    expect(ricuci("una sala mensa e sala comune", v)).toBe("una sala mensa e sala comune");
  });

  it("una parola che nei testi non si vede mai non nasce da pezzi che stavano in piedi da soli", () => {
    const v: Vocabolario = {
      ...conPesi,
      nota: (p) => conPesi.nota(p) || ["doti", "ledoti", "rigurgitare", "misura"].includes(p),
      peso: (p) => ({ le: 40000, doti: 3 })[p] ?? conPesi.peso!(p),
    };
    // «ledoti» sta nei dizionari, ma qui è «le doti».
    expect(ricuci("misura l e doti", v)).toBe("misura le doti");
    // «rigurgitare» è altrettanto rara, ma nessuno dei due pezzi è una parola.
    expect(ricuci("può rigu rgitare", v)).toBe("può rigurgitare");
  });

  it("un nome in maiuscolo dentro un titolo resta una parola", () => {
    const v: Vocabolario = { ...conPesi, nota: (p) => conPesi.nota(p) || p === "torile" };
    expect(ricuci("TORIL E LE SUE TERRE", v)).toBe("TORIL E LE SUE TERRE");
  });

  it("per unire può chiedere più certezza che per lasciare stare", () => {
    // «subisce l a»: «subiscela» esisterebbe come verbo col pronome, ma qui è «subisce la».
    const severo: Vocabolario = {
      nota: (p) => PAROLE.has(p) || p === "subiscela",
      unibile: (pezzi) => PAROLE.has(pezzi.join("").toLowerCase()),
    };
    expect(ricuci("subisce l a creatura", severo)).toBe("subisce la creatura");
  });
});

describe("ricuciParoleSpezzate: la parola andata a capo fra due righe", () => {
  it("porta sulla prima riga il pezzo che completa la parola", () => {
    expect(ricuci("In caso di imme·\ndiatamente dopo")).toBe("In caso di immediatamente\ndopo");
    expect(ricuci("uno dei seguenti incan-\ntesimi, lancia")).toBe("uno dei seguenti incantesimi,\nlancia");
  });

  it("non lascia una riga vuota se la seconda conteneva solo la coda", () => {
    expect(ricuci("il drago è inca·\npacitato")).toBe("il drago è incapacitato");
  });

  it("non unisce se il risultato non è una parola, né dopo una lettera sola", () => {
    expect(ricuci("il chuu-\nl attacca")).toBe("il chuu-\nl attacca");
    expect(ricuci("incantesimi di s·\nlivello")).toBe("incantesimi di s·\nlivello");
  });
});

describe("ricuciParoleSpezzate: il resoconto", () => {
  it("restituisce l'elenco di ciò che ha unito", () => {
    const { ricuciture } = ricuciParoleSpezzate("contu ndenti e poi u n attacco", vocabolario);
    expect(ricuciture).toEqual([
      { prima: "contu ndenti", dopo: "contundenti" },
      { prima: "u n", dopo: "un" },
    ]);
  });

  it("lascia com'è un testo senza parole spezzate", () => {
    const testo = "Il drago lancia incantesimi.\nOgni creatura entro 9 metri muore.";
    expect(ricuciParoleSpezzate(testo, vocabolario)).toEqual({ testo, ricuciture: [] });
  });
});
