import { describe, expect, it } from "vitest";
import { risolviSegnaposto, risolviSegnapostoProfondo, valoriVariante } from "./segnaposto-variante";

describe("risolviSegnaposto", () => {
  // Il caso segnalato dall'utente: il Compendio stampava "Hai un bonus di
  // {=bonusWeaponAttack} ai tiri per colpire", cioe' proprio il numero che si cercava.
  it("sostituisce il rimando col valore che sta accanto nel dato", () => {
    const testo = "You have a {=bonusWeaponAttack} bonus to attack rolls made with this weapon.";

    expect(risolviSegnaposto(testo, { bonusWeaponAttack: "+1" })).toBe(
      "You have a +1 bonus to attack rolls made with this weapon.",
    );
  });

  it("gestisce piu' rimandi nella stessa frase", () => {
    expect(
      risolviSegnaposto("{=bonusWeapon} to attack and {=bonusWeapon} to damage", {
        bonusWeapon: "+2",
      }),
    ).toBe("+2 to attack and +2 to damage");
  });

  it("applica i modificatori dopo la barra", () => {
    expect(risolviSegnaposto("{=baseName/l}", { baseName: "Arrow" })).toBe("arrow");
    expect(risolviSegnaposto("{=baseName/u}", { baseName: "Arrow" })).toBe("ARROW");
    expect(risolviSegnaposto("{=baseName/t}", { baseName: "flame tongue" })).toBe("Flame Tongue");
    expect(risolviSegnaposto("{=baseName/a}", { baseName: "Arrow" })).toBe("an Arrow");
    expect(risolviSegnaposto("{=baseName/a}", { baseName: "Sword" })).toBe("a Sword");
    expect(risolviSegnaposto("{=baseName/at}", { baseName: "sword" })).toBe("a Sword");
  });

  // Meglio lasciare il rimando visibile che scrivere "undefined" dentro una frase: cosi' se un
  // giorno 5etools introduce un campo nuovo, si vede che manca invece di leggere una bugia.
  it("lascia il rimando intatto se il valore non c'e'", () => {
    expect(risolviSegnaposto("bonus {=bonusMisterioso}", {})).toBe("bonus {=bonusMisterioso}");
    expect(risolviSegnaposto("bonus {=vuoto}", { vuoto: "" })).toBe("bonus {=vuoto}");
  });

  it("non tocca il testo senza rimandi, nemmeno gli altri tag di 5etools", () => {
    const testo = "Infligge {@damage 2d6} danni e {@dc 15} per il tiro salvezza.";
    expect(risolviSegnaposto(testo, { bonusWeapon: "+1" })).toBe(testo);
  });
});

describe("risolviSegnapostoProfondo", () => {
  it("scende dentro liste e oggetti annidati", () => {
    const entries = [
      "Bonus {=bonusAc} alla CA.",
      { type: "entries", name: "Extra", entries: ["Anche {=bonusAc} qui dentro."] },
    ];

    expect(risolviSegnapostoProfondo(entries, { bonusAc: "+3" })).toEqual([
      "Bonus +3 alla CA.",
      { type: "entries", name: "Extra", entries: ["Anche +3 qui dentro."] },
    ]);
  });

  it("non altera numeri e booleani che incontra", () => {
    const nodo = { livello: 3, attivo: true, testo: "{=bonusWeapon}" };
    expect(risolviSegnapostoProfondo(nodo, { bonusWeapon: "+1" })).toEqual({
      livello: 3,
      attivo: true,
      testo: "+1",
    });
  });
});

describe("valoriVariante", () => {
  it("usa i campi della variante e ricava il nome dell'oggetto base", () => {
    const v = valoriVariante("Arrow of Slaying (*)", { bonusWeapon: "+1", rarity: "rare" });

    expect(v.bonusWeapon).toBe("+1");
    expect(v.baseName).toBe("Arrow");
  });

  it("toglie il prefisso del bonus dal nome base", () => {
    expect(valoriVariante("+1 Weapon (no damage)", {}).baseName).toBe("Weapon");
    expect(valoriVariante("+2 Armor", {}).baseName).toBe("Armor");
  });

  it("regge una variante senza campi propri", () => {
    expect(valoriVariante("Vicious Weapon", undefined).baseName).toBe("Vicious Weapon");
  });
});
