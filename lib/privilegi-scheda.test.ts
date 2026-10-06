import { beforeEach, describe, expect, it, vi } from "vitest";

const loadClassDataMock = vi.fn();
const loadRacesMock = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/fivetools/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fivetools/data")>();
  return {
    ...actual,
    loadClassData: (...a: unknown[]) => loadClassDataMock(...a),
    loadRaces: (...a: unknown[]) => loadRacesMock(...a),
  };
});

// Le azioni del server parlano col database: qui interessa solo quale riga viene CHIESTA, e cosa
// succede con la risposta.
const loadTraduzioneIaMock = vi.fn().mockResolvedValue(null);
vi.mock("@/app/actions/compendio-ita", () => ({
  getTraduzioneIa: (...a: unknown[]) => loadTraduzioneIaMock(...a),
  getRazzeIta: () => Promise.resolve([]),
}));

const { caricaPrivilegiScheda } = await import("./privilegi-scheda");
const { characterSchema, newCharacter } = await import("./dnd");

// Un monaco come lo descrivono i dati veri: privilegi automatici più quelli OPZIONALI aggiunti
// dalle regole varianti di Tasha's, che nei dati stanno nello stesso elenco.
const datiMonaco = {
  classes: [{ name: "Monk", source: "PHB" }],
  subclasses: [
    {
      name: "Way of the Ascendant Dragon",
      shortName: "Ascendant Dragon",
      source: "FTD",
      className: "Monk",
      classSource: "PHB",
    },
  ],
  classFeatures: [
    { name: "Unarmored Defense", className: "Monk", classSource: "PHB", level: 1, entries: [] },
    { name: "Martial Arts", className: "Monk", classSource: "PHB", level: 1, entries: [] },
    { name: "Ki", className: "Monk", classSource: "PHB", level: 2, entries: [] },
    {
      name: "Dedicated Weapon",
      className: "Monk",
      classSource: "PHB",
      source: "TCE",
      level: 2,
      entries: [],
      isClassFeatureVariant: true,
    },
    { name: "Deflect Missiles", className: "Monk", classSource: "PHB", level: 3, entries: [] },
  ],
  subclassFeatures: [
    {
      name: "Breath of the Dragon",
      className: "Monk",
      classSource: "PHB",
      subclassShortName: "Ascendant Dragon",
      subclassSource: "FTD",
      level: 3,
      entries: ["testo"],
    },
  ],
};

const personaggio = (livello: number, sottoclasse?: string) =>
  characterSchema.parse({
    ...newCharacter(),
    nome: "Prova",
    razza: "",
    classi: [{ nome: "Monaco", livello, sottoclasse }],
  });

describe("caricaPrivilegiScheda", () => {
  beforeEach(() => {
    loadClassDataMock.mockReset().mockResolvedValue(datiMonaco);
    loadTraduzioneIaMock.mockReset().mockResolvedValue(null);
  });

  it("prende solo i privilegi fino al livello raggiunto", async () => {
    const privilegi = await caricaPrivilegiScheda(personaggio(2));

    expect(privilegi.map((p) => p.nome)).toEqual(["Unarmored Defense", "Martial Arts", "Ki"]);
  });

  // I privilegi opzionali di Tasha's non si hanno per il solo fatto di essere saliti di livello:
  // si scelgono, e il tavolo deve usare quelle regole. Stamparli sulla scheda di qualcuno vuol
  // dire attribuirgli capacità che non ha — ed è il motivo per cui in scheda compariva
  // "Dedicated Weapon" a un monaco che non l'aveva mai scelto.
  it("lascia fuori i privilegi opzionali", async () => {
    const privilegi = await caricaPrivilegiScheda(personaggio(3));

    expect(privilegi.map((p) => p.nome)).not.toContain("Dedicated Weapon");
  });

  // La riga tradotta è indicizzata col nome INGLESE della classe: chiedendola con quello scritto
  // in scheda ("Monaco") non si trovava mai niente e tutti i privilegi restavano in inglese.
  it("cerca la traduzione col nome inglese della classe, non con quello scritto in scheda", async () => {
    await caricaPrivilegiScheda(personaggio(1));

    expect(loadTraduzioneIaMock).toHaveBeenCalledWith("classi", "Monk", "PHB");
    expect(loadTraduzioneIaMock).not.toHaveBeenCalledWith("classi", "Monaco", expect.anything());
  });

  it("usa i nomi italiani quando il testo del manuale combacia", async () => {
    loadTraduzioneIaMock.mockResolvedValue({
      // Una riga per privilegio: è il formato con cui il testo italiano è stato prodotto.
      descrizioneIta: [
        "Difesa Senza Armatura (Liv. 1): testo.",
        "Arti Marziali (Liv. 1): altro testo.",
      ].join("\n"),
    });

    const privilegi = await caricaPrivilegiScheda(personaggio(1));

    expect(privilegi.map((p) => p.nome)).toEqual(["Difesa Senza Armatura", "Arti Marziali"]);
  });

  it("include i privilegi della sottoclasse, marcandoli come tali", async () => {
    const privilegi = await caricaPrivilegiScheda(personaggio(3, "Way of the Ascendant Dragon"));

    const soffio = privilegi.find((p) => p.nome === "Breath of the Dragon");
    expect(soffio?.origine).toBe("sottoclasse");
    expect(soffio?.livello).toBe(3);
  });

  it("ordina per livello, che è l'ordine in cui si sono ottenuti", async () => {
    const livelli = (await caricaPrivilegiScheda(personaggio(3, "Way of the Ascendant Dragon"))).map(
      (p) => p.livello,
    );

    expect(livelli).toEqual([...livelli].sort((a, b) => (a ?? 0) - (b ?? 0)));
  });

  // "Divine Domain feature" e simili sono righe che rimandano alla sottoclasse, il cui
  // privilegio vero è già nell'elenco: in scheda non direbbero niente.
  it("scarta le voci che rimandano soltanto alla sottoclasse", async () => {
    loadClassDataMock.mockResolvedValue({
      ...datiMonaco,
      classFeatures: [
        ...datiMonaco.classFeatures,
        {
          name: "Monastic Tradition feature",
          className: "Monk",
          classSource: "PHB",
          level: 3,
          entries: [],
        },
      ],
    });

    const privilegi = await caricaPrivilegiScheda(personaggio(3));

    expect(privilegi.map((p) => p.nome)).not.toContain("Monastic Tradition feature");
    expect(privilegi.map((p) => p.nome)).toContain("Deflect Missiles");
  });

  it("una classe che non esiste nel catalogo non fa saltare l'esportazione", async () => {
    const inventata = characterSchema.parse({
      ...newCharacter(),
      nome: "Prova",
      razza: "",
      classi: [{ nome: "Danzatore del Vuoto", livello: 5 }],
    });

    await expect(caricaPrivilegiScheda(inventata)).resolves.toEqual([]);
  });
});
