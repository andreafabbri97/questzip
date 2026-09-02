import { describe, expect, it } from "vitest";
import { descrizioneCreatura } from "./creature-testo";
import type { RawCreature } from "./data";

const glabrezu: RawCreature = {
  name: "Glabrezu",
  source: "MM",
  size: ["L"],
  type: "fiend",
  ac: [{ ac: 17, from: ["natural armor"] }],
  hp: { average: 157, formula: "15d10 + 75" },
  speed: { walk: 40 },
  str: 20,
  dex: 15,
  con: 21,
  int: 19,
  wis: 17,
  cha: 16,
  cr: "9",
  senses: ["truesight 120 ft."],
  passive: 13,
  languages: ["Abyssal", "telepathy 120 ft."],
  trait: [{ name: "Magic Resistance", entries: ["The glabrezu has advantage on saving throws."] }],
  action: [
    { name: "Multiattack", entries: ["The glabrezu makes four attacks."] },
    { name: "Pincer", entries: ["Melee Weapon Attack: +9 to hit."] },
  ],
};

describe("descrizioneCreatura", () => {
  it("mette in testa i numeri che servono al tavolo", () => {
    const testo = descrizioneCreatura(glabrezu);
    const testata = testo.split("\n\n")[0];

    expect(testata).toContain("CA 17");
    // formatHP tiene anche la formula dei dadi: al tavolo serve per rilanciare i PF.
    expect(testata).toContain("PF 157 (15d10 + 75)");
    expect(testata).toContain("Sfida 9");
    // La velocità va convertita in metri: 40 piedi = 12 m, come nel resto del Compendio italiano.
    expect(testata).toContain("12 m");
  });

  it("elenca le caratteristiche con il modificatore già calcolato", () => {
    expect(descrizioneCreatura(glabrezu)).toContain("FOR 20 (+5)");
    expect(descrizioneCreatura(glabrezu)).toContain("INT 19 (+4)");
  });

  it("riporta tratti e azioni come righe 'NOME. testo'", () => {
    const testo = descrizioneCreatura(glabrezu);

    expect(testo).toContain("Magic Resistance. The glabrezu has advantage on saving throws.");
    expect(testo).toContain("AZIONI");
    expect(testo).toContain("Multiattack. The glabrezu makes four attacks.");
  });

  it("non lascia sezioni vuote per una creatura senza azioni o sensi", () => {
    const minima: RawCreature = { name: "Nulla", source: "MM", str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 };

    const testo = descrizioneCreatura(minima);

    expect(testo).not.toContain("AZIONI");
    expect(testo).not.toContain("SENSI");
    expect(testo).not.toMatch(/\n\n\n/);
  });
});
