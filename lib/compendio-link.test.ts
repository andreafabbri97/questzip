import { describe, expect, it } from "vitest";
import { leggiVoceDaUrl, percorsoVoce, testoCondivisione } from "./compendio-link";

describe("percorsoVoce", () => {
  it("costruisce un indirizzo che punta alla voce", () => {
    expect(percorsoVoce({ tab: "mostri", nome: "Glabrezu", fonte: "MM" })).toBe(
      "/compendio?tab=mostri&v=Glabrezu&f=MM",
    );
  });

  it("codifica i nomi con spazi e simboli", () => {
    const percorso = percorsoVoce({ tab: "oggetti-magici", nome: "Belt of Giant Strength", fonte: "DMG" });

    expect(percorso).toContain("v=Belt+of+Giant+Strength");
    expect(leggiVoceDaUrl(percorso.split("?")[1])?.nome).toBe("Belt of Giant Strength");
  });

  it("senza voce resta l'indirizzo del Compendio", () => {
    expect(percorsoVoce(null)).toBe("/compendio");
  });
});

describe("leggiVoceDaUrl", () => {
  it("legge un indirizzo condiviso", () => {
    expect(leggiVoceDaUrl("?tab=incantesimi&v=Fireball&f=PHB")).toEqual({
      tab: "incantesimi",
      nome: "Fireball",
      fonte: "PHB",
    });
  });

  // Lo stesso nome esiste in piu' manuali (Aboleth sta in MM e in MPMM): senza fonte la voce
  // resta identificata solo dal nome, e va aperta comunque la prima che combacia.
  it("regge un link senza fonte", () => {
    expect(leggiVoceDaUrl("?tab=mostri&v=Aboleth")).toEqual({
      tab: "mostri",
      nome: "Aboleth",
      fonte: "",
    });
  });

  it("ignora un indirizzo senza parametri della voce", () => {
    expect(leggiVoceDaUrl("")).toBeNull();
    expect(leggiVoceDaUrl("?tab=mostri")).toBeNull();
  });
});

describe("testoCondivisione", () => {
  it("sta in una riga, con nome e categoria", () => {
    expect(testoCondivisione("Glabrezu", "Mostri")).toBe("Glabrezu — Mostri su QuestZip");
  });
});
