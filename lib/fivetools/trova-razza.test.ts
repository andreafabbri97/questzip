import { describe, expect, it } from "vitest";
import { trovaRazza } from "./trova-razza";
import type { RawRace } from "@/lib/fivetools/data";

const razza = (name: string, source: string, conTratti = true) =>
  ({
    name,
    source,
    entries: conTratti ? [{ name: "Tratto", entries: ["testo"] }] : [],
  }) as unknown as RawRace;

const ufficiali = [
  { nome: "Rinato", nomeInglese: "Reborn", fonteInglese: "VRGR" },
  { nome: "Elfo", nomeInglese: "Elf", fonteInglese: "PHB" },
];

describe("trovaRazza", () => {
  it("trova la razza dal nome inglese", () => {
    expect(trovaRazza([razza("Reborn", "VRGR")], ufficiali, "Reborn")?.source).toBe("VRGR");
  });

  // In scheda la razza si scrive in italiano: senza risalire al nome inglese non si trova nulla e
  // il personaggio resta senza tratti.
  it("trova la razza dal nome ufficiale italiano", () => {
    expect(trovaRazza([razza("Reborn", "VRGR")], ufficiali, "Rinato")?.name).toBe("Reborn");
  });

  // "Rinato (ex umano)" è un'annotazione personale, non un nome di razza.
  it("ignora una nota personale fra parentesi", () => {
    expect(trovaRazza([razza("Reborn", "VRGR")], ufficiali, "Rinato (ex umano)")?.name).toBe(
      "Reborn",
    );
  });

  // Alcune fonti ridefiniscono una razza senza portarne i tratti: sceglierla mostrerebbe zero
  // privilegi per una razza che invece ne ha.
  it("preferisce la fonte che ha davvero i tratti", () => {
    const candidate = [razza("Reborn", "LFL", false), razza("Reborn", "VRGR")];

    expect(trovaRazza(candidate, ufficiali, "Reborn")?.source).toBe("VRGR");
  });

  it("a parità di tratti preferisce la fonte con il testo ufficiale italiano", () => {
    const candidate = [razza("Reborn", "RHW"), razza("Reborn", "VRGR")];

    expect(trovaRazza(candidate, ufficiali, "Reborn")?.source).toBe("VRGR");
  });

  it("una razza inventata non corrisponde a niente", () => {
    expect(trovaRazza([razza("Reborn", "VRGR")], ufficiali, "Mezzo-drago di Compthorne")).toBeNull();
    expect(trovaRazza([], ufficiali, "")).toBeNull();
  });
});
