import { describe, expect, it } from "vitest";
import { isTema, TEMA_PREDEFINITO, temaDalDocumento, TEMI } from "./tema";

describe("tema", () => {
  it("riconosce solo i due temi esistenti", () => {
    expect(isTema("scuro")).toBe(true);
    expect(isTema("chiaro")).toBe(true);
    expect(isTema("Chiaro")).toBe(false);
    expect(isTema("")).toBe(false);
    expect(isTema(undefined)).toBe(false);
  });

  // Il valore arriva dal database, dove una riga vecchia o manomessa puo' contenere qualunque
  // cosa: senza questo controllo finirebbe in data-theme e il CSS non troverebbe nessuna palette,
  // lasciando la pagina con i colori di default del browser.
  it("il predefinito e' il tema storico dell'app", () => {
    expect(TEMA_PREDEFINITO).toBe("scuro");
    expect(TEMI).toContain(TEMA_PREDEFINITO);
  });

  it("legge il tema scritto dal server sull'html", () => {
    expect(temaDalDocumento({ dataset: { theme: "chiaro" } as DOMStringMap })).toBe("chiaro");
    expect(temaDalDocumento({ dataset: { theme: "scuro" } as DOMStringMap })).toBe("scuro");
  });

  it("senza attributo, o con un valore inatteso, ricade sul predefinito", () => {
    expect(temaDalDocumento({ dataset: {} as DOMStringMap })).toBe("scuro");
    expect(temaDalDocumento({ dataset: { theme: "seppia" } as DOMStringMap })).toBe("scuro");
  });
});
