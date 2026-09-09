import { describe, expect, it } from "vitest";
import { flattenEntries } from "./entries";

// Caso reale: "Lame dell'Anima" (Lama Spirituale, 9° livello) introduce due poteri con i due punti
// e poi li elenca come RIFERIMENTI ad altri privilegi, non come testo. Senza gestirli, la frase
// restava appesa ai due punti e i poteri sparivano — segnalato dall'utente sulla sua scheda.
const lameDellAnima = [
  "{@i 9th-level Soulknife feature}",
  "Your Psychic Blades are now an expression of your psi-suffused soul, giving you these powers:",
  {
    type: "options",
    entries: [
      { type: "refSubclassFeature", subclassFeature: "Homing Strikes|Rogue|PHB|Soulknife|TCE|9" },
      { type: "refSubclassFeature", subclassFeature: "Psychic Teleportation|Rogue|PHB|Soulknife|TCE|9" },
    ],
  },
];

describe("flattenEntries: riferimenti ad altri privilegi", () => {
  it("riporta i nomi dei poteri invece di lasciare la frase a metà", () => {
    const righe = flattenEntries(lameDellAnima);

    expect(righe.some((r) => r.includes("these powers"))).toBe(true);
    expect(righe).toContain("Homing Strikes");
    expect(righe).toContain("Psychic Teleportation");
  });

  it("del riferimento tiene solo il nome, non le coordinate interne", () => {
    const righe = flattenEntries([
      { type: "refClassFeature", classFeature: "Metamagic|Sorcerer||3" },
    ]);

    expect(righe).toEqual(["Metamagic"]);
  });

  it("un riferimento senza nome non produce righe vuote", () => {
    expect(flattenEntries([{ type: "refSubclassFeature" }])).toEqual([]);
  });
});
