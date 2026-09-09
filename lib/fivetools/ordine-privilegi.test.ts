import { describe, expect, it } from "vitest";
import { ordinaPrivilegiSottoclasse } from "./ordine-privilegi";

// Caso reale: la Lama Spirituale. Nei dati i privilegi "figli" stanno PRIMA della voce che li
// annuncia, così in scheda si leggeva "...questi poteri che usano i tuoi dadi di Energia
// Psionica:" come ultima riga, senza niente dopo. La parentela è scritta dentro il testo del
// padre, sotto forma di riferimenti.
const rif = (nome: string) => ({ type: "refSubclassFeature", subclassFeature: `${nome}|Rogue||Soulknife|TCE|3` });

const liv3 = [
  { name: "Psi-Bolstered Knack", level: 3 },
  { name: "Psychic Whispers", level: 3 },
  { name: "Soulknife", level: 3, entries: [rif("Psionic Power"), rif("Psychic Blades")] },
  { name: "Psionic Power", level: 3, entries: [{ type: "options", entries: [rif("Psi-Bolstered Knack"), rif("Psychic Whispers")] }] },
  { name: "Psychic Blades", level: 3 },
];

const liv9 = [
  { name: "Homing Strikes", level: 9 },
  { name: "Psychic Teleportation", level: 9 },
  { name: "Soul Blades", level: 9, entries: [{ type: "options", entries: [rif("Homing Strikes"), rif("Psychic Teleportation")] }] },
];

const dichiarato = ["Soulknife|Rogue||Soulknife|TCE|3", "Soul Blades|Rogue||Soulknife|TCE|9"];

describe("ordinaPrivilegiSottoclasse", () => {
  it("mette ogni padre subito prima dei propri figli, in profondità", () => {
    expect(ordinaPrivilegiSottoclasse(liv3, dichiarato).map((f) => f.name)).toEqual([
      "Soulknife",
      "Psionic Power",
      "Psi-Bolstered Knack",
      "Psychic Whispers",
      "Psychic Blades",
    ]);
  });

  it("la voce che introduce viene prima di quelle che annuncia", () => {
    expect(ordinaPrivilegiSottoclasse(liv9, dichiarato).map((f) => f.name)).toEqual([
      "Soul Blades",
      "Homing Strikes",
      "Psychic Teleportation",
    ]);
  });

  it("i livelli restano in ordine crescente", () => {
    const misti = [...liv9, ...liv3, { name: "Rend Mind", level: 17 }];

    expect(ordinaPrivilegiSottoclasse(misti, dichiarato).map((f) => f.level)).toEqual([
      3, 3, 3, 3, 3, 9, 9, 9, 17,
    ]);
  });

  it("senza parentele dichiarate lascia le voci come stanno", () => {
    const piatti = [
      { name: "Uno", level: 1 },
      { name: "Due", level: 1 },
    ];

    expect(ordinaPrivilegiSottoclasse(piatti, undefined).map((f) => f.name)).toEqual(["Uno", "Due"]);
  });

  // Un rimando che punta a se stesso (o un ciclo) non deve far girare a vuoto la pagina.
  it("regge un riferimento circolare senza perdere voci", () => {
    const ciclo = [
      { name: "A", level: 1, entries: [rif("B")] },
      { name: "B", level: 1, entries: [rif("A")] },
    ];

    expect(ordinaPrivilegiSottoclasse(ciclo, undefined).map((f) => f.name)).toHaveLength(2);
  });
});
