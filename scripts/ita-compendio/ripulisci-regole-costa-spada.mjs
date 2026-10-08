// Ripulisce le "Regole" della Guida degli Avventurieri alla Costa della Spada già caricate nel
// database, senza rigenerarle (un re-seed cancellerebbe le riparazioni fatte sul testo).
//
// Il libro è una scansione: le sezioni sono il testo OCR delle pagine, raggruppato per argomento
// da group-costa-spada.mjs. Due difetti non dipendono dalla qualità della lettura:
//
// 1. Pagine che non sono contenuto: la copertina, i riconoscimenti, la cartina (solo i nomi dei
//    luoghi sparsi sulla mappa, letti a caso) e l'indice analitico — ventimila caratteri di
//    «Baldur's Gate, 17, 45-47» che la ricerca del Compendio trovava per qualunque nome.
// 2. Titoli troncati all'accento: «Citt (pagina 48)», «Faer (pagina 22)», «Festivit (pagina 17)».
//    Il titolo è la parola con la maiuscola più frequente della pagina, cercata con un \b: e per
//    JavaScript una lettera accentata non è una lettera di parola, quindi la parola finiva lì.
//    Si completa con la forma intera più frequente nel testo della sezione.
//
// Le righe tolte si salvano in parsed/costa_spada-pagine-tolte.json prima di cancellarle.
// Rilanciabile: una pagina già tolta non c'è più, un titolo già completo non cambia.
//
// Uso: node --env-file=../../.env.local ripulisci-regole-costa-spada.mjs [--applica]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");

// Pagina di inizio della sezione -> che cos'è e come si riconosce. Il controllo sul testo evita
// di cancellare una sezione vera se un giorno il raggruppamento cambiasse i numeri di pagina.
// Stesso elenco in group-costa-spada.mjs, che le salta quando rigenera le sezioni.
const SENZA_CONTENUTO = new Map([
  [1, ["copertina", /DUNGEONS\s+DRAGONS/]],
  [4, ["riconoscimenti", /R[IG1]+[GC]ONOSCIMENTI|Direttore Creativo/]],
  [7, ["cartina", /Mirabar|Silverymoon/]],
  [160, ["indice analitico", /indice\s+anal/i]],
]);

const righe = await sql`SELECT id, titolo, testo, pagina FROM compendio_ita_regola WHERE fonte = 'costa_spada' ORDER BY pagina`;

const daTogliere = [];
for (const r of righe) {
  const voce = SENZA_CONTENUTO.get(r.pagina);
  if (!voce) continue;
  const [cosa, firma] = voce;
  if (firma.test(r.testo.slice(0, 600))) daTogliere.push({ ...r, cosa });
  else console.log(`! pagina ${r.pagina} («${r.titolo}») non sembra più ${cosa}: lasciata com'è`);
}
for (const r of daTogliere) console.log(`- ${r.cosa}: «${r.titolo}» (${r.testo.length} caratteri)`);

const tolti = new Set(daTogliere.map((r) => r.id));
const nuoviTitoli = [];
for (const r of righe) {
  if (tolti.has(r.id)) continue;
  const m = r.titolo.match(/^(\p{L}+)( \(pagin[ae] .*)$/u);
  if (!m) continue;
  const [, parola, coda] = m;
  // Le forme del testo che cominciano come il titolo e continuano con una lettera accentata.
  const conta = new Map();
  for (const trovata of r.testo.matchAll(new RegExp(`(?<!\\p{L})${parola}[à-ÿ]\\p{L}*`, "gu"))) {
    conta.set(trovata[0], (conta.get(trovata[0]) ?? 0) + 1);
  }
  const [intera, volte] = [...conta].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (!intera || volte < 2) continue;
  nuoviTitoli.push({ id: r.id, prima: r.titolo, dopo: `${intera}${coda}` });
}
for (const t of nuoviTitoli) console.log(`~ ${t.prima} -> ${t.dopo}`);

if (applica) {
  if (daTogliere.length > 0) {
    const file = new URL("./parsed/costa_spada-pagine-tolte.json", import.meta.url);
    const gia = existsSync(file) ? JSON.parse(readFileSync(file, "utf-8")) : [];
    writeFileSync(file, JSON.stringify([...gia, ...daTogliere], null, 1));
    for (const r of daTogliere) await sql`DELETE FROM compendio_ita_regola WHERE id = ${r.id}`;
  }
  for (const t of nuoviTitoli) await sql`UPDATE compendio_ita_regola SET titolo = ${t.dopo} WHERE id = ${t.id}`;
}
console.log(`\n${applica ? "" : "[PROVA] "}sezioni senza contenuto tolte: ${daTogliere.length} — titoli completati: ${nuoviTitoli.length}`);
