import { expect, test } from "@playwright/test";

// Gli oggetti magici più iconici del gioco (Lingua di Fiamme, Ammazzadraghi, Armatura Adamantina,
// le armi +1/+2/+3) NON sono in items.json: 5etools li tiene in magicvariants.json perché non sono
// un oggetto singolo ma una variante applicabile a un'intera famiglia di oggetti base. Le voci di
// famiglia del manuale (Anello di Resistenza, Corno del Valhalla) stanno invece in "itemGroup".
// Nessuno dei due veniva caricato: quegli oggetti erano ASSENTI dal Compendio, e le corrispondenti
// voci italiane ufficiali restavano scollegate perché la controparte inglese non esisteva.
test.describe("Compendio: varianti generiche e voci di famiglia", () => {
  for (const { inglese, italiano } of [
    { inglese: "Flame Tongue", italiano: "Lingua di Fiamme" },
    { inglese: "Ring of Resistance", italiano: "Anello di Resistenza" },
  ]) {
    test(`"${inglese}" è nel Compendio e mostra il testo ufficiale italiano`, async ({ page }) => {
      await page.goto("/compendio");
      await page.waitForFunction(
        () => !document.body.innerText.includes("Caricamento contenuti in corso"),
      );
      await page.getByRole("button", { name: "Oggetti magici" }).click();

      const search = page.getByPlaceholder("Cerca (in inglese o italiano)…");
      await search.fill(inglese);
      const riga = page.getByText(inglese, { exact: true }).first();
      await expect(riga).toBeVisible({ timeout: 15000 });
      await riga.click();

      await expect(page.getByText(/Testo ufficiale/)).toBeVisible({ timeout: 20000 });
      await expect(page.getByText(italiano).first()).toBeVisible();
    });
  }
});
