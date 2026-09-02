import { expect, test } from "@playwright/test";

// Segnalato dall'utente sul Glabrezu: mancavano gli incantesimi innati. Guardando il dato vero si è
// visto che il tipo RawCreature non modellava affatto metà stat block — tiri salvezza, abilità,
// resistenze, immunità, vulnerabilità e incantesimi — quindi la lacuna valeva per TUTTI i mostri.
test.describe("Compendio: lo stat block di un mostro è completo", () => {
  test("il Glabrezu mostra salvezze, resistenze, immunità e incantesimi innati", async ({ page }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );

    await page.getByRole("button", { name: "🐉Mostri" }).click();
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Glabrezu");
    await page.getByText("Glabrezu", { exact: true }).first().click();

    const scheda = page.getByText("Tiri salvezza").first();
    await expect(scheda).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("For +9, Cos +9, Sag +7, Car +7")).toBeVisible();

    // Il gruppo con la nota resta separato dai tipi secchi: "da attacchi non magici" vale solo per
    // contundenti/perforanti/taglienti, non per freddo, fuoco e fulmine.
    await expect(page.getByText(/freddo, fuoco, fulmine;/)).toBeVisible();
    await expect(page.getByText("veleno", { exact: true })).toBeVisible();
    await expect(page.getByText("avvelenato", { exact: true })).toBeVisible();

    // Gli incantesimi innati: il motivo della segnalazione.
    await expect(page.getByText("A volontà:")).toBeVisible();
    await expect(page.getByText(/1\/giorno ciascuno:/)).toBeVisible();
  });

  // Seconda lacuna trovata con lo stesso audit: 31 incantesimi del solo Manuale del Giocatore
  // sono rituali (si lanciano senza consumare uno slot) e la scheda non lo diceva mai.
  test("un incantesimo rituale è segnalato come tale", async ({ page }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );

    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Alarm");
    await page.getByText("Alarm", { exact: true }).first().click();

    await expect(page.getByText("Rituale")).toBeVisible({ timeout: 15000 });
  });
});
