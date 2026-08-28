import { describe, expect, it } from "vitest";

import { correggiTerminiDnd } from "./traduzione-termini";

describe("correggiTerminiDnd", () => {
  it("chiama famiglio la creatura, non famigliare", () => {
    expect(correggiTerminiDnd("Il warlock percepisce il mondo attraverso i sensi del suo famigliare.")).toBe(
      "Il warlock percepisce il mondo attraverso i sensi del suo famiglio.",
    );
    expect(correggiTerminiDnd("Puoi lanciare l'incantesimo attraverso un famigliare.")).toBe(
      "Puoi lanciare l'incantesimo attraverso un famiglio.",
    );
    expect(correggiTerminiDnd("I maghi e i loro famigliari")).toBe("I maghi e i loro famigliari");
  });

  it("corregge anche il plurale con il suo determinante", () => {
    expect(correggiTerminiDnd("Gli spiriti prendono la forma dei famigliari evocati.")).toBe(
      "Gli spiriti prendono la forma dei famigli evocati.",
    );
  });

  it("lascia stare l'aggettivo, che segue il sostantivo", () => {
    // qui "famigliare" è italiano corretto: la creatura non c'entra
    expect(correggiTerminiDnd("La creatura percorre un terreno famigliare.")).toBe(
      "La creatura percorre un terreno famigliare.",
    );
    expect(correggiTerminiDnd("Un volto famigliare appare nella nebbia.")).toBe(
      "Un volto famigliare appare nella nebbia.",
    );
  });
});
