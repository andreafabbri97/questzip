import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// "Con wifi ballerina a un tavolo di gioco può essere un problema reale" — richiesto e accettato
// dall'utente. public/sw.js mette in cache SOLO una shell sicura (/, /personaggi, /guida) più gli
// asset statici: la scheda personaggio funziona offline perché i suoi dati vivono già in
// localStorage (mai sul server, vedi lib/storage.ts), non serve altro. Le pagine di campagna
// (dati condivisi in tempo reale) restano intenzionalmente online-only — verificato qui mostrando
// che offline ottengono la pagina /offline invece dell'errore nativo del browser.
//
// Il primo reload ONLINE dopo la registrazione è necessario: alcuni chunk della pagina corrente
// possono essere stati richiesti prima che il service worker prendesse il controllo (vedi il
// commento in components/offline-support.tsx) e finiscono in cache solo a quel giro successivo.
//
// waitUntil: "domcontentloaded" sulle goto offline è deliberato: l'evento "load" del browser
// aspetta anche risorse non critiche che possono restare appese a lungo quando la rete è
// interrotta a metà (esattamente lo scenario "wifi ballerina") — il contenuto della pagina è già
// pronto molto prima, aspettare "load" qui misurerebbe solo la lentezza di quella singola
// risorsa, non se la funzione offline funziona.
test.describe("Robustezza offline (service worker)", () => {
  test("la scheda personaggio resta apribile offline, le pagine di campagna no", async ({
    page,
    context,
  }) => {
    test.setTimeout(60000);
    await injectTestCharacter(page, { nome: "Test Offline Shell" });
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, {
      timeout: 15000,
    });
    await page.reload();
    await page.waitForTimeout(1500);

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: /Test Offline Shell/ })).toBeVisible({
        timeout: 10000,
      });
      await page.getByRole("button", { name: /Test Offline Shell/ }).click();
      await expect(page.getByRole("button", { name: "⚔️ Combattimento" })).toBeVisible({
        timeout: 5000,
      });

      await page.goto("/campagne", { waitUntil: "domcontentloaded" });
      await expect(page.getByText("Sei offline")).toBeVisible({ timeout: 10000 });
    } finally {
      await context.setOffline(false);
    }

    // Tornati online, la stessa pagina deve funzionare di nuovo normalmente. Una breve attesa
    // dopo setOffline(false): il passaggio di stato rete non è istantaneo per la navigazione
    // successiva, un goto immediato può incappare in un net::ERR_ABORTED transitorio.
    await page.waitForTimeout(500);
    await page.goto("/campagne");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));
    await expect(page.getByPlaceholder("Es. La Maledizione di Strahd")).toBeVisible({
      timeout: 5000,
    });
  });
});
