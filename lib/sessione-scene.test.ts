import { describe, expect, it } from "vitest";
import { battuteDaLeggere, citatoNelTesto, paragrafi, vociInScena } from "./sessione-scene";

// I casi sono presi da una campagna vera (i nomi come vengono salvati dalla rubrica NPC e dal
// Compendio homebrew, il testo come lo scrive il master nelle trame).
describe("citatoNelTesto", () => {
  it("trova un mostro nominato al plurale", () => {
    const testo = "Scontro 1: 8 Guardie tiefling e 2 Veterani.";

    expect(citatoNelTesto("Guardia tiefling (Sfida 1/8)", testo)).toBe(true);
    expect(citatoNelTesto("Veterano (Sfida 3)", testo)).toBe(true);
  });

  it("ignora le precisazioni fra parentesi del nome salvato", () => {
    expect(citatoNelTesto("Glabrezu (Sfida 9)", "Scontro 3 — Glabrezu, 157 punti ferita.")).toBe(true);
  });

  it("cerca il nome proprio, non il cognome", () => {
    const scena = "Tatsudo entra mentre il demone è ancora a terra.";

    expect(citatoNelTesto("Tatsudo Yoshimitsu (PNG)", scena)).toBe(true);
    // Senza questa regola ogni Yoshimitsu comparirebbe in ogni scena che nomina la famiglia.
    expect(citatoNelTesto("Janine Yoshimitsu (PNG)", scena)).toBe(false);
  });

  it("non pesca un nome dentro un'altra parola", () => {
    expect(citatoNelTesto("Orco (Sfida 1/2)", "Il porcile è vuoto.")).toBe(false);
  });

  it("regge un nome con trattino", () => {
    const testo = "Duckworth è entrato in casa con dei mercenari.";

    expect(citatoNelTesto("Sicario — Duckworth Lamerde (Sfida 8)", testo)).toBe(true);
  });
});

describe("vociInScena", () => {
  it("tiene solo chi compare davvero nella scena", () => {
    const npc = [
      { nome: "Tatsudo Yoshimitsu (PNG)" },
      { nome: "Ginnie Brown (PNG)" },
      { nome: "Duckworth Lamerde (PNG)" },
    ];
    const scena = "Ginnie li accoglie uno per uno. Tatsudo arriva per ultimo e si siede.";

    expect(vociInScena(npc, scena).map((v) => v.nome)).toEqual([
      "Tatsudo Yoshimitsu (PNG)",
      "Ginnie Brown (PNG)",
    ]);
  });
});

describe("battuteDaLeggere", () => {
  it("estrae le frasi fra virgolette basse, nell'ordine in cui compaiono", () => {
    const scena = 'Jerome improvvisa: «Sono miei. Regali per mio padre.» Poi tace. «Sette anni.»';

    expect(battuteDaLeggere(scena)).toEqual(["Sono miei. Regali per mio padre.", "Sette anni."]);
  });

  it("non restituisce nulla se la scena non ha battute", () => {
    expect(battuteDaLeggere("Il cuore comico, e non tirerai un solo dado.")).toEqual([]);
  });
});

describe("paragrafi", () => {
  it("separa sulle righe vuote e scarta gli spazi", () => {
    expect(paragrafi("Primo.\n\n  Secondo.  \n\n\n")).toEqual(["Primo.", "Secondo."]);
  });
});
