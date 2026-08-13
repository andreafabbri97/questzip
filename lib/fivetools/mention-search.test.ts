import { beforeEach, describe, expect, it, vi } from "vitest";

// loadAllMentionCandidates cachea il risultato in una promise a livello di modulo — serve
// vi.resetModules() + import dinamico per ogni test (stesso principio già usato per lib/gemini.ts),
// altrimenti il secondo test riuserebbe silenziosamente i dati mockati del primo.
vi.mock("@/lib/fivetools/data", () => ({
  loadSpells: vi.fn().mockResolvedValue([]),
  loadCreatures: vi.fn().mockResolvedValue([]),
  loadInventoryItems: vi.fn().mockResolvedValue([
    { name: "Dagger", source: "PHB" },
    { name: "Dagger of Venom", source: "DMG" },
    { name: "Bracer of Flying Daggers", source: "AI" },
    { name: "Dragontooth Dagger", source: "TCE" },
  ]),
  loadRaces: vi.fn().mockResolvedValue([]),
  loadFeats: vi.fn().mockResolvedValue([]),
  loadBackgrounds: vi.fn().mockResolvedValue([]),
  loadConditions: vi.fn().mockResolvedValue([]),
  loadClassData: vi.fn().mockResolvedValue({ classes: [] }),
}));

vi.mock("@/app/actions/compendio-ita", () => ({
  getIncantesimiIta: vi.fn().mockResolvedValue([]),
  getMostriIta: vi.fn().mockResolvedValue([]),
  getRazzeIta: vi.fn().mockResolvedValue([]),
  getTalentiIta: vi.fn().mockResolvedValue([]),
  getClassiIta: vi.fn().mockResolvedValue([]),
  getOggettiIta: vi.fn().mockResolvedValue([]),
  getTraduzioniIa: vi.fn().mockResolvedValue([]),
}));

async function importMentionSearch() {
  vi.resetModules();
  return import("./mention-search");
}

describe("searchMentionCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mette il nome comune al primo posto anche se il catalogo elenca prima le varianti magiche", async () => {
    // Bug reale: senza ordinamento per rilevanza, "Dagger" restava fuori dagli 8 risultati (o qui,
    // dal limite ancora più basso usato dall'assistente IA) perché il filtro prendeva solo i primi
    // N nell'ordine grezzo del catalogo — stesso identico bug già corretto per la ricerca armi.
    const { searchMentionCandidates } = await importMentionSearch();

    const results = await searchMentionCandidates("dagger", 8);

    expect(results[0].name).toBe("Dagger");
  });

  it("rispetta il limite passato, mantenendo comunque la corrispondenza migliore in cima", async () => {
    const { searchMentionCandidates } = await importMentionSearch();

    const results = await searchMentionCandidates("dagger", 2);

    expect(results).toHaveLength(2);
    expect(results[0].name).toBe("Dagger");
  });

  it("ritorna un elenco vuoto per una query vuota, senza caricare i candidati", async () => {
    const { searchMentionCandidates } = await importMentionSearch();

    const results = await searchMentionCandidates("   ", 8);

    expect(results).toEqual([]);
  });
});
