import { describe, expect, it } from "vitest";
import {
  crToNumber,
  etichettaVerso,
  modoEffettivo,
  ordinaVoci,
  type SortDirection,
  type SortMode,
  type VoceOrdinabile,
} from "./ordinamento-compendio";

const ordina = (voci: VoceOrdinabile[], modo: SortMode, direzione: SortDirection, kind: string) =>
  ordinaVoci(voci, {
    modo,
    direzione,
    kind,
    nomeMostrato: (v) => v.name,
    nomeManuale: (v) => v.source,
  }).map((v) => v.name);

describe("crToNumber", () => {
  it("legge interi, frazioni e la forma con la tana", () => {
    expect(crToNumber("5")).toBe(5);
    expect(crToNumber("1/4")).toBe(0.25);
    expect(crToNumber({ cr: "13" })).toBe(13);
    expect(crToNumber("0")).toBe(0);
  });

  it("dà -1 quando il grado di sfida non c'è o non è un numero", () => {
    expect(crToNumber(undefined)).toBe(-1);
    expect(crToNumber("Unknown")).toBe(-1);
    expect(crToNumber("")).toBe(-1);
  });
});

describe("ordinaVoci per grado di sfida", () => {
  const mostri: VoceOrdinabile[] = [
    { name: "Spirito Bestiale", source: "TCE", pbNote: "equals your proficiency bonus" },
    { name: "Drago Rosso Antico", source: "MM", cr: "24" },
    { name: "Esperto", source: "TCE", level: 3 },
    { name: "Goblin", source: "MM", cr: "1/4" },
    { name: "Popolano", source: "MM", cr: "0" },
    { name: "Fantoccio", source: "XYZ" },
    { name: "Megera Verde", source: "MM", cr: { cr: "3" } },
    { name: "Combattente", source: "TCE", level: 1 },
    { name: "Coboldo", source: "MM", cr: "1/8" },
  ];

  // Il difetto segnalato: valevano -1 e aprivano l'elenco, quattro pagine prima del GS 0.
  it("mette in fondo le creature senza grado di sfida, non in testa", () => {
    expect(ordina(mostri, "cr", "asc", "mostri")).toEqual([
      "Popolano",
      "Coboldo",
      "Goblin",
      "Megera Verde",
      "Drago Rosso Antico",
      "Combattente",
      "Esperto",
      "Spirito Bestiale",
      "Fantoccio",
    ]);
  });

  it("al contrario parte dal più forte, e chi non ha un numero resta in fondo", () => {
    expect(ordina(mostri, "cr", "desc", "mostri")).toEqual([
      "Drago Rosso Antico",
      "Megera Verde",
      "Goblin",
      "Coboldo",
      "Popolano",
      "Esperto",
      "Combattente",
      "Spirito Bestiale",
      "Fantoccio",
    ]);
  });

  it("a parità di GS va dalla A alla Z in entrambi i versi", () => {
    const pari: VoceOrdinabile[] = [
      { name: "Zombi", source: "MM", cr: "1/4" },
      { name: "Goblin", source: "MM", cr: "1/4" },
      { name: "Lupo", source: "MM", cr: "1/4" },
    ];
    expect(ordina(pari, "cr", "asc", "mostri")).toEqual(["Goblin", "Lupo", "Zombi"]);
    expect(ordina(pari, "cr", "desc", "mostri")).toEqual(["Goblin", "Lupo", "Zombi"]);
  });
});

describe("ordinaVoci per nome", () => {
  const voci: VoceOrdinabile[] = [
    { name: "Zombi", source: "MM" },
    { name: "\"Il Demogorgon\"", source: "MM" },
    { name: "È Tardi", source: "MM" },
    { name: "aquila", source: "MM" },
    { name: "Elfo", source: "MM" },
  ];

  it("va dalla A alla Z ignorando virgolette, maiuscole e accenti", () => {
    expect(ordina(voci, "nome", "asc", "mostri")).toEqual(["aquila", "È Tardi", "Elfo", "\"Il Demogorgon\"", "Zombi"]);
  });

  it("e dalla Z alla A", () => {
    expect(ordina(voci, "nome", "desc", "mostri")).toEqual(["Zombi", "\"Il Demogorgon\"", "Elfo", "È Tardi", "aquila"]);
  });

  it("ordina sul nome che si legge, non su quello inglese", () => {
    const italiano: Record<string, string> = { "Devil's Sight": "Vista del Diavolo", Agonizing: "Agonizzante" };
    const risultato = ordinaVoci(
      [
        { name: "Devil's Sight", source: "PHB" },
        { name: "Agonizing", source: "PHB" },
      ],
      { modo: "nome", direzione: "desc", kind: "scelteClasse", nomeMostrato: (v) => italiano[v.name], nomeManuale: (v) => v.source },
    ).map((v) => v.name);
    expect(risultato).toEqual(["Devil's Sight", "Agonizing"]);
  });

  it("non modifica l'elenco che riceve", () => {
    const originale = [...voci];
    ordina(voci, "nome", "desc", "mostri");
    expect(voci).toEqual(originale);
  });
});

