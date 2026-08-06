// Estrae il prossimo lotto di descrizioni non ancora tradotte (budget di caratteri, come le fasi
// IA dello script gemello) e lo scrive come JSON in un file scratch, per farlo tradurre
// DIRETTAMENTE da Claude invece che da Gemini (quota IA gratuita esaurita, l'utente ha chiesto
// esplicitamente "traduci tu"). Stessi estrattori/englishText di ai-translate-compendio.mjs,
// duplicati qui per lo stesso motivo (Node puro non risolve l'alias "@/").
//
// Uso: node --env-file=../../.env.local self-translate-fetch.mjs <kind> <outFile> [budgetChars]
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull } from "drizzle-orm";
import { writeFileSync } from "node:fs";
import { compendioTraduzioniIa } from "../../lib/db/schema.ts";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
async function fetchJson(url) {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

const ATK_TAGS = { mw: "Melee Weapon Attack:", rw: "Ranged Weapon Attack:", ms: "Melee Spell Attack:", rs: "Ranged Spell Attack:" };
function resolveTag(tag, content) {
  const parts = content.split("|");
  switch (tag) {
    case "atk": return ATK_TAGS[parts[0]] ?? parts[0];
    case "hit": return `${Number(parts[0]) >= 0 ? "+" : ""}${parts[0]}`;
    case "dc": return `DC ${parts[0]}`;
    case "h": return "Hit: ";
    case "recharge": return parts[0] ? `(Recharge ${parts[0]}-6)` : "(Recharge 6)";
    case "chance": return `${parts[0]}%`;
    case "book": case "filter": case "link": return parts[0];
    // Tag come {@subclass Alchemist|Artificer|EFA|EFA} o {@classFeature Flash of
    // Genius|Artificer|EFA|7|EFA} ripetono il codice del manuale in coda invece di mettere lì
    // un testo alternativo: prendere "l'ultima parte se ce ne sono 3+" (euristica precedente)
    // restituiva quel codice invece del vero nome. parts[0] è sempre il nome corretto per i tag
    // di riferimento di 5etools.
    default: return parts[0];
  }
}
function stripTags(text) {
  return text.replace(/\{@(\w+)(?:\s+([^}]*))?\}/g, (_, tag, content = "") => resolveTag(tag, content.trim()));
}
function listItemText(item) {
  if (typeof item === "string") return stripTags(item);
  if (item.name) {
    const body = item.entry ? stripTags(item.entry) : entriesToText(item.entries);
    return `${stripTags(item.name)}. ${body}`.trim();
  }
  return entriesToText(item.entries);
}
function entriesToText(entries) {
  if (!entries) return "";
  return entries.map((e) => (typeof e === "string" ? stripTags(e) : listItemText(e))).join(" ");
}
function flattenEntries(entries) {
  if (!entries) return [];
  const blocks = [];
  for (const entry of entries) {
    if (typeof entry === "string") { blocks.push(stripTags(entry)); continue; }
    switch (entry.type) {
      case "list":
        for (const item of entry.items ?? []) blocks.push(listItemText(item));
        break;
      case "entries":
      case "section":
        if (entry.name) blocks.push(stripTags(entry.name));
        blocks.push(...flattenEntries(entry.entries));
        break;
      case "item":
        blocks.push(listItemText(entry));
        break;
      case "quote":
        blocks.push(...flattenEntries(entry.entries));
        break;
      default:
        break;
    }
  }
  return blocks;
}

