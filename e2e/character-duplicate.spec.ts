import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// "Mi piacerebbe poter creare una copia di un personaggio che ho già" (richiesta dell'utente,
// 2026-08-28): dalla scheda, un bottone "Duplica" crea "Nome - Copia" e ci porta sopra.
test("duplica un personaggio e apre la copia", async ({ page }) => {
  await injectTestCharacter(page);
  await page.getByRole("button", { name: /Test E2E/ }).click();

  await page.getByRole("button", { name: "⧉ Duplica" }).click();

  // si finisce sulla scheda della COPIA: il campo nome è quello nuovo
  await page.getByRole("button", { name: "Info & Personalità" }).click();
  await expect(page.getByPlaceholder("Es. Thorin Scudodiquercia")).toHaveValue("Test E2E - Copia");

  // e l'originale è ancora lì, accanto alla copia
  await page.getByRole("button", { name: "← Personaggi" }).click();
  await expect(page.getByRole("button", { name: /Test E2E - Copia/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Test E2E PF/ })).toBeVisible();
});

// La copia deve partire da quel che si è visto salvare: con modifiche in sospeso il bottone è
// disattivato, così non si duplica una bozza credendo di duplicare la scheda.
test("con modifiche non salvate il bottone Duplica è disattivato", async ({ page }) => {
  await injectTestCharacter(page);
  await page.getByRole("button", { name: /Test E2E/ }).click();

  await page.getByRole("button", { name: "Info & Personalità" }).click();
  await page.getByPlaceholder("Es. Thorin Scudodiquercia").fill("Bozza non salvata");

  await expect(page.getByRole("button", { name: "⧉ Duplica" })).toBeDisabled();
});
