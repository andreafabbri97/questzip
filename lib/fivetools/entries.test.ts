import { describe, expect, it } from "vitest";
import { guessDamageDice } from "./entries";

describe("guessDamageDice", () => {
  it("trova il primo dado dentro un tag {@damage ...}", () => {
    expect(
      guessDamageDice([
        "You cast a bolt of fire. On a hit, the target takes {@damage 8d6} fire damage.",
      ]),
    ).toBe("8d6");
  });

  it("ignora i tag {@dice ...} che non sono danno (es. Guidance)", () => {
    expect(guessDamageDice(["You can roll a {@dice 1d4} and add it to one ability check."])).toBe(
      "",
    );
  });

  it("stringa vuota se l'incantesimo non infligge danni diretti", () => {
    expect(guessDamageDice(["You can communicate with any creature within range."])).toBe("");
  });

  it("cerca anche dentro le entries annidate (liste, sezioni)", () => {
    expect(
      guessDamageDice([
        {
          type: "entries",
          name: "At Higher Levels",
          entries: ["The damage increases by {@damage 1d10} for each slot level above 1st."],
        },
      ]),
    ).toBe("1d10");
  });

  it("controlla anche entriesHigherLevel se entries non ha nulla", () => {
    expect(
      guessDamageDice(
        ["No damage here."],
        ["When you reach 5th level, deals {@damage 2d10} instead."],
      ),
    ).toBe("2d10");
  });

  it("nessun crash con entries undefined", () => {
    expect(guessDamageDice(undefined)).toBe("");
  });
});
