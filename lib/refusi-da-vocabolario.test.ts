import { describe, expect, it } from "vitest";
import { riparaRefusiDaVocabolario } from "./refusi-da-vocabolario";

// Un dizionario finto: la regola non dipende da quale elenco si usa. Le parole "in uso" sono
// quelle viste nei testi puliti; il dizionario ne ha in più, comprese alcune che parole non sono.
const IN_USO = new Set(
  (
    "argento isola ordine unico altro altra oro anima arte uso alleanza elfo acqua occhio organizzazione " +
    "influenza ufficiale effetto conflitto figure tribù perché città monete la il di un una nel regno grande " +
    "antica legge alba estremità ultima ultimo era erano ora allora signora leggendario flind andò sfoggiò finché " +
    "così attacco orco esempio libertà"
  ).split(" "),
);
const SOLO_NEL_DIZIONARIO = new Set("doro eira ife ong arante usanza erica autodeterminazione fiume flume".split(" "));
const vocabolario = {
  nota: (p: string) => IN_USO.has(p) || SOLO_NEL_DIZIONARIO.has(p),
  comune: (p: string) => IN_USO.has(p),
};
const ripara = (testo: string) => riparaRefusiDaVocabolario(testo, vocabolario).testo;

describe("riparaRefusiDaVocabolario: l'apostrofo", () => {
  it("lo rimette dove è stato perso", () => {
    expect(ripara("monete dargento")).toBe("monete d'argento");
    expect(ripara("lisola e lordine")).toBe("l'isola e l'ordine");
    expect(ripara("dellordine, allaltra, nellacqua")).toBe("dell'ordine, all'altra, nell'acqua");
    expect(ripara("questultima legge")).toBe("quest'ultima legge");
  });

  it("lascia le lettere com'erano", () => {
    expect(ripara("Lisola. LORDINE. Dargento")).toBe("L'isola. L'ORDINE. D'argento");
    expect(riparaRefusiDaVocabolario("dellordine", vocabolario).riparazioni).toEqual([
      { prima: "dellordine", dopo: "dell'ordine", tipo: "apostrofo" },
    ]);
  });

  // «dellAmn»: Amn non sta in nessun vocabolario, ma una maiuscola in mezzo alla parola dopo
  // un prefisso minuscolo non può essere altro che un nome rimasto senza apostrofo.
  it("riconosce il nome proprio dalla maiuscola in mezzo alla parola", () => {
    expect(ripara("a nord dellAmn, i membri dellAlleanza e lIsola")).toBe("a nord dell'Amn, i membri dell'Alleanza e l'Isola");
  });

  // «unattacco» è «un attacco» con lo spazio perso, non «un'attacco».
  it("con «un» lo rimette solo davanti a una parola in -a", () => {
    expect(ripara("unaltra usanza")).toBe("un'altra usanza");
    expect(ripara("unattacco, unorco, unaltro, unesempio")).toBe("unattacco, unorco, unaltro, unesempio");
  });

  it("non sceglie fra due prefissi possibili", () => {
    // «dall'ora» o «d'allora»?
    expect(ripara("dallora in poi")).toBe("dallora in poi");
  });

  // «usanza» ed «erica» stanno solo nel dizionario: in minuscolo bastano cinque lettere.
  it("in minuscolo si fida di una parola del dizionario di cinque lettere", () => {
    expect(ripara("vige lusanza, brughiera derica")).toBe("vige l'usanza, brughiera d'erica");
  });

  // La dea Leira diventava «L'eira», «life» diventava «l'ife», Darante «D'arante»: «eira», «ife»
  // e «arante» stavano nel dizionario fatto a macchina, ma nessun testo le usa.
  it("non si fida di una parola corta che sta solo nel dizionario, né di un nome", () => {
    expect(ripara("i fedeli di Leira")).toBe("i fedeli di Leira");
    expect(ripara("life and limb, long ago")).toBe("life and limb, long ago");
    expect(ripara("Darante e Lantan")).toBe("Darante e Lantan");
  });

  it("si fida di una parola lunga anche se sta solo nel dizionario", () => {
    expect(ripara("il diritto allautodeterminazione")).toBe("il diritto all'autodeterminazione");
  });

  it("non tocca ciò che ha già l'apostrofo né le parole troppo corte", () => {
    expect(ripara("dell'ordine e l'isola, un'antica legge")).toBe("dell'ordine e l'isola, un'antica legge");
    expect(ripara("era lora, luso")).toBe("era l'ora, l'uso");
    expect(ripara("lio dun")).toBe("lio dun");
  });
});

