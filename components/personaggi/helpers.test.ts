import { describe, expect, it } from "vitest";
import { formatClassSummary, idSchedaDaRicerca, indirizzoScheda } from "./helpers";

describe("formatClassSummary", () => {
  it("elenca classe e livello, saltando le righe senza nome", () => {
    expect(
      formatClassSummary([
        { nome: "Monaco", livello: 7 },
        { nome: "", livello: 1 },
        { nome: "Chierico", livello: 2 },
      ]),
    ).toBe("Monaco 7 / Chierico 2");
  });
});

// La scheda aperta era solo uno stato in memoria: ricaricando la pagina si tornava all'elenco
// (segnalato dall'utente). Ora sta nell'indirizzo, quindi sopravvive al ricaricamento e al tasto
// Indietro.
describe("scheda aperta nell'indirizzo", () => {
  it("riconosce la scheda aperta dalla parte di ricerca dell'indirizzo", () => {
    expect(idSchedaDaRicerca("?id=7c1f4a62-5d3e-4b89-9f2a-1e6b8c0d4a57")).toBe(
      "7c1f4a62-5d3e-4b89-9f2a-1e6b8c0d4a57",
    );
  });

  it("senza parametro, o con un parametro vuoto, nessuna scheda è aperta", () => {
    expect(idSchedaDaRicerca("")).toBeNull();
    expect(idSchedaDaRicerca("?altro=1")).toBeNull();
    expect(idSchedaDaRicerca("?id=")).toBeNull();
    expect(idSchedaDaRicerca("?id=%20%20")).toBeNull();
  });

  it("costruisce l'indirizzo della scheda e quello dell'elenco", () => {
    expect(indirizzoScheda("/personaggi", "abc")).toBe("/personaggi?id=abc");
    expect(indirizzoScheda("/personaggi", null)).toBe("/personaggi");
  });

  // Gli id sono generati da crypto.randomUUID(), ma una scheda importata da un file può portarsi
  // dietro un id scritto a mano: non deve rompere l'indirizzo.
  it("un id con caratteri speciali resta leggibile al ritorno", () => {
    const strano = "a b&c=d";

    const indirizzo = indirizzoScheda("/personaggi", strano);

    expect(idSchedaDaRicerca(indirizzo.slice(indirizzo.indexOf("?")))).toBe(strano);
  });
});
