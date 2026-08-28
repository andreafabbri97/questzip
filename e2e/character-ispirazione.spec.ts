import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// "Mi piacerebbe poter tracciare fino a 4 punti ispirazione (per ora ce n'è solo uno)" — richiesta
// dell'utente, 2026-08-28. Erano un sì/no; la scheda ufficiale in PDF ha quattro caselle.
test("l'ispirazione si conta fino a quattro punti", async ({ page }) => {
  await injectTestCharacter(page);
  await page.getByRole("button", { name: /Test E2E/ }).first().click();

  const stella = (n: number) =>
    page.getByRole("button", { name: `${n} punt${n === 1 ? "o" : "i"} ispirazione` });

  // si parte da zero: nessuna stella accesa
  await expect(stella(1)).toHaveAttribute("aria-pressed", "false");

  await stella(3).click();
  for (const n of [1, 2, 3]) await expect(stella(n)).toHaveAttribute("aria-pressed", "true");
  await expect(stella(4)).toHaveAttribute("aria-pressed", "false");

  // la quarta è il massimo previsto dalla scheda
  await stella(4).click();
  await expect(stella(4)).toHaveAttribute("aria-pressed", "true");

  // ritoccare la stella più alta accesa toglie un punto solo, senza azzerare
  await stella(4).click();
  await expect(stella(4)).toHaveAttribute("aria-pressed", "false");
  await expect(stella(3)).toHaveAttribute("aria-pressed", "true");
});

test("i punti ispirazione restano dopo il salvataggio", async ({ page }) => {
  await injectTestCharacter(page);
  await page.getByRole("button", { name: /Test E2E/ }).first().click();

  await page.getByRole("button", { name: "2 punti ispirazione" }).click();
  await page.getByRole("button", { name: "💾 Salva" }).click();
  // il salvataggio scrive in locale E spinge sull'account: si aspetta anche quel secondo passo,
  // perché alla ricarica la pagina riconcilia le due copie e vince la più recente
  await expect(page.getByRole("button", { name: "💾 Salva" })).toBeDisabled();
  await expect(page.getByText("☁ Backup ok")).toBeVisible({ timeout: 15000 });

  await page.reload();
  // dopo il test di duplicazione può esistere anche "Test E2E - Copia": si apre la prima
  await page.getByRole("button", { name: /Test E2E/ }).first().click();
  await expect(page.getByRole("button", { name: "💾 Salva" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2 punti ispirazione" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "3 punti ispirazione" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
