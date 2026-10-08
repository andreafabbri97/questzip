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

// Anche una trascrizione fatta a occhio si controlla: per mostri e oggetti i dadi del testo
// italiano devono essere quelli dell'originale su 5etools. Se non tornano ho letto male un numero
// (o ho saltato un'azione), e la voce non entra finché non la ricontrollo sulla pagina — a meno
// di --forza, per i casi in cui la differenza è voluta ed è stata verificata.
const forza = process.argv.includes("--forza");
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
// "Nome inglese|FONTE" -> il testo originale in cui contare i dadi
let originali = null;
if (tabella === "compendio_ita_mostro") {
  const { risolviCopie } = await import("../../lib/fivetools/risolvi-copia.ts");
  const index = await (await fetch(`${B}/bestiary/index.json`)).json();
  const files = await Promise.all(
    [...new Set(Object.values(index))].map((f) => fetch(`${B}/bestiary/${f}`).then((r) => r.json()).catch(() => ({}))),
  );
  const template = await fetch(`${B}/bestiary/template.json`).then((r) => r.json()).catch(() => ({}));
  const creature = risolviCopie(files.flatMap((f) => f.monster ?? []), template.monsterTemplate ?? []);
  const sezioni = ["trait", "action", "bonus", "reaction", "legendary", "mythic", "spellcasting"];
  originali = new Map(creature.map((m) => [`${m.name}|${m.source}`, JSON.stringify(sezioni.map((s) => m[s] ?? null))]));
} else if (tabella === "compendio_ita_oggetto") {
  const [items, variants] = await Promise.all([
    fetch(`${B}/items.json`).then((r) => r.json()),
    fetch(`${B}/magicvariants.json`).then((r) => r.json()),
  ]);
  originali = new Map();
  for (const x of [...(items.item ?? []), ...(items.itemGroup ?? [])]) {
    originali.set(`${x.name}|${x.source}`, JSON.stringify(x.entries ?? null));
  }
  for (const x of variants.magicvariant ?? []) {
    originali.set(`${x.name}|${x.inherits?.source ?? x.source}`, JSON.stringify(x.inherits?.entries ?? x.entries ?? null));
  }
}
function dadi(testo) {
  const conta = new Map();
  for (const m of testo.matchAll(/\b(\d+)d(\d+)\b/g)) conta.set(m[0], (conta.get(m[0]) ?? 0) + 1);
  return conta;
}
function differenzeDiDadi(italiano, inglese) {
  const a = dadi(italiano);
  const b = dadi(inglese);
  const diff = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const d = (a.get(k) ?? 0) - (b.get(k) ?? 0);
    if (d !== 0) diff.push(`${d > 0 ? "+" : ""}${d}×${k}`);
  }
  return diff;
}

let aggiornate = 0;
let respinte = 0;
for (const voce of voci) {
  const { nome, ...campi } = voce;
  const colonne = Object.keys(campi);
  // I nomi delle colonne finiscono nel testo della query: solo identificatori semplici.
  if (colonne.some((c) => !/^[a-z_]+$/.test(c))) {
    console.error(`✗ ${nome}: nome di colonna non valido`);
    continue;
  }
  const agganci = originali ? ", nome_inglese, fonte_inglese" : "";
  const righe = await sql.query(`SELECT id, ${colonne.join(", ")}${agganci} FROM ${tabella} WHERE nome = $1 AND fonte = $2`, [nome, fonte]);
  if (righe.length !== 1) {
    console.error(`✗ ${nome}: ${righe.length} righe trovate, attesa una sola`);
    continue;
  }
  if (originali) {
    const inglese = originali.get(`${righe[0].nome_inglese}|${righe[0].fonte_inglese}`);
    if (inglese) {
      const diff = differenzeDiDadi(Object.values(campi).join("\n"), inglese);
      if (diff.length > 0) {
        console.error(`${forza ? "!" : "✗"} ${nome}: dadi diversi dall'originale (${diff.join(", ")})${forza ? ", importata lo stesso" : " — da ricontrollare sulla pagina"}`);
        if (!forza) {
          respinte++;
          continue;
        }
      }
    }
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
if (respinte > 0) console.log(`respinte dal controllo dei dadi: ${respinte}`);
