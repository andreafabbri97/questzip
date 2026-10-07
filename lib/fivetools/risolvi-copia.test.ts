import { describe, expect, it } from "vitest";
import { risolviCopie, type TemplateCreatura } from "./risolvi-copia";

const base = {
  name: "Basilisk",
  source: "MM",
  str: 16,
  dex: 8,
  ac: [{ ac: 15, from: ["natural armor"] }],
  hp: { average: 52, formula: "8d8 + 16" },
  save: { con: "+4" },
  trait: [{ name: "Petrifying Gaze", entries: ["Tiro salvezza {@dc 12}."] }],
  action: [{ name: "Bite", entries: ["{@hit 5} to hit, 2d6 + 3 piercing."] }],
};

const risolvi = (creature: unknown[], template: TemplateCreatura[] = []) =>
  risolviCopie(creature as never[], template) as unknown as Record<string, unknown>[];

describe("risolviCopie", () => {
  // Il caso che ha fatto nascere questo modulo: il Compendio mostrava "—" e "(NaN)" perché la
  // creatura non ha alcun campo proprio, solo il rimando.
  it("una creatura fatta di solo _copy eredita tutte le statistiche", () => {
    const [, copia] = risolvi([
      base,
      { name: "Reduced-Threat Basilisk", source: "TftYP", _copy: { name: "Basilisk", source: "MM" } },
    ]);

    expect(copia.str).toBe(16);
    expect(copia.ac).toEqual([{ ac: 15, from: ["natural armor"] }]);
    expect(copia.name).toBe("Reduced-Threat Basilisk");
    expect(copia.source).toBe("TftYP");
    expect(copia._copy).toBeUndefined();
  });

  it("i campi propri vincono su quelli ereditati", () => {
    const [, copia] = risolvi([
      base,
      { name: "Basilisco Grosso", source: "X", str: 20, _copy: { name: "Basilisk", source: "MM" } },
    ]);

    expect(copia.str).toBe(20);
    expect(copia.dex).toBe(8);
  });

  it("modificare la copia non tocca l'originale", () => {
    const [originale, copia] = risolvi([
      base,
      {
        name: "Altro",
        source: "X",
        _copy: {
          name: "Basilisk",
          source: "MM",
          _mod: { action: { mode: "appendArr", items: { name: "Coda", entries: ["colpo"] } } },
        },
      },
    ]);

    expect((copia.action as unknown[]).length).toBe(2);
    expect((originale.action as unknown[]).length).toBe(1);
  });

  it("replaceTxt su '*' rinomina dentro tutto il testo", () => {
    const [, copia] = risolvi([
      base,
      {
        name: "Burney",
        source: "X",
        _copy: {
          name: "Basilisk",
          source: "MM",
          _mod: { "*": { mode: "replaceTxt", replace: "Tiro salvezza", with: "Prova" } },
        },
      },
    ]);

    expect((copia.trait as { entries: string[] }[])[0].entries[0]).toBe("Prova {@dc 12}.");
  });

  it("appendArr, prependArr e removeArr sugli elenchi", () => {
    const nuova = { name: "Coda", entries: ["colpo"] };
    const [, app] = risolvi([
      base,
      { name: "A", source: "X", _copy: { name: "Basilisk", source: "MM", _mod: { action: { mode: "appendArr", items: nuova } } } },
    ]);
    expect((app.action as { name: string }[]).map((a) => a.name)).toEqual(["Bite", "Coda"]);

    const [, pre] = risolvi([
      base,
      { name: "B", source: "X", _copy: { name: "Basilisk", source: "MM", _mod: { action: { mode: "prependArr", items: nuova } } } },
    ]);
    expect((pre.action as { name: string }[]).map((a) => a.name)).toEqual(["Coda", "Bite"]);

    const [, rim] = risolvi([
      base,
      { name: "C", source: "X", _copy: { name: "Basilisk", source: "MM", _mod: { action: { mode: "removeArr", names: "Bite" } } } },
    ]);
    expect(rim.action).toEqual([]);
  });

  // Il template "Reduced Threat" di Tales from the Yawning Portal: metà punti ferita e −2 su
  // tiri per colpire, CD e tiri salvezza. È il motivo per cui il basilisco ridotto deve avere
  // 26 PF e non 52, e CD 10 e non 12.
  it("applica i template: punti ferita dimezzati e −2 a colpire, CD e tiri salvezza", () => {
    const template: TemplateCreatura[] = [
      {
        name: "Reduced Threat",
        source: "TftYP",
        apply: {
          _mod: {
            hp: [
              { mode: "scalarMultProp", prop: "average", scalar: 0.5, floor: true },
              { mode: "prefixSuffixStringProp", prop: "formula", prefix: "floor((", suffix: ") ÷ 2)" },
            ],
            save: { mode: "scalarAddProp", scalar: -2, prop: "*" },
            trait: [{ mode: "scalarAddDc", scalar: -2 }],
            action: [{ mode: "scalarAddHit", scalar: -2 }],
          },
        },
      },
    ];
    const [, copia] = risolvi(
      [
        base,
        {
          name: "Reduced-Threat Basilisk",
          source: "TftYP",
          _copy: {
            name: "Basilisk",
            source: "MM",
            _templates: [{ name: "Reduced Threat", source: "TftYP" }],
          },
        },
      ],
      template,
    );

    expect(copia.hp).toEqual({ average: 26, formula: "floor((8d8 + 16) ÷ 2)" });
    expect((copia.trait as { entries: string[] }[])[0].entries[0]).toContain("{@dc 10}");
    expect((copia.action as { entries: string[] }[])[0].entries[0]).toContain("{@hit 3}");
    // Il tiro salvezza resta una stringa col segno: "+2", non il numero 2.
    expect(copia.save).toEqual({ con: "+2" });
  });

  it("risolve le catene: A copia B che copia C", () => {
    const [, , nipote] = risolvi([
      base,
      { name: "Medio", source: "X", dex: 12, _copy: { name: "Basilisk", source: "MM" } },
      { name: "Ultimo", source: "Y", _copy: { name: "Medio", source: "X" } },
    ]);

    expect(nipote.str).toBe(16);
    expect(nipote.dex).toBe(12);
  });

  // Dati corrotti non devono bloccare il caricamento dell'intero bestiario.
  it("due creature che si copiano a vicenda non mandano in ricorsione infinita", () => {
    const risultato = risolvi([
      { name: "A", source: "X", _copy: { name: "B", source: "X" } },
      { name: "B", source: "X", _copy: { name: "A", source: "X" } },
    ]);

    expect(risultato).toHaveLength(2);
  });

  it("se la creatura copiata non esiste, si restituisce quella di partenza senza esplodere", () => {
    const [sola] = risolvi([
      { name: "Orfana", source: "X", _copy: { name: "Inesistente", source: "ZZZ" } },
    ]);

    expect(sola.name).toBe("Orfana");
  });

  it("un'operazione sconosciuta non cancella il resto della creatura", () => {
    const [, copia] = risolvi([
      base,
      {
        name: "D",
        source: "X",
        _copy: {
          name: "Basilisk",
          source: "MM",
          _mod: { "*": { mode: "operazioneCheNonConosciamo", scalar: 3 } },
        },
      },
    ]);

    expect(copia.str).toBe(16);
    expect(copia.ac).toEqual([{ ac: 15, from: ["natural armor"] }]);
  });

  it("chi non ha _copy resta identico", () => {
    const [solo] = risolvi([base]);
    expect(solo).toBe(base as unknown as Record<string, unknown>);
  });
});
