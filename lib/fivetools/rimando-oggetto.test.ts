import { describe, expect, it } from "vitest";
import { haRimandiOggetto, indiceModelli, sciogliRimandiOggetto } from "./rimando-oggetto";

// La forma dei dati veri di 5etools (items-base.json -> itemEntry), con testi accorciati.
const modelli = indiceModelli([
  {
    name: "Ring of Resistance",
    source: "DMG",
    entriesTemplate: ["You have resistance to {{item.resist}} damage while wearing this ring. The ring is set with {{item.detail1}}."],
  },
  {
    name: "Ring of Resistance",
    source: "XDMG",
    entriesTemplate: ["You have Resistance to {{getFullImmRes item.resist}} damage while wearing this ring."],
  },
  {
    name: "Absorbing Tattoo",
    source: "TCE",
    entriesTemplate: [
      "This magic tattoo features designs that emphasize one color ({{item.detail1}}).",
      { type: "entries", name: "Damage Resistance", entries: ["You have resistance to {{item.resist}} damage."] },
    ],
  },
  { name: "Senza Testo", source: "DMG" },
]);

describe("sciogliRimandiOggetto", () => {
  it("mette il testo del modello al posto del rimando, con i valori della voce", () => {
    const anello = { resist: ["acid"], detail1: "pearl" };
    expect(sciogliRimandiOggetto(["{#itemEntry Ring of Resistance}"], anello, modelli)).toEqual([
      "You have resistance to acid damage while wearing this ring. The ring is set with pearl.",
    ]);
  });

  it("senza fonte intende il manuale del 2014, con la fonte prende quel modello", () => {
    const valori = { resist: ["fire"], detail1: "garnet" };
    expect(sciogliRimandiOggetto(["{#itemEntry Ring of Resistance|XDMG}"], valori, modelli)).toEqual([
      "You have Resistance to fire damage while wearing this ring.",
    ]);
    expect(sciogliRimandiOggetto(["{#itemEntry Ring of Resistance|DMG}"], valori, modelli)?.[0]).toContain("set with garnet");
  });

  it("riempie i segnaposto anche dentro le sezioni annidate del modello", () => {
    const tatuaggio = sciogliRimandiOggetto(["{#itemEntry Absorbing Tattoo|TCE}"], { resist: ["acid"], detail1: "green" }, modelli);
    expect(tatuaggio).toEqual([
      "This magic tattoo features designs that emphasize one color (green).",
      { type: "entries", name: "Damage Resistance", entries: ["You have resistance to acid damage."] },
    ]);
  });

  // Le Pietre Ioun: il testo comune, poi la proprietà di quella pietra.
  it("lascia al loro posto le altre voci accanto al rimando", () => {
    const voci = ["{#itemEntry Ring of Resistance}", "Testo proprio di questa voce."];
    const sciolte = sciogliRimandiOggetto(voci, { resist: ["cold"], detail1: "tourmaline" }, modelli);
    expect(sciolte).toHaveLength(2);
    expect(sciolte?.[1]).toBe("Testo proprio di questa voce.");
  });

  it("più tipi di danno diventano un elenco", () => {
    expect(sciogliRimandiOggetto(["{#itemEntry Ring of Resistance|XDMG}"], { resist: ["fire", "cold"] }, modelli)).toEqual([
      "You have Resistance to fire, cold damage while wearing this ring.",
    ]);
  });

  it("un valore che manca lascia il segnaposto, invece di scrivere «undefined»", () => {
    expect(sciogliRimandiOggetto(["{#itemEntry Ring of Resistance}"], { resist: ["acid"] }, modelli)?.[0]).toContain("{{item.detail1}}");
  });

  it("non tocca un rimando a un modello che non esiste, né il testo normale", () => {
    const voci = ["{#itemEntry Modello Inventato|XYZ}", "{#itemEntry Senza Testo}", "Una frase con {@dice 1d6} dentro."];
    expect(sciogliRimandiOggetto(voci, {}, modelli)).toEqual(voci);
  });

  it("senza modelli o senza voci restituisce ciò che ha ricevuto", () => {
    const voci = ["{#itemEntry Ring of Resistance}"];
    expect(sciogliRimandiOggetto(voci, {}, indiceModelli(undefined))).toBe(voci);
    expect(sciogliRimandiOggetto(undefined, {}, modelli)).toBeUndefined();
  });
});

describe("haRimandiOggetto", () => {
  it("riconosce un rimando rimasto fra le voci", () => {
    expect(haRimandiOggetto(["{#itemEntry Ring of Resistance}"])).toBe(true);
    expect(haRimandiOggetto(["Testo.", { type: "entries", entries: [] }])).toBe(false);
    expect(haRimandiOggetto(undefined)).toBe(false);
  });
});
