import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// Prima la card Party in campagna mostrava solo caratteristiche/PF/CA/slot: talenti, infusioni
// dell'Artefice e scelte di classe (es. suppliche occulte di un Warlock) prese in scheda non
// arrivavano mai al master — segnalato dall'utente durante un audit generale del Compendio.
// "Porta in campagna" vive nella tab Info & Personalità della scheda, non in quella di apertura
// (Combattimento): un test scritto senza cambiare tab non troverebbe mai il pulsante.
test.describe("Campagna: sync talenti/infusioni/scelte di classe nel Party", () => {
  test("sincronizza un personaggio e la card Party mostra la build completa", async ({ page }) => {
    await injectTestCharacter(page, {
      nome: "Test Party Sync",
      classi: [{ nome: "Warlock", livello: 5 }],
      razza: "Tiefling",
      talenti: [{ id: "t1", nome: "Allerta" }],
      infusioniConosciute: [{ id: "i1", nome: "Enhanced Defense" }],
      scelteClasse: [{ id: "c1", nome: "Agonizing Blast" }],
    });

    await page.goto("/campagne");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));
    await page.getByPlaceholder("Es. La Maledizione di Strahd").fill("E2E party sync");
    await page.getByRole("button", { name: /Crea \(diventi il master\)/ }).click();
    await page.waitForSelector("text=Elimina campagna", { timeout: 10000 });

    await page.goto("/personaggi");
    await page.getByRole("button", { name: /Test Party Sync/ }).click();
    await page.getByRole("button", { name: /Info & Personalità/ }).click();

    const syncSection = page.locator("section", { hasText: "Porta in campagna" });
    await expect(syncSection).toBeVisible({ timeout: 5000 });
    await syncSection.locator("select").selectOption({ label: "E2E party sync" });
    await syncSection.getByRole("button", { name: "Sincronizza" }).click();
    await expect(page.getByText(/Inviato alle/)).toBeVisible({ timeout: 5000 });

    await page.goto("/campagne");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));
    await page.getByText("E2E party sync", { exact: true }).click();
    await page.waitForSelector("text=Elimina campagna", { timeout: 10000 });

    await expect(page.getByText("Talenti: Allerta")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Infusioni: Enhanced Defense")).toBeVisible();
    await expect(page.getByText("Scelte di classe: Agonizing Blast")).toBeVisible();

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Elimina campagna" }).click();
    await expect(page.getByPlaceholder("Es. La Maledizione di Strahd")).toBeVisible({ timeout: 5000 });
  });
});
