import { describe, expect, it } from "vitest";
import {
  condizioniInItaliano,
  danniInItaliano,
  linguaggiInItaliano,
  radiceDanno,
  sensiAttesi,
  sensiInItaliano,
  tipiDiDanno,
} from "./intestazioni-mostro";

// Le forme attese sono quelle delle schede estratte bene: si ricostruisce la stessa riga.
describe("danniInItaliano", () => {
  const nonMagici = { resist: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks", cond: true };

  it("scrive il Fantasma come il Manuale dei Mostri", () => {
    expect(danniInItaliano(["acid", "fire", "lightning", "thunder", nonMagici], "2014")).toBe(
      "acido, fulmine, fuoco, tuono; contundente, perforante e tagliente da attacchi non magici",
    );
  });

  it("nei manuali dal 2021 gli aggettivi sono al plurale", () => {
    expect(danniInItaliano(["necrotic", "poison", "psychic"], "2021")).toBe("necrotici, psichici, veleno");
    expect(danniInItaliano(["necrotic", "poison", "psychic"], "2014")).toBe("necrotico, psichico, veleno");
    expect(danniInItaliano(["cold", nonMagici], "2021")).toBe("freddo; contundenti, perforanti e taglienti da attacchi non magici");
  });

  it("riconosce le armi argentate e quelle di adamantio", () => {
    const argentate = { resist: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks that aren't silvered" };
    const adamantio = { immune: ["bludgeoning", "piercing", "slashing"], note: "from nonmagical attacks that aren't adamantine" };
    expect(danniInItaliano(["cold", "fire", argentate], "2014")).toBe(
      "freddo, fuoco; contundente, perforante e tagliente da attacchi non magici con armi non argentate",
    );
    expect(danniInItaliano(["lightning", "poison", adamantio], "2014")).toBe(
      "fulmine, veleno; contundente, perforante e tagliente da attacchi non magici con armi non di adamantio",
    );
  });

  it("le due note dei manuali più recenti", () => {
    const nellOmbra = { resist: ["bludgeoning", "piercing", "slashing"], note: "while in dim light or darkness" };
    expect(danniInItaliano([nellOmbra], "2021")).toBe(
      "contundenti, perforanti e taglienti mentre si trova in condizioni di luce fioca o oscurità",
    );
    const nonMagico = { immune: ["bludgeoning", "piercing", "slashing"], note: "that is nonmagical" };
    expect(danniInItaliano(["fire", "poison", nonMagico], "2021")).toBe("fuoco, veleno; contundenti, perforanti e taglienti non magici");
  });

  it("una riga vuota resta vuota", () => {
    expect(danniInItaliano(undefined, "2014")).toBe("");
    expect(danniInItaliano([], "2021")).toBe("");
  });

  it("non inventa ciò che non sa scrivere", () => {
    expect(danniInItaliano([{ resist: ["fire"], note: "while wearing the mask of the dragon queen" }], "2014")).toBeNull();
    expect(danniInItaliano([{ special: "damage from spells" }], "2014")).toBeNull();
    expect(danniInItaliano(["ghiaccio"], "2014")).toBeNull();
  });
});

describe("tipiDiDanno e radiceDanno", () => {
  it("trovano i tipi anche dentro i gruppi con nota", () => {
    expect(tipiDiDanno(["acid", { resist: ["bludgeoning", "slashing"], note: "from nonmagical attacks" }]).sort()).toEqual([
      "acid",
      "bludgeoning",
      "slashing",
    ]);
  });

  it("la radice vale per singolare e plurale", () => {
    expect(radiceDanno("necrotic")).toBe("necrotic");
    expect(radiceDanno("radiant")).toBe("radios");
    expect(radiceDanno("fire")).toBe("fuoco");
  });
});

describe("condizioniInItaliano", () => {
  it("in ordine alfabetico italiano", () => {
    expect(condizioniInItaliano(["charmed", "exhaustion", "frightened", "grappled", "paralyzed", "petrified", "poisoned", "prone"])).toBe(
      "affascinato, afferrato, avvelenato, indebolimento, paralizzato, pietrificato, prono, spaventato",
    );
    expect(condizioniInItaliano(["unconscious", "blinded"])).toBe("accecato, privo di sensi");
  });

  it("vuota se non ce ne sono, null se c'è una forma che non conosce", () => {
    expect(condizioniInItaliano([])).toBe("");
    expect(condizioniInItaliano([{ conditionImmune: ["charmed"], note: "by spells" }])).toBeNull();
  });
});

describe("sensiInItaliano", () => {
  it("Percezione passiva per prima, poi i sensi in metri", () => {
    expect(sensiInItaliano(["blindsight 30 ft.", "darkvision 120 ft."], 13)).toBe("Percezione passiva 13, scurovisione 36 m, vista cieca 9 m");
    expect(sensiInItaliano(["truesight 120 ft."], 24)).toBe("Percezione passiva 24, vista pura 36 m");
    expect(sensiInItaliano(["tremorsense 60 ft.", "darkvision 30 ft."], 15)).toBe("Percezione passiva 15, percezione tellurica 18 m, scurovisione 9 m");
  });

  it("la vista cieca di chi non vede altro", () => {
    expect(sensiInItaliano(["blindsight 60 ft. (blind beyond this radius)"], 8)).toBe(
      "Percezione passiva 8, vista cieca 18 m (cieco oltre questo raggio)",
    );
  });

  it("senza sensi resta la sola Percezione passiva; i metri non interi hanno la virgola", () => {
    expect(sensiInItaliano(undefined, 10)).toBe("Percezione passiva 10");
    expect(sensiInItaliano(["blindsight 5 ft."], 10)).toBe("Percezione passiva 10, vista cieca 1,5 m");
  });

  it("null se un senso è scritto in un modo che non conosce, o manca la Percezione passiva", () => {
    expect(sensiInItaliano(["darkvision 60 ft. (rat form only)"], 10)).toBeNull();
    expect(sensiInItaliano(["darkvision 60 ft."], undefined)).toBeNull();
  });

  it("sensiAttesi dà le coppie da cercare nel testo italiano", () => {
    expect(sensiAttesi(["darkvision 120 ft.", "blindsight 60 ft. (blind beyond this radius)"])).toEqual(["scurovisione 36 m", "vista cieca 18 m"]);
  });
});

describe("linguaggiInItaliano", () => {
  it("traduce un elenco di nomi, con la telepatia in fondo", () => {
    expect(linguaggiInItaliano(["Common", "Draconic"])).toBe("Comune, Draconico");
    expect(linguaggiInItaliano(["Deep Speech", "Undercommon", "telepathy 120 ft."])).toBe("Gergo delle Profondità, Sottocomune, telepatia 36 m");
    expect(linguaggiInItaliano(["Aquan"])).toBe("Aquan");
  });

  it("non tocca le forme libere", () => {
    expect(linguaggiInItaliano(["understands Draconic but can't speak"])).toBeNull();
    expect(linguaggiInItaliano(["any two languages"])).toBeNull();
  });
});
