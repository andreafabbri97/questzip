import { expect, test, type Page } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } }); // schermo stretto tipico

// La tastiera virtuale non è riproducibile in Playwright, ma il modal reagisce a
// window.visualViewport: sostituirlo con una versione che dichiara meno altezza (come fa Android,
// che accorcia il viewport visibile) o un offset (come fa iOS, che lo sposta) esercita esattamente
// il codice che gestisce la tastiera vera.
async function apriTastiera(page: Page, altezza: number, offsetTop = 0) {
  await page.evaluate(
    ({ altezza, offsetTop }) => {
      const vv = window.visualViewport as unknown as {
        dispatchEvent: (e: Event) => boolean;
      };
      Object.defineProperty(vv, "height", { value: altezza, configurable: true });
      Object.defineProperty(vv, "offsetTop", { value: offsetTop, configurable: true });
      vv.dispatchEvent(new Event("resize"));
      vv.dispatchEvent(new Event("scroll"));
    },
    { altezza, offsetTop },
  );
  // un frame per lasciare a React il tempo di riposizionare il modal
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

// Selettori strutturali (non basati su role/aria): così questi test descrivono il COMPORTAMENTO e
// fallirebbero anche su una versione del modal che non dichiara role="dialog".
const overlayDi = (page: Page) => page.locator("body > div.fixed.inset-0.z-50").last();
const modalDi = (page: Page) => overlayDi(page).locator("> div").first();

async function apriModal(page: Page) {
  await page.goto("/personaggi");
  await page.getByRole("button", { name: "Assistente regole IA" }).click();
  await expect(page.getByText("🤖 Assistente regole")).toBeVisible();
}

test.describe("Assistente IA: comportamento su mobile con la tastiera virtuale", () => {
  // Il difetto segnalato dall'utente: "con la tastiera virtuale posso scrollare praticamente fuori
  // dal modal muovendo il modal (non la chat dell'IA)". L'overlay aveva overflow-y-auto e il modal
  // un'altezza minima fissa di 320px: con la tastiera aperta diventava più alto dello spazio
  // rimasto, e l'overlay lo lasciava trascinare via.
  test("il modal resta dentro l'area visibile quando si apre la tastiera", async ({ page }) => {
    await apriModal(page);
    await apriTastiera(page, 300);

    const box = await modalDi(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(-1);
    // Tutto il modal deve stare nei 300px visibili, non proseguire sotto la tastiera.
    expect(box!.y + box!.height).toBeLessThanOrEqual(301);
  });

  test("l'overlay non è scrollabile: a muoversi è solo la conversazione", async ({ page }) => {
    await apriModal(page);
    await apriTastiera(page, 300);

    const stato = await overlayDi(page).evaluate((overlay) => ({
      puoScorrere: overlay.scrollHeight > overlay.clientHeight + 1,
      overflow: getComputedStyle(overlay).overflowY,
    }));
    expect(stato.puoScorrere).toBe(false);
    expect(["visible", "hidden", "clip"]).toContain(stato.overflow);
  });

  // Su iOS la tastiera SPOSTA il viewport visibile invece di accorciarlo: un overlay ancorato al
  // viewport di layout finirebbe fuori dallo schermo, oltre il bordo superiore.
  test("segue lo spostamento del viewport visibile (comportamento iOS)", async ({ page }) => {
    await apriModal(page);
    await apriTastiera(page, 500, 120);

    const box = await modalDi(page).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(119); // sceso insieme al viewport visibile
    expect(box!.y + box!.height).toBeLessThanOrEqual(621); // 120 + 500: entro l'area visibile
  });

  test("l'area dei messaggi non trascina con sé l'overlay a fine scorrimento", async ({ page }) => {
    await apriModal(page);
    const scroller = modalDi(page).locator("div.overflow-y-auto").first();
    await expect(scroller).toHaveCount(1);
    expect(await scroller.evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe("contain");
  });

  // Con la tastiera aperta in orizzontale restano ~200px: le due righe di servizio sotto il campo
  // mangiavano lo spazio della conversazione, che e' l'unica cosa per cui il modal esiste.
  test("nasconde le righe di servizio quando lo spazio verticale e' minimo", async ({ page }) => {
    await apriModal(page);
    await expect(page.getByText(/verifica sempre le regole ufficiali/i)).toBeVisible();

    await apriTastiera(page, 260);
    await expect(page.getByText(/verifica sempre le regole ufficiali/i)).toBeHidden();

    await apriTastiera(page, 844); // tastiera chiusa: l'avvertenza torna
    await expect(page.getByText(/verifica sempre le regole ufficiali/i)).toBeVisible();
  });

  test("il campo di scrittura cresce col testo invece di scorrere su una riga sola", async ({ page }) => {
    await apriModal(page);
    const campo = page.getByPlaceholder("Fai una domanda sulle regole…");
    const altezzaIniziale = (await campo.boundingBox())!.height;

    await campo.fill("riga uno\nriga due\nriga tre");
    const altezzaDopo = (await campo.boundingBox())!.height;
    expect(altezzaDopo).toBeGreaterThan(altezzaIniziale);
  });

  test("il Tab resta dentro il modal invece di finire sulla pagina coperta", async ({ page }) => {
    await apriModal(page);
    for (let i = 0; i < 6; i++) await page.keyboard.press("Tab");
    const dentro = await page.evaluate(() => {
      const modal = document.querySelector("body > div.fixed.inset-0.z-50 > div");
      return !!modal && modal.contains(document.activeElement);
    });
    expect(dentro).toBe(true);
  });
});
