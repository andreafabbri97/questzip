import { describe, expect, it } from "vitest";
import { bestItalianName, buildItalianNameIndex } from "./italian-names";

describe("buildItalianNameIndex", () => {
  it("preferisce il nome ufficiale a quello tradotto, e la fonte esatta a una qualsiasi", () => {
    const index = buildItalianNameIndex(
      [{ nome: "Deflagrazione Occulta", nomeInglese: "Eldritch Blast", fonteInglese: "PHB" }],
      [{ name: "Eldritch Blast", source: "PHB", nomeIta: "Blast Occulto" }],
    );

    expect(bestItalianName(index, "Eldritch Blast", "PHB")).toBe("Deflagrazione Occulta");
    // Stesso nome inglese, altra fonte: niente testo ufficiale per quella ristampa, ma il nome
    // ufficiale vale lo stesso.
    expect(bestItalianName(index, "Eldritch Blast", "XPHB")).toBe("Deflagrazione Occulta");
  });

  // Dieci nomi tradotti erano finiti in archivio con uno spazio davanti (" TESSITORE DEL BUIO").
  // Invisibile a leggerlo, ma in un elenco alfabetico quello spazio sposta la voce e la lista
  // sembra fuori ordine senza motivo (segnalato dall'utente sui mostri ordinati per nome).
  it("toglie gli spazi intorno ai nomi, che altrimenti rovinano l'ordine alfabetico", () => {
    const index = buildItalianNameIndex(
      [{ nome: "  Driade  ", nomeInglese: "Dryad", fonteInglese: "MM" }],
      [{ name: "Gloom Weaver", source: "MTF", nomeIta: " TESSITORE DEL BUIO" }],
    );

    expect(bestItalianName(index, "Gloom Weaver", "MTF")).toBe("TESSITORE DEL BUIO");
    expect(bestItalianName(index, "Dryad", "MM")).toBe("Driade");
  });

  it("un nome fatto di soli spazi vale come assente", () => {
    const index = buildItalianNameIndex([], [{ name: "Jackal", source: "MM", nomeIta: "   " }]);

    expect(bestItalianName(index, "Jackal", "MM")).toBeUndefined();
  });

  it("senza nessuna corrispondenza non inventa niente", () => {
    const index = buildItalianNameIndex([], []);

    expect(bestItalianName(index, '"The Demogorgon"', "IMR")).toBeUndefined();
  });
});
