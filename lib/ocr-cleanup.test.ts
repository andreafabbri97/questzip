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
  // Refusi del corsivo dei titoletti, trovati cercando nelle schede le parole che non esistono.
  it("rimette le parentesi tonde dove il corsivo le ha fatte uscire graffe", () => {
    expect(pulisciCorpoScheda("Tocco Guaritore (3/Giorno}. Il deva tocca un'altra creatura.")).toBe(
      "Tocco Guaritore (3/Giorno). Il deva tocca un'altra creatura.",
    );
    expect(pulisciCorpoScheda("Risucchio di Energia {Costa 2 Azioni). Ogni creatura")).toBe(
      "Risucchio di Energia (Costa 2 Azioni). Ogni creatura",
    );
  });

  it("corregge «Ciorno», «q uest'ultima» e l'ordinale dei livelli di incantesimo", () => {
    expect(pulisciCorpoScheda("Spruzzo Fetido (1/Ciorno). Animare Macigni (1/Ciarno).")).toBe(
      "Spruzzo Fetido (1/Giorno). Animare Macigni (1/Giorno).",
    );
    expect(pulisciCorpoScheda("verso il bersaglio, q uest'ultimo subisce 7 (2d6) danni")).toBe(
      "verso il bersaglio, quest'ultimo subisce 7 (2d6) danni",
    );
    expect(pulisciCorpoScheda('3" livello (3 slot): dissolvi magie\n2• livello (3 slot): invisibilità')).toBe(
      "3° livello (3 slot): dissolvi magie\n2° livello (3 slot): invisibilità",
    );
    // Le virgolette vere restano: l'ordinale si corregge solo davanti a «livello».
    expect(pulisciCorpoScheda('la parola "fuoco" pronunciata')).toBe('la parola "fuoco" pronunciata');
  });

  // Trovato confrontando le distanze con i piedi dell'originale.
  it("ricompone la distanza spezzata davanti all'unità di misura", () => {
    expect(pulisciCorpoScheda("portata 1, 5 m o gittata 9/36 m, un bersaglio")).toBe("portata 1,5 m o gittata 9/36 m, un bersaglio");
    expect(pulisciCorpoScheda("una creatura visibile entro 1 8 metri")).toBe("una creatura visibile entro 18 metri");
    expect(pulisciCorpoScheda("portata 1,5 m o gittata 6/1 8 m, un bersaglio")).toBe("portata 1,5 m o gittata 6/18 m, un bersaglio");
    expect(pulisciCorpoScheda("gittata 1 8/72 m, un bersaglio")).toBe("gittata 18/72 m, un bersaglio");
    expect(pulisciCorpoScheda("gittata 45/1 83 m, un bersaglio")).toBe("gittata 45/183 m, un bersaglio");
    expect(pulisciCorpoScheda("gittata 1, 5/6 m, un bersaglio")).toBe("gittata 1,5/6 m, un bersaglio");
    expect(pulisciCorpoScheda("entro un raggio di 1 50 metri")).toBe("entro un raggio di 150 metri");
    expect(pulisciCorpoScheda("a più di 1, 5 km dal bersaglio")).toBe("a più di 1,5 km dal bersaglio");
  });

  // Forme contate sulla tabella intera: ognuna stava in decine di schede.
  describe("forme ricorrenti", () => {
    it("ricompone la frequenza degli incantesimi innati", () => {
      expect(pulisciCorpoScheda("A volontà: luci danzanti\nl/giorno ciascuno: levitazione")).toBe(
        "A volontà: luci danzanti\n1/giorno ciascuno: levitazione",
      );
      expect(pulisciCorpoScheda("ragnatela l /giorno: dominare persone")).toBe("ragnatela 1/giorno: dominare persone");
      expect(pulisciCorpoScheda("respirare sott'acqua 1 /giorno: tentacoli neri")).toBe("respirare sott'acqua 1/giorno: tentacoli neri");
      expect(pulisciCorpoScheda("3/giorno ciascuno: paura")).toBe("3/giorno ciascuno: paura");
    });

    it("rimette l'articolo a inizio frase, non il pronome in mezzo", () => {
      expect(pulisciCorpoScheda("Multiattacco. li drago può usare la Presenza")).toBe("Multiattacco. Il drago può usare la Presenza");
      expect(pulisciCorpoScheda("Colpo di Ali (Costa 2 Azioni). li drago sbatte le ali.")).toBe(
        "Colpo di Ali (Costa 2 Azioni). Il drago sbatte le ali.",
      );
      expect(pulisciCorpoScheda("li leviatano può eseguire 3 azioni leggendarie")).toBe("Il leviatano può eseguire 3 azioni leggendarie");
      expect(pulisciCorpoScheda("afferra i nemici e li trascina a sé")).toBe("afferra i nemici e li trascina a sé");
      expect(pulisciCorpoScheda("i bersagli vicini:\nli colpisce tutti")).toBe("i bersagli vicini:\nli colpisce tutti");
    });

    it("ricompone il bonus per colpire", () => {
      expect(pulisciCorpoScheda("Attacco con arma da mischia: +1 0 al tiro per colpire")).toBe(
        "Attacco con arma da mischia: +10 al tiro per colpire",
      );
      expect(pulisciCorpoScheda("Attacco con Arma da Mischia:+ 17 al tiro per colpire")).toBe(
        "Attacco con Arma da Mischia: +17 al tiro per colpire",
      );
      expect(pulisciCorpoScheda("a mischia: + 1 1 al tiro per colpire")).toBe("a mischia: +11 al tiro per colpire");
      expect(pulisciCorpoScheda("Attacco con arma a distanza: +1 3 al tiro per\ncolpire, gittata 18/72 m")).toBe(
        "Attacco con arma a distanza: +13 al tiro per\ncolpire, gittata 18/72 m",
      );
    });

    it("legge lo zero e il cinque scambiati per lettere", () => {
      expect(pulisciCorpoScheda("Quando la culla scende a O punti ferita")).toBe("Quando la culla scende a 0 punti ferita");
      expect(pulisciCorpoScheda("uno scudo che scende a un bonus di +O è distrutto")).toBe(
        "uno scudo che scende a un bonus di +0 è distrutto",
      );
      expect(pulisciCorpoScheda("termina il suo turno con O punti ferita, muore")).toBe("termina il suo turno con 0 punti ferita, muore");
      expect(pulisciCorpoScheda("danni perforanti o S (1d8 + 1) danni")).toBe("danni perforanti o 5 (1d8 + 1) danni");
      expect(pulisciCorpoScheda("Ragnatela (Ricarica S-6). Attacco")).toBe("Ragnatela (Ricarica 5-6). Attacco");
      expect(pulisciCorpoScheda("metallo non magico in l round.")).toBe("metallo non magico in 1 round.");
      // "a O" davanti a un nome proprio non è uno zero.
      expect(pulisciCorpoScheda("fedele a O Grande Antico")).toBe("fedele a O Grande Antico");
    });

    it("ricompone la CD degli incantesimi", () => {
      expect(pulisciCorpoScheda("(CD del tiro salvezza sull'incantesimo 1 3):")).toBe("(CD del tiro salvezza sull'incantesimo 13):");
    });

    it("riattacca l'apostrofo alla parola", () => {
      expect(pulisciCorpoScheda("l 'effetto svanisce in quell 'area")).toBe("l'effetto svanisce in quell'area");
      expect(pulisciCorpoScheda("spese all' inizio del proprio turno")).toBe("spese all'inizio del proprio turno");
      expect(pulisciCorpoScheda("non usa u n'azione per svegliarlo")).toBe("non usa un'azione per svegliarlo");
      expect(pulisciCorpoScheda("tre attacchi Lancia dell' Erebo")).toBe("tre attacchi Lancia dell'Erebo");
    });

    it("ricuce le parole che nessun vocabolario separerebbe", () => {
      expect(pulisciCorpoScheda("CD 24, altri menti viene buttato a terra")).toBe("CD 24, altrimenti viene buttato a terra");
      expect(pulisciCorpoScheda("finché il ram pollo non muore")).toBe("finché il rampollo non muore");
      expect(pulisciCorpoScheda("i suoi pu nti ferita massimi")).toBe("i suoi punti ferita massimi");
    });

    it("rimette l'elle del corsivo letta come barra", () => {
      expect(pulisciCorpoScheda("Runa de/fuoco. Il gigante")).toBe("Runa del fuoco. Il gigante");
      expect(pulisciCorpoScheda("Armatura del/a fornace")).toBe("Armatura della fornace");
      expect(pulisciCorpoScheda("entro 1,5 metri da/l'urlatore")).toBe("entro 1,5 metri dall'urlatore");
      expect(pulisciCorpoScheda("Ritrarre i/filamento. Una creatura")).toBe("Ritrarre il filamento. Una creatura");
      expect(pulisciCorpoScheda("Mu/tiattacco. Il lucertoloide")).toBe("Multiattacco. Il lucertoloide");
      expect(pulisciCorpoScheda("arma elemento/e, dissolvi magie")).toBe("arma elementale, dissolvi magie");
      expect(pulisciCorpoScheda("por/ore con gli onimo/i, por/ore con i vegeto/i")).toBe(
        "parlare con gli animali, parlare con i vegetali",
      );
    });

    it("lascia le barre vere", () => {
      expect(pulisciCorpoScheda("Colpo a segno/mancato: il gigante")).toBe("Colpo a segno/mancato: il gigante");
      expect(pulisciCorpoScheda("3/giorno: ingrandire/ridurre, cecità/sordità")).toBe("3/giorno: ingrandire/ridurre, cecità/sordità");
      expect(pulisciCorpoScheda("una bestia e/o un umanoide")).toBe("una bestia e/o un umanoide");
      // Controesempi della revisione del codice: ognuno veniva rovinato dalla prima versione.
      expect(pulisciCorpoScheda("la creatura/l'oggetto bersagliato")).toBe("la creatura/l'oggetto bersagliato");
      expect(pulisciCorpoScheda("si muove su/giù, da/verso il bersaglio, a/per i/gli alleati")).toBe(
        "si muove su/giù, da/verso il bersaglio, a/per i/gli alleati",
      );
    });

    it("non scambia per refusi le cose che gli somigliano", () => {
      // Tre misure, non «6,9 m».
      expect(pulisciCorpoScheda("linee lunghe 3, 6, 9 m")).toBe("linee lunghe 3, 6, 9 m");
      // Litri al giorno, non una frequenza.
      expect(pulisciCorpoScheda("consuma 5 l/giorno di acqua")).toBe("consuma 5 l/giorno di acqua");
      // L'Ovest e l'inizio di un nome, non uno zero.
      expect(pulisciCorpoScheda("si sposta da E a O di 9 metri")).toBe("si sposta da E a O di 9 metri");
      expect(pulisciCorpoScheda("appartiene a O'Brien")).toBe("appartiene a O'Brien");
      // Una citazione fra apici, non un'elisione staccata.
      expect(pulisciCorpoScheda("ha un 'ordine' segreto")).toBe("ha un 'ordine' segreto");
    });

    it("legge lo zero anche quando la frase va a capo", () => {
      expect(pulisciCorpoScheda("il suo massimo dei punti ferita\na O, il bersaglio muore")).toBe(
        "il suo massimo dei punti ferita\na 0, il bersaglio muore",
      );
      expect(pulisciCorpoScheda("i suoi punti ferita non scendono\na O finché")).toBe("i suoi punti ferita non scendono\na 0 finché");
      expect(pulisciCorpoScheda("viene ridotto a O.")).toBe("viene ridotto a 0.");
    });
  });

  it("legge come cifre l'elle e l'esse di una distanza", () => {
    expect(pulisciCorpoScheda("portata l,5 m, un bersaglio")).toBe("portata 1,5 m, un bersaglio");
    expect(pulisciCorpoScheda("portata l, 5 m, una creatura")).toBe("portata 1,5 m, una creatura");
    expect(pulisciCorpoScheda("entro l,S metri dal ghast")).toBe("entro 1,5 metri dal ghast");
    expect(pulisciCorpoScheda("portata 1, S m o gittata 6/18 m")).toBe("portata 1,5 m o gittata 6/18 m");
    expect(pulisciCorpoScheda("nel raggio di l 8 metri")).toBe("nel raggio di 18 metri");
  });

  it("non tocca le distanze già scritte bene né i numeri che precedono una distanza", () => {
    expect(pulisciCorpoScheda("portata 1,5 m o gittata 9/36 m")).toBe("portata 1,5 m o gittata 9/36 m");
    expect(pulisciCorpoScheda("si sposta per 3d6 x 3 metri")).toBe("si sposta per 3d6 x 3 metri");
    expect(pulisciCorpoScheda("misura dagli 1,8 ai 3 metri")).toBe("misura dagli 1,8 ai 3 metri");
    expect(pulisciCorpoScheda("telepatia 3 6 m")).toBe("telepatia 36 m");
    // Due numeri veri restano due: una gittata, un elenco.
    expect(pulisciCorpoScheda("gittata 6/18 m, e fino a 2 o 3 m")).toBe("gittata 6/18 m, e fino a 2 o 3 m");
  });

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

