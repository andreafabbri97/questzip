import { expect, test } from "@playwright/test";

// Prima il Compendio non aveva indirizzi propri: qualunque voce si stesse guardando, la barra del
// browser restava su "/compendio" e mandarla a qualcuno apriva la pagina vuota. Il tasto Condividi
// ha senso solo insieme a questo.
test.describe("Compendio: condividere una voce", () => {
  test("l'indirizzo segue la voce aperta e il link riapre quella voce", async ({ page }) => {
    await page.goto("/compendio");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );

    await page.getByRole("button", { name: "🐉Mostri" }).click();
    await page.getByPlaceholder("Cerca (in inglese o italiano)…").fill("Glabrezu");
    await page.getByText("Glabrezu", { exact: true }).first().click();

    await expect(page.getByRole("button", { name: "Condividi" })).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/tab=mostri&v=Glabrezu/);

    // Il link condiviso: aperto da zero deve mostrare la scheda, non l'elenco.
    const link = page.url();
    await page.goto("/compendio");
    await expect(page).not.toHaveURL(/v=Glabrezu/);
    await page.goto(link);
    await expect(page.getByText("Tiri salvezza").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("For +9, Cos +9, Sag +7, Car +7")).toBeVisible();
  });

  test("chiudendo la voce l'indirizzo torna quello del Compendio", async ({ page }) => {
    // Su schermo largo il dettaglio resta sempre affiancato all'elenco e non c'è niente da
    // chiudere: il tasto "← Risultati" esiste solo nel layout stretto (lg:hidden).
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/compendio?tab=mostri&v=Glabrezu&f=MM");
    await expect(page.getByRole("button", { name: "Condividi" })).toBeVisible({ timeout: 20000 });

    await page.getByRole("button", { name: "← Risultati" }).first().click();
    await expect(page).not.toHaveURL(/v=Glabrezu/);
  });

  // Su desktop navigator.share non c'è: il ripiego utile è copiare il link, non un errore.
  test("senza menu di sistema il link finisce negli appunti", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/compendio?tab=mostri&v=Glabrezu&f=MM");
    await page.getByRole("button", { name: "Condividi" }).click();

    // Il nome accessibile resta "Condividi" (aria-label fisso, così non cambia sotto le dita di
    // chi usa uno screen reader): lo stato si legge dal testo.
    await expect(page.getByRole("button", { name: "Condividi" })).toHaveText(/Link copiato/);
    const negliAppunti = await page.evaluate(() => navigator.clipboard.readText());
    expect(negliAppunti).toContain("/compendio?tab=mostri&v=Glabrezu&f=MM");
  });
});
