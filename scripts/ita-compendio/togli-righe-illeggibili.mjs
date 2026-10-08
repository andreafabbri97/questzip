// Toglie dalle schede dei mostri le righe che non sono testo: citazioni decorative lette come
// glifi, didascalie delle illustrazioni, numeri di pagina (vedi lib/righe-illeggibili.ts).
//
// È il fratello di togli-prosa-schede.mjs: quello toglie la prosa della pagina finita dentro la
// scheda, questo ciò che non è nemmeno prosa. Usa il vocabolario (vocabolario.mjs) per dire che
// cosa è una parola: una riga fatta di parole che non esistono non è una riga del manuale.
// Le schede trascritte a mano non si toccano: sono già il testo giusto.
//
// Senza --applica segnala soltanto. --elenco stampa ogni riga tolta o accorciata: va letto prima
// di applicare, cercando le righe VERE finite nell'elenco (una riga buona con un refuso dentro si
// corregge con correggi-refusi.mjs, non si toglie).
//
// Uso: node --env-file=../../.env.local togli-righe-illeggibili.mjs [--applica] [--elenco]
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { togliRigheIllegibili } from "../../lib/righe-illeggibili.ts";
import { caricaVocabolario } from "./vocabolario.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const elenco = process.argv.includes("--elenco");
const SEZIONI = ["tratti", "azioni", "azioni_bonus", "reazioni", "azioni_leggendarie"];

const trascritteAMano = new Set();
for (const file of readdirSync(path.join(SCRIPT_DIR, "parsed")).filter((f) => /^trascritti-mostri-.*\.json$/.test(f))) {
  const { fonte, voci } = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "parsed", file), "utf-8"));
  for (const voce of voci ?? []) trascritteAMano.add(`${voce.nome}|${fonte}`);
}

const { nota } = await caricaVocabolario(sql);
const righe = await sql.query(`SELECT id, nome, fonte, ${SEZIONI.join(", ")} FROM compendio_ita_mostro`);

let schede = 0;
let tolte = 0;
let accorciate = 0;
for (const riga of righe) {
  if (trascritteAMano.has(`${riga.nome}|${riga.fonte}`)) continue;
  const patch = {};
  for (const sezione of SEZIONI) {
    if (!riga[sezione]) continue;
    const esito = togliRigheIllegibili(riga[sezione], nota);
    if (esito.testo === riga[sezione]) continue;
    patch[sezione] = esito.testo;
    tolte += esito.tolte.length;
    accorciate += esito.accorciate.length;
    if (elenco) {
      for (const t of esito.tolte) console.log(`- ${riga.nome} [${riga.fonte}] ${sezione}: ${t}`);
      for (const [prima, dopo] of esito.accorciate) console.log(`~ ${riga.nome} [${riga.fonte}] ${sezione}: «${prima.slice(dopo.length)}» tolto dalla fine di «…${dopo.slice(-40)}»`);
    }
  }
  const colonne = Object.keys(patch);
  if (colonne.length === 0) continue;
  schede++;
  if (applica) {
    const set = colonne.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await sql.query(`UPDATE compendio_ita_mostro SET ${set} WHERE id = $${colonne.length + 1}`, [...colonne.map((c) => patch[c]), riga.id]);
  }
}

console.log(`${applica ? "" : "[PROVA] "}schede ripulite: ${schede} — righe tolte: ${tolte}, righe accorciate: ${accorciate}`);