describe("ripristinaTestoOggettiMagici: i simboli rimasti nel testo", () => {
  it("la f letta come parentesi davanti a qualunque parola", () => {
    expect(ripristinaTestoOggettiMagici("una cintura della {orza dei giganti")).toBe("una cintura della forza dei giganti");
    expect(ripristinaTestoOggettiMagici("Questa verga di {attura drow")).toBe("Questa verga di fattura drow");
    expect(ripristinaTestoOggettiMagici("associato alla [reccia assassina")).toBe("associato alla freccia assassina");
  });

  it("la quadra al posto di «l'» e di «I»", () => {
    expect(ripristinaTestoOggettiMagici("comprendere e parlare [Abissale. Inoltre")).toBe("comprendere e parlare l'Abissale. Inoltre");
    expect(ripristinaTestoOggettiMagici("parlare e capire ['Ignan. Se")).toBe("parlare e capire l'Ignan. Se");
    expect(ripristinaTestoOggettiMagici("o lance. [l personaggio può")).toBe("o lance. Il personaggio può");
    expect(ripristinaTestoOggettiMagici("[ punti ferita persi a causa")).toBe("I punti ferita persi a causa");
  });

  it("il trattino basso, l'uguale e l'euro rimasti accanto alle parole", () => {
    expect(ripristinaTestoOggettiMagici("per lei termina_ La mazza recupera")).toBe("per lei termina. La mazza recupera");
    expect(ripristinaTestoOggettiMagici("la potenza di ogni_ singola sfera")).toBe("la potenza di ogni singola sfera");
    expect(ripristinaTestoOggettiMagici("Alla fine di ogni = suo turno")).toBe("Alla fine di ogni suo turno");
    expect(ripristinaTestoOggettiMagici("la impugna,= può usare")).toBe("la impugna, può usare");
    expect(ripristinaTestoOggettiMagici("spendere 1 carica €, se una porta")).toBe("spendere 1 carica e, se una porta");
    expect(ripristinaTestoOggettiMagici("al suo interno €e trasportate")).toBe("al suo interno e trasportate");
  });

  it("«@gni» e lo zero fra due rarità", () => {
    expect(ripristinaTestoOggettiMagici("di 1 minuto. @gni sfera emana")).toBe("di 1 minuto. Ogni sfera emana");
    expect(ripristinaTestoOggettiMagici("(+1) rara (+2)0 molto rara (+3)")).toBe("(+1) rara (+2) o molto rara (+3)");
  });

  // Il confine di parola di JavaScript non vede le lettere accentate: questa non veniva trovata.
  it("rimette l'apostrofo anche alle parole che finiscono con un accento", () => {
    expect(ripristinaTestoOggettiMagici("trasformarne lestremità in una testa")).toBe("trasformarne l'estremità in una testa");
    // …senza prendere per articolo l'inizio di un'altra parola.
    expect(ripristinaTestoOggettiMagici("lanello d'oro e larmatura")).toBe("l'anello d'oro e l'armatura");
    expect(ripristinaTestoOggettiMagici("un collanello")).toBe("un collanello");
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
