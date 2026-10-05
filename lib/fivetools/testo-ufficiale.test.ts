import { describe, expect, it } from "vitest";
import { descrizioneUfficialeUsabile } from "./testo-ufficiale";

describe("descrizioneUfficialeUsabile", () => {
  // Il caso vero: verificando "Bastone Ferrato" dalla scheda di un personaggio, al posto della
  // descrizione si leggeva "M" — la lettera della colonna "Tipo" della tabella armi, raccolta
  // dall'OCR. E, prendendo quel ramo, i dati veri dell'arma non venivano mostrati affatto.
  it("scarta la lettera della colonna tipo di una tabella", () => {
    expect(descrizioneUfficialeUsabile("M")).toBe(false);
    expect(descrizioneUfficialeUsabile("R")).toBe(false);
    expect(descrizioneUfficialeUsabile(" M ")).toBe(false);
  });

  it("scarta un'intestazione di colonna, anche se abbastanza lunga", () => {
    expect(descrizioneUfficialeUsabile("Armatura Media")).toBe(false);
  });

  it("tiene una descrizione vera", () => {
    expect(
      descrizioneUfficialeUsabile(
        "Questo bastone può essere impugnato a due mani per infliggere più danni.",
      ),
    ).toBe(true);
  });

  it("niente e vuoto non sono descrizioni", () => {
    expect(descrizioneUfficialeUsabile(null)).toBe(false);
    expect(descrizioneUfficialeUsabile(undefined)).toBe(false);
    expect(descrizioneUfficialeUsabile("   ")).toBe(false);
  });
});
