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

    // Si misura il TETTO, non l'altezza effettiva: il riquadro si adatta al contenuto, quindi con
    // pochi tiri in cronologia resta più basso del massimo consentito e una soglia sull'altezza
    // reale dipenderebbe da quanti tiri sono stati fatti prima.
    const tetto = await modal.evaluate((el) => parseFloat(getComputedStyle(el).maxHeight));
    // prima era 85vh = 717px su uno schermo da 844: ora 90dvh, cioè circa 760
    expect(tetto).toBeGreaterThan(730);

    const box = await modal.boundingBox();
    expect(box).not.toBeNull();
    // e comunque il riquadro non deborda mai dall'area visibile
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(845);
  });
});
