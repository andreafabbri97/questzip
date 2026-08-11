import { expect, test } from "@playwright/test";
import { cleanupSeededCampaign, seedCampaignWithMessages } from "./db-helpers";

// Regressione: il token di una menzione "#Nome" salva sempre il nome INGLESE (chiave stabile per
// il Compendio, invariato), ma la CHIP mostrata mentre si scrive e quella nel messaggio già
// inviato mostravano quel nome inglese anche quando esiste un nome italiano — inconsistente con
// il menu a tendina di scelta, che invece mostra già l'italiano per primo. Segnalato dall'utente
// con screenshot il 09/08/2026 ("Ti lancio una #Fireball" invece di "#Palla di Fuoco").
//
// Copre anche il bug gemello: dopo un reload la cache di ricerca menzioni (8 categorie, ~4500
// mostri inclusi) è fredda — senza un indicatore, il menu restava vuoto/invisibile durante il
// primo giro di rete, indistinguibile da "nessun risultato trovato" (l'utente: "a volte non lo
// prende bene quando ricarico la pagina... o forse ci mette solo tanto a cercare?" — la seconda
// ipotesi era quella giusta).
test.describe("Chat: le menzioni #Nome mostrano l'italiano, anche subito dopo un reload", () => {
  let campaignId: string;

  test.beforeAll(async () => {
    campaignId = await seedCampaignWithMessages("Verifica lingua menzioni", 1);
  });

  test.afterAll(async () => {
    await cleanupSeededCampaign(campaignId);
  });

  test("menu, chip nel composer e chip nel messaggio inviato sono tutti in italiano", async ({
    page,
  }) => {
    await page.goto(`/chat?thread=campaign:${campaignId}`);
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));
    // Reload "a freddo": nessuna cache di mention-search ancora riscaldata in questa pagina —
    // esattamente lo scenario segnalato dall'utente.
    await page.reload();
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));

    const editor = page.locator('[contenteditable="true"]');
    await editor.click();
    await editor.type("#palla", { delay: 20 });

    // Mai un vuoto totale indistinguibile da "nessun risultato": o l'indicatore di caricamento, o
    // (cache già calda) i risultati veri, entro un paio di secondi dal primo tasto.
    const loadingOrResults = page
      .getByText("Cerco nel Compendio…")
      .or(page.getByText("Palla di Fuoco", { exact: false }));
    await expect(loadingOrResults.first()).toBeVisible({ timeout: 2000 });

    const suggestion = page.locator("button", { hasText: "Palla di Fuoco" }).first();
    await expect(suggestion).toBeVisible({ timeout: 15000 });
    await expect(suggestion).toContainText("Fireball"); // ordine italiano-poi-inglese, non il contrario
    await suggestion.click();

    await expect(editor.locator("span").first()).toContainText("Palla di Fuoco");

    await page.keyboard.press("Enter");
    const sentChip = page.locator("button", { hasText: "Palla di Fuoco" }).last();
    await expect(sentChip).toBeVisible({ timeout: 5000 });
  });
});
