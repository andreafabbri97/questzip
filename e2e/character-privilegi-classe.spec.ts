import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// La scheda di un personaggio di livello alto elenca una ventina di privilegi tutti uguali, e la
// domanda al tavolo è sempre la stessa: che cosa ho, e da dove viene.
test.describe("Scheda: privilegi di classe", () => {
  test("raggruppa per livello e dice se un privilegio viene dalla sottoclasse", async ({ page }) => {
    await injectTestCharacter(page, {
      nome: "Test Privilegi",
      classi: [{ nome: "Ladro", livello: 5, sottoclasse: "Soulknife" }],
    });

    await page.goto("/personaggi");
    await page.getByText("Test Privilegi", { exact: true }).first().click();
    await page.getByRole("button", { name: /Tratti & Talenti/ }).click();

    const sezione = page.locator("section").filter({ hasText: "Privilegi di classe" });
    await expect(sezione.getByText("Livello 1").first()).toBeVisible({ timeout: 20000 });
    await expect(sezione.getByText("Livello 3").first()).toBeVisible();

    // L'origine di ogni riga: in multiclasse con sottoclasse cambia dove andare a cercare.
    await expect(sezione.getByText("sottoclasse").first()).toBeVisible();
    await expect(sezione.getByText("classe", { exact: true }).first()).toBeVisible();

    // Nessun privilegio oltre il livello raggiunto.
    await expect(sezione.getByText("Livello 9")).toHaveCount(0);
  });

  // La colonna "Attacco furtivo" della tabella del Ladro mostrava un trattino a ogni livello:
  // quelle celle contengono un tiro (1d6, 2d6…) e non un numero, e il formattatore non lo sapeva.
  test("la tabella del Ladro nel Compendio mostra i dadi dell'Attacco furtivo", async ({ page }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );

    await page.getByRole("button", { name: "⚔️Classi" }).click();
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Rogue");
    await page.getByText("Rogue", { exact: true }).first().click();

    const tabella = page.locator("table").filter({ hasText: "Attacco furtivo" }).first();
    await expect(tabella).toBeVisible({ timeout: 20000 });
    await expect(tabella).toContainText("1d6");
    await expect(tabella).toContainText("3d6");
  });

  // "Lame dell'Anima" (9° livello) introduce due poteri con i due punti e poi li elenca come
  // riferimenti ad altri privilegi: il testo si fermava lì e i poteri non comparivano.
  test("un privilegio che rimanda ad altri li nomina invece di lasciare la frase a metà", async ({
    page,
  }) => {
    await injectTestCharacter(page, {
      nome: "Test Lame",
      classi: [{ nome: "Ladro", livello: 9, sottoclasse: "Soulknife" }],
    });

    await page.goto("/personaggi");
    await page.getByText("Test Lame", { exact: true }).first().click();
    await page.getByRole("button", { name: /Tratti & Talenti/ }).click();

    const sezione = page.locator("section").filter({ hasText: "Privilegi di classe" });
    await sezione.getByRole("button", { name: /Soul Blades|Lame dell/ }).first().click();

    const modal = page.getByRole("dialog").first();
    await expect(modal).toBeVisible({ timeout: 20000 });
    await expect(modal.getByText(/Homing Strikes|Colpi/i).first()).toBeVisible();
    await expect(modal.getByText(/Psychic Teleportation|Teletrasporto/i).first()).toBeVisible();
  });
});
