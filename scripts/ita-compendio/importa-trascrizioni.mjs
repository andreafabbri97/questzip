// Porta nel database le voci TRASCRITTE A MANO leggendo le pagine dei manuali, per le schede in
// cui l'estrazione automatica non è riparabile a regole (testo troncato, due schede fuse, la
// didascalia di un'illustrazione finita in mezzo).
//
// Il file sta in parsed/, che è fuori dal repository: contiene testo dei manuali. Forma:
//   { "tabella": "compendio_ita_talento", "fonte": "tasha",
//     "voci": [ { "nome": "...", "descrizione": "...", "prerequisito": "..." } ] }
// Ogni voce è cercata per nome + fonte e aggiorna SOLO le colonne che elenca: nome inglese,
// aggancio e tutto il resto della riga restano come sono (niente seed, che li azzererebbe).
//
// Uso: node --env-file=../../.env.local importa-trascrizioni.mjs <file.json> [--applica]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const file = process.argv[2];
const applica = process.argv.includes("--applica");
if (!file) {
  console.error("Uso: node importa-trascrizioni.mjs <file.json> [--applica]");
  process.exit(1);
}

const TABELLE_AMMESSE = new Set([
  "compendio_ita_talento",
  "compendio_ita_incantesimo",
  "compendio_ita_oggetto",
  "compendio_ita_mostro",
]);

const { tabella, fonte, voci } = JSON.parse(readFileSync(file, "utf-8"));
if (!TABELLE_AMMESSE.has(tabella)) {
  console.error(`Tabella non ammessa: ${tabella}`);
  process.exit(1);
}

let aggiornate = 0;
for (const voce of voci) {
  const { nome, ...campi } = voce;
  const colonne = Object.keys(campi);
  // I nomi delle colonne finiscono nel testo della query: solo identificatori semplici.
  if (colonne.some((c) => !/^[a-z_]+$/.test(c))) {
    console.error(`✗ ${nome}: nome di colonna non valido`);
    continue;
  }
  const righe = await sql.query(`SELECT id, ${colonne.join(", ")} FROM ${tabella} WHERE nome = $1 AND fonte = $2`, [nome, fonte]);
  if (righe.length !== 1) {
    console.error(`✗ ${nome}: ${righe.length} righe trovate, attesa una sola`);
    continue;
  }
  const cambiate = colonne.filter((c) => (righe[0][c] ?? "") !== campi[c]);
  if (cambiate.length === 0) continue;
  aggiornate++;
  console.log(`✓ ${nome}: ${cambiate.map((c) => `${c} ${String(righe[0][c] ?? "").length} -> ${campi[c].length} car`).join(", ")}`);
  if (applica) {
    const set = cambiate.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await sql.query(`UPDATE ${tabella} SET ${set} WHERE id = $${cambiate.length + 1}`, [
      ...cambiate.map((c) => campi[c]),
      righe[0].id,
    ]);
  }
}
console.log(`\n${applica ? "" : "[PROVA] "}voci aggiornate: ${aggiornate} su ${voci.length}`);
