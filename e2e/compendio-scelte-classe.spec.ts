import { expect, test, type Page } from "@playwright/test";

// Il pannello si apre solo quando l'elenco delle opzioni è già stato caricato, e finché quel
// caricamento non è finito un re-render può richiuderlo: con le classi che ne hanno molte (il
// guerriero ne ha 48) un solo click non basta. Apertura e verifica stanno quindi nella stessa
// attesa, che riprova a cliccare finché l'opzione cercata non è davvero a schermo.
async function verificaOpzione(page: Page, nomeItaliano: string) {
  const pannello = page.getByRole("button", { name: /Scelte della classe/ });
  await expect(pannello).toBeVisible({ timeout: 15000 });
  const opzione = page.getByRole("button", { name: nomeItaliano, exact: true });
  await expect(async () => {
    if ((await pannello.innerText()).includes("▼")) await pannello.click();
    await expect(opzione).toHaveCount(1, { timeout: 2000 });
  }).toPass({ timeout: 30000 });
}

// Segnalato dall'utente con uno screenshot dello Stregone: il pannello "Scelte della classe" ne
// mostrava venti invece di dieci — ogni Metamagia due volte, perché la stessa opzione esiste sia
// nell'edizione 2014 (PHB) sia in quella 2024 (XPHB) con lo stesso identico nome inglese — e otto
// su dieci restavano in inglese, perché non erano mai entrate nella cache delle traduzioni.
test("le Metamagie dello stregone sono dieci, non doppie, e con il nome del manuale", async ({ page }) => {
  await page.goto("/compendio");
  await page.waitForFunction(
    () => !document.body.innerText.includes("Caricamento contenuti in corso"),
  );

  await page.getByRole("button", { name: "Classi" }).click();
  await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Sorcerer");
  await page.getByText("Sorcerer", { exact: true }).first().click();

  // i nomi ufficiali del Manuale del Giocatore p.110 e del Calderone di Tasha p.70
  for (const nome of [
    "Incantesimo Preciso",
    "Incantesimo Distante",
    "Incantesimo Potenziato",
    "Incantesimo Esteso",
    "Incantesimo Intensificato",
    "Incantesimo Rapido",
    "Incantesimo Celato",
    "Incantesimo Raddoppiato",
    "Incantesimo Mirato",
    "Incantesimo Trasmutato",
  ]) {
    await verificaOpzione(page, nome);
  }

  // nessun residuo in inglese fra le opzioni
  await expect(page.getByRole("button", { name: "Careful Spell", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Twinned Spell", exact: true })).toHaveCount(0);
});

// Stesso problema su tutte le altre classi: le manovre del Maestro di Battaglia, le discipline
// elementali del Monaco, i colpi arcani e le rune non erano MAI entrati nella cache, quindi
// comparivano tutti in inglese. I nomi ora vengono dalle pagine dei manuali.
const ALTRE = [
  { classe: "Fighter", nome: "Attacco Sbilanciante" },
  { classe: "Monk", nome: "Pugno dei Quattro Tuoni" },
  { classe: "Warlock", nome: "Deflagrazione Agonizzante" },
  { classe: "Artificer", nome: "Arma Migliorata" },
];

for (const voce of ALTRE) {
  test(`le scelte di ${voce.classe} usano il nome del manuale (${voce.nome})`, async ({ page }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );

    await page.getByRole("button", { name: "Classi" }).click();
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill(voce.classe);
    await page.getByText(voce.classe, { exact: true }).first().click();

    await verificaOpzione(page, voce.nome);
  });
}

// Due richieste dell'utente sulla scheda di una scelta di classe (2026-08-28):
// 1. il prerequisito era incollato alla descrizione ("Prerequisito: 5° livello Il warlock può…"),
//    due frasi appiccicate senza punto né a capo;
// 2. nell'elenco non si capiva CHE TIPO di scelta fosse una voce (supplica occulta, metamagia…).
test("il prerequisito sta su una riga sua e l'elenco dice di che tipo di scelta si tratta", async ({
  page,
}) => {
  await page.goto("/compendio");
  await page.waitForFunction(
    () => !document.body.innerText.includes("Caricamento contenuti in corso"),
  );

  await page.getByRole("button", { name: "Scelte di classe" }).click();
  await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Presagio di Sventura");

  const riga = page.getByRole("button", { name: /Presagio di Sventura/ }).first();
  await expect(riga).toBeVisible({ timeout: 15000 });
  await expect(riga).toContainText("Supplica occulta");

  await riga.click();

  // il prerequisito è un paragrafo a sé: il testo della descrizione non lo contiene più
  const prerequisito = page.getByText(/^Prerequisito: 5° livello$/);
  await expect(prerequisito).toBeVisible();
  await expect(page.getByText(/livello Il warlock/)).toHaveCount(0);
});
