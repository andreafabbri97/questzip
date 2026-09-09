import { describe, expect, it } from "vitest";
import { resolveSubclassFeatures } from "./data";

// Nei dati 5etools alcuni privilegi compaiono DUE volte: una col testo e una come segnaposto
// vuoto a un altro livello. "Channel Divinity: Preserve Life" del Dominio della Vita sta al 2°
// col suo testo e al 3° senza niente; "The Hexblade" al 1° e di nuovo al 3°. In scheda erano
// righe cliccabili che aprivano un riquadro vuoto — 150 su 2.454.
const dati = {
  classes: [],
  subclasses: [],
  classFeatures: [],
  subclassFeatures: [
    {
      name: "Channel Divinity: Preserve Life",
      level: 2,
      className: "Cleric",
      subclassShortName: "Life",
      subclassSource: "PHB",
      source: "PHB",
      entries: ["Come azione, presenti il tuo simbolo sacro…"],
    },
    {
      name: "Channel Divinity: Preserve Life",
      level: 3,
      className: "Cleric",
      subclassShortName: "Life",
      subclassSource: "PHB",
      source: "PHB",
    },
    {
      name: "Life Domain",
      level: 3,
      className: "Cleric",
      subclassShortName: "Life",
      subclassSource: "PHB",
      source: "PHB",
      entries: [],
    },
  ],
} as unknown as Parameters<typeof resolveSubclassFeatures>[0];

const dominioVita = {
  name: "Life Domain",
  className: "Cleric",
  shortName: "Life",
  source: "PHB",
} as unknown as Parameters<typeof resolveSubclassFeatures>[1];

describe("resolveSubclassFeatures", () => {
  it("tiene il privilegio col testo e scarta il segnaposto vuoto", () => {
    const risolti = resolveSubclassFeatures(dati, dominioVita);

    expect(risolti).toHaveLength(1);
    expect(risolti[0].level).toBe(2);
    expect(risolti[0].name).toBe("Channel Divinity: Preserve Life");
  });

  it("scarta anche le voci con un elenco di testo vuoto", () => {
    const risolti = resolveSubclassFeatures(dati, dominioVita);

    expect(risolti.some((f) => f.name === "Life Domain")).toBe(false);
  });
});
