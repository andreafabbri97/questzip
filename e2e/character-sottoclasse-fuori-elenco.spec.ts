import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// Il menu della sottoclasse elenca i nomi del Compendio, che sono in inglese. Una sottoclasse
// scritta a mano in italiano — o importata da un PDF, o arrivata da un'altra scheda — non
// combaciava con nessuna opzione e il menu ricadeva su "— nessuna —": la sottoclasse sembrava
// persa pur essendo salvata, e sarebbe bastato toccare il menu per perderla davvero.
test.describe("Scheda personaggio: sottoclasse fuori dal Compendio", () => {
  test("il menu mostra la sottoclasse anche se il Compendio non la conosce", async ({ page }) => {
    await injectTestCharacter(page, {
      nome: "Test Sottoclasse",
      classi: [{ nome: "Ladro", livello: 8, sottoclasse: "Assassino" }],
    });

    await page.goto("/personaggi");
    await page.getByText("Test Sottoclasse", { exact: true }).first().click();
    await page.getByRole("button", { name: /Info & Personalità/ }).click();

    // Il menu esiste solo dopo che le sottoclassi della classe sono state caricate.
    const menu = page.getByLabel(/Archetipo|Sottoclasse/i).first();
    await expect(menu).toBeVisible({ timeout: 15000 });
    await expect(menu).toHaveValue("Assassino");
  });

  test("una sottoclasse del Compendio resta selezionata normalmente", async ({ page }) => {
    await injectTestCharacter(page, {
      nome: "Test Sottoclasse EN",
      classi: [{ nome: "Ladro", livello: 8, sottoclasse: "Assassin" }],
    });

    await page.goto("/personaggi");
    await page.getByText("Test Sottoclasse EN", { exact: true }).first().click();
    await page.getByRole("button", { name: /Info & Personalità/ }).click();

    const menu = page.getByLabel(/Archetipo|Sottoclasse/i).first();
    await expect(menu).toBeVisible({ timeout: 15000 });
    await expect(menu).toHaveValue("Assassin");
  });
});
