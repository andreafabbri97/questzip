// Stessa voce, manuali diversi: "Devil's Sight" esiste sia nel PHB 2014 sia nella ristampa 2024
// (XPHB), ma la traduzione era salvata solo per uno dei due — per l'altro l'app ripiegava sulla
// traduzione automatica dal vivo, che restituiva "La vista del diavolo" (con un articolo che nel
// nome ufficiale non c'è). Segnalato dall'utente vedendo i due nomi diversi affiancati.
//
// Qui il nome verificato viene copiato sulle fonti gemelle che ne sono PRIVE. Mai sovrascritto uno
// esistente: alcune voci cambiano davvero nome fra edizioni (Eldritch Knight è "Cavaliere Mistico"
// nel 2014 e "Cavaliere Occulto" nel 2024) e quelle vanno lasciate in pace.
//
// Uso: node --env-file=../../.env.local propaga-nomi-fonti.mjs [--dry-run]
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes("--dry-run");

// Fonti "gemelle": stesso contenuto, edizione diversa.
const GEMELLE = [
  ["PHB", "XPHB"],
  ["MM", "XMM"],
  ["DMG", "XDMG"],
];

let creati = 0;
for (const coppia of GEMELLE) {
  for (const [da, a] of [coppia, [...coppia].reverse()]) {
    const mancanti = await sql`
      SELECT o.kind, o.name, o.nome_ita, o.descrizione_ita
      FROM compendio_traduzione_ia o
      WHERE o.source = ${da}
        AND o.nome_ita IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM compendio_traduzione_ia d
          WHERE d.kind = o.kind AND d.name = o.name AND d.source = ${a}
        )`;
    for (const r of mancanti) {
      if (!dryRun) {
        await sql`
          INSERT INTO compendio_traduzione_ia (kind, name, source, nome_ita, descrizione_ita)
          VALUES (${r.kind}, ${r.name}, ${a}, ${r.nome_ita}, ${r.descrizione_ita})
          ON CONFLICT (kind, name, source) DO NOTHING`;
      }
      creati++;
    }
    if (mancanti.length) console.log(`${da} -> ${a}: ${mancanti.length} nomi propagati`);
  }
}
console.log(`\n${dryRun ? "[PROVA] " : ""}totale nomi propagati: ${creati}`);
