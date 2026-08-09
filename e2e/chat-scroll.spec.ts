import { expect, test } from "@playwright/test";
import { cleanupSeededCampaign, seedCampaignWithMessages } from "./db-helpers";

// Regressione: con una conversazione lunga, la chat non scorreva al proprio interno — scrollava
// l'intera PAGINA invece della sola lista messaggi. Segnalato dall'utente ("non funziona lo
// scroll, mi fa scrollare solo la pagina intera"). Due bug distinti, entrambi corretti:
// (1) il riquadro messaggi (flex-1 overflow-y-auto) non aveva min-h-0 — senza, un figlio flex non
//     si restringe mai sotto l'altezza del proprio contenuto, quindi l'intero pannello cresceva
//     oltre lo spazio disponibile invece di restare bloccato e scorrere al suo interno (stesso
//     identico bug già visto nei modal dei dadi, in una sessione precedente).
// (2) anche con min-h-0, "justify-content: flex-end" sul contenitore (usato per ancorare i
//     messaggi in fondo quando la conversazione è corta) rompeva silenziosamente il calcolo di
//     scrollHeight — il browser non registrava come overflow il contenuto "prima dell'inizio" del
//     riquadro, quindi scrollHeight risultava sempre uguale a clientHeight anche con decine di
//     messaggi fuori vista: lo scroll sembrava "non fare nulla" perché per il browser non c'era
//     nulla da scorrere. Sostituito con uno spacer a margin-top:auto, che ottiene lo stesso
//     ancoraggio in fondo senza quel bug.
test.describe("Chat: scroll interno della lista messaggi", () => {
  let campaignId: string;

  test.beforeAll(async () => {
    campaignId = await seedCampaignWithMessages("E2E scroll test", 40);
  });

  test.afterAll(async () => {
    await cleanupSeededCampaign(campaignId);
  });

  test("una conversazione lunga scorre al proprio interno, non sposta la pagina", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));
    await page.getByText("E2E scroll test", { exact: true }).click();
    await page.waitForFunction(() => document.body.innerText.includes("Messaggio di riempimento"));

    const list = page.locator(".overflow-y-auto.flex.flex-col").first();
    const before = await list.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      scrollTop: el.scrollTop,
    }));
    // Con 40 messaggi il contenuto deve davvero straboccare il riquadro (altrimenti il test non
    // starebbe verificando nulla) ed essere già scrollato quasi in fondo (il più recente visibile).
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight + 200);
    expect(before.scrollTop).toBeGreaterThan(0);

    await list.hover();
    await page.mouse.wheel(0, -600);
    await expect
      .poll(async () => list.evaluate((el) => el.scrollTop))
      .toBeLessThan(before.scrollTop);

    // La PAGINA non deve mai scrollare — solo il riquadro messaggi.
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  });
});
