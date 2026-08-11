import { describe, expect, it } from "vitest";
import { microphoneErrorMessage } from "./microphone-error";

// Prima c'era un solo messaggio generico per QUALUNQUE errore di getUserMedia — segnalato
// dall'utente durante il giro di miglioramento della chat vocale: permesso negato (azione per
// l'utente: impostazioni del browser) è un caso ben diverso da "nessun microfono collegato" o
// "microfono già in uso da un'altra app", ognuno richiede un'azione diversa da parte dell'utente.
describe("microphoneErrorMessage", () => {
  it("permesso negato: messaggio specifico che indica le impostazioni del browser", () => {
    const error = new DOMException("denied", "NotAllowedError");
    expect(microphoneErrorMessage(error)).toContain("Permesso al microfono negato");
  });

  it("nessun microfono: messaggio specifico", () => {
    const error = new DOMException("none", "NotFoundError");
    expect(microphoneErrorMessage(error)).toContain("Nessun microfono trovato");
  });

  it("microfono occupato da un'altra app: messaggio specifico", () => {
    const error = new DOMException("busy", "NotReadableError");
    expect(microphoneErrorMessage(error)).toContain("già in uso da un'altra app");
  });

  it("errore sconosciuto: messaggio generico di fallback", () => {
    expect(microphoneErrorMessage(new Error("qualcosa di imprevisto"))).toContain(
      "Non riesco ad accedere al microfono",
    );
    expect(microphoneErrorMessage("stringa qualsiasi")).toContain(
      "Non riesco ad accedere al microfono",
    );
  });
});
