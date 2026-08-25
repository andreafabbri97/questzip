import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

// Richiesta dell'utente: su telefono il modal dei dadi era più basso del necessario, con 64px di
// margine cieco in cima e un tetto di 85vh (che per giunta conta anche la barra degli indirizzi,
// quindi poteva sforare l'area davvero visibile). Ora il margine è 40px e il tetto 90dvh.
test.describe("Modal dadi: altezza su mobile", () => {
  test("sfrutta più altezza dello schermo senza uscire dall'area visibile", async ({ page }) => {
    await page.goto("/personaggi");
    // Il nome accessibile del bottone comprende l'emoji del dado, quindi niente confronto esatto.
    await page.getByRole("button", { name: /Dadi/ }).first().click();

    const modal = page.locator("body > div.fixed.inset-0.z-40 > div").first();
    await expect(modal).toBeVisible();

    const box = await modal.boundingBox();
    expect(box).not.toBeNull();
    // Prima il tetto effettivo era 844 * 0.85 = 717px: ora deve essere sensibilmente più alto.
    expect(box!.height).toBeGreaterThan(730);
    // ...senza però debordare dallo schermo.
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(845);
  });
});
