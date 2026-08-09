import { expect, test } from "@playwright/test";

// Regressione segnalata dall'utente: il primissimo tiro dopo l'apertura del modal (cronologia
// ancora vuota) a volte spariva subito dopo essere apparso, e tornava a comparire solo dopo un
// secondo tiro. Causa: il GET iniziale della cronologia (getMyDiceRolls, partito al mount) può
// risolversi DOPO che l'utente ha già tirato in modo ottimistico — sovrascrivendo `history` con
// l'istantanea del server presa PRIMA di quel tiro (che quindi non lo conteneva ancora),
// cancellandolo silenziosamente. Dal secondo tiro in poi il problema non si ripresentava più
// (quell'effetto gira una sola volta). Corretto unendo per id invece di sovrascrivere in
// components/dice-roller.tsx. Qui si ritarda ad arte la risposta del server action per simulare
// la finestra di race condition in modo deterministico, invece di sperare che capiti per caso.
test("il primo tiro con cronologia vuota resta visibile anche se il caricamento iniziale è lento", async ({
  page,
}) => {
  await page.goto("/personaggi");
  await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));

  // Ritarda le POST (server action, incluso il GET iniziale della cronologia) SOLO da qui in poi
  // — dà tempo di cliccare "Tira" prima che si risolva.
  await page.route("**/personaggi", async (route) => {
    if (route.request().method() === "POST") {
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
    await route.continue();
  });

  await page.getByRole("button", { name: "Dadi" }).click();
  await expect(page.getByRole("heading", { name: "Tira dadi" })).toBeVisible();

  await page.getByRole("button", { name: /^Tira d20$/ }).click();

  // Ben oltre il ritardo artificiale (1.2s) + il tumble numerico: il tiro deve essere ancora lì,
  // non sparire quando il GET ritardato finalmente si risolve.
  await page.waitForTimeout(2500);
  const bigNumber = await page.locator(".text-6xl").first().textContent();
  expect(bigNumber?.trim()).toMatch(/^\d+$/);
});
