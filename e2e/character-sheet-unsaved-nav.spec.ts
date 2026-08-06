import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// Regressione: con modifiche non salvate, il bottone "← Personaggi" dentro la scheda mostrava il
// modal "Modifiche non salvate", ma i link della barra di navigazione in alto (Home, Campagne,
// Compendio...) navigavano via subito, in silenzio, perdendo le modifiche senza alcun avviso —
// due percorsi di uscita scollegati. Segnalato dall'utente il 2026-08-06. Corretto con un
// provider condiviso (components/unsaved-changes-provider.tsx) che entrambi i percorsi usano ora.
test("un link della barra di navigazione mostra lo stesso avviso di modifiche non salvate del bottone indietro", async ({
  page,
}) => {
  await injectTestCharacter(page);
  await page.getByRole("button", { name: /Test E2E/ }).click();

  await page.getByRole("button", { name: "Info & Personalità" }).click();
  await page.getByPlaceholder("Es. Thorin Scudodiquercia").fill("Nome modificato");

  await page.getByRole("link", { name: "Compendio" }).first().click();

  const modal = page.getByText("Modifiche non salvate");
  await expect(modal).toBeVisible();
  await expect(page).toHaveURL(/\/personaggi$/); // la navigazione resta bloccata finché non si sceglie

  await page.getByRole("button", { name: "Esci senza salvare" }).click();
  await expect(page).toHaveURL(/\/compendio/);
});
