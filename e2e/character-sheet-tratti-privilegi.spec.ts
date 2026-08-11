import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// Regressione per la richiesta dell'utente del 2026-08-06: la scheda "Tratti & Talenti" (1)
// mostrava i privilegi di classe come copia-incolla dell'INTERA classe (livelli 1-20) invece di
// fermarsi al livello attuale del personaggio, (2) non aveva alcuna sezione per i privilegi di
// razza, (3) alcuni talenti mostravano un nome in inglese nell'elenco ma la traduzione ufficiale
// italiana nel modal "📖 Verifica" — stessa voce, testo diverso a seconda di dove la si guardava.
// Personaggio di prova: Elfo (razza con testo ufficiale completo) / Stregone livello 3, sottoclasse
// Discendenza Draconica (Draconic Bloodline, anch'essa con testo ufficiale — vedi
// questzip-sottoclassi-no-pdf), talento "Alert" (ufficiale: "Allerta").
test.describe("Tratti & Talenti: privilegi di classe filtrati per livello, privilegi di razza, coerenza traduzioni", () => {
  test.beforeEach(async ({ page }) => {
    await injectTestCharacter(page, {
      razza: "Elf",
      classi: [{ nome: "Sorcerer", livello: 3, sottoclasse: "Draconic Bloodline" }],
      talenti: [{ id: "t1", nome: "Alert" }],
    });
    await page.getByRole("button", { name: /Test E2E/ }).click();
    await page.getByRole("button", { name: "📖 Tratti & Talenti" }).click();
  });

  test("i privilegi di classe si fermano al livello del personaggio, mostrati come elenco compatto", async ({
    page,
  }) => {
    // Espanso di default (richiesto esplicitamente dall'utente) — niente più click per rivelarlo,
    // basta verificare che il bottone di collasso sia presente. Da espanso il testo del bottone è
    // "Nascondi X" (non più "Come funziona X", quello compare solo da chiuso).
    await expect(page.getByRole("button", { name: /Nascondi Stregone/ })).toBeVisible();

    // Metamagia arriva al 3° livello (il livello del personaggio): deve esserci. Aspetta che la
    // riga esatta "Metamagia (Metamagic)" sia visibile (non solo un sottostringa "Metamagia", che
    // combacia anche con "Opzioni di Metamagia (Metamagic Options)") — questo conferma anche che
    // la traduzione ufficiale/IA sia arrivata prima di cliccare, altrimenti un click troppo rapido
    // aprirebbe il modal con la traduzione dal vivo di riserva invece del testo IA di qualità
    // migliore (race condition vista durante lo sviluppo, non un bug del componente).
    const metamagicRow = page.getByRole("button", { name: "Metamagia (Metamagic) Liv. 3" });
    await expect(metamagicRow).toBeVisible();
    // Affinità Elementale/Elemental Affinity (sottoclasse) arriva solo al 6° livello: NON deve
    // comparire — prima di questa modifica l'elenco mostrava sempre tutti e 20 i livelli.
    await expect(page.getByText("Elemental Affinity", { exact: false })).not.toBeVisible();
    await expect(page.getByText("Affinità Elementale", { exact: false })).not.toBeVisible();

    // Click su una riga apre il modal di dettaglio con il testo ufficiale, non un testo grezzo. Il
    // nome tradotto del bottone può arrivare dalla sola traduzione dal vivo (Google Translate
    // indovina comunque "Metamagic"->"Metamagia", parola quasi identica) PRIMA che la cache IA
    // usata per il CORPO del modal sia pronta — le due traduzioni arrivano da fetch indipendenti,
    // quindi il solo testo del bottone non garantisce che il corpo sia già quello giusto. Ritenta
    // il click finché il modal non mostra il testo IA corretto invece di quello dal vivo.
    await expect(async () => {
      await metamagicRow.click();
      try {
        await expect(page.getByText(/piegare i tuoi incantesimi/)).toBeVisible({ timeout: 500 });
      } catch (error) {
        await page.keyboard.press("Escape"); // richiude il modal (col testo sbagliato) e riprova
        throw error;
      }
    }).toPass({ timeout: 10000 });
  });

  test("i privilegi di razza sono presenti e mostrano il testo ufficiale italiano", async ({ page }) => {
    // Espanso di default — niente più click per rivelarlo. Da espanso il bottone dice "Nascondi X".
    await expect(page.getByRole("button", { name: /Nascondi Elf/ })).toBeVisible();

    const scurovisione = page.getByText("Scurovisione", { exact: true });
    await expect(scurovisione).toBeVisible();
    await scurovisione.click();
    await expect(page.getByText(/penombra del sottobosco/)).toBeVisible();
  });

  test("una razza davvero homebrew mostra un avviso invece di restare vuota", async ({ page }) => {
    await injectTestCharacter(page, { razza: "Razza Inventata Che Non Esiste Nel Compendio" });
    await page.getByRole("button", { name: /Test E2E/ }).click();
    await page.getByRole("button", { name: "📖 Tratti & Talenti" }).click();

    await expect(page.getByText(/non è stata trovata nel Compendio/)).toBeVisible();
  });

  // Regressione: l'utente ha corretto la mia assunzione precedente — "Rinato" NON è homebrew, è un
  // vero lignaggio del Van Richten's Guide to Ravenloft (5etools: "Reborn"/VRGR); "(ex umano)" è
  // solo una nota personale del giocatore sulla razza di partenza prima del lignaggio, non parte
  // del nome. Il match deve staccare l'annotazione tra parentesi E riconoscere anche il nome
  // ufficiale ITALIANO scritto a mano (non solo quello inglese dell'autocompletamento).
  test("'Rinato (ex umano)' risolve al vero lignaggio Rinato, non homebrew", async ({ page }) => {
    await injectTestCharacter(page, { razza: "Rinato (ex umano)" });
    await page.getByRole("button", { name: /Test E2E/ }).click();
    await page.getByRole("button", { name: "📖 Tratti & Talenti" }).click();

    await expect(page.getByText(/non è stata trovata nel Compendio/)).not.toBeVisible();
    // Espanso di default — niente più click per rivelarlo. Da espanso il bottone dice "Nascondi X".
    await expect(page.getByRole("button", { name: /Nascondi Rinato \(Reborn\)/ })).toBeVisible();

    const row = page.getByText("Natura immortale", { exact: true });
    await expect(row).toBeVisible();
    await row.click();
    await expect(page.getByText(/sfuggito alla morte/)).toBeVisible();
  });

  test("il talento mostra la stessa traduzione ufficiale sia in elenco sia nel modal Verifica", async ({
    page,
  }) => {
    await expect(page.getByText("Allerta (Alert)", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "📖 Verifica" }).click();
    await expect(page.getByText("Allerta", { exact: false }).first()).toBeVisible();
  });
});
