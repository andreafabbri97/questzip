import { expect, test } from "@playwright/test";

// Richiesta esplicita dell'utente il 2026-08-06: il Compendio si apriva in inglese di default
// (bisognava premere il toggle 🇮🇹 ogni volta) — cambiato il default a italiano.
test("il Compendio mostra i risultati in italiano senza dover toccare il toggle lingua", async ({
  page,
}) => {
  await page.goto("/compendio");
  await page.waitForFunction(() => !document.body.innerText.includes("Caricamento contenuti in corso"));

  await page.getByText("Acid Splash", { exact: true }).first().click();
  await expect(page.getByText("Fiotto Acido", { exact: false }).first()).toBeVisible({ timeout: 10000 });
});