async function loadEnglishSpells() {
  const books = ["aag", "ai", "aitfr-avt", "bmt", "efa", "egw", "ftd", "frhof", "ggr", "idrotf", "llk", "phb", "sato", "scc", "tce", "xge", "xphb"];
  const files = await Promise.all(books.map((b) => fetchJson(`${RAW_BASE}/spells/spells-${b}.json`)));
  return files.flatMap((f) => f?.spell ?? []);
}
async function loadEnglishCreatures() {
  const index = await fetchJson(`${RAW_BASE}/bestiary/index.json`);
  const files = index ? Array.from(new Set(Object.values(index))) : [];
  const bestiaries = await Promise.all(files.map((f) => fetchJson(`${RAW_BASE}/bestiary/${f}`)));
  return bestiaries.flatMap((f) => f?.monster ?? []);
}
async function loadEnglishItems() {
  const file = await fetchJson(`${RAW_BASE}/items.json`);
  return file?.item ?? [];
}
async function loadEnglishRaces() {
  const file = await fetchJson(`${RAW_BASE}/races.json`);
  return file?.race ?? [];
}
async function loadEnglishFeats() {
  const file = await fetchJson(`${RAW_BASE}/feats.json`);
  return file?.feat ?? [];
}
async function loadEnglishBackgrounds() {
  const file = await fetchJson(`${RAW_BASE}/backgrounds.json`);
  return file?.background ?? [];
}
async function loadEnglishConditions() {
  const file = await fetchJson(`${RAW_BASE}/conditionsdiseases.json`);
  return file?.condition ?? [];
}
// A differenza delle altre categorie, il file per-libro contiene sia class[] (crunch meccanico,
// già coperto da compendio_ita_classe per il PHB) sia classFeature[] (il testo "come funziona"
// di ogni caratteristica di classe, per livello) — è quest'ultimo array quello che serve qui.
// Restituisce un oggetto (non un array piatto come gli altri loader) perché per kind "classi"
// rawByKey più sotto deve costruire due tipi di raggruppamento diversi dagli stessi file: uno per
// le classi base (per className|classSource) e uno per le sottoclassi (per subclass name|source,
// filtrando subclassFeature su subclassShortName+subclassSource+className).
async function loadEnglishClassFeatures() {
  const books = ["artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk", "mystic", "paladin", "ranger", "rogue", "sidekick", "sorcerer", "warlock", "wizard"];
  const files = await Promise.all(books.map((b) => fetchJson(`${RAW_BASE}/class/class-${b}.json`)));
  return {
    classFeatures: files.flatMap((f) => f?.classFeature ?? []),
    subclasses: files.flatMap((f) => f?.subclass ?? []),
    subclassFeatures: files.flatMap((f) => f?.subclassFeature ?? []),
  };
}

// Molte ristampe nel mirror 5etools (varianti di manuali di avventura, NPC con equip diverso...)
// non hanno trait/action propri: sono un riferimento "_copy" a un altro mostro base, più un
// "_mod" che applica un piccolo patch (aggiunge/rimuove/sostituisce singole voci). Senza risolverlo
// qui, raw.trait/action/... risultano vuoti e la voce viene silenziosamente saltata per sempre.
function applyMod(baseArr, mod) {
  let arr = baseArr ? [...baseArr] : [];
  for (const m of Array.isArray(mod) ? mod : [mod]) {
    if (!m || typeof m !== "object") continue;
    const items = m.items == null ? [] : Array.isArray(m.items) ? m.items : [m.items];
    if (m.mode === "prependArr") arr = [...items, ...arr];
    else if (m.mode === "appendArr") arr = [...arr, ...items];
    else if (m.mode === "insertArr") arr.splice(typeof m.index === "number" ? m.index : arr.length, 0, ...items);
    else if (m.mode === "replaceArr") {
      const idx = arr.findIndex((x) => x?.name?.toLowerCase() === String(m.replace).toLowerCase());
      if (idx >= 0) arr.splice(idx, 1, ...items);
      else arr = [...arr, ...items];
    } else if (m.mode === "removeArr") {
      const names = new Set((Array.isArray(m.names) ? m.names : [m.replace]).filter(Boolean).map((n) => String(n).toLowerCase()));
      arr = arr.filter((x) => !names.has(x?.name?.toLowerCase()));
    }
  }
  return arr;
}
const MOD_FIELDS = ["trait", "action", "bonus", "reaction", "legendary"];
function resolveMonster(entry, rawByKey, cache, depth = 0) {
  if (!entry?._copy || depth > 5) return entry;
  const key = `${entry.name}|${entry.source}`;
  if (cache.has(key)) return cache.get(key);
  // Alcuni riferimenti _copy nel mirror hanno una capitalizzazione diversa dal nome reale
  // della base (es. "Kuo-Toa" vs "Kuo-toa"): senza il fallback case-insensitive, la base
  // non si trova mai e la voce resta silenziosamente vuota per sempre.
  const base =
    rawByKey.get(`${entry._copy.name}|${entry._copy.source}`) ??
    rawByKey.get(`${entry._copy.name.toLowerCase()}|${entry._copy.source}`);
  if (!base) return entry;
  const resolvedBase = resolveMonster(base, rawByKey, cache, depth + 1);
  const merged = { ...resolvedBase, ...entry };
  delete merged._copy;
  for (const field of MOD_FIELDS) {
    if (entry._copy._mod?.[field]) merged[field] = applyMod(resolvedBase[field], entry._copy._mod[field]);
  }
  cache.set(key, merged);
  return merged;
}