describe("ordinaVoci per rarità, livello e manuale", () => {
  it("segue la scala delle rarità e lascia in fondo quelle fuori scala", () => {
    const oggetti: VoceOrdinabile[] = [
      { name: "Cintura", source: "DMG", rarity: "varies" },
      { name: "Spada Vorpal", source: "DMG", rarity: "legendary" },
      { name: "Pozione", source: "DMG", rarity: "common" },
      { name: "Mano di Vecna", source: "DMG", rarity: "artifact" },
      { name: "Anello", source: "DMG", rarity: "rare" },
    ];
    expect(ordina(oggetti, "rarita", "asc", "oggetti")).toEqual(["Pozione", "Anello", "Spada Vorpal", "Mano di Vecna", "Cintura"]);
    expect(ordina(oggetti, "rarita", "desc", "oggetti")).toEqual(["Mano di Vecna", "Spada Vorpal", "Anello", "Pozione", "Cintura"]);
  });

  it("ordina gli incantesimi per livello nei due versi", () => {
    const incantesimi: VoceOrdinabile[] = [
      { name: "Desiderio", source: "PHB", level: 9 },
      { name: "Luce", source: "PHB", level: 0 },
      { name: "Palla di Fuoco", source: "PHB", level: 3 },
      { name: "Fulmine", source: "PHB", level: 3 },
    ];
    expect(ordina(incantesimi, "livello", "asc", "incantesimi")).toEqual(["Luce", "Fulmine", "Palla di Fuoco", "Desiderio"]);
    expect(ordina(incantesimi, "livello", "desc", "incantesimi")).toEqual(["Desiderio", "Fulmine", "Palla di Fuoco", "Luce"]);
  });

  it("ordina per manuale nei due versi, e dentro il manuale per nome", () => {
    const voci: VoceOrdinabile[] = [
      { name: "Lupo", source: "Manuale dei Mostri" },
      { name: "Aarakocra", source: "Mostri del Multiverso" },
      { name: "Goblin", source: "Manuale dei Mostri" },
    ];
    expect(ordina(voci, "manuale", "asc", "mostri")).toEqual(["Goblin", "Lupo", "Aarakocra"]);
    expect(ordina(voci, "manuale", "desc", "mostri")).toEqual(["Aarakocra", "Goblin", "Lupo"]);
  });
});

describe("modoEffettivo", () => {
  // Cambiando scheda può restare selezionato un modo che lì non esiste.
  it("ricade sul nome quando il modo non ha senso per la categoria", () => {
    expect(modoEffettivo("cr", "incantesimi")).toBe("nome");
    expect(modoEffettivo("rarita", "mostri")).toBe("nome");
    expect(modoEffettivo("livello", "oggetti")).toBe("nome");
    expect(modoEffettivo("cr", "mostri")).toBe("cr");
    expect(modoEffettivo("manuale", "talenti")).toBe("manuale");
  });
});

describe("etichettaVerso", () => {
  it("dice il verso con le parole della colonna", () => {
    expect(etichettaVerso("nome", "asc")).toBe("A→Z");
    expect(etichettaVerso("nome", "desc")).toBe("Z→A");
    expect(etichettaVerso("cr", "desc")).toBe("30→0");
    expect(etichettaVerso("livello", "asc")).toBe("0→9");
    expect(etichettaVerso("manuale", "desc")).toBe("Z→A");
    expect(etichettaVerso("rarita", "asc")).toBe("comune→raro");
    expect(etichettaVerso("rarita", "desc")).toBe("raro→comune");
  });
});
