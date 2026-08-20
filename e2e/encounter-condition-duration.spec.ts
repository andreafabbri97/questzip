import { expect, test } from "@playwright/test";

// Prima le condizioni durante un combattimento erano solo un elenco di nomi, senza durata: un
// master perdeva facilmente il conto di quando scadeva un effetto a tempo (es. "Bless per 10
// round") — proposto e accettato dall'utente come miglioramento. scadeAlRound è un round
// ASSOLUTO calcolato una volta sola all'aggiunta (vedi combat-tracker.tsx), quindi il conto alla
// rovescia scende semplicemente confrontandolo col round corrente ad ogni "Prossimo turno",
// senza bisogno di alcuna scrittura extra sul server a ogni turno.
test.describe("Campagna: durata delle condizioni in combattimento", () => {
  test("una condizione con durata scende di round in round e si segnala come scaduta", async ({ page }) => {
    await page.goto("/campagne");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));
    await page.getByPlaceholder("Es. La Maledizione di Strahd").fill("E2E durata condizioni");
    await page.getByRole("button", { name: /Crea \(diventi il master\)/ }).click();
    await page.waitForSelector("text=Elimina campagna", { timeout: 10000 });

    await page.getByRole("button", { name: "⚔️ Inizia combattimento" }).click();
    await page.getByPlaceholder("Nome combattente").fill("Goblin");
    await page.locator("label", { hasText: "PF" }).locator("input").fill("7");
    await page.getByRole("button", { name: "Aggiungi", exact: true }).click();

    const combatantRow = page.locator("li", { hasText: "Goblin" });
    await expect(combatantRow).toBeVisible({ timeout: 5000 });

    // Una condizione senza durata resta indeterminata (comportamento di prima, invariato).
    await combatantRow.getByRole("button", { name: "+ Condizione" }).click();
    await page.getByPlaceholder("Nome (es. Bless)").fill("Prone");
    await combatantRow.getByRole("button", { name: "✓" }).click();
    await expect(combatantRow.getByText(/^Prone/)).toBeVisible({ timeout: 5000 });

    // Una condizione con durata 2 round mostra il conto alla rovescia e poi "scaduta".
    await combatantRow.getByRole("button", { name: "+ Condizione" }).click();
    await page.getByPlaceholder("Nome (es. Bless)").fill("Bless");
    await page.locator('input[aria-label="Durata in round (0 = indeterminata)"]').fill("2");
    await combatantRow.getByRole("button", { name: "✓" }).click();
    await expect(combatantRow.getByText("· 2 round")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Prossimo turno →" }).click();
    await expect(combatantRow.getByText("· 1 round")).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Prossimo turno →" }).click();
    await expect(combatantRow.getByText("· scaduta")).toBeVisible({ timeout: 5000 });

    // La condizione indeterminata non è mai toccata dal passaggio dei round.
    await expect(combatantRow.getByText(/^Prone/)).toBeVisible();

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Termina" }).click();
    await expect(page.getByRole("button", { name: "⚔️ Inizia combattimento" })).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Elimina campagna" }).click();
    await expect(page.getByPlaceholder("Es. La Maledizione di Strahd")).toBeVisible({ timeout: 5000 });
  });
});
