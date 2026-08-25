import { expect, test } from "@playwright/test";

// Nei manuali su due colonne strette il nome della scheda va spesso a capo, e il parser prendeva
// solo la riga immediatamente sopra lo stat block: la scheda finiva nel Compendio come "MENTE" o
// "DELLE TEMPESTE" — nomi che non esistono, impossibili da abbinare alla controparte inglese e
// quindi senza testo ufficiale. Ricomposti i nomi, quelle voci mostrano il testo dei manuali.
test.describe("Compendio: schede col nome spezzato dal PDF", () => {
  for (const { inglese, italiano } of [
    { inglese: "Duergar Mind Master", italiano: "DUERGAR MAESTRO DELLA MENTE" },
    { inglese: "Storm Giant Quintessent", italiano: "QUINTESSENZA DI GIGANTE DELLE TEMPESTE" },
  ]) {
    test(`"${inglese}" mostra il testo ufficiale italiano`, async ({ page }) => {
      await page.goto("/compendio");
      await page.waitForFunction(
        () => !document.body.innerText.includes("Caricamento contenuti in corso"),
      );
      await page.getByRole("button", { name: "Mostri" }).click();

      const search = page.getByPlaceholder("Cerca (in inglese o italiano)…");
      await search.fill(inglese);
      const riga = page.getByText(inglese, { exact: true }).first();
      await expect(riga).toBeVisible({ timeout: 15000 });
      await riga.click();

      await expect(page.getByText(/Testo ufficiale/)).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(italiano).first()).toBeVisible();

      // I numeri dello stat block non devono più uscire con le cifre separate ("CA 1 4").
      const testo = await page.locator("main").innerText();
      expect(testo).not.toMatch(/\bCA\s+\d\s\d\b/);
    });
  }
});
