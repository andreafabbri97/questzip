// Toglie dalle schede dei mostri la prosa della pagina finita dentro tratti e azioni: vedi
// togliProsaDiPagina in lib/prosa-di-pagina.ts per la regola e per ciò che NON tocca.
//
// È il difetto opposto a quello delle schede troncate, e il controllo dei dadi non lo vede: la
// prosa non ha dadi. Si riconosce dalla lunghezza — l'Ogre aveva 3.600 caratteri di azioni dove
// l'originale ne ha 240.
//
// Due verifiche prima di scrivere, per ogni scheda:
// - i dadi devono restare identici (la regola toglie solo righe senza cifre, quindi è una prova
//   che il codice fa quello che dichiara);
// - ciò che resta non deve essere più corto dell'originale di quanto lo fosse prima: se lo è, il
//   taglio ha preso qualcosa di troppo e la scheda si lascia com'è.
// Le schede trascritte a mano non si toccano.
//
// Uso: node --env-file=../../.env.local togli-prosa-schede.mjs [--applica] [--elenco]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { togliProsaDiPagina } from "../../lib/prosa-di-pagina.ts";
import { risolviCopie } from "../../lib/fivetools/risolvi-copia.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const elenco = process.argv.includes("--elenco");
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

const COLONNE = ["tratti", "azioni", "azioni_bonus", "reazioni", "azioni_leggendarie"];
const SEZIONI_INGLESI = ["trait", "action", "bonus", "reaction", "legendary", "mythic", "spellcasting"];

function dadi(testo) {
  return [...testo.matchAll(/\b\d+d\d+\b/g)].map((m) => m[0]).sort().join(" ");
}
function testoInglese(valore) {
  if (typeof valore === "string") return valore;
  if (Array.isArray(valore)) return valore.map(testoInglese).join(" ");
  if (valore && typeof valore === "object") return Object.values(valore).map(testoInglese).join(" ");
  return "";
}

const trascritteAMano = new Set();
for (const file of readdirSync(path.join(__dirname, "parsed")).filter((f) => /^trascritti-mostri-.*\.json$/.test(f))) {
  const { fonte, voci } = JSON.parse(readFileSync(path.join(__dirname, "parsed", file), "utf-8"));
  for (const voce of voci ?? []) trascritteAMano.add(`${voce.nome}|${fonte}`);
}

const index = await (await fetch(`${B}/bestiary/index.json`)).json();
const files = await Promise.all(
  [...new Set(Object.values(index))].map((f) => fetch(`${B}/bestiary/${f}`).then((r) => r.json()).catch(() => ({}))),
);
const template = await fetch(`${B}/bestiary/template.json`).then((r) => r.json()).catch(() => ({}));
const creature = risolviCopie(files.flatMap((f) => f.monster ?? []), template.monsterTemplate ?? []);
const perChiave = new Map(creature.map((m) => [`${m.name}|${m.source}`, m]));

const righe = await sql`
  SELECT id, nome, fonte, nome_inglese, fonte_inglese, tratti, azioni, azioni_bonus, reazioni, azioni_leggendarie
  FROM compendio_ita_mostro ORDER BY fonte, nome`;

let toccate = 0;
let caratteriTolti = 0;
const saltate = [];
const ancoraLunghe = [];
for (const r of righe) {
  if (trascritteAMano.has(`${r.nome}|${r.fonte}`)) continue;
  const eng = r.nome_inglese ? perChiave.get(`${r.nome_inglese}|${r.fonte_inglese}`) : null;
  const lunghezzaEng = eng ? SEZIONI_INGLESI.map((s) => testoInglese(eng[s])).join(" ").length : null;

  const patch = {};
  const dettagli = [];
  for (const c of COLONNE) {
    const prima = r[c] ?? "";
    if (!prima) continue;
    const dopo = togliProsaDiPagina(prima);
    if (dopo === prima) continue;
    patch[c] = dopo;
    const tenute = new Set(dopo.split("\n"));
    const tolte = prima.split("\n").filter((l) => l.trim() && !tenute.has(l));
    dettagli.push(`     ${c}: -${prima.length - dopo.length} car, ${tolte.length} righe  «${tolte[0]?.slice(0, 44)}» … «${tolte.at(-1)?.slice(-44)}»`);
  }
  const chiavi = Object.keys(patch);

  const testoPrima = COLONNE.map((c) => r[c] ?? "").join("\n");
  const testoDopo = COLONNE.map((c) => patch[c] ?? r[c] ?? "").join("\n");
  if (lunghezzaEng && testoDopo.length > 1.7 * lunghezzaEng + 300) {
    ancoraLunghe.push(`${r.nome} [${r.fonte}]: ${testoDopo.length} car contro ${lunghezzaEng} dell'originale`);
  }
  if (chiavi.length === 0) continue;

  if (dadi(testoDopo) !== dadi(testoPrima)) {
    saltate.push(`${r.nome} [${r.fonte}]: i dadi cambierebbero`);
    continue;
  }
  // Il testo italiano di una scheda è di norma un po' più lungo dell'originale: se dopo il taglio
  // scende sotto, si è portato via qualcosa di vero.
  if (lunghezzaEng && testoDopo.length < 0.95 * lunghezzaEng && testoPrima.length >= 0.95 * lunghezzaEng) {
    saltate.push(`${r.nome} [${r.fonte}]: resterebbero ${testoDopo.length} car contro ${lunghezzaEng} dell'originale`);
    continue;
  }

  toccate++;
  caratteriTolti += testoPrima.length - testoDopo.length;
  if (elenco) {
    console.log(`  ${r.nome} [${r.fonte}]  ${testoPrima.length} -> ${testoDopo.length} (originale ${lunghezzaEng ?? "?"})`);
    for (const d of dettagli) console.log(d);
  }
  if (applica) {
    const set = chiavi.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await sql.query(`UPDATE compendio_ita_mostro SET ${set} WHERE id = $${chiavi.length + 1}`, [
      ...chiavi.map((c) => patch[c]),
      r.id,
    ]);
  }
}

console.log(`${applica ? "" : "[PROVA] "}schede ripulite: ${toccate} — caratteri tolti: ${caratteriTolti}`);
console.log(`saltate per prudenza: ${saltate.length}`);
for (const s of saltate) console.log(`  - ${s}`);
console.log(`ancora molto più lunghe dell'originale: ${ancoraLunghe.length}`);
if (elenco) for (const s of ancoraLunghe) console.log(`  - ${s}`);
