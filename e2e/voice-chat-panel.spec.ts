import { expect, test } from "@playwright/test";

// Copre il flusso base della chat vocale (entra/silenzia/esci, riga "io" con indicatore di
// stato) — parte del giro di miglioramento chat vocale del 09/08/2026 (UI: indicatori "sta
// parlando"/silenziato per riga partecipante, messaggi di errore mic differenziati; server:
// Durable Object avvisa gli altri quando qualcuno perde la connessione senza uscire
// correttamente, ripresa automatica quando il canale di segnalazione si riconnette). Il mesh
// multi-partecipante reale, la riconnessione e l'avviso di disconnessione della Durable Object
// NON sono testabili qui: questo ambiente locale non ha NEXT_PUBLIC_PARTYKIT_HOST/
// PARTYKIT_AUTH_SECRET configurati (nessun realtime, comportamento noto e documentato — vedi
// questzip-progetto.md), quindi il canale di segnalazione WebRTC non si apre mai in locale.
// Verificati con lettura attenta + tsc/lint puliti (anche sul tsconfig separato di party/), non
// dal vivo con più browser.
test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
  permissions: ["microphone"],
});

test.describe("Chat vocale: flusso base (entra/silenzia/esci)", () => {
  test("mostra la propria riga con indicatore di stato, silenzia funziona, esci torna al bottone Entra", async ({
    page,
  }) => {
    await page.goto("/campagne");
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));

    await page.getByPlaceholder("Es. La Maledizione di Strahd").fill("E2E chat vocale");
    await page.getByRole("button", { name: /Crea \(diventi il master\)/ }).click();
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));
    await page.getByText("E2E chat vocale", { exact: true }).click();
    await page.waitForFunction(() => !document.body.innerText.includes("Caricamento"));

    await page.getByRole("button", { name: "Entra" }).click();
    await expect(page.getByText("(tu)", { exact: false })).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: /Silenzia/ }).click();
    await expect(page.getByText("silenziato", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: /Riattiva mic/ }).click();
    await expect(page.getByText("silenziato", { exact: false })).not.toBeVisible();

    await page.getByRole("button", { name: "Esci" }).click();
    await expect(page.getByRole("button", { name: "Entra" })).toBeVisible();

    // Pulizia: elimina la campagna di prova (conferma via window.confirm). Aspetta che la
    // cancellazione (server action asincrona) sia davvero finita, non solo che il click sia
    // partito — altrimenti il browser si chiude a fine test prima che la richiesta arrivi al
    // server, lasciando la campagna orfana (trovato: due copie residue della stessa campagna
    // dopo due run, la seconda cancellazione falliva per la stessa causa della prima).
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Elimina campagna" }).click();
    await expect(page.getByPlaceholder("Es. La Maledizione di Strahd")).toBeVisible({ timeout: 5000 });
  });
});
