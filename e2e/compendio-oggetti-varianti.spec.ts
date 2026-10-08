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

  // Le voci di una famiglia (i dieci Tatuaggi Assorbenti, gli Anelli di Resistenza, le Pietre
  // Ioun) non hanno un testo proprio: nei dati c'è un rimando `{#itemEntry …}` al testo comune,
  // con accanto il tipo di danno o il colore. Il rimando non veniva sciolto: in inglese si leggeva
  // il rimando alla lettera, in italiano la sua "traduzione" — 101 oggetti senza descrizione.
  test("un oggetto di famiglia mostra il testo comune, con i suoi valori, in entrambe le lingue", async ({
    page,
  }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );
    await page.getByRole("button", { name: "Oggetti magici" }).click();

    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Acid Absorbing Tattoo");
    const riga = page.getByText("Acid Absorbing Tattoo", { exact: true }).first();
    await expect(riga).toBeVisible({ timeout: 15000 });
    await riga.click();

    const scheda = page.locator("div.card-elevated:has(h2.heading-ornate)").first();
    await expect(scheda.getByText("Assorbimento dei Danni")).toBeVisible({ timeout: 20000 });
    // Il valore di QUESTA voce dentro il testo comune: il tipo di danno e il colore.
    await expect(scheda.getByText(/resistenza ai danni da acido/)).toBeVisible();
    await expect(scheda.getByText(/\(verde\)/)).toBeVisible();
    await expect(scheda).not.toContainText("{#itemEntry");
    await expect(scheda).not.toContainText("{{");

    await page.getByTitle("Inglese (originale)").click();
    await expect(scheda.getByText("Damage Absorption")).toBeVisible({ timeout: 20000 });
    await expect(scheda.getByText(/resistance to acid damage/)).toBeVisible();
    await expect(scheda).not.toContainText("{#itemEntry");
    await expect(scheda).not.toContainText("{{");
  });
});
