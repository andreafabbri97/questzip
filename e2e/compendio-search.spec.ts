import { expect, test } from "@playwright/test";

// Regressione: la ricerca italiana nel Compendio si affidava a un indice (useItalianSearchIndex)
// agganciato per errore al toggle "lingua risultati" invece che sempre attivo — con la lingua di
// lettura sul default inglese, l'indice restava vuoto e la ricerca ripiegava sulla sola traduzione
// al volo della query, inaffidabile per frasi parziali: "palla di" (parte di "Palla di Fuoco", nome
// ufficiale di Fireball) non trovava nulla, pur trovando sia "palla" da solo sia la frase completa
// "palla di fuoco". Segnalato dall'utente con screenshot il 2026-08-06.
test("cercare 'palla di fuoco' in italiano trova Fireball anche digitando la frase a metà", async ({
  page,
}) => {
  await page.goto("/compendio");
  const searchInput = page.getByPlaceholder("Cerca (in inglese o italiano)…");
  await expect(searchInput).toBeVisible();
  await page.waitForFunction(
    () => !document.body.innerText.includes("Caricamento contenuti in corso"),
  );

  for (const query of ["palla", "palla di", "palla di fuoc", "palla di fuoco"]) {
    await searchInput.fill(query);
    await expect(page.getByText("Nessun risultato.")).not.toBeVisible();
    await expect(page.getByText("Fireball").first()).toBeVisible();
  }
});
