import { expect, test } from "@playwright/test";

// Tabella del fallimento critico: regola della casa che il gruppo usa ad ogni sessione, quindi sta
// nel Riferimento rapido del master invece che su un foglio a parte. È segnata come regola della
// casa perché il resto del Compendio riporta i manuali alla lettera e le due cose non vanno confuse.
test.describe("Compendio: tabella del fallimento critico", () => {
  test("il master la trova nel riferimento rapido, con tutte e sei le facce", async ({ page }) => {
    await page.goto("/compendio");
    await page.getByRole("button", { name: "📚Regole" }).click();
    await page.getByRole("button", { name: /Riferimento rapido per il master/ }).click();

    await expect(page.getByText(/Fallimento critico \(1 naturale/)).toBeVisible();
    await expect(page.getByText("regola della casa")).toBeVisible();

    // Le sei facce del d6, con le due colonne distinte: stesso effetto sull'1, diversi sul 6.
    const tabella = page.locator("table").filter({ hasText: "Fisico" }).first();
    await expect(tabella.locator("tbody tr")).toHaveCount(6);
    await expect(tabella).toContainText("Concedi vantaggio al nemico");
    await expect(tabella).toContainText("Cadi prono");
    await expect(tabella).toContainText("Svantaggio alla prossima prova di concentrazione");
  });

  test("su telefono le due colonne diventano righe etichettate, senza scorrimento laterale", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/compendio");
    await page.getByRole("button", { name: "📚Regole" }).click();
    await page.getByRole("button", { name: /Riferimento rapido per il master/ }).click();

    // La tabella affiancata resta nascosta: al suo posto una card per faccia del dado.
    await expect(page.locator("table").filter({ hasText: "Fisico" })).toBeHidden();
    // Lo stesso testo esiste due volte: nella tabella nascosta e nella lista che la sostituisce.
    const lista = page.getByRole("list").filter({ hasText: "Cadi prono" });
    await expect(lista.getByText("Cadi prono")).toBeVisible();
    await expect(lista.getByText("Fisico").first()).toBeVisible();

    const scorrimentoLaterale = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(scorrimentoLaterale).toBe(false);
  });
});
