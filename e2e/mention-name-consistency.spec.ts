import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// Regressione: il Compendio, l'autocompletamento di Personaggi e il bottone "📖 Verifica" usavano
// la stessa priorità nome-italiano (ufficiale fonte esatta > ufficiale altra fonte > cache IA) via
// lib/fivetools/compendio-detail.tsx — ma lib/fivetools/mention-search.ts (usato dai mention
// "#Nome" in chat, dall'assistente regole IA e anche dallo stesso bottone "Verifica") aveva una
// SECONDA implementazione indipendente della stessa idea, senza il livello "ufficiale di
// un'altra fonte": una voce come "Wrathful Smite" mostrava "Punizione Collerica" (nome ufficiale
// PHB) nel Compendio ma poteva ancora mostrare "Punizione Irata" (cache IA) da "Verifica"/chat/
// assistente. Segnalato dall'utente ("quei nomi si devono rifare tutti al Compendio, sia in chat,
// sia l'assistente IA, sia nel personaggio") il 2026-08-06. Corretto estraendo la logica in
// lib/fivetools/italian-names.ts (buildItalianNameIndex/bestItalianName), riusata ora da entrambi
// i file — una sola implementazione, niente più rischio di derivare.
test("il bottone '📖 Verifica' di un incantesimo mostra lo stesso nome ufficiale cross-fonte del Compendio", async ({
  page,
}) => {
  await injectTestCharacter(page, {
    classi: [{ nome: "Wizard", livello: 3 }],
    incantesimi: [{ id: "s1", nome: "Wrathful Smite", livello: 1, preparato: true, dadoDanno: "" }],
  });
  await page.getByRole("button", { name: /Test E2E/ }).click();
  await page.getByRole("button", { name: "✨ Incantesimi" }).click();

  const verificaBtn = page.getByRole("button", { name: "📖 Verifica" });
  await expect(verificaBtn).toBeVisible({ timeout: 10000 });
  await verificaBtn.click();

  await expect(page.getByText("Punizione Collerica")).toBeVisible();
  await expect(page.getByText("Punizione Irata")).not.toBeVisible();
});
