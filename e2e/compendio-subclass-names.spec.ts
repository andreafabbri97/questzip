import { expect, test } from "@playwright/test";

// Regressione: le sottoclassi non hanno mai avuto un'estrazione dal PDF reale come il resto del
// Compendio (solo traduzione IA, mai verificata) — trovati e corretti (leggendo i manuali veri)
// diversi nomi sbagliati in più manuali. Le sottoclassi non sono voci di primo livello cercabili
// nel Compendio: si aprono dentro il dettaglio della classe base, come elenco di archetipi/domini
// espandibili (es. sezione "MARTIAL ARCHETYPE" del Guerriero), col nome italiano mostrato inline
// tra parentesi ("Eldritch Knight (Cavaliere Mistico)") — è lì che si verifica. Se la pipeline IA
// (ai-translate-compendio.mjs) venisse rilanciata e sovrascrivesse questi nomi per errore, questo
// test lo segnala. Segnalato dall'utente il 2026-08-06/07.
test("le sottoclassi corrette leggendo i PDF mostrano il nome ufficiale, non quello IA sbagliato", async ({
  page,
}) => {
  await page.goto("/compendio");
  await page.getByRole("button", { name: /Classi/ }).click();
  await page.waitForFunction(
    () => !document.body.innerText.includes("Caricamento contenuti in corso"),
  );
  const searchInput = page.getByPlaceholder("Cerca (in inglese o italiano)…");

  const cases: [className: string, correctText: string, wrongText: string][] = [
    ["Fighter", "Eldritch Knight (Cavaliere Mistico)", "Eldritch Knight (Cavaliere Occulto)"],
    ["Fighter", "Rune Knight (Cavaliere Runico)", "Rune Knight (Cavaliere delle Rune)"],
    ["Sorcerer", "Draconic Bloodline (Discendenza Draconica)", "Draconic Bloodline (Stirpe Draconica)"],
  ];

  for (const [className, correctText, wrongText] of cases) {
    await searchInput.fill(className);
    await page.getByText(className, { exact: true }).first().click();
    await expect(page.getByText(correctText, { exact: false })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(wrongText, { exact: false })).not.toBeVisible();
  }
});
