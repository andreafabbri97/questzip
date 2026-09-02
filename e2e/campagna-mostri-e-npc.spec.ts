import { expect, test } from "@playwright/test";
import { cleanupSeededMember, seedCampaignWithPartyMember } from "./db-helpers";
import { injectTestCharacter } from "./helpers";

// Gestione di mostri e NPC dalla pagina Campagna. Prima un mostro homebrew andava scritto da zero
// ricopiando i numeri dal Compendio, e di un NPC importato da Personaggi restava solo il riquadro
// dei numeri: armi e incantesimi bisognava andarseli a rileggere sulla scheda, in un'altra pagina.
test.describe("Campagna: mostri dal Compendio e schede NPC", () => {
  let campaignId: string;
  let compagnoUserId: string;

  test.beforeAll(async () => {
    ({ campaignId, compagnoUserId } = await seedCampaignWithPartyMember("E2E mostri e npc"));
  });

  test.afterAll(async () => {
    await cleanupSeededMember(campaignId, compagnoUserId);
  });

  test("importa un mostro dal Compendio nel form homebrew, precompilato e modificabile", async ({
    page,
  }) => {
    await page.goto(`/campagne?open=${campaignId}`);
    await page.getByText("E2E mostri e npc", { exact: true }).first().click();

    await page.getByRole("button", { name: "+ Nuova voce" }).first().click();
    const cerca = page.getByLabel("Importa un mostro dal Compendio");
    await expect(cerca).toBeVisible({ timeout: 15000 });

    await cerca.fill("Glabrezu");
    await page.getByRole("button", { name: /Glabrezu/ }).first().click();

    // Nome, numeri e descrizione arrivano compilati: il master rivede e poi conferma. Niente è
    // stato salvato — è un modulo precompilato, non una voce già creata.
    await expect(page.getByPlaceholder(/Nome \(es\./)).toHaveValue("Glabrezu");
    const descrizione = page.getByPlaceholder("Descrizione, tratti, effetti…");
    await expect(descrizione).toContainText(/CA 17/);
    await expect(descrizione).toContainText(/Sfida 9/);
    await expect(descrizione).toContainText(/AZIONI/);
  });

  test("di un NPC importato da Personaggi si apre la scheda intera, senza uscire dalla campagna", async ({
    page,
  }) => {
    await injectTestCharacter(page, { nome: "Test NPC Scheda" });

    await page.goto(`/campagne?open=${campaignId}`);
    await page.getByText("E2E mostri e npc", { exact: true }).first().click();

    await page.getByRole("button", { name: "Importa da Personaggi" }).click();
    // Il menu elenca i personaggi in localStorage: qui ce n'è uno solo, quello appena iniettato.
    const rubrica = page.locator("section").filter({ hasText: "Rubrica NPC" }).last();
    await rubrica.getByRole("combobox").first().selectOption({ index: 1 });
    await page.getByRole("button", { name: "Importa", exact: true }).click();

    // La rubrica mostra la card di UN solo NPC per volta: prima si seleziona il suo nome.
    await rubrica.getByRole("button", { name: "Test NPC Scheda", exact: true }).last().click();
    // Anche il Party ha un bottone "Scheda", e sta più in alto nella pagina: qui serve
    // quello della rubrica NPC.
    await rubrica.getByRole("button", { name: "📋 Scheda" }).first().click();
    const scheda = page.getByRole("dialog", { name: /Scheda di Test NPC Scheda/ });
    await expect(scheda).toBeVisible({ timeout: 10000 });
    // Roba che il riassunto della rubrica non mostra e che al tavolo serve.
    await expect(scheda.getByText("Tiri salvezza")).toBeVisible();
    await expect(page).toHaveURL(/\/campagne/); // non è finito in Personaggi
  });
});
