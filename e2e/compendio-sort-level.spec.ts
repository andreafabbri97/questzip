import { expect, test } from "@playwright/test";

// Richiesta esplicita dell'utente il 2026-08-06: l'ordinamento degli incantesimi aveva solo
// "Nome"/"Manuale", mancava "Livello" (utile per sfogliare, es. tutti i trucchetti insieme).
test("ordinare gli incantesimi per livello mostra prima i trucchetti, poi il 1° livello ecc.", async ({
  page,
}) => {
  await page.goto("/compendio");
  await page.waitForFunction(() => !document.body.innerText.includes("Caricamento contenuti in corso"));

  await page.getByRole("button", { name: "Livello" }).click();

  // Le prime righe visibili nell'elenco devono essere tutte trucchetti (livello 0) — con
  // l'ordinamento per nome invece sarebbero mischiate a caso in base alla lettera iniziale.
  const firstBadges = await page.locator("main >> text=/· (trucchetto|liv\\. \\d+)/").allInnerTexts();
  expect(firstBadges.length).toBeGreaterThan(5);
  for (const badge of firstBadges.slice(0, 5)) {
    expect(badge.toLowerCase()).toContain("trucchetto");
  }
});
