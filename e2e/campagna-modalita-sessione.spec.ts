import { expect, test } from "@playwright/test";
import { cleanupSeededMember, seedCampaignWithPartyMember } from "./db-helpers";

// Modalità sessione: una scena per volta, a schermo intero. Nata dalla prima volta da master
// dell'utente — materiale scritto bene ma pensato per essere letto PRIMA, mentre durante il gioco
// serve poter guardare invece che ricordare.
test.describe("Campagna: modalità sessione", () => {
  let campaignId: string;
  let compagnoUserId: string;

  test.beforeAll(async () => {
    ({ campaignId, compagnoUserId } = await seedCampaignWithPartyMember("E2E modalita sessione"));
  });

  test.afterAll(async () => {
    await cleanupSeededMember(campaignId, compagnoUserId);
  });

  test("scorre le scene e stacca le battute da leggere dal resto del testo", async ({ page }) => {
    await page.goto(`/campagne?open=${campaignId}`);
    await page.getByText("E2E modalita sessione", { exact: true }).first().click();

    // Due trame, per poter davvero cambiare scena. La seconda ha una battuta fra virgolette basse
    // e nomina un mostro della campagna.
    const trame = page.locator("section").filter({ hasText: "Trame e missioni" }).last();
    for (const [titolo, testo] of [
      ["ATTO 1 — Le porte", "Le guardie contano il gruppo."],
      ["ATTO 2 — La cena", "Ginnie serve la cena. «E tuo fratello?» Nessuno risponde."],
    ]) {
      await trame.getByRole("button", { name: "+ Nuova trama" }).click();
      await trame.getByPlaceholder(/^Titolo/).fill(titolo);
      await trame.getByPlaceholder(/Obiettivo, chi la muove/).fill(testo);
      await trame.getByRole("button", { name: "Crea", exact: true }).click();
      await expect(trame.getByRole("button", { name: new RegExp(titolo) })).toBeVisible();
    }

    await page.getByRole("button", { name: "▶️ Modalità sessione" }).click();
    const sessione = page.getByRole("dialog", { name: "Modalità sessione" });
    await expect(sessione).toBeVisible();
    await expect(sessione.getByText("1 / 2")).toBeVisible();

    await sessione.getByRole("button", { name: "Avanti →" }).click();
    await expect(sessione.getByText("2 / 2")).toBeVisible();

    // La battuta è staccata dal paragrafo: al tavolo si legge senza cercarla dentro il testo.
    await expect(sessione.getByText("Da leggere")).toBeVisible();
    // exact: la stessa battuta resta anche dentro il paragrafo — qui si verifica proprio la
    // copia staccata in cima, che è il punto della funzione.
    await expect(sessione.getByText("«E tuo fratello?»", { exact: true })).toBeVisible();

    // Le frecce servono a cambiare scena senza guardare lo schermo.
    await page.keyboard.press("ArrowLeft");
    await expect(sessione.getByText("1 / 2")).toBeVisible();
  });

  test("riaprendola si torna alla scena in cui si era rimasti", async ({ page }) => {
    await page.goto(`/campagne?open=${campaignId}`);
    await page.getByText("E2E modalita sessione", { exact: true }).first().click();

    await page.getByRole("button", { name: "▶️ Modalità sessione" }).click();
    const sessione = page.getByRole("dialog", { name: "Modalità sessione" });
    await sessione.getByRole("button", { name: "Avanti →" }).click();
    await expect(sessione.getByText("2 / 2")).toBeVisible();
    await sessione.getByRole("button", { name: "Chiudi" }).click();

    await page.getByRole("button", { name: "▶️ Modalità sessione" }).click();
    await expect(page.getByRole("dialog", { name: "Modalità sessione" }).getByText("2 / 2")).toBeVisible();
  });
});
