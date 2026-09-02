import { describe, expect, it } from "vitest";
import {
  formatAbilita,
  formatCondizioni,
  formatListaDanni,
  formatTiriSalvezza,
} from "./creature-stats";

describe("formatTiriSalvezza", () => {
  it("segue l'ordine dello stat block, non quello dell'oggetto", () => {
    const save = { wis: "+7", str: "+9", cha: "+7", con: "+9" };

    expect(formatTiriSalvezza(save)).toBe("For +9, Cos +9, Sag +7, Car +7");
  });

  it("in inglese lascia le sigle originali", () => {
    expect(formatTiriSalvezza({ dex: "+6", int: "+4" }, "en")).toBe("DEX +6, INT +4");
  });

  it("non produce nulla se la creatura non ha tiri salvezza", () => {
    expect(formatTiriSalvezza(undefined)).toBe("");
  });
});

describe("formatAbilita", () => {
  it("traduce i nomi delle abilità", () => {
    expect(formatAbilita({ perception: "+10", "sleight of hand": "+4" })).toBe(
      "Percezione +10, Rapidità di Mano +4",
    );
  });
});

describe("formatListaDanni", () => {
  // Il Glabrezu: tre tipi secchi più un gruppo la cui nota vale solo per quel gruppo. Se si
  // appiattisse tutto in un elenco unico, "da attacchi non magici" sembrerebbe valere anche per
  // freddo, fuoco e fulmine — cioè si leggerebbe una resistenza che il mostro non ha.
  it("tiene separato il gruppo con la nota dai tipi di danno secchi", () => {
    const resist = [
      "cold",
      "fire",
      "lightning",
      { resist: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks", cond: true },
    ];

    expect(formatListaDanni(resist, "resist")).toBe(
      "freddo, fuoco, fulmine; contundenti, perforanti, taglienti da attacchi non magici",
    );
  });

  it("gestisce la nota che precede i tipi (Archmage: 'nonmagical ... from stoneskin')", () => {
    const resist = [
      {
        resist: ["bludgeoning", "piercing", "slashing"],
        preNote: "nonmagical",
        note: "(from stoneskin)",
        cond: true,
      },
    ];

    expect(formatListaDanni(resist, "resist")).toBe(
      "non magici contundenti, perforanti, taglienti (from stoneskin)",
    );
  });

  it("riporta i casi speciali scritti a parole", () => {
    expect(formatListaDanni([{ special: "damage from spells" }], "resist")).toBe("damage from spells");
  });

  it("legge la chiave giusta per le immunità", () => {
    const immune = ["poison", { immune: ["bludgeoning"], note: "from nonmagical attacks" }];

    expect(formatListaDanni(immune, "immune")).toBe("veleno; contundenti da attacchi non magici");
  });
});

describe("formatCondizioni", () => {
  it("traduce le condizioni", () => {
    expect(formatCondizioni(["poisoned", "charmed"])).toBe("avvelenato, affascinato");
  });
});
