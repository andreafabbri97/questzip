import { describe, expect, it } from "vitest";
import { correggiMaiuscoletto, fraseDaMaiuscoletto, nomiConMaiuscola, titoloLeggibile } from "./titolo-leggibile";

describe("titoloLeggibile", () => {
  it("rimette le maiuscole come le scrive l'indice del libro", () => {
    expect(titoloLeggibile("ROCCHE NANICHE DEL NORD")).toBe("Rocche Naniche del Nord");
    expect(titoloLeggibile("TORIL E LE SUE TERRE")).toBe("Toril e le Sue Terre");
    expect(titoloLeggibile("LA COSTA DELLA SPADA E IL NORD")).toBe("La Costa della Spada e il Nord");
  });

  it("tratta l'apostrofo: l'articolo resta, il nome prende la maiuscola", () => {
    expect(titoloLeggibile("L'ALLEANZA DEI LORD")).toBe("L'Alleanza dei Lord");
    expect(titoloLeggibile("CAVALIERE DELL'ORDINE")).toBe("Cavaliere dell'Ordine");
    expect(titoloLeggibile("ORDINE DEL GUANTO D'ARME")).toBe("Ordine del Guanto d'Arme");
  });

  it("non tocca il genitivo inglese", () => {
    expect(titoloLeggibile("BALDUR'S GATE")).toBe("Baldur's Gate");
  });

  it("dopo i due punti ricomincia un titolo", () => {
    expect(titoloLeggibile("PRIVILEGIO: OCCHI APERTI")).toBe("Privilegio: Occhi Aperti");
    expect(titoloLeggibile("OPZIONE: I LINGUAGGI UMANI")).toBe("Opzione: I Linguaggi Umani");
  });

  it("gestisce trattini, parentesi e sigle", () => {
    expect(titoloLeggibile("MANTOL-DERITH")).toBe("Mantol-Derith");
    expect(titoloLeggibile("NANI GRIGI (DUERGAR)")).toBe("Nani Grigi (Duergar)");
    expect(titoloLeggibile("NOTA PER IL DM: PERSONALIZZARE I REAMI")).toBe("Nota per il DM: Personalizzare i Reami");
  });

  it("non scambia per refusi l'articolo, i dadi e il pronome «vi»", () => {
    expect(titoloLeggibile("Il Tempo nei Reami")).toBe("Il Tempo nei Reami");
    expect(titoloLeggibile("TABELLA D100")).toBe("Tabella d100");
    expect(titoloLeggibile("TIRA 2D10")).toBe("Tira 2d10");
    expect(titoloLeggibile("COSA VI ASPETTA")).toBe("Cosa Vi Aspetta");
    expect(titoloLeggibile("ATTO II")).toBe("Atto II");
  });

  it("corregge le lettere che l'OCR sbaglia nel maiuscoletto", () => {
    expect(titoloLeggibile("ARTIGIANO Dl CLAN")).toBe("Artigiano di Clan");
    expect(titoloLeggibile("IL CAVALIERE Rosso")).toBe("Il Cavaliere Rosso");
    expect(titoloLeggibile("ELFI OSCURI (DRow)")).toBe("Elfi Oscuri (Drow)");
  });
});

describe("correggiMaiuscoletto", () => {
  it("in una parola maiuscola una elle minuscola o un uno sono una I, uno zero una O", () => {
    expect(correggiMaiuscoletto("FORME Dl CULTO")).toBe("FORME DI CULTO");
    expect(correggiMaiuscoletto("D1VINITÀ")).toBe("DIVINITÀ");
    expect(correggiMaiuscoletto("SIMB0LO")).toBe("SIMBOLO");
  });

  it("non tocca le parole scritte normalmente, né i numeri veri", () => {
    expect(correggiMaiuscoletto("Player's Handbook il livello")).toBe("Player's Handbook il livello");
    expect(correggiMaiuscoletto("CAPITOLO 10")).toBe("CAPITOLO 10");
    expect(correggiMaiuscoletto("CAVALIERE Dell'ORDINE")).toBe("CAVALIERE Dell'ORDINE");
    expect(correggiMaiuscoletto("Al DRUIDI")).toBe("Al DRUIDI");
    // La cifra in fondo alla parola è comunque una lettera: «GIAC0» è GIACO.
    expect(correggiMaiuscoletto("GIAC0 DI MAGLIA")).toBe("GIACO DI MAGLIA");
  });
});

describe("fraseDaMaiuscoletto", () => {
  it("riporta in minuscolo la riga, con la maiuscola iniziale", () => {
    expect(fraseDaMaiuscoletto("TUTTE LE DODICI CLASSI PRESENTATE NEL")).toBe("Tutte le dodici classi presentate nel");
  });

  it("rimette il capolettera che l'OCR non ha letto", () => {
    expect(fraseDaMaiuscoletto("UESTO CAPITOLO DESCRIVE MOLTE", new Set(), "Q")).toBe("Questo capitolo descrive molte");
  });

  it("ridà la maiuscola ai nomi che la portano nel resto del testo", () => {
    expect(fraseDaMaiuscoletto("EL MONDO Dl TORIL, TRA IL MARE", new Set(["Toril"]), "N")).toBe("Nel mondo di Toril, tra il mare");
  });

  it("dopo un punto ricomincia una frase, dopo una virgoletta chiusa no", () => {
    expect(fraseDaMaiuscoletto("LO SAI COSA SIGNIFICA? SENTIRE")).toBe("Lo sai cosa significa? Sentire");
    expect(fraseDaMaiuscoletto('"DURI DI COMPRENDONIO, VERO?" BRONTOLÒ UN')).toBe('"Duri di comprendonio, vero?" brontolò un');
  });
});

describe("nomiConMaiuscola", () => {
  it("prende le parole con la maiuscola in mezzo a una frase, non quelle che la aprono", () => {
    const nomi = nomiConMaiuscola("Questa città sorge sul Mare delle Spade, vicino a Waterdeep. Ogni estate torna la fiera.");
    expect([...nomi].sort()).toEqual(["Mare", "Spade", "Waterdeep"]);
  });
});
