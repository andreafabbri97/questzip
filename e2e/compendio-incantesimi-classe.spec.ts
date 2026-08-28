import { expect, test } from "@playwright/test";

// Buco segnalato dall'utente: la tabella di progressione dice quanti slot hai a ogni livello, ma
// dal Compendio non c'era modo di sapere COSA puoi metterci dentro — per la lista degli
// incantesimi di una classe bisognava uscire e andare su un sito esterno. Il dato non sta sulle
// voci degli incantesimi (non hanno un campo "classi") ma in spells/sources.json, che rovescia la
// relazione: per ogni incantesimo elenca le classi che lo hanno in lista.
test.describe("Compendio: incantesimi selezionabili da una classe", () => {
  async function apriClasse(page: import("@playwright/test").Page, nome: string) {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );
    await page.getByRole("button", { name: "Classi" }).click();
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill(nome);
    await page.getByText(nome, { exact: true }).first().click();
  }

  test("il warlock elenca i suoi incantesimi divisi per livello", async ({ page }) => {
    await apriClasse(page, "Warlock");

    const apri = page.getByRole("button", { name: /Incantesimi della classe/ });
    await expect(apri).toBeVisible({ timeout: 20000 });
    await apri.click();

    // Divisi per livello, trucchetti compresi. "Trucchetti" e' anche un'intestazione della
    // tabella di progressione, quindi si cerca la variante paragrafo del gruppo incantesimi.
    await expect(page.getByRole("paragraph").filter({ hasText: /^Trucchetti$/ })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^5° livello$/ })).toBeVisible();

    // Un incantesimo iconico del warlock. Il nome mostrato dipende dalla lingua selezionata e
    // dall'indice dei nomi italiani, quindi si accetta l'una o l'altra forma: qui interessa che la
    // lista ci sia e sia quella giusta, non quale delle due traduzioni compare.
    await expect(
      page.getByRole("button", { name: /Deflagrazione Occulta|Eldritch Blast/ }),
    ).toBeVisible();

    // La lista del warlock nel manuale conta 85 incantesimi: se ne comparissero pochi vorrebbe
    // dire che l'abbinamento classe-incantesimo si e' rotto.
    const chip = page.locator("button", { hasText: /./ });
    expect(await chip.count()).toBeGreaterThan(50);
  });

  test("cliccare un incantesimo ne apre la scheda senza lasciare la classe", async ({ page }) => {
    await apriClasse(page, "Warlock");
    await page.getByRole("button", { name: /Incantesimi della classe/ }).click();
    await page.getByRole("button", { name: /Deflagrazione Occulta|Eldritch Blast/ }).first().click();

    // Il dettaglio dell'incantesimo si apre sopra, e la classe resta sotto: la scheda mostra il
    // livello e la scuola, che nella pagina della classe non c'erano.
    await expect(page.getByText(/Livello|Scuola|School/i).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: /Incantesimi della classe/ })).toBeVisible();
  });

  test("una classe senza incantesimi non mostra la sezione", async ({ page }) => {
    await apriClasse(page, "Barbarian");
    await expect(page.getByText(/Progressione/).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: /Incantesimi della classe/ })).toHaveCount(0);
  });

  // Oltre agli incantesimi, ogni classe sblocca altre scelte: suppliche occulte e Voto del Patto
  // per il warlock, manovre per il Maestro di Battaglia, metamagia per lo stregone. Vivono in
  // optionalfeatures.json e prima si potevano solo cercare a mano, senza sapere a quale classe
  // appartenessero — e le manovre (43 voci) non erano nemmeno caricate.
  test("il warlock elenca le sue suppliche occulte", async ({ page }) => {
    await apriClasse(page, "Warlock");
    const apri = page.getByRole("button", { name: /Scelte della classe/ });
    await expect(apri).toBeVisible({ timeout: 20000 });
    await apri.click();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Supplica occulta$/ })).toBeVisible();
    // La stessa supplica esiste in piu' edizioni del manuale (PHB e XPHB), quindi compare due
    // volte: qui interessa che ci sia, non quale delle due.
    await expect(
      page.getByRole("button", { name: /Vista del Diavolo|Devil's Sight/ }).first(),
    ).toBeVisible();
  });

  test("il guerriero elenca le manovre del Maestro di Battaglia", async ({ page }) => {
    await apriClasse(page, "Fighter");
    await page.getByRole("button", { name: /Scelte della classe/ }).click();
    await expect(
      page.getByRole("paragraph").filter({ hasText: /Maestro di Battaglia/ }),
    ).toBeVisible({ timeout: 20000 });
  });

  test("una classe senza scelte opzionali non mostra la sezione", async ({ page }) => {
    await apriClasse(page, "Cleric");
    await expect(page.getByText(/Progressione/).first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: /Scelte della classe/ })).toHaveCount(0);
  });

  // Segnalazione dell'utente: "il warlock può avere scudo come incantesimo di primo livello ma non
  // c'è segnato nel compendio sotto il warlock". Vero — e il buco era doppio: gli incantesimi che
  // una SOTTOCLASSE concede (scudo arriva dal patrono Lama Maledetta) non erano caricati affatto, e
  // nemmeno quelli che i manuali successivi AGGIUNGONO alla lista di classe.
    test("il warlock mostra scudo fra gli incantesimi delle sottoclassi", async ({ page }) => {
      await apriClasse(page, "Warlock");

      const apri = page.getByRole("button", { name: /Incantesimi dalle sottoclassi/ });
      await expect(apri).toBeVisible({ timeout: 20000 });
      await apri.click();

      await expect(page.getByText(/The Hexblade|Lama Maledetta/).first()).toBeVisible();
      await expect(page.getByRole("button", { name: /^(Scudo|Shield)$/ }).first()).toBeVisible();
    });

    test("la lista del warlock comprende gli incantesimi aggiunti dai manuali successivi", async ({
      page,
    }) => {
      await apriClasse(page, "Warlock");

      const apri = page.getByRole("button", { name: /Incantesimi della classe/ });
      await expect(apri).toBeVisible({ timeout: 20000 });
      await apri.click();

      // "Cause Fear" è uno dei 36 che la Guida di Xanathar aggiunge alla lista del warlock
      await expect(
        page.getByRole("button", { name: /^(Provocare Paura|Cause Fear)$/ }).first(),
      ).toBeVisible();
    });
});
