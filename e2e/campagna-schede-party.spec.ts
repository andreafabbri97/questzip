import { expect, test } from "@playwright/test";
import { cleanupSeededMember, seedCampaignWithPartyMember } from "./db-helpers";
import { injectTestCharacter } from "./helpers";

// Prima, dalla pagina Campagna, il party mostrava solo un riassunto (PF, CA, modificatori, slot):
// per vedere altro il giocatore doveva uscire e andare in Personaggi — perdendo di vista
// combattimento, mappa e chat — e il master non aveva proprio modo di vedere la scheda di un
// compagno, perché in Personaggi si vede solo la propria.
test.describe("Campagna: schede del party", () => {
  let campaignId: string;
  let compagnoUserId: string;
  let nomePersonaggio: string;

  test.beforeAll(async () => {
    ({ campaignId, compagnoUserId, nomePersonaggio } = await seedCampaignWithPartyMember(
      "E2E schede party",
    ));
  });

  test.afterAll(async () => {
    await cleanupSeededMember(campaignId, compagnoUserId);
  });

  test("il master apre la scheda di un compagno con competenze, armi e incantesimi", async ({
    page,
  }) => {
    await page.goto(`/campagne?open=${campaignId}`);
    await page.getByText("E2E schede party", { exact: true }).first().click();
    await expect(page.getByText(nomePersonaggio).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "📋 Scheda" }).first().click();
    const scheda = page.getByRole("dialog", { name: `Scheda di ${nomePersonaggio}` });
    await expect(scheda).toBeVisible();

    // Percezione passiva: SAG 16 (+3) + competenza a livello 5 (+3) => 10 + 6 = 16. È il numero
    // che il master usa di continuo, e prima non era ricavabile perché le competenze non
    // arrivavano affatto al server.
    await expect(scheda.getByText("Percezione passiva")).toBeVisible();
    await expect(scheda.getByText("16", { exact: true }).first()).toBeVisible();

    // Tiri salvezza, armi e incantesimi: tutta roba che prima non usciva dalla scheda locale.
    await expect(scheda.getByText("Tiri salvezza")).toBeVisible();
    await expect(scheda.getByText("Arco lungo")).toBeVisible();
    await expect(scheda.getByText(/Marchio del Cacciatore/)).toBeVisible();
    await expect(scheda.getByText("Avvelenato")).toBeVisible();
    await expect(scheda.getByText(/Cerca la sorella scomparsa/)).toBeVisible();
  });

  test("il giocatore apre la PROPRIA scheda senza uscire dalla campagna", async ({ page }) => {
    // Il personaggio vive in localStorage: senza, il pulsante non avrebbe nulla da aprire.
    await injectTestCharacter(page);
    await page.goto(`/campagne?open=${campaignId}`);
    await page.getByText("E2E schede party", { exact: true }).first().click();
    await expect(page.getByText(nomePersonaggio).first()).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "✏️ La mia scheda" }).first().click();
    await expect(page.getByText("La tua scheda · aperta dalla campagna")).toBeVisible();
    await expect(page).toHaveURL(/\/campagne/); // NON è finito su /personaggi

    await page.getByRole("button", { name: "← Torna alla campagna" }).click();
    await expect(page.getByText(nomePersonaggio).first()).toBeVisible();
  });
});
