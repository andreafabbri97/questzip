import { expect, test } from "@playwright/test";

// Le voci qui sotto erano nei manuali italiani ma non nel Compendio, ciascuna per un motivo
// diverso: il sottotitolo storpiato dall'OCR (Allarme, Sembrare), il sottotitolo spezzato a fine
// colonna (Sciame di Palle di Neve di Snilloc e altri 54 della Guida di Xanathar), una
// caratteristica finita in un'altra colonna del PDF che faceva scartare l'intera scheda del mostro
// (Aboleth e altri 305), un capitolo che il parser dei talenti non sapeva isolare (Cuoco, e i
// talenti di Xanathar e Dragonlance). Il test verifica che ora il Compendio mostri per ognuna il
// nome del manuale — non la traduzione automatica, che darebbe un nome diverso.

const VOCI = [
  { tab: "Incantesimi", inglese: "Alarm", italiano: "Allarme" },
  { tab: "Incantesimi", inglese: "Seeming", italiano: "Sembrare" },
  { tab: "Incantesimi", inglese: "Steel Wind Strike", italiano: "Colpo del Vento d'Acciaio" },
  { tab: "Mostri", inglese: "Aboleth", italiano: "Aboleth" },
  { tab: "Talenti", inglese: "Chef", italiano: "Cuoco" },
  { tab: "Talenti", inglese: "Dungeon Delver", italiano: "Esperto di Dungeon" },
  // oggetti letti a mano dalle pagine del Manuale del DM (il PDF ha il font offuscato)
  { tab: "Oggetti magici", inglese: "Wand of Orcus", italiano: "Bacchetta di Orcus" },
  { tab: "Oggetti magici", inglese: "Portable Hole", italiano: "Buco Portatile" },
  // equipaggiamento comune del capitolo 5: prima non aveva testo italiano per nessuna delle 259 voci
  { tab: "Oggetti comuni", inglese: "Handaxe", italiano: "Ascia" },
  { tab: "Oggetti comuni", inglese: "Plate Armor", italiano: "Armatura Completa" },
];

for (const voce of VOCI) {
  test(`"${voce.inglese}" mostra il testo ufficiale italiano (${voce.italiano})`, async ({ page }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );

    // la ricerca lavora dentro la categoria aperta: senza cambiare scheda si cercherebbe un
    // mostro fra gli incantesimi
    if (voce.tab !== "Incantesimi") {
      await page.getByRole("button", { name: voce.tab }).click();
    }
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill(voce.inglese);
    const riga = page.getByText(voce.inglese, { exact: true }).first();
    await expect(riga).toBeVisible({ timeout: 15000 });
    await riga.click();

    const intestazione = page.locator("h2", { hasText: voce.inglese });
    // il timeout largo è lo stesso già usato dagli altri spec del Compendio: il nome italiano
    // arriva da una server action, e a server appena avviato la prima chiamata è lenta
    await expect(intestazione).toContainText(voce.italiano, { timeout: 15000 });

    // "Testo ufficiale" è l'etichetta che il dettaglio mostra solo quando la scheda viene dal
    // manuale italiano: senza di essa staremmo guardando una traduzione automatica
    await expect(page.getByText(/testo ufficiale/i).first()).toBeVisible({ timeout: 15000 });
  });
}

// Le varianti non hanno una scheda propria nel manuale italiano: il nome resta quello specifico
// della variante (è giusto che "Belt of Fire Giant Strength" si chiami "Cintura della Forza da
// Gigante del Fuoco"), ma il TESTO deve venire dalla scheda madre del manuale invece che dalla
// traduzione automatica.
test("una variante mostra il testo della scheda madre del manuale", async ({ page }) => {
  await page.goto("/compendio");
  await page.waitForFunction(
    () => !document.body.innerText.includes("Caricamento contenuti in corso"),
  );

  await page.getByRole("button", { name: "Oggetti magici" }).click();
  await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Belt of Fire Giant Strength");
  const riga = page.getByText("Belt of Fire Giant Strength", { exact: true }).first();
  await expect(riga).toBeVisible({ timeout: 15000 });
  await riga.click();

  await expect(page.getByText(/testo ufficiale/i).first()).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText(/il suo punteggio di Forza cambia in un determinato punteggio conferito dalla cintura/i),
  ).toBeVisible({ timeout: 15000 });
});
