// Scarica una copia locale delle tabelle del Compendio italiano, un file <tabella>.json per
// tabella, per lavorarci senza interrogare il database a ogni prova.
//
// La quota di trasferimento dati di Neon è condivisa fra lo sviluppo e la produzione: una messa a
// punto fatta di venti anteprime, ognuna delle quali rilegge tutte le schede, la consuma per
// niente (e a quota finita l'app chiede il login a tutti). Gli script che hanno --copia leggono da
// qui; quando la regola è a posto si applica al database una volta sola.
//
// Uso: node --env-file=../../.env.local copia-locale.mjs <cartella> [tabella ...]
//   senza tabelle le scarica tutte, compresa la cache delle traduzioni (la più pesante: 12 MB)
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const TABELLE = [
  "compendio_ita_mostro",
  "compendio_ita_oggetto",
  "compendio_ita_incantesimo",
  "compendio_ita_talento",
  "compendio_ita_razza",
  "compendio_ita_regola",
  "compendio_traduzione_ia",
];

const sql = neon(process.env.DATABASE_URL);
const [cartella, ...richieste] = process.argv.slice(2);
if (!cartella) {
  console.error("Uso: node copia-locale.mjs <cartella> [tabella ...]");
  process.exit(1);
}
const sconosciute = richieste.filter((t) => !TABELLE.includes(t));
if (sconosciute.length > 0) {
  console.error(`Tabelle sconosciute: ${sconosciute.join(", ")}. Ammesse: ${TABELLE.join(", ")}`);
  process.exit(1);
}

mkdirSync(cartella, { recursive: true });
for (const tabella of richieste.length > 0 ? richieste : TABELLE) {
  const righe = await sql.query(`SELECT * FROM ${tabella}`);
  writeFileSync(path.join(cartella, `${tabella}.json`), JSON.stringify(righe));
  console.log(`${tabella}: ${righe.length} righe`);
}
