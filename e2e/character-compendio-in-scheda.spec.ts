import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// Gestire il personaggio richiedeva di continuo un salto in /compendio e ritorno. Il modal di
// dettaglio esisteva già (lo stesso delle menzioni #Nome in chat) ma era collegato solo ad armi,
// oggetti, incantesimi, talenti e scelte di classe: classe, razza, background e condizioni no.
test.describe("Scheda: il Compendio si apre senza uscire dal personaggio", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestCharacter(page, {
      nome: "Test Compendio",
      razza: "Elf",
      background: "Acolyte",
      classi: [{ nome: "Rogue", livello: 5, sottoclasse: "Soulknife" }],
      condizioniAttive: ["Avvelenato"],
    });
    await page.goto("/personaggi");
    await page.getByText("Test Compendio", { exact: true }).first().click();
  });

  test("dalla classe si apre la progressione 1-20 restando nella scheda", async ({ page }) => {
    await page.getByRole("button", { name: /Info & Personalità/ }).click();
    await page.getByRole("button", { name: "📖 Progressione" }).first().click();

    // È la scheda vera della classe: la tabella con le colonne del manuale, non un riassunto.
    await expect(page.getByText("Progressione").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Attacco furtivo").first()).toBeVisible();
    // Non si è cambiata pagina: chiuso il modal si è ancora sul personaggio.
    await expect(page).toHaveURL(/\/personaggi/);
  });

  // Dal modal della classe si vedono anche gli incantesimi che quella classe può imparare e le
  // scelte disponibili: era l'altro motivo per cui bisognava andare nel Compendio.
  test("il modal della classe mostra anche gli incantesimi e le scelte della classe", async ({
    page,
  }) => {
    await page.getByRole("button", { name: /Info & Personalità/ }).click();
    await page.getByRole("button", { name: "📖 Progressione" }).first().click();

    await expect(page.getByText("Progressione").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Incantesimi/).first()).toBeVisible();
  });

  test("razza e background hanno la loro scheda", async ({ page }) => {
    await page.getByRole("button", { name: /Info & Personalità/ }).click();

    const bottoni = page.getByRole("button", { name: "📖 Verifica" });
    await expect(bottoni.first()).toBeVisible({ timeout: 20000 });
    // Uno per la razza e uno per il background.
    await expect(bottoni).toHaveCount(2);
  });

  // Servono a decidere come salire di livello: erano stati ridotti a un conteggio, che al tavolo
  // basta ma per pianificare no.
  test("la sottoclasse mostra sia quello che hai sia quello che arriva dopo", async ({ page }) => {
    await page.getByRole("button", { name: /Info & Personalità/ }).click();
    // Il blocco della sottoclasse è chiuso di default: è il più lungo della scheda.
    await page.getByRole("button", { name: /Come funziona/ }).first().click();

    await expect(page.getByText("Che cosa hai adesso")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(/Ai livelli successivi/)).toBeVisible();
    // La descrizione generale della sottoclasse: nel testo italiano è la voce che porta il suo
    // stesso nome, e nei dati inglesi non esiste — prima veniva scartata insieme al resto.
    await expect(page.getByText(/lame psichiche|psionic|psichic/i).first()).toBeVisible();
  });

  test("una condizione addosso al personaggio dice cosa comporta", async ({ page }) => {
    await page.getByRole("button", { name: /Combattimento/ }).click();

    const info = page.getByRole("button", { name: "📖 Avvelenato" });
    await expect(info).toBeVisible({ timeout: 20000 });
    await info.click();
    await expect(page.getByText(/svantaggio/i).first()).toBeVisible({ timeout: 15000 });
  });

  test("su telefono non aggiunge nulla di sempre visibile né scorrimento laterale", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: /Info & Personalità/ }).click();
    await expect(page.getByRole("button", { name: "📖 Progressione" })).toBeVisible({
      timeout: 20000,
    });

    const scorrimentoLaterale = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(scorrimentoLaterale).toBe(false);
  });

  // Il motivo per cui i bottoni "ci mettevano un po'": per decidere SE mostrarsi, ogni categoria
  // presente in scheda si scaricava il catalogo intero più le tabelle di traduzione, a ogni
  // apertura e anche per chi non avrebbe cliccato niente. Ora il lavoro parte al clic.
  test("aprire la scheda non scarica i cataloghi del Compendio", async ({ page }) => {
    const catalogo: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("conditionsdiseases.json")) catalogo.push(req.url());
    });

    await page.getByRole("button", { name: /Combattimento/ }).click();
    const info = page.getByRole("button", { name: "📖 Avvelenato" });
    await expect(info).toBeVisible();
    // Il bottone c'è già, e finora non è stato scaricato niente per saperlo.
    expect(catalogo).toHaveLength(0);

    await info.click();
    await expect(page.getByText(/svantaggio/i).first()).toBeVisible({ timeout: 15000 });
    // Solo ora, e solo perché l'utente ha voluto leggere.
    expect(catalogo.length).toBeGreaterThan(0);
  });
});
