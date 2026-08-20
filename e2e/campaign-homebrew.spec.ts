import { expect, test } from "@playwright/test";

// Il Compendio ufficiale dipende interamente dal mirror 5etools: un master non poteva aggiungere
// un proprio mostro/oggetto/incantesimo casalingo — proposto e accettato dall'utente come
// miglioramento. Stesso modello di visibilità di Handout (campaignHandouts.visibile in
// lib/db/schema.ts): una voce nasce nascosta, il master la rivela quando serve — qui verificato
// solo lato master (toggle + filtro), il filtro server-side per i giocatori è identico a quello
// di getHandoutsForCampaign, già in produzione. L'integrazione col tracker di combattimento
// (HomebrewMonsterQuickAdd) è la parte a più alto rischio di regressione silenziosa: un mostro
// homebrew deve poter finire in combattimento con PF/XP corretti tanto quanto uno ufficiale.
test.describe("Campagna: Compendio homebrew", () => {
  test("crea, filtra, rivela una voce homebrew e la usa in combattimento", async ({ page }) => {
    await page.goto("/campagne");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));
    await page.getByPlaceholder("Es. La Maledizione di Strahd").fill("E2E homebrew");
    await page.getByRole("button", { name: /Crea \(diventi il master\)/ }).click();
    await page.waitForSelector("text=Elimina campagna", { timeout: 10000 });

    // Un mostro homebrew nasce nascosto.
    await page.getByRole("button", { name: "+ Nuova voce" }).click();
    await page.getByPlaceholder(/Bestia dell'abisso/).fill("Vermezanna");
    await page.locator("label", { hasText: "PF" }).locator("input").fill("45");
    await page.locator("label", { hasText: "XP" }).locator("input").fill("450");
    await page.getByPlaceholder(/Descrizione, tratti/).fill("Un verme gigante sotto la locanda.");
    await page.getByRole("button", { name: "Crea", exact: true }).click();

    const monsterChip = page.getByRole("button", { name: /Vermezanna/ });
    await expect(monsterChip).toContainText("nascosto", { timeout: 5000 });

    // Un secondo tipo, per verificare che il filtro per categoria isoli correttamente le voci.
    await page.getByRole("button", { name: "+ Nuova voce" }).click();
    const newForm = page.locator("div.border-edge.bg-surface-raised.p-3.space-y-2");
    await newForm.getByRole("button", { name: "💍 Oggetto" }).click();
    await page.getByPlaceholder(/Bestia dell'abisso/).fill("Anello del Corvo");
    await page.getByPlaceholder(/Descrizione, tratti/).fill("Un anello d'argento.");
    await page.getByRole("button", { name: "Crea", exact: true }).click();
    await expect(page.getByRole("button", { name: /Anello del Corvo/ })).toBeVisible({ timeout: 5000 });

    const homebrewSection = page.locator("section", { hasText: "Compendio homebrew" });
    await homebrewSection.getByRole("button", { name: "🐉 Mostro" }).click();
    await expect(homebrewSection.getByRole("button", { name: /Vermezanna/ })).toBeVisible();
    await expect(homebrewSection.getByRole("button", { name: /Anello del Corvo/ })).not.toBeVisible();

    // Rivela il mostro: il "nascosto" scompare dalla label del chip.
    await monsterChip.click();
    await page.getByRole("button", { name: "🙈 Nascosto" }).click();
    await expect(monsterChip).not.toContainText("nascosto", { timeout: 5000 });

    // Aggiungilo in combattimento dal picker homebrew — deve arrivare con PF/XP corretti.
    await page.getByRole("button", { name: "⚔️ Inizia combattimento" }).click();
    await page
      .locator("select", { hasText: "Homebrew della campagna" })
      .selectOption({ label: "Vermezanna (45 PF)" });
    await page.getByRole("button", { name: "Aggiungi", exact: true }).click();
    const combatantRow = page.locator("li", { hasText: "Vermezanna" });
    await expect(combatantRow.getByText("45/45")).toBeVisible({ timeout: 5000 });

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Termina" }).click();
    await expect(page.getByRole("button", { name: "⚔️ Inizia combattimento" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Elimina campagna" }).click();
    await expect(page.getByPlaceholder("Es. La Maledizione di Strahd")).toBeVisible({ timeout: 5000 });
  });
});
