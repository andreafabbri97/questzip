// Toglie da una scheda di mostro la scheda ACCANTO che ci è finita dentro.
//
// Quando il parser non riconosce il titolo della scheda successiva (il maiuscoletto letto male,
// una riga di glifi), non sa che la scheda è finita e continua: tutto il blocco dopo — nome, tipo,
// classe armatura, punti ferita, tratti, azioni — finisce in coda. Il Plesiosauro aveva addosso
// "Punti Ferita 136 (13d12 + 52)", che sono quelli del Tirannosauro.
//
// Il segnale non ha ambiguità: dentro tratti e azioni una riga che comincia con "Classe Armatura"
// o "Punti Ferita" è l'intestazione di un'altra scheda. Si taglia da lì (e dalle due righe prima,
// se sono il nome e la riga "Bestia Grande, senza allineamento"), fino alla fine della sezione.
// Le sezioni che l'originale non ha affatto (reazioni, azioni leggendarie...) e che compaiono solo
// in una scheda che ne ha inghiottita un'altra sono dell'altra, e si svuotano.
//
// Prima di scrivere si controlla che il taglio avvicini la scheda all'originale: i dadi non
// devono allontanarsi da quelli di 5etools, e il testo non deve scendere sotto la sua lunghezza
// (in qualche pagina le colonne sono uscite mescolate, e dopo l'intestazione dell'altra scheda
// c'è ancora testo di questa: lì si lascia tutto com'è e la scheda va letta dalla pagina).
//
// Uso: node --env-file=../../.env.local togli-schede-vicine.mjs [--applica] [--elenco]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { risolviCopie } from "../../lib/fivetools/risolvi-copia.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const elenco = process.argv.includes("--elenco");
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

// colonna del database <- sezione dell'originale
const SEZIONI = [
  ["tratti", ["trait", "spellcasting"]],
  ["azioni", ["action"]],
  ["azioni_bonus", ["bonus"]],
  ["reazioni", ["reaction"]],
  ["azioni_leggendarie", ["legendary", "mythic"]],
];
const SEZIONI_INGLESI = SEZIONI.flatMap(([, s]) => s);

const INTESTAZIONE = /^(?:C ?lasse ?Armatura|Punti ?Ferita)\s+[\dlISO]/;
const RIGA_TIPO =
  /^(?:Aberrazione|Bestia|Celestiale|Costrutto|Drago|Elementale|Folletto|Gigante|Immondo|Melma|Mostruosit[àa]|Non morto|Umanoide|Vegetale|Sciame)\b[^.]{0,60},/i;
// Il nome della scheda accanto: corto, senza punteggiatura di frase, con l'iniziale maiuscola.
const sembraUnNome = (riga) => riga.length <= 45 && /^[A-ZÀ-Ù0-9"']/.test(riga) && !/[.,;:!?]$/.test(riga) && !/\d\s*\(/.test(riga);

function taglia(testo) {
  const righe = testo.split("\n");
  let taglio = righe.findIndex((r) => INTESTAZIONE.test(r.trim()));
  if (taglio === -1) return null;
  if (taglio > 0 && RIGA_TIPO.test(righe[taglio - 1].trim())) taglio--;
  if (taglio > 0 && sembraUnNome(righe[taglio - 1].trim())) taglio--;
  return righe.slice(0, taglio).join("\n").trim();
}

function dadi(testo) {
  const conta = new Map();
  for (const m of testo.matchAll(/\b\d+d\d+\b/g)) conta.set(m[0], (conta.get(m[0]) ?? 0) + 1);
  return conta;
}
function scarto(a, b) {
  let n = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) n += Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0));
  return n;
}
function testoInglese(valore) {
  if (typeof valore === "string") return valore;
  if (Array.isArray(valore)) return valore.map(testoInglese).join(" ");
  if (valore && typeof valore === "object") return Object.values(valore).map(testoInglese).join(" ");
  return "";
}

const trascritteAMano = new Set();
for (const file of readdirSync(path.join(__dirname, "parsed")).filter((f) => /^trascritti-mostri-.*[.]json$/.test(f))) {
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

const righeDb = await sql`
  SELECT id, nome, fonte, nome_inglese, fonte_inglese, tratti, azioni, azioni_bonus, reazioni, azioni_leggendarie
  FROM compendio_ita_mostro ORDER BY fonte, nome`;

let toccate = 0;
const saltate = [];
for (const r of righeDb) {
  if (trascritteAMano.has(`${r.nome}|${r.fonte}`)) continue;
  const eng = r.nome_inglese ? perChiave.get(`${r.nome_inglese}|${r.fonte_inglese}`) : null;
  if (!eng) continue;

  const patch = {};
  for (const [colonna] of SEZIONI) {
    const tagliato = r[colonna] ? taglia(r[colonna]) : null;
    if (tagliato !== null) patch[colonna] = tagliato;
  }
  if (Object.keys(patch).length === 0) continue;
  // Le sezioni che l'originale non ha: in una scheda che ne ha inghiottita un'altra sono dell'altra.
  for (const [colonna, inglesi] of SEZIONI) {
    const haOriginale = inglesi.some((s) => testoInglese(eng[s]).trim().length > 0);
    if (!haOriginale && (patch[colonna] ?? r[colonna] ?? "") !== "") patch[colonna] = "";
  }

  const prima = SEZIONI.map(([c]) => r[c] ?? "").join("\n");
  const dopo = SEZIONI.map(([c]) => patch[c] ?? r[c] ?? "").join("\n");
  const dadiEng = dadi(JSON.stringify(SEZIONI_INGLESI.map((s) => eng[s] ?? null)));
  const lunghezzaEng = SEZIONI_INGLESI.map((s) => testoInglese(eng[s])).join(" ").length;
  const s0 = scarto(dadi(prima), dadiEng);
  const s1 = scarto(dadi(dopo), dadiEng);
  const descrizione = `${r.nome} [${r.fonte}]: ${prima.length} -> ${dopo.length} car (originale ${lunghezzaEng}), dadi diversi ${s0} -> ${s1}`;
  if (s1 > s0) {
    saltate.push(`${descrizione} — i dadi si allontanerebbero`);
    continue;
  }
  if (dopo.length < 0.95 * lunghezzaEng) {
    saltate.push(`${descrizione} — resterebbe più corta dell'originale`);
    continue;
  }
  toccate++;
  if (elenco) console.log(`  ${descrizione}  [${Object.keys(patch).join(", ")}]`);
  if (applica) {
    const chiavi = Object.keys(patch);
    const set = chiavi.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await sql.query(`UPDATE compendio_ita_mostro SET ${set} WHERE id = $${chiavi.length + 1}`, [...chiavi.map((c) => patch[c]), r.id]);
  }
}

console.log(`${applica ? "" : "[PROVA] "}schede liberate dalla scheda accanto: ${toccate}`);
console.log(`lasciate com'erano, da leggere sulla pagina: ${saltate.length}`);
for (const s of saltate) console.log(`  - ${s}`);
