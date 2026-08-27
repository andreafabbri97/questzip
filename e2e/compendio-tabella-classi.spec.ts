import { expect, test } from "@playwright/test";

// Segnalazione dell'utente: la tabella di progressione delle classi non era una tabella. Dal PDF
// italiano erano state estratte solo due colonne (privilegi e bonus di competenza), quindi al
// posto della tabella del manuale compariva un elenco «Liv. N — privilegi» che ripeteva quanto già
// scritto sotto e non diceva nulla su slot, trucchetti o suppliche. I numeri ora vengono dai dati
// strutturati di 5etools (sono gli stessi in ogni lingua), i nomi restano quelli ufficiali italiani.
test.describe("Compendio: tabella di progressione delle classi", () => {
  async function apriClasse(page: import("@playwright/test").Page, nome: string) {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );
    await page.getByRole("button", { name: "Classi" }).click();
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill(nome);
    await page.getByText(nome, { exact: true }).first().click();
  }

  test("il warlock mostra slot, suppliche e trucchetti, non solo i privilegi", async ({ page }) => {
    await apriClasse(page, "Warlock");
    await expect(page.getByText(/Testo ufficiale/)).toBeVisible({ timeout: 20000 });

    const tabella = page.locator("table").first();
    await expect(tabella).toBeVisible();

    // Le colonne che prima mancavano del tutto, con l'intestazione tradotta.
    for (const colonna of ["Trucchetti", "Incantesimi noti", "Slot", "Suppliche"]) {
      await expect(tabella.getByRole("columnheader", { name: colonna, exact: true })).toBeVisible();
    }

    // Tutti e 20 i livelli, non solo quelli con un privilegio nuovo.
    await expect(tabella.locator("tbody tr")).toHaveCount(20);

    // Il 20° livello del warlock era rimasto VUOTO nell'estrazione: nel manuale è
    // "Maestro dell'Occulto" (non "Maestro Occulto", che sarebbe la traduzione spontanea).
    const ultima = tabella.locator("tbody tr").nth(19);
    await expect(ultima).toContainText("Maestro dell'Occulto");

    // I nomi dei privilegi non devono più avere i refusi dell'OCR.
    const testo = await tabella.innerText();
    expect(testo).toContain("Patrono Ultraterreno");
    expect(testo).not.toContain("U ltraterreno");
  });

  test("l'Artificer si chiama Artefice, non Artificiere", async ({ page }) => {
    await apriClasse(page, "Artificer");
    await expect(page.getByText("Artefice").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Artificiere")).toHaveCount(0);
  });

  test("il ladro mostra la colonna dell'attacco furtivo", async ({ page }) => {
    await apriClasse(page, "Rogue");
    const tabella = page.locator("table").first();
    await expect(tabella).toBeVisible({ timeout: 20000 });
    await expect(
      tabella.getByRole("columnheader", { name: "Attacco furtivo", exact: true }),
    ).toBeVisible();
    await expect(tabella.locator("tbody tr")).toHaveCount(20);
  });

  // Controllo su TUTTE e 13 le classi base, non solo su quelle segnalate: la tabella deve esserci,
  // coprire tutti e 20 i livelli e non contenere né tag grezzi di 5etools né gli artefatti
  // dell'OCR (una maiuscola staccata dal resto della parola, o il valore di una colonna numerica
  // finito dentro il nome del privilegio).
  const CLASSI = [
    "Artificer", "Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk",
    "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard",
  ];
  for (const classe of CLASSI) {
    test(`${classe}: tabella completa e senza refusi`, async ({ page }) => {
      await apriClasse(page, classe);
      const tabella = page.locator("table").first();
      await expect(tabella).toBeVisible({ timeout: 20000 });
      await expect(tabella.locator("tbody tr")).toHaveCount(20);

      const testo = await tabella.innerText();
      expect(testo).not.toContain("{@"); // tag di collegamento 5etools non convertito
      expect(testo).not.toMatch(/[A-Z] [a-zà-ù]{3,}/); // "U ltraterreno", "M igliorata"
      expect(testo).not.toMatch(/\d+d\d+\s+[A-Z]/); // "1d6 Azione Scaltra"
      expect(testo).not.toMatch(/\d+\s*m\s+[A-Z]/); // "5 m Corpo Senza Tempo"
    });
  }

  // Dubbio dell'utente: "i talenti come faccio a capire per quali classi sono?". In 5e non sono
  // legati a una classe — si prendono al posto di un Aumento dei Punteggi di Caratteristica — ma
  // finché la riga spariva quando prerequisiti non ce n'erano, dall'assenza non si capiva se il
  // talento fosse aperto a tutti o se il dato mancasse.
  test("un talento senza prerequisiti lo dice, invece di non mostrare nulla", async ({ page }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );
    await page.getByRole("button", { name: "Talenti" }).click();
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Alert");
    await page.getByText("Alert", { exact: true }).first().click();

    await expect(page.getByText("Prerequisiti")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("Nessuno — qualsiasi classe o razza")).toBeVisible();
  });

  test("un talento CON prerequisiti li mostra", async ({ page }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );
    await page.getByRole("button", { name: "Talenti" }).click();
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Heavily Armored");
    await page.getByText("Heavily Armored", { exact: true }).first().click();

    await expect(page.getByText(/Competenza nelle armature medie/i)).toBeVisible({ timeout: 20000 });
  });
});
