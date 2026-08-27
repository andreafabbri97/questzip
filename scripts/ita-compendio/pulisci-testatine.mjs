// Toglie dai testi del Compendio le testatine di pagina del PDF e i watermark della scansione
// (vedi lib/testatine-pagina.ts). Le regole restano SOLO segnalate, non modificate: la' i titoli
// dei capitoli fanno parte del contenuto, non sono intestazioni intruse.
//
// Uso: node --env-file=../../.env.local pulisci-testatine.mjs [--applica]
import { neon } from "@neondatabase/serverless";
import { togliTestatinePagina } from "../../lib/testatine-pagina.ts";

const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");

const CAMPI = [
  ["compendio_ita_talento", "descrizione"],
  ["compendio_ita_incantesimo", "descrizione"],
  ["compendio_ita_oggetto", "descrizione"],
  ["compendio_ita_razza", "introduzione"],
  ["compendio_ita_mostro", "tratti"],
  ["compendio_ita_mostro", "azioni"],
  ["compendio_ita_mostro", "reazioni"],
  ["compendio_ita_mostro", "azioni_leggendarie"],
];

let totale = 0;
const grosse = [];
for (const [tabella, colonna] of CAMPI) {
  const righe = await sql.query(
    `SELECT id, ${colonna} AS v FROM ${tabella} WHERE ${colonna} IS NOT NULL AND ${colonna} <> ''`,
  );
  let toccate = 0;
  for (const riga of righe) {
    const originale = String(riga.v);
    const pulito = togliTestatinePagina(originale);
    if (pulito === originale) continue;
    // Tetto prudenziale: una testatina di pagina e' una manciata di caratteri. Se ne sparissero
    // centinaia vorrebbe dire che il taglio ha agganciato anche il testo intorno — in quei pochi
    // casi la riga resta com'e' e viene segnalata, invece di rischiare di amputare una descrizione.
    const persi = originale.replace(/\s/g, "").length - pulito.replace(/\s/g, "").length;
    if (persi > 150) {
      grosse.push(`${tabella}.${colonna} id=${riga.id}: -${persi} caratteri, lasciata invariata`);
      continue;
    }
    toccate++;
    if (applica) {
      await sql.query(`UPDATE ${tabella} SET ${colonna} = $1 WHERE id = $2`, [pulito, riga.id]);
    }
  }
  totale += toccate;
  if (toccate > 0) console.log(`${tabella}.${colonna}: ${toccate} righe ripulite`);
}
console.log(`\n${applica ? "" : "[PROVA] "}totale righe ripulite: ${totale}`);
if (grosse.length > 0) {
  console.log(`righe saltate perché il taglio sarebbe stato troppo ampio (${grosse.length}):`);
  for (const g of grosse) console.log("  -", g);
}
