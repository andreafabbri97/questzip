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
    default: return parts.length >= 3 ? parts[parts.length - 1] : parts[0];
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

function englishText(kind, raw) {
  if (kind === "mostri") {
    const parts = [];
    for (const t of raw.trait ?? []) parts.push(`${t.name}: ${flattenEntries(t.entries).join(" ")}`);
    for (const a of raw.action ?? []) parts.push(`Azione — ${a.name}: ${flattenEntries(a.entries).join(" ")}`);
    for (const b of raw.bonus ?? []) parts.push(`Azione Bonus — ${b.name}: ${flattenEntries(b.entries).join(" ")}`);
    for (const r of raw.reaction ?? []) parts.push(`Reazione — ${r.name}: ${flattenEntries(r.entries).join(" ")}`);
    for (const l of raw.legendary ?? []) parts.push(`Azione Leggendaria — ${l.name}: ${flattenEntries(l.entries).join(" ")}`);
    return parts.join("\n");
  }
  if (kind === "classi") return "";
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
const rawByKey = new Map(entries.map((e) => [`${e.name}|${e.source}`, e]));

const items = [];
let chars = 0;
for (const row of pending) {
  const raw = rawByKey.get(`${row.name}|${row.source}`);
  const text = raw ? englishText(kind, raw) : "";
  if (!text) continue; // nessun testo sorgente: lasciato per il prossimo giro/altra via
  if (chars + text.length > budget && items.length > 0) break;
  items.push({ name: row.name, source: row.source, text });
  chars += text.length;
}

writeFileSync(outFile, JSON.stringify({ kind, items }, null, 2));
console.log(`Scritte ${items.length} voci (~${chars} caratteri) su ${pending.length} totali mancanti in ${outFile}`);
