import { expect, test } from "@playwright/test";

// Richiesta esplicita dell'utente il 2026-08-06: gli oggetti NON magici (armi, armature,
// attrezzatura comune) non avevano mai una voce di menu propria nel Compendio — la tab "Oggetti
// magici" è intenzionalmente solo-magici, per design. Aggiunta una seconda tab "Oggetti comuni"
// che condivide lo stesso CompendiumKind "oggetti" (stessa ricerca/traduzione/Verifica di tutto
// il resto del sito, già unificate in giri precedenti) con loadInventoryItems come dati, filtrata
// per rarità "none" invece che "diversa da none".
test.describe("Compendio: tab Oggetti comuni", () => {
  test("mostra armi/attrezzatura mundane, cercabili e senza artefatti di rarità/tipo", async ({
    page,
  }) => {
    await page.goto("/compendio");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento contenuti in corso"));

    await page.getByRole("button", { name: /Oggetti comuni/ }).click();
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("alabarda");

    await expect(page.getByText("Halberd", { exact: true }).first()).toBeVisible({ timeout: 10000 });
    // Bug scoperto durante l'implementazione: il Player's Handbook 2024 (XPHB) codifica il tipo
    // oggetto come "M|XPHB" invece del semplice "M" del 2014 — senza staccare il suffisso, quel
    // codice composito veniva mostrato letteralmente al posto di "Arma Da Mischia".
    await expect(page.getByText("M|XPHB")).not.toBeVisible();
    await expect(page.getByText("Arma Da Mischia").first()).toBeVisible();
    // rarity "none" (valore reale per gli oggetti mundani) non deve mai apparire come testo "None".
    await expect(page.getByText("None", { exact: true })).not.toBeVisible();
  });

  test("la tab Oggetti magici resta solo-magici (nessuna arma mundana)", async ({ page }) => {
    await page.goto("/compendio");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento contenuti in corso"));

    await page.getByRole("button", { name: /Oggetti magici/ }).click();
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Halberd");
    await expect(page.getByText("Nessun risultato.")).toBeVisible({ timeout: 10000 });
  });
});
