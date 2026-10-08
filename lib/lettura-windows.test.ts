import { describe, expect, it } from "vitest";
import { pulisciLetturaWindows } from "./lettura-windows";

describe("pulisciLetturaWindows", () => {
  it("rimette l'articolo «Il» letto come due aste, solo a inizio frase", () => {
    expect(pulisciLetturaWindows("II Tethyr è un regno feudale. II suo sovrano regna.")).toBe("Il Tethyr è un regno feudale. Il suo sovrano regna.");
    expect(pulisciLetturaWindows("Bruenor II tornò sul trono")).toBe("Bruenor II tornò sul trono");
    // Un numero romano vero: fra parentesi, o da solo su una riga.
    expect(pulisciLetturaWindows("fondata nel (II secolo) dai nani")).toBe("fondata nel (II secolo) dai nani");
    expect(pulisciLetturaWindows("Tabella 3.\n\nII\n\nLa guerra")).toBe("Tabella 3.\n\nII\n\nLa guerra");
    expect(pulisciLetturaWindows("fine del primo.\n\nII secondo capoverso")).toBe("fine del primo.\n\nIl secondo capoverso");
    expect(pulisciLetturaWindows("- II personaggio ha resistenza\n- II personaggio può volare")).toBe("- Il personaggio ha resistenza\n- Il personaggio può volare");
  });

  it("ripara i dadi con l'uno o lo zero letti come lettere", () => {
    expect(pulisciLetturaWindows("infligge Id8 danni e poi 2dlO")).toBe("infligge 1d8 danni e poi 2d10");
    expect(pulisciLetturaWindows("Si tira un dlOO sulla tabella")).toBe("Si tira un d100 sulla tabella");
    expect(pulisciLetturaWindows("recupera Id6 + 1 cariche (Id20)")).toBe("recupera 1d6 + 1 cariche (1d20)");
  });

  it("non inventa dadi dove non ce ne sono", () => {
    expect(pulisciLetturaWindows("dl resto, Io il dio-drago")).toBe("dl resto, Io il dio-drago");
    expect(pulisciLetturaWindows("un 2d6 già giusto")).toBe("un 2d6 già giusto");
  });

  it("rimette il meno delle formule", () => {
    expect(pulisciLetturaWindows("contiene 1d6 — 1 livelli di incantesimi")).toBe("contiene 1d6 − 1 livelli di incantesimi");
    expect(pulisciLetturaWindows("la lama — 1 metro di acciaio")).toBe("la lama — 1 metro di acciaio");
  });

  it("rimette la «o» letta come zero, l'uno letto come lettera e il più letto come quattro", () => {
    expect(pulisciLetturaWindows("spendere 1 0 più cariche: mani brucianti (l carica)")).toBe("spendere 1 o più cariche: mani brucianti (1 carica)");
    expect(pulisciLetturaWindows("Arma +1, +2 0 +3")).toBe("Arma +1, +2 o +3");
    expect(pulisciLetturaWindows("può spendere I carica")).toBe("può spendere 1 carica");
    expect(pulisciLetturaWindows("della durata di I minuto, poi scende a O punti ferita")).toBe("della durata di 1 minuto, poi scende a 0 punti ferita");
    expect(pulisciLetturaWindows("del Fuoco. I I personaggio può spendere")).toBe("del Fuoco. Il personaggio può spendere");
    expect(pulisciLetturaWindows("ottiene un bonus di 42 alla CA")).toBe("ottiene un bonus di +2 alla CA");
    expect(pulisciLetturaWindows("viene ridotta di 1d6 +6 anni")).toBe("viene ridotta di 1d6 + 6 anni");
  });

  it("non tocca gli zeri e le lettere che sono al loro posto", () => {
    expect(pulisciLetturaWindows("scende a 0 punti ferita")).toBe("scende a 0 punti ferita");
    // La riga di una tabella di slot: gli zeri sono zeri.
    expect(pulisciLetturaWindows("4 3 3 3 2 0 0 0 0")).toBe("4 3 3 3 2 0 0 0 0");
    expect(pulisciLetturaWindows("Area 1a Sala del Trono")).toBe("Area 1a Sala del Trono");
    expect(pulisciLetturaWindows("la carica del toro, l'ultima carica")).toBe("la carica del toro, l'ultima carica");
    expect(pulisciLetturaWindows("I minuti passano. I punti ferita persi")).toBe("I minuti passano. I punti ferita persi");
    expect(pulisciLetturaWindows("un bonus di 4 alla CA")).toBe("un bonus di 4 alla CA");
  });

  it("rimette il segno dell'ordinale davanti a «livello»", () => {
    expect(pulisciLetturaWindows("al 5' livello, al 17* livello e al 3\" livello")).toBe("al 5° livello, al 17° livello e al 3° livello");
    expect(pulisciLetturaWindows("A partire dal 17 • livello")).toBe("A partire dal 17° livello");
    expect(pulisciLetturaWindows('A partire dal IO" livello')).toBe("A partire dal 10° livello");
  });

  it("toglie la cifra in più quando il numero non può essere un livello", () => {
    expect(pulisciLetturaWindows("arriva al 141 livello")).toBe("arriva al 14° livello");
    expect(pulisciLetturaWindows("Al 61 livello e al 31 livello")).toBe("Al 6° livello e al 3° livello");
    expect(pulisciLetturaWindows("come incantesimo di 20 livello")).toBe("come incantesimo di 2° livello");
  });

  it("lascia stare un numero che può essere un livello vero", () => {
    expect(pulisciLetturaWindows("al 20 livello")).toBe("al 20 livello");
    expect(pulisciLetturaWindows("al 14° livello")).toBe("al 14° livello");
  });

  it("corregge la ù con la dieresi e l'articolo «la» con l'uno", () => {
    expect(pulisciLetturaWindows("Per di piü, 1a Luce della Legge")).toBe("Per di più, la Luce della Legge");
    expect(pulisciLetturaWindows("Faerün")).toBe("Faerün");
  });
});
