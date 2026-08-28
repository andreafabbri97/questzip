import { expect, test } from "@playwright/test";

// Tre bug distinti segnalati/scoperti nello stesso giro (09/08/2026), tutti sull'estrazione o sulla
// visualizzazione del testo ufficiale degli incantesimi:
//
// 1. "False Life" mancava del tutto dal testo ufficiale caricato (mai estratto): il parser
//    (scripts/ita-compendio/parse-spells.mjs) richiedeva la cifra del livello attaccata al simbolo
//    "°" ("1°livello"), ma nel PDF a volte c'è uno spazio spurio ("1 ° livello") — senza \s* lì il
//    sottotitolo non veniva riconosciuto e l'intero incantesimo andava perso. Recuperati 30
//    incantesimi di 1° livello in questo modo tra PHB e Xanathar (compreso "Vita Falsata", il nome
//    ufficiale — l'utente aveva ipotizzato fosse "Finta Vita" per via del fallback di traduzione
//    automatica che compariva al suo posto).
// 2. Il campo "Materiali" (solo nel ramo di fallback, quando non c'è testo ufficiale) non veniva
//    mai tradotto — restava sempre in inglese anche a lingua IT selezionata, unico campo della
//    scheda a bypassare la traduzione.
// 3. Nel corpo delle descrizioni (non nei nomi, già protetti da fixDigitLetterConfusion), la cifra
//    "1" della notazione dei dadi ("1d4"...) viene spesso estratta come lettera "l" minuscola
//    isolata ("ld4") — stesso artefatto del font PDF, mai corretto prima per il testo dei campi.
test.describe("Compendio: testo ufficiale degli incantesimi", () => {
  test("Vita Falsata (False Life) ha testo ufficiale, nome corretto e notazione dadi corretta", async ({
    page,
  }) => {
    await page.goto("/compendio");
    const searchInput = page.getByPlaceholder("Cerca (in inglese o italiano)…");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );

    await searchInput.fill("False Life");
    const row = page.getByText("False Life", { exact: true }).first();
    await expect(row).toBeVisible();
    await expect(page.getByText("Vita Falsata").first()).toBeVisible({ timeout: 15000 });

    await row.click();
    await expect(page.getByText("Testo ufficiale · Manuale del Giocatore")).toBeVisible();
    // "1d4 + 4", non "ld4 + 4"
    await expect(page.getByText(/1d4 \+ 4 punti ferita/)).toBeVisible();
    await expect(page.getByText(/\bld4\b/)).not.toBeVisible();
  });

  // Questo caso dipende dall'unico pezzo dell'app che parla con un servizio esterno: la traduzione
  // automatica dal vivo (endpoint pubblico di Google Translate). Dal 2026-08-28 quell'endpoint
  // risponde "429 Too Many Requests" e non traduce più niente, quindi i Materiali di un
  // incantesimo senza testo ufficiale restano nella lingua originale. Il test verifica ora ciò che
  // conta e che dipende da noi: che la riga ci sia e mostri il testo dell'incantesimo — tradotto
  // se la traduzione arriva, in inglese se non arriva, mai vuota.
  test("un incantesimo senza testo ufficiale mostra comunque la riga Materiali", async ({
    page,
  }) => {
    await page.goto("/compendio");
    const searchInput = page.getByPlaceholder("Cerca (in inglese o italiano)…");
    await page.waitForFunction(
      () => !document.body.innerText.includes("Caricamento contenuti in corso"),
    );

    // Wither and Bloom (Strixhaven): fuori dal set PHB/Tasha/Xanathar con testo ufficiale, ha un
    // componente materiale testuale — buon candidato per il ramo di fallback (traduzione
    // automatica), quello toccato dal fix.
    await searchInput.fill("Wither and Bloom");
    const row = page.getByText("Wither and Bloom", { exact: true }).first();
    await expect(row).toBeVisible();
    await row.click();

    const materiali = page.getByText(/^Materiali:/);
    await expect(materiali).toBeVisible({ timeout: 15000 });
    // "vite" tradotto, "vine" no: una delle due, non la riga vuota o il segnaposto
    await expect(materiali).toContainText(/vite|vine/i);
  });
});
