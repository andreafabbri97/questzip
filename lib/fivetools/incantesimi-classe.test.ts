import { describe, expect, it } from "vitest";

import {
  incantesimiDaSources,
  incantesimiDelleSottoclassi,
  incantesimiDiSottoclasse,
} from "./incantesimi-classe";

describe("incantesimiDaSources", () => {
  const file = {
    PHB: {
      "Eldritch Blast": { class: [{ name: "Warlock", source: "PHB" }] },
      Shield: {
        class: [
          { name: "Sorcerer", source: "PHB" },
          { name: "Wizard", source: "PHB" },
        ],
      },
      "Cause Fear": {
        classVariant: [{ name: "Warlock", source: "PHB", definedInSource: "XGE" }],
      },
    },
  };

  it("tiene la lista base della classe", () => {
    const w = incantesimiDaSources(file, "Warlock", "PHB");
    expect(w.find((s) => s.name === "Eldritch Blast")?.origine).toEqual({ tipo: "base" });
  });

  it("include le liste ampliate dai manuali successivi, dicendo da quale", () => {
    // la Guida di Xanathar aggiunge 36 incantesimi alla lista del warlock: erano esclusi del tutto
    const w = incantesimiDaSources(file, "Warlock", "PHB");
    expect(w.find((s) => s.name === "Cause Fear")?.origine).toEqual({
      tipo: "variante",
      manuale: "XGE",
    });
  });

  it("non attribuisce a una classe gli incantesimi di un'altra", () => {
    const w = incantesimiDaSources(file, "Warlock", "PHB");
    expect(w.some((s) => s.name === "Shield")).toBe(false);
  });
});

describe("incantesimiDiSottoclasse", () => {
  it("legge la lista ampliata di un patrono", () => {
    // il caso segnalato dall'utente: il warlock Lama Maledetta ha scudo al 1° livello
    const hexblade = {
      name: "The Hexblade",
      className: "Warlock",
      classSource: "PHB",
      source: "XGE",
      additionalSpells: [
        { expanded: { s1: ["shield", "wrathful smite"], s2: ["blur", "branding smite"] } },
      ],
    };
    expect(incantesimiDiSottoclasse(hexblade).map((s) => s.name)).toEqual([
      "shield",
      "wrathful smite",
      "blur",
      "branding smite",
    ]);
  });

  it("riconosce la fonte quando il nome se la porta dietro, e la ignora quando è vuota", () => {
    const s = incantesimiDiSottoclasse({
      name: "Life Domain",
      className: "Cleric",
      classSource: "PHB",
      source: "PHB",
      additionalSpells: [{ prepared: { 1: ["bless|xphb", "fire shield|"] } }],
    });
    expect(s).toEqual([
      { name: "bless", source: "XPHB", origine: { tipo: "sottoclasse", nome: "Life Domain" } },
      { name: "fire shield", source: undefined, origine: { tipo: "sottoclasse", nome: "Life Domain" } },
    ]);
  });

  it("scarta le voci 'scegline uno dalla lista del mago', che non nominano un incantesimo", () => {
    const arcana = {
      name: "Arcana Domain",
      className: "Cleric",
      classSource: "PHB",
      source: "SCAG",
      additionalSpells: [
        {
          prepared: { 17: [{ choose: "level=6|class=Wizard" }, "detect magic"] },
          known: { 1: { _: [{ choose: "level=0|class=Wizard", count: 2 }] } },
        },
      ],
    };
    expect(incantesimiDiSottoclasse(arcana).map((s) => s.name)).toEqual(["detect magic"]);
  });

  it("attraversa l'annidamento in più che alcune sottoclassi hanno", () => {
    const s = incantesimiDiSottoclasse({
      name: "Nature Domain",
      className: "Cleric",
      classSource: "PHB",
      source: "PHB",
      additionalSpells: [{ known: { 1: { _: ["druidcraft"] } } }],
    });
    expect(s.map((x) => x.name)).toEqual(["druidcraft"]);
  });

  it("non ripete lo stesso incantesimo concesso da più canali", () => {
    const s = incantesimiDiSottoclasse({
      name: "Test",
      className: "Cleric",
      classSource: "PHB",
      source: "PHB",
      additionalSpells: [{ prepared: { 1: ["bless"] }, known: { 1: ["bless"] } }],
    });
    expect(s).toHaveLength(1);
  });
});

describe("incantesimiDelleSottoclassi", () => {
  const sottoclassi = [
    {
      name: "The Hexblade",
      className: "Warlock",
      classSource: "PHB",
      source: "XGE",
      additionalSpells: [{ expanded: { s1: ["shield"] } }],
    },
    // molte sottoclassi non danno incantesimi: non devono comparire come gruppi vuoti
    { name: "The Undying", className: "Warlock", classSource: "PHB", source: "SCAG" },
    { name: "Life Domain", className: "Cleric", classSource: "PHB", source: "PHB", additionalSpells: [{ prepared: { 1: ["bless"] } }] },
  ];

  it("raggruppa per sottoclasse, saltando quelle senza incantesimi e le altre classi", () => {
    expect(incantesimiDelleSottoclassi(sottoclassi, "Warlock", "PHB")).toEqual([
      {
        sottoclasse: "The Hexblade",
        fonte: "XGE",
        incantesimi: [
          { name: "shield", source: undefined, origine: { tipo: "sottoclasse", nome: "The Hexblade" } },
        ],
      },
    ]);
  });
});
