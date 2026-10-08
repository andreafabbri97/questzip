import { expect, test, type Page } from "@playwright/test";

// Segnalazione dell'utente del 2026-10-09: "se ordino i mostri per GS non sono proprio in ordine",
// e la richiesta di poter ordinare "in entrambi i versi" (A→Z oppure Z→A).
//
// Il disordine veniva dalle creature che un grado di sfida non ce l'hanno (evocazioni, gregari
// descritti da un livello): valevano -1 e aprivano l'elenco, quattro pagine di «Livello 3», «—»,
// «competenza come la tua» prima di arrivare al GS 0. Ora stanno in fondo, in entrambi i versi.
// La logica è provata in lib/fivetools/ordinamento-compendio.test.ts; qui si controlla che i
// pulsanti la usino davvero.

async function apriMostri(page: Page) {
  await page.goto("/compendio");
  await page.waitForFunction(() => !document.body.innerText.includes("Caricamento contenuti in corso"));
  await page.getByRole("button", { name: "Mostri" }).click();
  await expect(page.locator("main >> text=/GS .+ ·/").first()).toBeVisible({ timeout: 30000 });
}

/** I gradi di sfida scritti nelle righe dell'elenco, nell'ordine in cui compaiono. */
async function gradiVisibili(page: Page): Promise<string[]> {
  const righe = await page.locator("main >> text=/GS .+ ·/").allInnerTexts();
  return righe.map((r) => r.match(/GS (.+?) ·/)?.[1] ?? "?");
}

test.describe("Compendio: ordinamento nei due versi", () => {
  test("per GS si parte da 0, e invertendo dal più forte", async ({ page }) => {
    await apriMostri(page);

    await page.getByRole("button", { name: "GS", exact: true }).click();
    const crescente = page.getByRole("button", { name: /^GS\s*0→30$/ });
    await expect(crescente).toBeVisible();
    await expect(crescente).toHaveAttribute("aria-pressed", "true");

    // La prima pagina è tutta di GS 0: prima c'erano le creature senza grado di sfida.
    const primi = await gradiVisibili(page);
    expect(primi.length).toBeGreaterThan(10);
    expect(new Set(primi.slice(0, 10))).toEqual(new Set(["0"]));

    // Secondo tocco sullo stesso pulsante: verso contrario.
    await crescente.click();
    await expect(page.getByRole("button", { name: /^GS\s*30→0$/ })).toBeVisible();
    const dalPiuForte = await gradiVisibili(page);
    expect(dalPiuForte[0]).toBe("30");
    // Sempre numeri, e mai in salita: chi non ha un GS non compare nemmeno in cima al contrario.
    const numeri = dalPiuForte.slice(0, 10).map(Number);
    expect(numeri.every((n) => Number.isFinite(n))).toBe(true);
    expect([...numeri].sort((a, b) => b - a)).toEqual(numeri);
  });

  test("per nome si può andare dalla Z alla A, e cambiando criterio si riparte dalla A", async ({ page }) => {
    await apriMostri(page);

    // "Nome" è già attivo all'apertura: un tocco lo inverte.
    const nome = page.getByRole("button", { name: /^Nome\s*A→Z$/ });
    await expect(nome).toBeVisible();
    await nome.click();
    await expect(page.getByRole("button", { name: /^Nome\s*Z→A$/ })).toBeVisible();

    // Passando a un altro criterio il verso torna quello naturale, non resta "al contrario".
    await page.getByRole("button", { name: "Manuale", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Manuale\s*A→Z$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Nome", exact: true })).toHaveAttribute("aria-pressed", "false");
  });
});
