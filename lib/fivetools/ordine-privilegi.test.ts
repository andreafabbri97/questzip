import { describe, expect, it } from "vitest";
import { ordinaPrivilegiSottoclasse } from "./ordine-privilegi";

// Caso reale: la Lama Spirituale al 9° livello. Nel file i due poteri stanno PRIMA della voce che
// li annuncia, così in scheda si leggeva "...questi poteri che usano i tuoi dadi di Energia
// Psionica:" come ultima riga, senza niente dopo.
const liv9 = [
  { name: "Homing Strikes", level: 9 },
  { name: "Psychic Teleportation", level: 9 },
  { name: "Soul Blades", level: 9 },
];
const dichiarato = [
  "Soulknife|Rogue||Soulknife|TCE|3",
  "Soul Blades|Rogue||Soulknife|TCE|9",
  "Psychic Veil|Rogue||Soulknife|TCE|13",
];

describe("ordinaPrivilegiSottoclasse", () => {
  it("mette la voce che introduce prima di quelle che annuncia", () => {
    expect(ordinaPrivilegiSottoclasse(liv9, dichiarato).map((f) => f.name)).toEqual([
      "Soul Blades",
      "Homing Strikes",
      "Psychic Teleportation",
    ]);
  });

  it("i livelli restano in ordine crescente", () => {
    const misti = [
      { name: "Rend Mind", level: 17 },
      { name: "Homing Strikes", level: 9 },
      { name: "Soul Blades", level: 9 },
      { name: "Soulknife", level: 3 },
    ];

    expect(ordinaPrivilegiSottoclasse(misti, dichiarato).map((f) => f.level)).toEqual([3, 9, 9, 17]);
  });

  it("senza un ordine dichiarato lascia le voci come stanno, per livello", () => {
    expect(ordinaPrivilegiSottoclasse(liv9, undefined).map((f) => f.name)).toEqual([
      "Homing Strikes",
      "Psychic Teleportation",
      "Soul Blades",
    ]);
  });
});
