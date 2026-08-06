import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// Regressione: su schermi stretti le righe di incantesimi/armi (dado danno + bottoni 🎲) e la
// griglia dei tiri salvezza (2 colonne fisse) andavano in overflow orizzontale — il bottone
// "🎲 Attacco" veniva tagliato fuori dallo schermo. Segnalato dall'utente con screenshot il
// 2026-08-06. Corretto rendendo quei gruppi flex-wrap invece di forzarli su una riga sola.
test.use({ viewport: { width: 375, height: 700 } });

test("la scheda personaggio non va in overflow orizzontale su schermo stretto", async ({ page }) => {
  await injectTestCharacter(page, {
    trsCompetenti: ["intelligenza", "saggezza"],
    trsBonus: { forza: 1 },
    incantesimi: [{ id: "sp1", nome: "Fireball", livello: 3, preparato: true, dadoDanno: "8d6" }],
    armi: [
      {
        id: "w1",
        nome: "Spada lunga magica +1",
        caratteristica: "forza",
        competente: true,
        bonusExtra: 1,
        dadoDanno: "1d8",
        tipoDanno: "tagliente",
        aDistanza: false,
      },
    ],
  });
  await page.getByRole("button", { name: /Test E2E/ }).click();

  const noHorizontalOverflow = async () =>
    page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

  await expect.poll(noHorizontalOverflow).toBe(true); // ⚔️ Combattimento (armi), tab di default

  await page.getByRole("button", { name: "Incantesimi" }).click();
  await expect.poll(noHorizontalOverflow).toBe(true);

  await page.getByRole("button", { name: "Info & Personalità" }).click();
  await expect.poll(noHorizontalOverflow).toBe(true); // tiri salvezza + abilità
});
