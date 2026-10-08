import { describe, expect, it } from "vitest";
import {
  pulisciCorpoScheda,
  pulisciNumeriStatBlock,
  pulisciTestoOcr,
  quotaIlleggibile,
  riparaDadiFraParentesi,
  riparaDadiNelTesto,
  ripristinaAccentiPersi,
  ripristinaTestoOggettiMagici,
  togliColonnaCaratteristiche,
} from "./ocr-cleanup";

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

describe("riparaDadiFraParentesi", () => {
  // I casi veri trovati nel bestiario: la parentesi del danno è il punto più rovinato dall'OCR.
  it("rimette le cifre al posto delle lettere", () => {
    expect(riparaDadiFraParentesi("Colpo: 8 (ldlO + 3) danni perforanti")).toBe(
      "Colpo: 8 (1d10 + 3) danni perforanti",
    );
    expect(riparaDadiFraParentesi("subisce 17 (Sd6) danni da freddo")).toBe(
      "subisce 17 (5d6) danni da freddo",
    );
    expect(riparaDadiFraParentesi("Punti Ferita 119 (14d l 0 + 42)")).toBe(
      "Punti Ferita 119 (14d10 + 42)",
    );
    expect(riparaDadiFraParentesi("8 {l d& + 4) danni contundenti")).toBe(
      "8 (1d8 + 4) danni contundenti",
    );
  });

  it("normalizza gli spazi di un dado già giusto", () => {
    expect(riparaDadiFraParentesi("11 (2d6+4) danni")).toBe("11 (2d6 + 4) danni");
    expect(riparaDadiFraParentesi("3 (1d6 - 1) danni")).toBe("3 (1d6 - 1) danni");
  });

  // Il vincolo sulle facce è ciò che rende sicura la regola: senza, qualunque parentesi fatta di
  // quelle lettere verrebbe "riparata".
  it("non tocca le parentesi che non sono dadi", () => {
    for (const testo of ["(dolo)", "(solo di giorno)", "(ricarica 5-6)", "(1d7)", "(lodi)", "(S)"]) {
      expect(riparaDadiFraParentesi(testo)).toBe(testo);
    }
  });

  it("non tocca le lettere fuori dalle parentesi", () => {
    const testo = "Il Soldato colpisce l'Ogre (2d8 + 4) e lo Spettro";
    expect(riparaDadiFraParentesi(testo)).toBe(testo);
  });
});

describe("togliColonnaCaratteristiche", () => {
  it("toglie sigle e punteggi rimasti in cima ai tratti", () => {
    const testo = "INT\n12 (+l)\nSAG\n14 (+2)\nDevozione draconica. Mentre l'ufficiale vede un drago...";
    expect(togliColonnaCaratteristiche(testo)).toBe(
      "Devozione draconica. Mentre l'ufficiale vede un drago...",
    );
  });

  it("si ferma alla prima riga di testo vero, senza guardare oltre", () => {
    const testo = "Anfibio. Può respirare in aria e in acqua.\nCAR\n10 (+0)";
    expect(togliColonnaCaratteristiche(testo)).toBe(testo);
  });

  it("tiene il bonus di competenza che sta in mezzo alla colonna", () => {
    const testo = "INT\n12 (+l)\nBonus di Competenza +2\nCAR\n16 (+3)\nNatura insolita. Non mangia.";
    expect(togliColonnaCaratteristiche(testo)).toBe(
      "Bonus di Competenza +2\nNatura insolita. Non mangia.",
    );
  });

  it("lascia stare un testo che comincia in modo normale", () => {
    expect(togliColonnaCaratteristiche("Carica. Se il toro si muove...")).toBe(
      "Carica. Se il toro si muove...",
    );
  });
});

describe("riparaDadiNelTesto", () => {
  // Tutti casi veri del bestiario, trovati confrontando i dadi con l'originale.
  it("ripara i dadi spezzati in mezzo a una frase", () => {
    expect(riparaDadiNelTesto("evoca magicamente l d4 lupi fatti di ghiaccio")).toBe(
      "evoca magicamente 1d4 lupi fatti di ghiaccio",
    );
    expect(riparaDadiNelTesto("dall'attacco è ridotto di ldlO + 3.")).toBe("dall'attacco è ridotto di 1d10 + 3.");
    expect(riparaDadiNelTesto("ore pari a l dl 2 + il punteggio")).toBe("ore pari a 1d12 + il punteggio");
    expect(riparaDadiNelTesto("(massimo 1 0d6) e, se scende")).toBe("(massimo 10d6) e, se scende");
    expect(riparaDadiNelTesto("dopo 1 d20 giorni si dissolve")).toBe("dopo 1d20 giorni si dissolve");
  });

  it("ripara anche dentro una parentesi che contiene parole", () => {
    expect(riparaDadiNelTesto("Colpito: 15 (ldl2 + 4 più\n1 d8) danni taglienti.")).toBe(
      "Colpito: 15 (1d12 + 4 più\n1d8) danni taglienti.",
    );
  });

  it("lascia stare i dadi già giusti e ciò che non è un dado", () => {
    for (const testo of [
      "subisce 7 (2d6) danni e poi 1d4 + 1",
      "entro 18 metri, CD 12",
      "un dado da d8 o d10",
      "l'idra ha 5 teste",
      "1d7 non esiste",
    ]) {
      expect(riparaDadiNelTesto(testo)).toBe(testo);
    }
  });

  // "I d6 extra" è italiano: l'articolo davanti ai dadi. Non deve diventare "1d6 extra".
  it("non scambia l'articolo per una cifra", () => {
    expect(riparaDadiNelTesto("I d6 extra si sommano al danno")).toBe("I d6 extra si sommano al danno");
    expect(riparaDadiNelTesto("infligge Id6 danni")).toBe("infligge 1d6 danni");
  });
});

