import { describe, expect, it } from "vitest";
import { eTitoletto, riflussoTestoOcr } from "./testo-riflusso";

describe("eTitoletto", () => {
  it("riconosce i titoletti dei tratti del manuale", () => {
    expect(eTitoletto("Multiattacco")).toBe(true);
    expect(eTitoletto("Resistenza alla Magia")).toBe(true);
    expect(eTitoletto("Pregiati Animali da Guardia")).toBe(true);
  });

  it("non scambia una frase breve qualunque per un titoletto", () => {
    expect(eTitoletto("Poi risorge")).toBe(false);
    expect(eTitoletto("Colpito: 7 danni")).toBe(false);
    expect(eTitoletto("La belva effettua due attacchi con i tentacoli")).toBe(false);
  });
});

describe("riflussoTestoOcr", () => {
  it("ricuce gli a-capo di fine colonna del PDF", () => {
    const ocr = "Sfuggente. Se la belva distorcente è soggetta a un effetto che\nle consente di effettuare un tiro salvezza per subire danni\ndimezzati, non subisce alcun danno se lo supera.";
    expect(riflussoTestoOcr(ocr)).toBe(
      "Sfuggente. Se la belva distorcente è soggetta a un effetto che le consente di effettuare un tiro salvezza per subire danni dimezzati, non subisce alcun danno se lo supera.",
    );
  });

  it("apre un paragrafo nuovo a ogni titoletto di tratto", () => {
    const ocr = "Multiattacco. La belva effettua due attacchi.\nTentacolo. Attacco con Arma da Mischia.";
    expect(riflussoTestoOcr(ocr).split("\n\n")).toEqual([
      "Multiattacco. La belva effettua due attacchi.",
      "Tentacolo. Attacco con Arma da Mischia.",
    ]);
  });

  it("non spezza una frase breve che non è un titoletto", () => {
    const testo = "La creatura muore. Poi risorge. Il DM decide.";
    expect(riflussoTestoOcr(testo)).toBe(testo);
  });

  it("lascia intatti gli elenchi puntati", () => {
    const elenco = "Opzioni:\n- prima voce\n- seconda voce";
    expect(riflussoTestoOcr(elenco)).toBe(elenco);
  });

  it("lascia intatte le tabelle etichetta — valore", () => {
    const tabella = "Tabella dei livelli\n1 — primo\n2 — secondo";
    expect(riflussoTestoOcr(tabella)).toBe(tabella);
  });

  it("conserva i paragrafi già separati da riga vuota", () => {
    expect(riflussoTestoOcr("Primo paragrafo.\n\nSecondo paragrafo.")).toBe(
      "Primo paragrafo.\n\nSecondo paragrafo.",
    );
  });
});