describe("riparaRefusiDaVocabolario: le altre lettere perse", () => {
  it("rimette la lettera persa da una legatura", () => {
    expect(ripara("una grande infuenza")).toBe("una grande influenza");
    expect(ripara("un uffciale del regno")).toBe("un ufficiale del regno");
    expect(ripara("un efetto, un confitto, le fgure")).toBe("un effetto, un conflitto, le figure");
    expect(ripara("Infuenza")).toBe("Influenza");
  });

  it("anche dopo un apostrofo che c'è già", () => {
    expect(ripara("la ricchezza dell'infuenza")).toBe("la ricchezza dell'influenza");
  });

  it("anche quando manca pure l'apostrofo", () => {
    expect(ripara("si contendevano linfuenza. Linfuenza del regno")).toBe("si contendevano l'influenza. L'influenza del regno");
  });

  it("non sceglie fra due riparazioni possibili", () => {
    // «fume» può essere «fiume» o «flume»: se esistono tutte e due, resta com'è.
    const due = { nota: (p: string) => p === "fiume" || p === "flume" };
    expect(riparaRefusiDaVocabolario("fume", due).testo).toBe("fume");
    expect(riparaRefusiDaVocabolario("fume", { nota: (p: string) => p === "fiume" }).testo).toBe("fiume");
  });

  it("rimette una lettera sola per volta, e mai in fondo alla parola", () => {
    // «ufcio» ne ha perse due (ffi): non c'è un modo solo di ricostruirla, e resta.
    expect(riparaRefusiDaVocabolario("ufcio", { nota: (p: string) => p === "ufficio" }).testo).toBe("ufcio");
    // «mezzelf» è una parola troncata, non una legatura: potrebbe essere «mezzelfo» o «mezzelfi».
    expect(riparaRefusiDaVocabolario("mezzelf", { nota: (p: string) => p === "mezzelfi" }).testo).toBe("mezzelf");
  });

  it("non scambia una parola inglese per una del gioco", () => {
    expect(ripara("you will find your calling")).toBe("you will find your calling");
  });

  it("rimette la g letta come é", () => {
    expect(ripara("la Siénora delle Nebbie")).toBe("la Signora delle Nebbie");
    expect(ripara("un oggetto leééendario")).toBe("un oggetto leggendario");
    expect(ripara("perché")).toBe("perché");
  });
});

describe("riparaRefusiDaVocabolario: l'accento finale", () => {
  it("lo rimette dove non c'è un'altra lettura", () => {
    expect(ripara("la tribu, perche la citta")).toBe("la tribù, perché la città");
    expect(ripara("finche, cosi")).toBe("finché, così");
    expect(ripara("LIBERTA")).toBe("LIBERTÀ");
  });

  // «ando» e «sfoggio» non sono nel dizionario finto, «andò» e «sfoggiò» sì: ma un verbo al
  // passato remoto ha sempre un'altra lettura, e il dizionario vero non le ha tutte.
  it("non lo mette sui verbi", () => {
    expect(ripara("lo sfoggio di ricchezza")).toBe("lo sfoggio di ricchezza");
    expect(ripara("ando via")).toBe("ando via");
  });

  it("non raddoppia un accento scritto come lettera più segno", () => {
    expect(ripara("perché la citta")).toBe("perché la città");
  });
});

describe("riparaRefusiDaVocabolario: in generale", () => {
  it("non tocca una parola che esiste, anche se qui è un refuso", () => {
    expect(ripara("monete doro")).toBe("monete doro");
  });

  it("ripara solo i tipi richiesti", () => {
    const soloAccenti = riparaRefusiDaVocabolario("la citta e lisola della Siénora", vocabolario, ["accento"]);
    expect(soloAccenti.testo).toBe("la città e lisola della Siénora");
    expect(soloAccenti.riparazioni.map((r) => r.tipo)).toEqual(["accento"]);
  });
});
