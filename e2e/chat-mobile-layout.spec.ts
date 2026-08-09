import { expect, test } from "@playwright/test";
import { cleanupSeededCampaign, seedCampaignWithMessages } from "./db-helpers";

test.use({ viewport: { width: 390, height: 844 } }); // schermo stretto tipico

// Ottimizzazione mobile richiesta dall'utente: il titolo "Chat" e i tab Messaggi/Amici sono
// ridondanti quando una conversazione è aperta (c'è già "← Conversazioni" dentro il riquadro) e
// su uno schermo stretto rubano spazio verticale prezioso — nascosti solo lì, solo sotto lg:,
// solo quando una thread è selezionata.
test.describe("Chat: layout mobile", () => {
  let campaignId: string;

  test.beforeAll(async () => {
    campaignId = await seedCampaignWithMessages("E2E layout test", 1);
  });

  test.afterAll(async () => {
    await cleanupSeededCampaign(campaignId);
  });

  test("titolo e tab spariscono su mobile quando una conversazione è aperta, tornano alla lista", async ({
    page,
  }) => {
    await page.goto("/chat");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));

    await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Messaggi", exact: true })).toBeVisible();

    await page.getByText("E2E layout test", { exact: true }).click();
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));

    await expect(page.getByRole("heading", { name: "Chat" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Messaggi", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "← Conversazioni" })).toBeVisible();

    await page.getByRole("button", { name: "← Conversazioni" }).click();
    await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Messaggi", exact: true })).toBeVisible();
  });
});
