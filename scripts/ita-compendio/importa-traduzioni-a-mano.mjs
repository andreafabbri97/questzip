// Scrive nella cache delle traduzioni le voci per cui NON esiste un manuale italiano da cui
// leggere, e che sono quindi state tradotte a mano invece che lasciate alla traduzione automatica.
//
// Oggi riguarda le sole quattro opzioni di Eberron: Forge of the Artificer, manuale che non
// possediamo in nessuna lingua: vedi traduzioni-scelte-classe-efa.json, dove sta anche la
// terminologia usata. Finiscono in compendio_traduzione_ia — la cache — e non nelle tabelle del
// testo ufficiale, perché ufficiali non sono.
//
// Uso: node --env-file=../../.env.local importa-traduzioni-a-mano.mjs [--applica]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");

const dati = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "traduzioni-scelte-classe-efa.json"), "utf-8"));

console.log(`${dati.voci.length} voci tradotte a mano (fonte ${dati.fonte})`);
for (const v of dati.voci) console.log(`  ${v.en} -> ${v.it} (${v.descrizione.length} caratteri)`);

if (!applica) {
  console.log("\n[PROVA] nessuna scrittura: aggiungere --applica");
} else {
  for (const v of dati.voci) {
    await sql`
      INSERT INTO compendio_traduzione_ia (kind, name, source, nome_ita, descrizione_ita, updated_at)
      VALUES ('scelteClasse', ${v.en}, ${dati.fonte}, ${v.it}, ${v.descrizione}, now())
      ON CONFLICT (kind, name, source) DO UPDATE
        SET nome_ita = excluded.nome_ita,
            descrizione_ita = excluded.descrizione_ita,
            updated_at = now()`;
  }
  console.log(`\nscritte ${dati.voci.length} voci`);
}
