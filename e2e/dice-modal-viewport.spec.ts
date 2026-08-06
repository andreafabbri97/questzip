import { expect, test } from "@playwright/test";

// Regressione: su un portatile 15" 1080p il modal dei dadi appariva tagliato verticalmente — il
// contenitore scrollabile interno non aveva "min-h-0", quindi come figlio flex non si restringeva
// mai sotto l'altezza del proprio contenuto (default CSS min-height:auto): lo scroll interno non
// scattava mai e il pannello (max-h-[85vh] overflow-hidden) tagliava semplicemente il resto
// invece di farlo scorrere. Segnalato dall'utente il 2026-08-06. Corretto in
// components/dice-modal.tsx e components/dice-roller-modal.tsx.
test.use({ viewport: { width: 1280, height: 680 } }); // finestra ridotta su schermo 1080p scalato

test("il modal dadi resta interamente raggiungibile anche con poca altezza disponibile", async ({
  page,
}) => {
  await page.goto("/personaggi");
  await page.getByRole("button", { name: "Dadi" }).click();

  await expect(page.getByRole("heading", { name: "Tira dadi" })).toBeVisible();
  const rollButton = page.getByRole("button", { name: /^Tira /, exact: false }).first();
  await expect(rollButton).toBeVisible();
  const box = await rollButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(680);
});
