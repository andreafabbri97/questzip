import { expect, test } from "@playwright/test";

// Regressione: il sottotitolo italiano accanto al nome inglese (DualName, mostrato sia nelle righe
// dell'elenco sia nell'intestazione del dettaglio) usava SOLO la cache di traduzione IA, mai il
// testo ufficiale del manuale — anche quando quest'ultimo era già collegato correttamente. Per
// "Eldritch Blast"/PHB il testo ufficiale (compendio_ita_incantesimo, da Manuale del Giocatore) dice
// "Deflagrazione Occulta", ma il sottotitolo mostrava "Blast Occulto" (cache IA, qualità inferiore).
// Segnalato dall'utente con screenshot il 2026-08-06.
test("il sottotitolo italiano di un incantesimo con testo ufficiale usa il nome del manuale, non la cache IA", async ({
  page,
}) => {
  await page.goto("/compendio");
  const searchInput = page.getByPlaceholder("Cerca (in inglese o italiano)…");
  await page.waitForFunction(
    () => !document.body.innerText.includes("Caricamento contenuti in corso"),
  );

  await searchInput.fill("Eldritch Blast");
  const row = page.getByText("Eldritch Blast", { exact: true }).first();
  await expect(row).toBeVisible();
  await expect(page.getByText("Blast Occulto")).not.toBeVisible();
  // Timeout più largo del default: il sottotitolo dipende da un giro al DB (server action) per
  // l'indice italiano, che a server appena avviato (cache dei loader ancora vuota) può richiedere
  // più dei 5s di default — non un problema di logica, verificato ripetendo la stessa asserzione a
  // cache calda (passa in <4s).
  await expect(page.getByText("Deflagrazione Occulta").first()).toBeVisible({ timeout: 15000 });

  await row.click();
  const heading = page.locator("h2", { hasText: "Eldritch Blast" });
  await expect(heading).toContainText("Deflagrazione Occulta");
  // L'italiano è la lingua predefinita di tutta l'app (non solo del Compendio): il nome italiano
  // deve comparire per primo/in grande, l'inglese come sottotitolo — non il contrario. Prima
  // DualName non teneva conto della lingua selezionata e mostrava sempre l'inglese per primo,
  // anche a lingua italiana selezionata (il default). Segnalato dall'utente su uno screenshot.
  await expect(heading.locator("span").first()).toHaveText("Deflagrazione Occulta");
});