describe("pulisciCorpoScheda", () => {
  it("ripara la prima cifra del danno medio letta come elle", () => {
    expect(pulisciCorpoScheda("Colpito: l3 (2d8 + 4) danni perforanti.")).toBe(
      "Colpito: 13 (2d8 + 4) danni perforanti.",
    );
  });

  it("ricompone il danno medio spezzato davanti ai dadi", () => {
    expect(pulisciCorpoScheda("Colpo: 1 3 (3d6 + 3) danni perforanti.")).toBe(
      "Colpo: 13 (3d6 + 3) danni perforanti.",
    );
  });

  it("ricompone la classe difficoltà spezzata", () => {
    expect(pulisciCorpoScheda("tiro salvezza su Costituzione con CD 1 4.")).toBe(
      "tiro salvezza su Costituzione con CD 14.",
    );
  });

  // Due numeri veri accanto, senza dadi dopo: non vanno fusi.
  it("non fonde due numeri distinti", () => {
    expect(pulisciCorpoScheda("colpisce 2 o 3 bersagli entro 9 metri")).toBe(
      "colpisce 2 o 3 bersagli entro 9 metri",
    );
  });
});

describe("ripristinaAccentiPersi", () => {
  // Frasi vere degli incantesimi di Tasha, così come erano finite nel Compendio.
  it("rimette gli accenti persi in modo sistematico", () => {
    expect(ripristinaAccentiPersi("l'incantatore pud muovere la lama")).toBe(
      "l'incantatore può muovere la lama",
    );
    expect(ripristinaAccentiPersi("La lama é in grado di attraversare")).toBe(
      "La lama è in grado di attraversare",
    );
    expect(ripristinaAccentiPersi("Se il bersaglio @ una creatura")).toBe(
      "Se il bersaglio è una creatura",
    );
    expect(ripristinaAccentiPersi("uno slot di livello pit: alto che")).toBe(
      "uno slot di livello più alto che",
    );
    expect(ripristinaAccentiPersi("non pitt di 9 metri, il metodo piti diretto")).toBe(
      "non più di 9 metri, il metodo più diretto",
    );
    expect(ripristinaAccentiPersi("subisce soltanto la meta di quei danni")).toBe(
      "subisce soltanto la metà di quei danni",
    );
    expect(ripristinaAccentiPersi("Velocita 9 m, se possiede gia uno stile")).toBe(
      "Velocità 9 m, se possiede già uno stile",
    );
    expect(ripristinaAccentiPersi("Pud usare cid che trova")).toBe("Può usare ciò che trova");
  });

  it("ricuce le parole spezzate a fine riga", () => {
    expect(ripristinaAccentiPersi("uno di questi incan- tesimi senza spendere slot")).toBe(
      "uno di questi incantesimi senza spendere slot",
    );
  });

  // Finiscono in "-ita" ma sono giuste: per questo l'elenco delle parole è chiuso.
  it("non tocca le parole che finiscono allo stesso modo ma non vogliono l'accento", () => {
    const testo = "recupera 1 punto ferita, evita il colpo e limita i danni per tutta la vita";
    expect(ripristinaAccentiPersi(testo)).toBe(testo);
  });

  it("non tocca le é dentro una parola né le coppie ambigue", () => {
    const testo = "finché non usa di nuovo il privilegio, dopodiché la creatura si sposta da sé";
    expect(ripristinaAccentiPersi(testo)).toBe(testo);
  });

  it("non tocca un trattino vero", () => {
    expect(ripristinaAccentiPersi("un semi-piano e l'auto-guarigione")).toBe(
      "un semi-piano e l'auto-guarigione",
    );
  });
});

