import { describe, expect, it } from "vitest";
import { conOggettoInsolito } from "./oggetto-insolito";

describe("conOggettoInsolito", () => {
  it("cambia il nome nei titoli", () => {
    expect(conOggettoInsolito("Ninnolo di Aerenal")).toBe("Oggetto Insolito di Aerenal");
    expect(conOggettoInsolito("la tabella dei Ninnoli di Lorehold")).toBe("la tabella degli Oggetti Insoliti di Lorehold");
  });

  it("accorda l'articolo e la preposizione davanti alla vocale", () => {
    expect(conOggettoInsolito("Si tira 1d6 per determinare il ninnolo:")).toBe("Si tira 1d6 per determinare l'oggetto insolito:");
    expect(conOggettoInsolito("il valore del ninnolo, i ninnoli e dei ninnoli")).toBe(
      "il valore dell'oggetto insolito, gli oggetti insoliti e degli oggetti insoliti",
    );
    expect(conOggettoInsolito("Il ninnolo emette un canto. I ninnoli brillano.")).toBe("L'oggetto insolito emette un canto. Gli oggetti insoliti brillano.");
  });

  it("accorda anche davanti al nome con la maiuscola, e le preposizioni fuse", () => {
    expect(conOggettoInsolito("i Ninnoli di Lorehold, ai Ninnoli, con i Ninnoli")).toBe("gli Oggetti Insoliti di Lorehold, agli Oggetti Insoliti, con gli Oggetti Insoliti");
    expect(conOggettoInsolito("Il Ninnolo di Aerenal")).toBe("L'Oggetto Insolito di Aerenal");
    expect(conOggettoInsolito("col ninnolo in mano, coi ninnoli in tasca")).toBe("con l'oggetto insolito in mano, con gli oggetti insoliti in tasca");
  });

  it("non tocca le parole che contengono un articolo, né un articolo che non si accorda", () => {
    expect(conOggettoInsolito("gli amici dei ninnoli")).toBe("gli amici degli oggetti insoliti");
    expect(conOggettoInsolito("quindici ninnoli")).toBe("quindici oggetti insoliti");
    expect(conOggettoInsolito("i ninnolo")).toBe("i oggetto insolito");
  });

  it("lascia com'è ciò che sta davanti quando non va accordato", () => {
    expect(conOggettoInsolito("per il tuo ninnolo iniziale")).toBe("per il tuo oggetto insolito iniziale");
    expect(conOggettoInsolito("trova un solo ninnolo, due ninnoli")).toBe("trova un solo oggetto insolito, due oggetti insoliti");
  });

  it("non tocca un testo che non ne parla, né uno già corretto", () => {
    const testo = "Un anello di ottone che non si consuma mai";
    expect(conOggettoInsolito(testo)).toBe(testo);
    const fatto = conOggettoInsolito("il ninnolo e i ninnoli");
    expect(conOggettoInsolito(fatto)).toBe(fatto);
  });
});