function englishText(kind, raw) {
  if (kind === "mostri") {
    const parts = [];
    for (const t of raw.trait ?? []) parts.push(`${stripTags(t.name)}: ${flattenEntries(t.entries).join(" ")}`);
    for (const a of raw.action ?? []) parts.push(`Azione — ${stripTags(a.name)}: ${flattenEntries(a.entries).join(" ")}`);
    for (const b of raw.bonus ?? []) parts.push(`Azione Bonus — ${stripTags(b.name)}: ${flattenEntries(b.entries).join(" ")}`);
    for (const r of raw.reaction ?? []) parts.push(`Reazione — ${stripTags(r.name)}: ${flattenEntries(r.entries).join(" ")}`);
    for (const l of raw.legendary ?? []) parts.push(`Azione Leggendaria — ${stripTags(l.name)}: ${flattenEntries(l.entries).join(" ")}`);
    return parts.join("\n");
  }
  if (kind === "classi") {
    // raw qui è un array di classFeature (una per privilegio/livello), non un oggetto singolo:
    // stesso motivo per cui la costruzione di rawByKey più sotto ha un ramo dedicato per "classi".
    return raw
      .slice()
      .sort((a, b) => a.level - b.level)
      .map((f) => `${stripTags(f.name)} (Liv. ${f.level}): ${flattenEntries(f.entries).join(" ")}`)
      .join("\n");
  }
  return flattenEntries(raw.entries).join("\n");
}

const LOADERS = {
  incantesimi: loadEnglishSpells,
  mostri: loadEnglishCreatures,
  oggetti: loadEnglishItems,
  razze: loadEnglishRaces,
  talenti: loadEnglishFeats,
  background: loadEnglishBackgrounds,
  condizioni: loadEnglishConditions,
  classi: loadEnglishClassFeatures,
};

const [kind, outFile, budgetArg] = process.argv.slice(2);
const budget = Number(budgetArg) || 20000;
if (!kind || !outFile || !LOADERS[kind]) {
  console.error("Uso: node self-translate-fetch.mjs <kind> <outFile> [budgetChars]");
  process.exit(1);
}

const pending = await db
  .select()
  .from(compendioTraduzioniIa)
  .where(and(eq(compendioTraduzioniIa.kind, kind), isNull(compendioTraduzioniIa.descrizioneIta)));

if (pending.length === 0) {
  console.log(`Nessuna descrizione mancante per ${kind}.`);
  writeFileSync(outFile, JSON.stringify({ kind, items: [] }, null, 2));
  process.exit(0);
}

console.log(`Scarico dati inglesi (${kind})...`);
const entries = await LOADERS[kind]();
let rawByKey;
if (kind === "classi") {
  // classFeature non ha name/source propri (il "nome" è quello del privilegio, non della
  // classe): raggruppa per className|classSource, così ogni chiave punta all'elenco di
  // caratteristiche di quella classe invece che a un singolo oggetto.
  rawByKey = new Map();
  for (const f of entries.classFeatures) {
    const key = `${f.className}|${f.classSource}`;
    if (!rawByKey.has(key)) rawByKey.set(key, []);
    rawByKey.get(key).push(f);
  }
  // Le sottoclassi condividono lo stesso kind "classi" (chiave name|source della sottoclasse
  // stessa, distinta dal nome della classe base): subclassFeature non ha un riferimento diretto
  // alla sottoclasse, va filtrato su subclassShortName+subclassSource+className.
  for (const s of entries.subclasses) {
    const key = `${s.name}|${s.source}`;
    if (rawByKey.has(key)) continue;
    const feats = entries.subclassFeatures.filter(
      (f) => f.subclassShortName === s.shortName && f.subclassSource === s.source && f.className === s.className,
    );
    rawByKey.set(key, feats);
  }
} else {
  rawByKey = new Map(entries.map((e) => [`${e.name}|${e.source}`, e]));
  for (const e of entries) {
    const lowerKey = `${e.name.toLowerCase()}|${e.source}`;
    if (!rawByKey.has(lowerKey)) rawByKey.set(lowerKey, e);
  }
}

const copyCache = new Map();
const items = [];
let chars = 0;
for (const row of pending) {
  let raw = rawByKey.get(`${row.name}|${row.source}`);
  if (raw && kind === "mostri") raw = resolveMonster(raw, rawByKey, copyCache);
  const text = raw ? englishText(kind, raw) : "";
  if (!text) continue; // nessun testo sorgente: lasciato per il prossimo giro/altra via
  if (chars + text.length > budget && items.length > 0) break;
  items.push({ name: row.name, source: row.source, text });
  chars += text.length;
}

writeFileSync(outFile, JSON.stringify({ kind, items }, null, 2));
console.log(`Scritte ${items.length} voci (~${chars} caratteri) su ${pending.length} totali mancanti in ${outFile}`);
