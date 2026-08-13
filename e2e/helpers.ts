import type { Page } from "@playwright/test";

// Oggetto minimo ma VALIDO secondo characterSchema (lib/dnd.ts) — costruito a mano invece di
// importare lo schema Zod del progetto (Playwright gira in un contesto Node separato dall'app,
// più semplice tenere i due mondi disaccoppiati). Iniettato via localStorage prima di aprire
// /personaggi: molto più veloce e affidabile che ricreare un personaggio dal wizard ad ogni test.
export async function injectTestCharacter(page: Page, overrides: Record<string, unknown> = {}) {
  await page.goto("/personaggi");
  await page.evaluate((patch) => {
    const character = {
      // UUID vero (non un id leggibile a mano): il backup cloud (app/actions/character-sync.ts)
      // scrive questo campo in una colonna Postgres "uuid" — un id non conforme fa fallire quella
      // query lato server ad ogni test (errore innocuo, il fallimento è già gestito con un .catch,
      // ma inutilmente rumoroso nei log).
      id: "e2e00000-0000-4000-8000-000000000001",
      nome: "Test E2E",
      classi: [{ nome: "Guerriero", livello: 5 }],
      razza: "Umano",
      hpMax: 30,
      hpAttuali: 30,
      hpTemporanei: 0,
      classeArmatura: 14,
      velocita: 9,
      iniziativaBonus: 0,
      percezionePassivaBonus: 0,
      visioneRadius: 0,
      scurovisione: false,
      vedeOscuritaMagica: false,
      caratteristiche: { forza: 16, destrezza: 14, costituzione: 12, intelligenza: 10, saggezza: 10, carisma: 8 },
      trsCompetenti: [],
      abilitaCompetenti: [],
      abilitaEsperte: [],
      trsBonus: {},
      abilitaBonus: {},
      slotUsati: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      slotPattoUsati: 0,
      tiriMorteSuccessi: 0,
      tiriMorteFallimenti: 0,
      esperienza: 0,
      allineamento: "",
      background: "",
      tratti: "",
      legami: "",
      ideali: "",
      difetti: "",
      nemici: "",
      eta: "",
      altezza: "",
      peso: "",
      occhi: "",
      carnagione: "",
      capelli: "",
      ritrattoUrl: "",
      ispirazione: false,
      dadiVitaUsati: 0,
      affaticamento: 0,
      oggettiMagici: [],
      privilegiLimitati: [],
      livelloFollia: 0,
      pesoMassimo: 0,
      linguaggi: [],
      resistenze: [],
      immunita: [],
      vulnerabilita: [],
      condizioniAttive: [],
      inventario: [],
      monete: { oro: 0, argento: 0, rame: 0 },
      incantesimi: [],
      armi: [],
      talenti: [],
      infusioniConosciute: [],
      scelteClasse: [],
      note: "",
      aggiornatoAl: Date.now(),
      ...patch,
    };
    localStorage.setItem("questzip:personaggi", JSON.stringify([character]));
  }, overrides);
  await page.reload();
}
