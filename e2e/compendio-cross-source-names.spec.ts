import { expect, test } from "@playwright/test";

// Regressione: molte voci del Player's Handbook 2024 (XPHB) sono ristampe di una voce PHB 2014
// con lo STESSO nome inglese, ma senza testo ufficiale italiano proprio ancora estratto — il
// Compendio mostrava per queste il nome indovinato dalla cache IA/traduzione dal vivo, spesso
// diverso da quello ufficiale della fonte "gemella" (es. "Wrathful Smite": ufficiale PHB
// "Punizione Collerica" contro IA/live XPHB "Punizione Irata", stesso incantesimo). Segnalato
// dall'utente con screenshot il 2026-08-06. Corretto in useItalianSearchIndex/bestItalianName
// (lib/fivetools/compendio-detail.tsx): un nome ufficiale di QUALSIASI fonte ora vince sempre
// sulla cache IA, non solo quello della fonte esatta.
test("una voce XPHB senza testo ufficiale proprio mostra comunque il nome ufficiale della fonte gemella PHB", async ({
  page,
}) => {
  await page.goto("/compendio");
  await page.waitForFunction(() => !document.body.innerText.includes("Caricamento contenuti in corso"));
  await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Wrathful Smite");

  const rows = page.getByText("Wrathful Smite", { exact: true });
  await expect(rows).toHaveCount(2, { timeout: 10000 }); // PHB + XPHB

  // Entrambe le righe (PHB con testo ufficiale collegato, XPHB senza) mostrano lo stesso nome
  // italiano ufficiale — mai "Punizione Irata" (la resa IA/live vista prima della correzione).
  await expect(page.getByText("Punizione Collerica").first()).toBeVisible();
  await expect(page.getByText("Punizione Irata")).not.toBeVisible();

  // Il testo ufficiale (PHB) e le statistiche specifiche della fonte esatta restano distinti: la
  // versione XPHB ha davvero meccaniche diverse (scuola Necromanzia invece di Invocazione, niente
  // concentrazione) — il nome condiviso non deve far confondere le due schede.
  await page.getByText("XPHB").last().click();
  await expect(page.getByText("Necromanzia", { exact: true })).toBeVisible();
});
