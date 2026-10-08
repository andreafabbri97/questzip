import { expect, test } from "@playwright/test";

// La Costa della Spada era una sezione per pagina, con per titolo la parola più frequente della
// pagina («Tamal», «Gyrt»). Ora è divisa come l'indice del libro, e le sezioni che cominciano
// nella stessa pagina (il capitolo, la sua prima parte) restano nell'ordine del libro grazie alla
// colonna `ordine`.
test.describe("Compendio: le Regole della Costa della Spada", () => {
  test("le sezioni hanno i titoli del libro, nell'ordine del libro", async ({ page }) => {
    await page.goto("/compendio");
    await page.getByRole("button", { name: "📚Regole" }).click();
    await page.getByRole("button", { name: "Costa della Spada", exact: true }).click();

    const titoli = page.locator("ul li button > span:first-child");
    await expect(titoli.first()).toHaveText("Capitolo 1: Benvenuti nei Reami");
    // Stessa pagina del capitolo: senza l'ordine del libro potrebbe finirgli davanti.
    await expect(titoli.nth(1)).toHaveText("La Costa della Spada e il Nord");
    await expect(titoli.nth(2)).toHaveText("Toril e le Sue Terre");

    // Una sezione per luogo e per divinità, con il loro nome.
    await expect(page.getByRole("button", { name: /^Baldur's Gate/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Tymora/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Tamal/ })).toHaveCount(0);
  });

  test("le tabelle si leggono come tabelle", async ({ page }) => {
    await page.goto("/compendio");
    await page.getByRole("button", { name: "📚Regole" }).click();
    await page.getByRole("button", { name: "Costa della Spada", exact: true }).click();
    await page.getByRole("button", { name: /^Le Religioni nei Reami/ }).click();

    await expect(page.getByText("Il Pantheon Faerûniano", { exact: true })).toBeVisible();
    // Una riga della tabella: il nome della divinità, poi allineamento, domini e simbolo. Qui si
    // guarda la forma, non il testo: quello dei manuali resta fuori dal repository.
    const riga = page.locator("p").filter({ hasText: /^Akadi/ });
    await expect(riga).toHaveCount(1);
    expect((await riga.innerText()).split(" — ")).toHaveLength(4);
  });
});
