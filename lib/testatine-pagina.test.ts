import { describe, expect, it } from "vitest";
import { togliTestatinePagina } from "./testatine-pagina";

// Il titolo del capitolo è stampato in cima a ogni pagina del manuale: l'estrazione lo legge come
// testo del corpo e lo pianta in mezzo a una frase. Nella descrizione del talento "Resiliente"
// finiva un pezzo di intestazione, e nelle azioni di alcuni mostri perfino il watermark di chi ha
// scansionato il PDF (segnalato dall'utente come testo "tagliato").
describe("togliTestatinePagina", () => {
  it("toglie l'intestazione di capitolo con le lettere spaziate dall'OCR", () => {
    const testo =
      "Ottiene competenza nei tiri salvezza. C A P I TOLO 6 I OPZION I DI PERSON A LIZZAZION E";
    expect(togliTestatinePagina(testo)).toBe("Ottiene competenza nei tiri salvezza.");
  });

  it("toglie l'intestazione anche quando è in mezzo alla frase", () => {
    const testo = "o di spingere CAPITOLO 6 I OPZIONI DI PE RSONALI ZZAZIONE il bersaglio";
    expect(togliTestatinePagina(testo)).toBe("o di spingere il bersaglio");
  });

  it("toglie le appendici, anche storpiate dall'OCR", () => {
    const testo = "Colpito: 1 danno tagliente. APPENDICE A: CRE.ATI!RE V/.RI";
    expect(togliTestatinePagina(testo)).toBe("Colpito: 1 danno tagliente.");
  });

  // Watermark e intestazione erano attaccati: togliendo prima l'intestazione, il titolo in
  // maiuscolo si mangiava la "O" di "Offrimi" e lasciava il watermark monco a schermo.
  it("toglie il watermark della scansione anche se attaccato a un'appendice", () => {
    const testo = "Colpito: 1 danno. APPENDICE A: CREATURE VARIE Offrimi un caffè: paypal.me/mimmi987";
    expect(togliTestatinePagina(testo)).toBe("Colpito: 1 danno.");
  });

  it("non tocca un testo che parla di capitoli senza essere un'intestazione", () => {
    const testo = "Le indicazioni di questo capitolo aiutano il DM a creare i mostri.";
    expect(togliTestatinePagina(testo)).toBe(testo);
  });

  it("conserva gli a capo, che portano la struttura dei paragrafi", () => {
    expect(togliTestatinePagina("Primo.\n\nSecondo.")).toBe("Primo.\n\nSecondo.");
  });
});
