import { expect, test } from "@playwright/test";

// Le fonti OCR del compendio conservano gli a-capo di fine colonna del PDF: nel database una frase
// risulta spezzata ogni ~60 caratteri, e whitespace-pre-wrap li mostrava tali e quali. Risultato:
// tratti e azioni dei mostri finivano tutti in un'unica card, con le righe spezzate a metà frase e
// senza riadattarsi alla larghezza dello schermo (il difetto si vedeva soprattutto da telefono).
// lib/testo-riflusso.ts ricuce gli a-capo tipografici e ricostruisce un paragrafo per ogni tratto.
test.describe("Compendio: impaginazione dei testi OCR", () => {
  test("i tratti di un mostro sono paragrafi separati, con il titoletto in evidenza", async ({
    page,
  }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );
    await page.getByRole("button", { name: "Mostri" }).click();

    const search = page.getByPlaceholder("Cerca (in inglese o italiano)…");
    await search.fill("Displacer Beast");
    const row = page.getByText("Displacer Beast", { exact: true }).first();
    await expect(row).toBeVisible();
    await row.click();

    // Il testo ufficiale italiano deve essere quello mostrato.
    await expect(page.getByText("Distorsione", { exact: false }).first()).toBeVisible({
      timeout: 15000,
    });

    // Ogni tratto ha il proprio titoletto in grassetto: se il riflusso non fosse applicato ne
    // esisterebbe uno solo, perché l'intera sezione sarebbe un unico paragrafo.
    const titoletti = page.locator("p > span.font-bold.text-accent-strong");
    expect(await titoletti.count()).toBeGreaterThan(2);

    // Nessun a-capo tipografico deve sopravvivere dentro un paragrafo: la spezzatura del PDF
    // cadeva a metà frase, quindi una riga finiva senza punteggiatura e la successiva iniziava
    // in minuscolo.
    const testo = await page.locator("main").innerText();
    expect(testo).not.toMatch(/[a-zà-ù,]\n[a-zà-ù]/);
  });

  test("la notazione dei dadi non contiene più la 'l' al posto della cifra 1", async ({ page }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );
    await page.getByRole("button", { name: "Mostri" }).click();

    const search = page.getByPlaceholder("Cerca (in inglese o italiano)…");
    await search.fill("Displacer Beast");
    await page.getByText("Displacer Beast", { exact: true }).first().click();

    await expect(page.getByText(/Testo ufficiale/)).toBeVisible({ timeout: 20000 });
    const testo = await page.locator("main").innerText();
    expect(testo).toMatch(/1d6/);
    expect(testo).not.toMatch(/\bld6\b/);
    // "danni perforan ti" era spezzato dall'OCR
    expect(testo).not.toMatch(/perforan ti/);
  });
});
