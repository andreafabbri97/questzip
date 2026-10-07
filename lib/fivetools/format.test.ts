import { describe, expect, it } from "vitest";
import {
  formatCreatureType,
  formatSfidaCreatura,
  formatDuration,
  formatRarity,
  formatTableCell,
  formatTime,
} from "./format";

// I dati 5etools esprimono SEMPRE l'unità al singolare, con la quantità in un campo separato: le
// vecchie chiavi plurali del dizionario ("minutes"/"hours") non venivano quindi mai raggiunte e su
// quasi ogni incantesimo senza testo ufficiale italiano si leggeva "10 minuto", "8 ora", oppure
// l'unità restava proprio in inglese ("10 day", "1 round", mai mappate).
describe("formatTime", () => {
  it("accorda il plurale invece di ripetere il singolare", () => {
    expect(formatTime([{ number: 10, unit: "minute" }])).toBe("10 minuti");
    expect(formatTime([{ number: 8, unit: "hour" }])).toBe("8 ore");
  });

  it("tiene il singolare quando la quantità è 1", () => {
    expect(formatTime([{ number: 1, unit: "minute" }])).toBe("1 minuto");
    expect(formatTime([{ number: 1, unit: "hour" }])).toBe("1 ora");
    expect(formatTime([{ number: 1, unit: "action" }])).toBe("1 azione");
  });

  it("traduce anche le unità che prima restavano in inglese", () => {
    expect(formatTime([{ number: 10, unit: "day" }])).toBe("10 giorni");
    expect(formatTime([{ number: 1, unit: "round" }])).toBe("1 round");
    expect(formatTime([{ number: 2, unit: "week" }])).toBe("2 settimane");
  });

  it("unisce più opzioni di lancio con 'o'", () => {
    expect(formatTime([{ number: 1, unit: "action" }, { number: 1, unit: "bonus" }])).toBe(
      "1 azione o 1 azione bonus",
    );
  });

  it("resta prudente su un'unità sconosciuta invece di inventare", () => {
    expect(formatTime([{ number: 3, unit: "qualcosa" }])).toBe("3 qualcosa");
  });
});

describe("formatDuration", () => {
  it("accorda il plurale e segnala la concentrazione", () => {
    expect(formatDuration([{ type: "timed", duration: { type: "hour", amount: 8 } }])).toBe("8 ore");
    expect(
      formatDuration([{ type: "timed", concentration: true, duration: { type: "minute", amount: 10 } }]),
    ).toBe("10 minuti (concentrazione)");
  });

  it("gestisce i tipi non temporali", () => {
    expect(formatDuration([{ type: "instant" }])).toBe("Istantanea");
    expect(formatDuration([{ type: "permanent" }])).toBe("Permanente");
    expect(formatDuration(undefined)).toBe("—");
  });
});

describe("formatRarity / formatCreatureType", () => {
  it("traduce rarità e tipo di creatura, che restavano gli unici valori in inglese", () => {
    expect(formatRarity("very rare")).toBe("molto raro");
    expect(formatRarity("uncommon")).toBe("non comune");
    expect(formatCreatureType("dragon")).toBe("drago");
    expect(formatCreatureType({ type: "humanoid" })).toBe("umanoide");
  });

  it("lascia passare invariato un valore non riconosciuto", () => {
    expect(formatRarity("qualcosa")).toBe("qualcosa");
    expect(formatCreatureType("qualcosa")).toBe("qualcosa");
  });

  // Sei creature (famigli di Acquisitions Incorporated, Empireo, cavalcatura planare) possono
  // essere di piu' tipi a scelta. Su quella forma annidata si chiamava toLowerCase() di un
  // oggetto: eccezione, e l'INTERA pagina del Compendio finiva nella schermata di errore. Si
  // vedeva ordinando i mostri per grado sfida, perche' queste creature non ne hanno uno e
  // finivano in cima all'elenco, dove prima non comparivano mai.
  it("elenca i tipi quando la creatura puo' essere di piu' tipi a scelta", () => {
    expect(formatCreatureType({ type: { choose: ["celestial", "fey", "fiend"] } })).toBe(
      "celestiale, folletto o immondo",
    );
    expect(formatCreatureType({ type: { choose: ["celestial", "fiend"] }, tags: ["titan"] })).toBe(
      "celestiale o immondo",
    );
    expect(formatCreatureType({ type: { choose: ["dragon"] } })).toBe("drago");
  });

  it("non esplode se il tipo e' una forma che non conosciamo", () => {
    expect(formatCreatureType({ type: { choose: [] } })).toBe("—");
    expect(formatCreatureType(undefined)).toBe("—");
  });
});

describe("formatSfidaCreatura", () => {
  const creatura = (extra: Record<string, unknown>) =>
    ({ name: "X", source: "Y", str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...extra }) as never;

  it("mostra il grado sfida quando c'e'", () => {
    expect(formatSfidaCreatura(creatura({ cr: "3" }))).toBe("3");
    expect(formatSfidaCreatura(creatura({ cr: { cr: "1/2" } }))).toBe("1/2");
  });

  // Un centinaio di creature mostrava solo un trattino. Quasi nessuna e' incompleta: o e'
  // descritta da un livello, o e' un'evocazione la cui competenza e' quella di chi la evoca.
  // Il dato c'era nel manuale e veniva buttato via (chiesto dall'utente).
  it("per chi ha un livello al posto del grado sfida, mostra il livello", () => {
    expect(formatSfidaCreatura(creatura({ level: 11 }))).toBe("Livello 11");
    expect(formatSfidaCreatura(creatura({ level: 1 }))).toBe("Livello 1");
  });

  it("per le evocazioni dice che la competenza e' quella dell'evocatore", () => {
    expect(formatSfidaCreatura(creatura({ pbNote: "equals your Proficiency Bonus" }))).toBe(
      "competenza come la tua",
    );
    expect(formatSfidaCreatura(creatura({ pbNote: "equals your bonus" }))).toBe(
      "competenza come la tua",
    );
  });

  it("una nota che non conosciamo si mostra com'e', invece di sparire", () => {
    expect(formatSfidaCreatura(creatura({ pbNote: "see sidebar" }))).toBe("see sidebar");
  });

  it("il trattino resta solo quando non c'e' davvero niente", () => {
    expect(formatSfidaCreatura(creatura({}))).toBe("—");
    expect(formatSfidaCreatura(creatura({ pbNote: "   " }))).toBe("—");
  });

  it("il grado sfida vince sugli altri due, se presenti insieme", () => {
    expect(formatSfidaCreatura(creatura({ cr: "5", level: 3, pbNote: "x" }))).toBe("5");
  });
});

describe("formatTableCell: celle con un tiro", () => {
  // La colonna "Attacco furtivo" del Ladro mostrava un trattino a ogni livello: queste celle non
  // hanno "value" ma "toRoll", e il formattatore non lo conosceva.
  it("rende un dado come si legge sul manuale", () => {
    expect(formatTableCell({ type: "dice", toRoll: [{ number: 2, faces: 6 }] })).toBe("2d6");
  });

  it("somma i dadi multipli e riporta il modificatore col segno", () => {
    expect(
      formatTableCell({ type: "dice", toRoll: [{ number: 1, faces: 8 }, { number: 1, faces: 4, modifier: 2 }] }),
    ).toBe("1d8 + 1d4+2");
  });

  it("resta un trattino se la cella non ha né valore né tiro", () => {
    expect(formatTableCell({ type: "dice" })).toBe("—");
  });
});
