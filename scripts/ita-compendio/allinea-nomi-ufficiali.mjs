// Allinea i nomi della cache IA a quelli UFFICIALI estratti dai manuali italiani.
//
// La cache IA serve per le migliaia di voci che nei manuali posseduti non ci sono: dove invece il
// testo ufficiale c'e', il nome giusto e' quello stampato, non quello che il modello avrebbe
// scelto. Senza questo allineamento nel Compendio comparivano nomi inventati accanto a voci di cui
// possediamo la traduzione vera ("Gabbia di Forza" invece di quello del manuale), e il nome e' cio'
// che si legge negli elenchi e con cui si cerca.
//
// Uso: node --env-file=../../.env.local allinea-nomi-ufficiali.mjs [--applica]
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");

const COPPIE = [
  ["incantesimi", "compendio_ita_incantesimo"],
  ["mostri", "compendio_ita_mostro"],
  ["oggetti", "compendio_ita_oggetto"],
  ["razze", "compendio_ita_razza"],
  ["talenti", "compendio_ita_talento"],
  ["classi", "compendio_ita_classe"],
];

let totale = 0;
for (const [kind, tabella] of COPPIE) {
  const righe = await sql.query(
    `SELECT u.nome AS ufficiale, u.nome_inglese, u.fonte_inglese, t.nome_ita
     FROM ${tabella} u
     JOIN compendio_traduzione_ia t
       ON t.kind = $1 AND t.name = u.nome_inglese AND t.source = u.fonte_inglese
     WHERE u.nome_inglese IS NOT NULL AND t.nome_ita IS DISTINCT FROM u.nome`,
    [kind],
  );
  if (righe.length === 0) { console.log(`${kind}: gia' allineati`); continue; }
  console.log(`${kind}: ${righe.length} nomi da allineare`);
  for (const r of righe.slice(0, 5)) console.log(`    ${r.nome_inglese}: "${r.nome_ita}" -> "${r.ufficiale}"`);
  if (righe.length > 5) console.log(`    …e altri ${righe.length - 5}`);
  totale += righe.length;
  if (applica) {
    await sql.query(
      `UPDATE compendio_traduzione_ia t SET nome_ita = u.nome, updated_at = now()
       FROM ${tabella} u
       WHERE t.kind = $1 AND t.name = u.nome_inglese AND t.source = u.fonte_inglese
         AND u.nome_inglese IS NOT NULL AND t.nome_ita IS DISTINCT FROM u.nome`,
      [kind],
    );
  }
}
console.log(`\n${applica ? "" : "[PROVA] "}totale nomi allineati: ${totale}`);
