import { expect, test } from "@playwright/test";
import { injectTestCharacter } from "./helpers";

// Regressione: il campo nome-arma nella scheda Personaggio (⚔️ Combattimento → Armi) era un
// semplice <input> di testo libero, senza alcun collegamento al Compendio — a differenza di
// incantesimi/talenti/inventario/oggetti magici, non aveva né autocompletamento (in inglese o
// italiano) né il bottone "📖 Verifica". Segnalato dall'utente mentre verificava se la ricerca del
// Compendio funziona "ovunque nell'app" per ogni categoria, armi comprese. Corretto sostituendo
// l'<input> con lo stesso Autocomplete (loadInventoryItems, che include le armi mundane oltre agli
// oggetti magici) usato dall'Inventario, più CompendioInfoButton per la verifica.
//
// Bug collegato scoperto durante la verifica: "📖 Verifica"/le menzioni "#Nome" in chat/
// l'assistente regole IA usavano MENTION_KIND_LOADERS.oggetti = loadItems (SOLO oggetti magici,
// lo stesso loader della tab "Oggetti magici" del Compendio) — un'arma mundana come "Halberd" non
// veniva mai trovata anche scrivendone il nome esatto. Corretto passando a loadInventoryItems
// (magici + mundani) in lib/fivetools/mention-search.ts e app/actions/ai-assistant.ts. Espone
// anche un secondo bug cosmetico mai raggiunto prima (ItemDetail era irraggiungibile per oggetti
// mundani): rarity "none" (valore 5etools reale per gli oggetti mundani) veniva mostrato come
// "None" invece di essere filtrato come le altre rarità assenti.
test("il campo nome-arma cerca nel Compendio (anche in italiano) e Verifica apre il dettaglio corretto", async ({
  page,
}) => {
  await injectTestCharacter(page, { armi: [{ id: "w1", nome: "" }] });
  await page.getByRole("button", { name: /Test E2E/ }).click();
  await page.getByRole("button", { name: "⚔️ Combattimento" }).click();

  const nameInput = page.getByPlaceholder("Spada lunga, Alabarda…");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("alabarda");
  await expect(page.getByText("Halberd", { exact: false })).toBeVisible({ timeout: 10000 });

  await nameInput.fill("Halberd");
  await page.getByRole("heading", { name: "Armi e attacchi" }).click(); // chiude il menu suggerimenti, che altrimenti copre "Verifica"
  const verificaBtn = page.getByRole("button", { name: "📖 Verifica" });
  await expect(verificaBtn).toBeVisible({ timeout: 10000 });
  await verificaBtn.click();

  await expect(page.getByText("Alabarda", { exact: false })).toBeVisible();
  await expect(page.getByText("None", { exact: true })).not.toBeVisible();
});
