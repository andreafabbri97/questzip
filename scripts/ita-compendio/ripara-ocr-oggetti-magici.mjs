// Ripara i refusi sistematici del catalogo "Oggetti magici A-Z" (fonte `oggetti_magici`), letto
// con l'OCR da pagine fotografate: vedi ripristinaTestoOggettiMagici in lib/ocr-cleanup.ts.
//
// In più, due correzioni che dal solo testo non si possono decidere e chiedono il confronto con
// l'originale su 5etools:
//
// 1. Il punto e virgola al posto della virgola. Questo OCR lo sbaglia una volta su tre ("Se la
//    pietra tocca il terreno; il personaggio può..."), ma un punto e virgola può anche essere
//    giusto. Si converte solo nelle voci il cui originale inglese non ne contiene NESSUNO: lì
//    sono tutti errori di lettura. Dove l'originale ne ha, il testo resta com'è.
// 2. Il punto finale. Molte descrizioni finiscono con una virgola o senza niente: è l'ultimo
//    segno letto male, ma potrebbe anche essere una descrizione troncata. Si chiude col punto
//    solo se la lunghezza torna con l'originale (tabelle escluse); le altre finiscono nell'elenco
//    da guardare sulla pagina.
//
// Uso: node --env-file=../../.env.local ripara-ocr-oggetti-magici.mjs [--applica]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { pulisciTestoOcr, ripristinaTestoOggettiMagici } from "../../lib/ocr-cleanup.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

/** Il testo inglese di una voce, senza le tabelle (in italiano non stanno nel paragrafo). */
function prosa(valore) {
  if (typeof valore === "string") return valore;
  if (Array.isArray(valore)) return valore.map(prosa).join(" ");
  if (valore && typeof valore === "object") {
    if (valore.type === "table") return "";
    return [valore.name, valore.entries, valore.items, valore.entry].map(prosa).join(" ");
  }
  return "";
}

const [items, variants] = await Promise.all([
  fetch(`${B}/items.json`).then((r) => r.json()),
  fetch(`${B}/magicvariants.json`).then((r) => r.json()),
]);
const inglese = new Map();
for (const x of [...(items.item ?? []), ...(items.itemGroup ?? [])]) inglese.set(`${x.name}|${x.source}`, x.entries);
for (const x of variants.magicvariant ?? []) inglese.set(`${x.name}|${x.inherits?.source ?? x.source}`, x.inherits?.entries ?? x.entries);

const righe = await sql`
  SELECT id, nome, categoria, descrizione, nome_inglese, fonte_inglese
  FROM compendio_ita_oggetto WHERE fonte = 'oggetti_magici' ORDER BY nome`;

// Le voci trascritte a mano dalle pagine (parsed/trascritti-oggetti-magici-*.json) sono già il
// testo giusto: qui non si toccano. I loro punti e virgola sono quelli stampati sul manuale, e una
// regola pensata per i refusi dell'OCR li rovinerebbe.
const trascritteAMano = new Set();
for (const file of readdirSync(path.join(__dirname, "parsed")).filter((f) => /^trascritti-oggetti-magici-.*\.json$/.test(f))) {
  for (const voce of JSON.parse(readFileSync(path.join(__dirname, "parsed", file), "utf-8")).voci ?? []) {
    trascritteAMano.add(voce.nome);
  }
}

let toccate = 0;
let virgole = 0;
let punti = 0;
const daGuardare = [];
for (const r of righe) {
  if (trascritteAMano.has(r.nome)) continue;
  const originale = r.descrizione ?? "";
  let testo = pulisciTestoOcr(ripristinaTestoOggettiMagici(originale)).trim();

  const en = inglese.get(`${r.nome_inglese}|${r.fonte_inglese}`);
  const testoEn = en ? prosa(en) : null;
  if (testoEn !== null && !testoEn.includes(";")) {
    const prima = testo;
    testo = testo.replace(/;(?=\s|$)/g, ",");
    virgole += [...prima].filter((c) => c === ";").length - [...testo].filter((c) => c === ";").length;
  }

  if (!/[.!?»”")]$/.test(testo)) {
    const completa = testoEn !== null && testo.length >= testoEn.length * 0.95 && testo.length <= testoEn.length * 1.6;
    if (completa) {
      testo = `${testo.replace(/[,;:]$/, "")}.`;
      punti++;
    } else {
      daGuardare.push(`${r.nome}: ${testo.length} car contro ${testoEn?.length ?? "?"} dell'originale — finisce con «…${testo.slice(-40)}»`);
    }
  } else if (testoEn !== null && testo.length > testoEn.length * 1.6 + 200) {
    daGuardare.push(`${r.nome}: ${testo.length} car contro ${testoEn.length} dell'originale — troppo lunga, forse ha inghiottito la voce accanto`);
  } else if (testoEn !== null && testo.length < testoEn.length * 0.75) {
    daGuardare.push(`${r.nome}: ${testo.length} car contro ${testoEn.length} dell'originale — corta`);
  }

  const categoria = ripristinaTestoOggettiMagici(r.categoria ?? "").replace(/ 0 /g, " o ");
  const patch = {};
  if (testo !== originale) patch.descrizione = testo;
  if (categoria !== (r.categoria ?? "")) patch.categoria = categoria;
  const chiavi = Object.keys(patch);
  if (chiavi.length === 0) continue;
  toccate++;
  if (applica) {
    const set = chiavi.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await sql.query(`UPDATE compendio_ita_oggetto SET ${set} WHERE id = $${chiavi.length + 1}`, [
      ...chiavi.map((c) => patch[c]),
      r.id,
    ]);
  }
}

console.log(`${applica ? "" : "[PROVA] "}voci ripulite: ${toccate} su ${righe.length}`);
console.log(`punti e virgola tornati virgole: ${virgole} — punti finali rimessi: ${punti}`);
console.log(`da guardare sulla pagina: ${daGuardare.length}`);
for (const d of daGuardare) console.log(`  - ${d}`);
