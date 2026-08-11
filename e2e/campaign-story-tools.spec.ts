import { expect, test } from "@playwright/test";

// Tre strumenti nuovi per il master, richiesti esplicitamente dall'utente: "la campagna per il
// master vorrei che fosse migliorata, in particolare nella scrittura della storia e nella
// preparazione delle sessioni (momenti off session)" — prima esisteva solo un campo descrizione
// e il Diario delle sessioni (retroattivo, "cosa è già successo"). Rubrica NPC e Trame coprono la
// scrittura della storia, la Preparazione prossima sessione copre la parte "off session". Tutti e
// tre SOLO per il master, mai mostrati ai giocatori (vedi commento sullo schema in
// lib/db/schema.ts) — qui il test gira con l'unico account di prova, che è sempre master delle
// campagne che crea, quindi non copre esplicitamente "un giocatore non li vede affatto": quella
// garanzia viene dalle server action stesse (requireDm lancia un errore per chiunque non sia
// master, verificato leggendo il codice — non serve un secondo account solo per questo).
test.describe("Campagna: strumenti master (NPC, trame, preparazione sessione)", () => {
  test("crea/modifica/elimina un NPC, una trama e una voce di preparazione", async ({ page }) => {
    await page.goto("/campagne");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));

    await page.getByPlaceholder("Es. La Maledizione di Strahd").fill("E2E strumenti master");
    await page.getByRole("button", { name: /Crea \(diventi il master\)/ }).click();
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));
    await page.getByText("E2E strumenti master", { exact: true }).click();
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));

    // --- Rubrica NPC ---
    await page.getByRole("button", { name: "+ Nuovo NPC" }).click();
    await page.getByPlaceholder(/Sindaco Alric/).fill("Grondar il Fabbro");
    await page.getByPlaceholder(/Locanda del Cervo/).fill("Fucina del villaggio");
    await page.getByPlaceholder(/Aspetto, personalità/).fill("Nano burbero ma leale.");
    await page.getByRole("button", { name: "Crea", exact: true }).first().click();

    const npcChip = page.getByRole("button", { name: "Grondar il Fabbro" });
    await expect(npcChip).toBeVisible({ timeout: 5000 });
    await npcChip.click();
    await expect(page.getByText("Fucina del villaggio")).toBeVisible();

    // Cambio stato senza entrare in modalità modifica.
    await page.getByRole("button", { name: "Morto", exact: true }).click();
    await expect(page.getByRole("button", { name: "Grondar il Fabbro · Morto" })).toBeVisible();

    // --- Trame e missioni ---
    await page.getByRole("button", { name: "+ Nuova trama" }).click();
    await page.getByPlaceholder(/Il culto sotto/).fill("Il debito di Grondar");
    await page.getByPlaceholder(/Obiettivo, chi la muove/).fill("Scoprire chi ha ucciso il fabbro.");
    await page.getByRole("button", { name: "Crea", exact: true }).first().click();

    const questChip = page.getByRole("button", { name: /Il debito di Grondar/ });
    await expect(questChip).toBeVisible({ timeout: 5000 });
    await questChip.click();
    await page.getByRole("button", { name: "Completata", exact: true }).click();
    await expect(page.getByRole("button", { name: /Il debito di Grondar · Completata/ })).toBeVisible();

    // --- Preparazione prossima sessione ---
    await page.getByPlaceholder(/Preparare l'incontro/).fill("Preparare l'agguato dei banditi al ponte");
    await page.getByRole("button", { name: "+ Aggiungi" }).click();
    const prepRow = page.getByText("Preparare l'agguato dei banditi al ponte");
    await expect(prepRow).toBeVisible({ timeout: 5000 });

    const checkbox = page.locator("li", { has: prepRow }).locator('input[type="checkbox"]');
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect(prepRow).toHaveClass(/line-through/);

    // Pulizia: elimina la campagna di prova. Aspetta che la cancellazione (server action
    // asincrona) sia davvero finita, non solo che il click sia partito — altrimenti il browser
    // si chiude a fine test prima che la richiesta arrivi al server, lasciando la campagna
    // orfana (trovato: due copie residue della stessa campagna dopo due run).
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Elimina campagna" }).click();
    await expect(page.getByPlaceholder("Es. La Maledizione di Strahd")).toBeVisible({ timeout: 5000 });
  });
});
