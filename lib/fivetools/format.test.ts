import { describe, expect, it } from "vitest";
import { formatCreatureType, formatDuration, formatRarity, formatTime } from "./format";

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
});
