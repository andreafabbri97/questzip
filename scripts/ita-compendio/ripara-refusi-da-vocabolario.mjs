// Ripara nel database i refusi che un vocabolario basta a riconoscere: l'apostrofo perso
// («dargento», «lisola»), la lettera persa da una legatura («infuenza», «uffciale», «efetto»),
// l'accento finale («tribu») — vedi lib/refusi-da-vocabolario.ts.
//
// È il fratello di ricuci-parole-spezzate.mjs e usa lo stesso vocabolario (vocabolario.mjs): un
// dizionario italiano più le parole del gioco prese dai testi puliti del Compendio. La regola
// ripara solo una parola che non esiste e che ha un modo solo di tornare a esistere, quindi una
// parola vera non la tocca mai, per quanto rara. Nasce per la Guida della Costa della Spada,
// 870.000 caratteri letti da una scansione che perdeva apostrofi e legature a ogni riga.
//
// Senza --applica segnala soltanto. --elenco stampa TUTTE le riparazioni distinte: vanno lette
// prima di applicare, come ogni riparazione fatta a regole.
//
// Uso: node --env-file=../../.env.local ripara-refusi-da-vocabolario.mjs [--applica] [--elenco] [--copia <cartella>]
//   --copia  legge le tabelle da una copia locale (un file <tabella>.json per tabella) invece che
//            dal database, per le prove ripetute: non si può usare insieme ad --applica. Il
//            vocabolario, se parsed/vocabolario-dnd.txt non c'è ancora, si costruisce comunque dal
//            database, una volta sola.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { riparaRefusiDaVocabolario } from "../../lib/refusi-da-vocabolario.ts";
import { caricaVocabolario } from "./vocabolario.mjs";

const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const elenco = process.argv.includes("--elenco");
const copia = process.argv.includes("--copia") ? process.argv[process.argv.indexOf("--copia") + 1] : null;
if (copia && applica) {
  console.error("--copia serve per le prove: non si può usare insieme ad --applica");
  process.exit(1);
}

const CAMPI = {
  compendio_ita_regola: ["testo"],
  compendio_ita_oggetto: ["descrizione"],
  compendio_ita_mostro: ["tratti", "azioni", "azioni_bonus", "azioni_leggendarie", "reazioni"],
  compendio_ita_incantesimo: ["descrizione"],
  compendio_ita_talento: ["descrizione", "prerequisito"],
  compendio_ita_razza: ["introduzione"],
};

const vocabolario = await caricaVocabolario(sql);
console.log(`vocabolario: ${vocabolario.dimensione} parole`);
// "In uso" come lo intende vocabolario.mjs: vista almeno due volte nei testi puliti del Compendio.
const perRefusi = { nota: vocabolario.nota, comune: (p) => vocabolario.peso(p) >= 2 };
// Le "regole" del catalogo degli oggetti magici sono pagine in inglese lette male, che l'app non
// mostra (app/actions/compendio-ita.ts le esclude): ripararle con un vocabolario italiano non ha senso.
const daSaltare = (tabella, riga) => tabella === "compendio_ita_regola" && riga.fonte === "oggetti_magici";

const conteggi = new Map();
let righeToccate = 0;
for (const [tabella, colonne] of Object.entries(CAMPI)) {
  const file = copia ? path.join(copia, `${tabella}.json`) : null;
  if (file && !existsSync(file)) continue;
  const righe = file ? JSON.parse(readFileSync(file, "utf-8")) : await sql.query(`SELECT * FROM ${tabella}`);
  let toccate = 0;
  for (const riga of righe) {
    if (daSaltare(tabella, riga)) continue;
    const patch = {};
    for (const c of colonne) {
      if (typeof riga[c] !== "string" || !riga[c]) continue;
      const { testo, riparazioni } = riparaRefusiDaVocabolario(riga[c], perRefusi);
      if (testo === riga[c]) continue;
      patch[c] = testo;
      for (const r of riparazioni) {
        const chiave = `${r.tipo.padEnd(9)} ${r.prima} -> ${r.dopo}`;
        conteggi.set(chiave, (conteggi.get(chiave) ?? 0) + 1);
      }
    }
    const chiavi = Object.keys(patch);
    if (chiavi.length === 0) continue;
    toccate++;
    if (applica) {
      const set = chiavi.map((c, i) => `${c} = $${i + 1}`).join(", ");
      await sql.query(`UPDATE ${tabella} SET ${set} WHERE id = $${chiavi.length + 1}`, [...chiavi.map((c) => patch[c]), riga.id]);
    }
  }
  righeToccate += toccate;
  console.log(`${tabella.padEnd(28)} ${toccate} su ${righe.length}`);
}

const ordinate = [...conteggi].sort((a, b) => b[1] - a[1]);
const totale = ordinate.reduce((n, [, quante]) => n + quante, 0);
if (elenco) for (const [chiave, quante] of ordinate) console.log(`${String(quante).padStart(4)}  ${chiave}`);
else for (const [chiave, quante] of ordinate.slice(0, 15)) console.log(`${String(quante).padStart(4)}  ${chiave}`);
console.log(`\n${applica ? "" : "[PROVA] "}righe riparate: ${righeToccate} — riparazioni: ${totale} (${ordinate.length} diverse)`);
