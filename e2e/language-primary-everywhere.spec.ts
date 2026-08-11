import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// Regressione: l'italiano è la lingua predefinita di TUTTA l'app (non solo del Compendio), ma
// diversi punti della scheda personaggio mostravano ancora l'inglese per primo o da solo:
// (1) il suggerimento dell'Autocomplete razza ("Reborn (Rinato)" invece di "Rinato (Reborn)"),
// (2) l'intestazione della sezione sottoclasse presa alla lettera dal campo 5etools
//     `subclassTitle` ("Primal Path" invece di "Cammino Primordiale"),
// (3) le opzioni del <select> di sottoclasse, che mostravano SOLO il nome inglese
//     ("The Archfey"), mai una parola in italiano.
// Segnalato dall'utente con screenshot il 09/08/2026.
test.describe("Italiano come lingua primaria nella scheda personaggio", () => {
  test("razza: l'autocompletamento mostra il nome italiano per primo", async ({ page }) => {
    await injectTestCharacter(page, { razza: "" });
    await page.getByRole("button", { name: /Test E2E/ }).click();
    await page.getByRole("button", { name: /Info & Personalità/ }).click();

    const razzaInput = page.getByLabel("Razza", { exact: false }).or(page.locator('input[placeholder*="azza" i]')).first();
    await razzaInput.fill("reb");
    await expect(page.getByText("Rinato (Reborn)", { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Reborn (Rinato)", { exact: false })).not.toBeVisible();
  });

  test("sottoclasse: intestazione tradotta e opzioni con nome italiano", async ({ page }) => {
    await injectTestCharacter(page, {
      classi: [{ nome: "Barbarian", livello: 3 }],
      razza: "Umano",
    });
    await page.getByRole("button", { name: /Test E2E/ }).click();
    await page.getByRole("button", { name: /Info & Personalità/ }).click();

    await expect(page.getByText("Cammino Primordiale", { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("PRIMAL PATH", { exact: true })).not.toBeVisible();

    // Le opzioni del <select> dipendono da un secondo giro di fetch dell'indice italiano
    // (useItalianSearchIndex, un'istanza a sé rispetto a quella del titolo sezione sopra) — poll
    // invece di un timeout fisso, così il test non è fragile a quanto impiega quel giro di rete.
    await expect
      .poll(
        async () =>
          page
            .locator("select")
            .evaluateAll((selects) =>
              selects.flatMap((s) => Array.from(s.options).map((o) => o.textContent)),
            )
            .then((options) => options.find((o) => o?.includes("Berserker")) ?? null),
        { timeout: 10000 },
      )
      .toBe("Cammino del Berserker (Path of the Berserker)");
  });
});