describe("refusi delle schede dei mostri", () => {
  it("ricompone l'articolo letto a pezzi o come numero", () => {
    expect(pulisciCorpoScheda("Natura insolita. I l dragocchio non ha bisogno di mangiare.")).toBe(
      "Natura insolita. Il dragocchio non ha bisogno di mangiare.",
    );
    expect(pulisciCorpoScheda("4: Raggio infuocato. 11 bersaglio deve effettuare un tiro salvezza")).toBe(
      "4: Raggio infuocato. Il bersaglio deve effettuare un tiro salvezza",
    );
  });

  it("lascia stare l'undici quando è un numero", () => {
    const testo = "Colpito: 11 (2d6 + 4) danni. 11 metri più in là, altre 11 creature.";
    expect(pulisciCorpoScheda(testo)).toBe(testo);
  });

  it("ripristina la prima voce di un elenco numerato", () => {
    expect(pulisciCorpoScheda("raggi oculari:\nl: Raggio paralizzante.\n2: Raggio debilitante.")).toBe(
      "raggi oculari:\n1: Raggio paralizzante.\n2: Raggio debilitante.",
    );
  });

  it("toglie il trattino di sillabazione invisibile", () => {
    expect(pulisciTestoOcr("l'incandescente combat\u00ad timento emblematico")).toBe(
      "l'incandescente combattimento emblematico",
    );
  });
});

describe("ripristinaTestoOggettiMagici", () => {
  // Frasi vere del catalogo degli oggetti magici, come erano nel Compendio.
  it("rimette la congiunzione e il verbo letti come simboli", () => {
    expect(ripristinaTestoOggettiMagici("pu\u00f2 usare un'azione \u20ac spendere 1 carica")).toBe(
      "pu\u00f2 usare un'azione e spendere 1 carica",
    );
    expect(ripristinaTestoOggettiMagici("la tunica non & mai considerata")).toBe(
      "la tunica non \u00e8 mai considerata",
    );
  });

  it("ricompone le legature perse", () => {
    expect(ripristinaTestoOggettiMagici("i danni efettuati, un efetto, gli infigge 2d6, il tipo infitto")).toBe(
      "i danni effettuati, un effetto, gli infligge 2d6, il tipo inflitto",
    );
    expect(ripristinaTestoOggettiMagici("la scopa smette di futtuare e Lefletto termina")).toBe(
      "la scopa smette di fluttuare e L'effetto termina",
    );
    expect(ripristinaTestoOggettiMagici("subisce 4d6 danni da {uoco")).toBe("subisce 4d6 danni da fuoco");
  });

  it("rimette gli apostrofi spariti", () => {
    expect(ripristinaTestoOggettiMagici("pronuncia la parola dordine ogni giorno allalba")).toBe(
      "pronuncia la parola d'ordine ogni giorno all'alba",
    );
    expect(ripristinaTestoOggettiMagici("Se spende lultima carica, Lanello si sbriciola")).toBe(
      "Se spende l'ultima carica, L'anello si sbriciola",
    );
    expect(ripristinaTestoOggettiMagici("con questarma magica, allinterno dellarmatura")).toBe(
      "con quest'arma magica, all'interno dell'armatura",
    );
  });

  // \u00c8 il motivo dell'elenco chiuso: queste cominciano come le forme rotte ma sono parole vere.
  it("non mette apostrofi dentro parole vere", () => {
    const testo = "la lama riflette la luna, il lato della lancia allarma le guardie, dato che dalla torre";
    expect(ripristinaTestoOggettiMagici(testo)).toBe(testo);
  });

  it("ripara lo zero letto al posto della congiunzione", () => {
    expect(ripristinaTestoOggettiMagici("spendere 1 0 pi\u00f9 cariche")).toBe("spendere 1 o pi\u00f9 cariche");
    expect(ripristinaTestoOggettiMagici("che usi Forza 0 Costituzione")).toBe("che usi Forza o Costituzione");
  });

  it("lascia stare gli zeri veri", () => {
    const testo = "scende a 0 punti ferita. La velocit\u00e0 \u00e8 ridotta a 0 fino al turno successivo, costa 10 mo";
    expect(ripristinaTestoOggettiMagici(testo)).toBe(testo);
  });

  it("ripara i dadi e i numeri incollati", () => {
    expect(ripristinaTestoOggettiMagici("Si tira un dl00e si consulta la tabella")).toBe(
      "Si tira un d100 e si consulta la tabella",
    );
    expect(ripristinaTestoOggettiMagici("ha gi\u00e0 Idl0 livelli di energia")).toBe("ha gi\u00e0 1d10 livelli di energia");
    expect(ripristinaTestoOggettiMagici("un risultato di 20al tiro per colpire")).toBe(
      "un risultato di 20 al tiro per colpire",
    );
    expect(ripristinaTestoOggettiMagici("recupera 1d6 + 1 cariche e infligge 2d10 danni")).toBe(
      "recupera 1d6 + 1 cariche e infligge 2d10 danni",
    );
  });
});
