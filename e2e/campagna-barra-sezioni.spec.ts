import { expect, test } from "@playwright/test";
import { cleanupSeededMember, seedCampaignWithPartyMember } from "./db-helpers";

// Al tavolo la pagina campagna è una colonna lunga: durante una sessione dal vivo il master
// passa di continuo dalle proprie note al combattimento alle schede del party, e prima l'unico
// modo era scorrere avanti e indietro tutta la pagina.
test.describe("Campagna: barra di salto rapido", () => {
  let campaignId: string;
  let compagnoUserId: string;

  test.beforeAll(async () => {
    ({ campaignId, compagnoUserId } = await seedCampaignWithPartyMember("E2E barra sezioni"));
  });

  test.afterAll(async () => {
    await cleanupSeededMember(campaignId, compagnoUserId);
  });

  test("il master salta a una sezione lontana senza scorrere", async ({ page }) => {
    await page.goto(`/campagne?open=${campaignId}`);
    await page.getByText("E2E barra sezioni", { exact: true }).first().click();

    const barra = page.locator("nav").filter({ hasText: "Combattimento" }).first();
    await expect(barra).toBeVisible({ timeout: 15000 });

    // Le voci riservate al master ci sono solo perché questo utente è il master: PNG, trame e
    // preparazione sono invisibili ai giocatori (vedi il commento sullo schema in lib/db/schema.ts).
    for (const voce of ["Handout", "Party", "Combattimento", "NPC", "Trame", "Preparazione"]) {
      await expect(barra.getByRole("link", { name: new RegExp(voce) })).toBeVisible();
    }

    // La sezione PNG sta in fondo alla pagina: prima del salto non è nello schermo, dopo sì.
    await expect(page.getByRole("heading", { name: /Rubrica NPC/ })).toBeAttached({ timeout: 15000 });
    const png = page.locator("#sez-png");
    await expect(png).not.toBeInViewport();
    await barra.getByRole("link", { name: /NPC/ }).click();
    await expect(png).toBeInViewport({ timeout: 5000 });

    // La barra resta agganciata: si continua a navigare anche da fondo pagina.
    await expect(barra).toBeInViewport();
  });
});
