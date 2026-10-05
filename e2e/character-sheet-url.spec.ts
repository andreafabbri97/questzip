import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// Quale scheda era aperta viveva solo in memoria: bastava ricaricare la pagina — il gesto più
// normale del mondo, e al tavolo capita di continuo — per ritrovarsi nell'elenco dei personaggi
// (segnalato dall'utente). Ora sta nell'indirizzo, e questi sono i quattro modi in cui un
// indirizzo viene usato davvero.
test.describe("La scheda aperta resta aperta", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestCharacter(page, { nome: "Scheda Persistente" });
    await page.goto("/personaggi");
    await page.getByText("Scheda Persistente", { exact: true }).first().click();
    await expect(page.getByRole("button", { name: "← Personaggi" })).toBeVisible({ timeout: 20000 });
  });

  test("aprire una scheda la scrive nell'indirizzo", async ({ page }) => {
    await expect(page).toHaveURL(/\/personaggi\?id=e2e00000-0000-4000-8000-000000000001/);
  });

  test("ricaricando la pagina la scheda è ancora aperta", async ({ page }) => {
    await page.reload();

    await expect(page.getByRole("button", { name: "← Personaggi" })).toBeVisible({ timeout: 20000 });
    await expect(page).toHaveURL(/id=e2e00000/);
  });

  test("Indietro riporta all'elenco e Avanti riapre la scheda", async ({ page }) => {
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Personaggi" })).toBeVisible({ timeout: 20000 });
    await expect(page).not.toHaveURL(/id=/);

    await page.goForward();
    await expect(page.getByRole("button", { name: "← Personaggi" })).toBeVisible({ timeout: 20000 });
  });

  test("un indirizzo con l'id apre la scheda anche senza storia alle spalle", async ({ page }) => {
    await page.goto("/personaggi?id=e2e00000-0000-4000-8000-000000000001");

    await expect(page.getByRole("button", { name: "← Personaggi" })).toBeVisible({ timeout: 20000 });
  });

  // Un id che non corrisponde a nessun personaggio (scheda cancellata, link vecchio) non deve
  // lasciare la pagina bianca: si vede l'elenco.
  test("un id inesistente mostra l'elenco invece di una pagina vuota", async ({ page }) => {
    await page.goto("/personaggi?id=e2e00000-0000-4000-8000-000000009999");

    await expect(page.getByRole("heading", { name: "Personaggi" })).toBeVisible({ timeout: 20000 });
  });
});
