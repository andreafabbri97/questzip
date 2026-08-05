// Traduce con l'IA (Gemini) nomi e descrizioni delle voci del Compendio che NON hanno testo
// ufficiale (le tabelle compendio_ita_* restano sempre la fonte migliore quando esistono — qui
// si copiano direttamente, zero chiamate IA). Per tutto il resto (migliaia di voci: mostri e
// oggetti soprattutto), oggi c'è solo la traduzione automatica dal vivo di
// lib/fivetools/translate.ts — questo script costruisce una cache permanente di qualità
// migliore, ancorata alla terminologia ufficiale già nel DB.
//
// Lavoro LUNGO (migliaia di voci, quota IA gratuita giornaliera limitata) — pensato per essere
// rilanciato più giorni di fila. Idempotente e riprendibile: ogni riga tiene traccia separata di
// "nome tradotto?" e "descrizione tradotta?" (colonne nullable), rilanciarlo salta tutto ciò che
// è già fatto. Se la quota si esaurisce a metà, si ferma da sé (askGemini ritorna null) invece di
// andare in loop d'errore.
//
// Uso: node --env-file=../../.env.local ai-translate-compendio.mjs [categoria] [opzioni]
//   categoria facoltativa: incantesimi|mostri|oggetti|razze|talenti|classi|background|condizioni
//   --dry-run            non scrive nulla, solo log di cosa farebbe
//   --names-only          salta la fase descrizioni
//   --descriptions-only   salta la fase nomi

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, isNull } from "drizzle-orm";
import {
  compendioTraduzioniIa,
  compendioItaIncantesimi,
  compendioItaMostri,
  compendioItaOggetti,
  compendioItaRazze,
  compendioItaTalenti,
  compendioItaClassi,
} from "../../lib/db/schema.ts";
import { askGemini } from "../../lib/gemini.ts";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL non impostato. Uso: node --env-file=../../.env.local ai-translate-compendio.mjs");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
async function fetchJson(url) {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- stripTags/flattenEntries duplicati da lib/fivetools/tags.ts e entries.tsx: quel secondo
// file è .tsx con JSX vero (non solo tipi), Node non può importarlo direttamente nemmeno con lo
// stripping nativo dei tipi — stesso motivo per cui anche i loader sotto sono duplicati invece
// che importati da lib/fivetools/data.ts (quello usa l'alias "@/", non risolvibile qui). ---
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

// --- loader inglesi, stesso approccio di match-english-names.mjs (più i due nuovi: background/
// condizioni, non presenti lì perché quello script copre solo le categorie con testo ufficiale) ---
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
async function loadEnglishClasses() {
  const books = ["artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk", "mystic", "paladin", "ranger", "rogue", "sidekick", "sorcerer", "warlock", "wizard"];
  const files = await Promise.all(books.map((b) => fetchJson(`${RAW_BASE}/class/class-${b}.json`)));
  return files.flatMap((f) => f?.class ?? []);
}
async function loadEnglishBackgrounds() {
  const file = await fetchJson(`${RAW_BASE}/backgrounds.json`);
  return file?.background ?? [];
}
async function loadEnglishConditions() {
  const file = await fetchJson(`${RAW_BASE}/conditionsdiseases.json`);
  return file?.condition ?? [];
}

// Testo descrittivo inglese appiattito, un estrattore per categoria perché la forma dei dati
// grezzi 5etools è diversa per ciascuna (vedi RawSpell/RawCreature/... in lib/fivetools/data.ts).
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
  if (kind === "classi") return ""; // nessun testo descrittivo nel loader attuale (solo crunch meccanico)
  return flattenEntries(raw.entries).join("\n");
}

// Testo ufficiale già nel DB, appiattito nello stesso spirito — un estrattore per categoria dato
// che ogni tabella compendio_ita_* ha una forma diversa (vedi lib/db/schema.ts).
function officialDescrizione(kind, row) {
  switch (kind) {
    case "incantesimi":
    case "oggetti":
    case "talenti":
      return row.descrizione || null;
    case "mostri": {
      const parts = [];
      if (row.tratti) parts.push(`Tratti: ${row.tratti}`);
      if (row.azioni) parts.push(`Azioni: ${row.azioni}`);
      if (row.azioniLeggendarie) parts.push(`Azioni Leggendarie: ${row.azioniLeggendarie}`);
      if (row.reazioni) parts.push(`Reazioni: ${row.reazioni}`);
      return parts.length > 0 ? parts.join("\n\n") : null;
    }
    case "razze": {
      const parts = [];
      if (row.introduzione) parts.push(row.introduzione);
      for (const t of row.tratti ?? []) parts.push(`${t.nome}: ${t.testo}`);
      for (const sub of row.sottorazze ?? []) {
        parts.push(`— ${sub.nome} —`);
        for (const t of sub.tratti ?? []) parts.push(`${t.nome}: ${t.testo}`);
      }
      return parts.length > 0 ? parts.join("\n\n") : null;
    }
    default:
      return null; // classi: nessun campo descrittivo utile in questa tabella
  }
}

const KIND_LABELS = {
  incantesimi: "incantesimi", mostri: "mostri", oggetti: "oggetti magici",
  razze: "razze", talenti: "talenti", classi: "classi", background: "background", condizioni: "condizioni",
};

const CATEGORIES = {
  incantesimi: { loadEnglish: loadEnglishSpells, officialTable: compendioItaIncantesimi },
  mostri: { loadEnglish: loadEnglishCreatures, officialTable: compendioItaMostri },
  oggetti: { loadEnglish: loadEnglishItems, officialTable: compendioItaOggetti },
  razze: { loadEnglish: loadEnglishRaces, officialTable: compendioItaRazze },
  talenti: { loadEnglish: loadEnglishFeats, officialTable: compendioItaTalenti },
  classi: { loadEnglish: loadEnglishClasses, officialTable: compendioItaClassi },
  background: { loadEnglish: loadEnglishBackgrounds, officialTable: null },
  condizioni: { loadEnglish: loadEnglishConditions, officialTable: null },
};

function parseJsonResponse(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

async function translateNamesBatch(kind, names, fewShot) {
  const examples = fewShot.length > 0
    ? `Esempi di terminologia ufficiale già in uso (inglese -> italiano):\n${fewShot.map(([en, it]) => `- ${en} -> ${it}`).join("\n")}\n\n`
    : "";
  const prompt = `Sei un traduttore esperto della terminologia ufficiale di Dungeons & Dragons 5ª edizione in italiano. Traduci questi nomi di ${KIND_LABELS[kind]} dall'inglese all'italiano, nello stesso stile/registro della terminologia ufficiale.\n\n${examples}Traduci ORA questi ${names.length} nomi. Rispondi SOLO con un oggetto JSON — chiave il nome inglese ESATTO come scritto qui sotto, valore la traduzione italiana — con TUTTI e ${names.length} i nomi, nessuno escluso:\n${names.map((n) => `- ${n}`).join("\n")}`;
  const raw = await askGemini({ prompt });
  return parseJsonResponse(raw);
}

async function translateDescriptionsBatch(kind, items, fewShot) {
  const examples = fewShot.length > 0
    ? `Esempi di terminologia ufficiale già in uso in questa categoria (per coerenza di stile):\n${fewShot.map(([en, it]) => `- ${en} -> ${it}`).join("\n")}\n\n`
    : "";
  const list = items.map((it, i) => `${i + 1}. [${it.name}]\n${it.text}`).join("\n\n");
  const prompt = `Sei un traduttore esperto di Dungeons & Dragons 5ª edizione. Traduci in italiano queste ${items.length} descrizioni di ${KIND_LABELS[kind]}, usando la terminologia ufficiale italiana del gioco (non una traduzione letterale parola per parola).\n\n${examples}Rispondi SOLO con un array JSON di ${items.length} stringhe (il testo tradotto di ciascuna voce), NELLO STESSO ORDINE della lista qui sotto — un elemento per voce, senza aggiungerne o toglierne:\n\n${list}`;
  const raw = await askGemini({ prompt });
  const parsed = parseJsonResponse(raw);
  return Array.isArray(parsed) && parsed.length === items.length ? parsed : null;
}

async function ensureQueueRows(kind, entries, dryRun) {
  const seen = new Set();
  const values = [];
  for (const e of entries) {
    const key = `${e.name}|${e.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    values.push({ kind, name: e.name, source: e.source });
  }
  if (dryRun) {
    console.log(`  [dry-run] ${values.length} voci nella coda di lavoro (inserite solo se mancanti).`);
    return;
  }
  const chunkSize = 500;
  for (let i = 0; i < values.length; i += chunkSize) {
    await db.insert(compendioTraduzioniIa).values(values.slice(i, i + chunkSize)).onConflictDoNothing();
  }
}

async function applyOfficialShortcut(kind, officialTable, dryRun) {
  if (!officialTable) return;
  const rows = await db.select().from(officialTable);
  // Solo le righe già abbinate a un nome inglese (fatto da match-english-names.mjs).
  const matched = rows.filter((r) => r.nomeInglese && r.fonteInglese);
  console.log(`  Scorciatoia testo ufficiale: ${matched.length}/${rows.length} righe abbinate a un nome inglese.`);
  for (const row of matched) {
    const descrizioneIta = officialDescrizione(kind, row);
    if (dryRun) continue;
    await db
      .update(compendioTraduzioniIa)
      .set({ nomeIta: row.nome, descrizioneIta, updatedAt: new Date() })
      .where(
        and(
          eq(compendioTraduzioniIa.kind, kind),
          eq(compendioTraduzioniIa.name, row.nomeInglese),
          eq(compendioTraduzioniIa.source, row.fonteInglese),
        ),
      );
  }
}

async function sampleFewShot(officialTable, limit = 15) {
  if (!officialTable) return [];
  const rows = await db.select().from(officialTable).limit(200);
  const named = rows.filter((r) => r.nomeInglese);
  const sample = named.slice(0, limit);
  return sample.map((r) => [r.nomeInglese, r.nome]);
}

const NAME_BATCH_SIZE = 250;
const DESCRIPTION_CHAR_BUDGET = 8000;
const CALL_DELAY_MS = 1500;

async function translateNamesForCategory(kind, dryRun) {
  const pending = await db
    .select()
    .from(compendioTraduzioniIa)
    .where(and(eq(compendioTraduzioniIa.kind, kind), isNull(compendioTraduzioniIa.nomeIta)));
  if (pending.length === 0) {
    console.log(`  Nomi: niente da fare.`);
    return;
  }
  console.log(`  Nomi: ${pending.length} da tradurre.`);
  const fewShot = await sampleFewShot(CATEGORIES[kind].officialTable);

  for (let i = 0; i < pending.length; i += NAME_BATCH_SIZE) {
    const batch = pending.slice(i, i + NAME_BATCH_SIZE);
    console.log(`  Nomi: batch ${i / NAME_BATCH_SIZE + 1} (${batch.length} voci)...`);
    const result = await translateNamesBatch(kind, batch.map((r) => r.name), fewShot);
    if (!result) {
      console.log(`  Nomi: IA non disponibile (quota esaurita o errore) — mi fermo qui per oggi.`);
      return;
    }
    let ok = 0;
    for (const row of batch) {
      const nomeIta = result[row.name];
      if (!nomeIta || typeof nomeIta !== "string") continue;
      ok++;
      if (!dryRun) {
        await db
          .update(compendioTraduzioniIa)
          .set({ nomeIta, updatedAt: new Date() })
          .where(and(eq(compendioTraduzioniIa.kind, kind), eq(compendioTraduzioniIa.name, row.name), eq(compendioTraduzioniIa.source, row.source)));
      }
    }
    console.log(`  Nomi: ${ok}/${batch.length} tradotti in questo batch.`);
    await sleep(CALL_DELAY_MS);
  }
}

async function translateDescriptionsForCategory(kind, rawByKey, dryRun) {
  if (kind === "classi") {
    console.log(`  Descrizioni: nessun testo descrittivo per le classi in questo loader, saltato.`);
    return;
  }
  const pending = await db
    .select()
    .from(compendioTraduzioniIa)
    .where(and(eq(compendioTraduzioniIa.kind, kind), isNull(compendioTraduzioniIa.descrizioneIta)));
  if (pending.length === 0) {
    console.log(`  Descrizioni: niente da fare.`);
    return;
  }
  console.log(`  Descrizioni: ${pending.length} da tradurre.`);
  const fewShot = await sampleFewShot(CATEGORIES[kind].officialTable, 5);

  let batch = [];
  let batchChars = 0;
  let batchNum = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    batchNum++;
    console.log(`  Descrizioni: batch ${batchNum} (${batch.length} voci, ~${batchChars} caratteri)...`);
    const translations = await translateDescriptionsBatch(kind, batch, fewShot);
    if (!translations) {
      console.log(`  Descrizioni: IA non disponibile (quota esaurita o errore) — mi fermo qui per oggi.`);
      batch = [];
      throw new StopForToday();
    }
    for (let i = 0; i < batch.length; i++) {
      if (dryRun) continue;
      await db
        .update(compendioTraduzioniIa)
        .set({ descrizioneIta: translations[i] ?? "", updatedAt: new Date() })
        .where(and(eq(compendioTraduzioniIa.kind, kind), eq(compendioTraduzioniIa.name, batch[i].name), eq(compendioTraduzioniIa.source, batch[i].source)));
    }
    console.log(`  Descrizioni: ${batch.length} tradotte in questo batch.`);
    batch = [];
    batchChars = 0;
    await sleep(CALL_DELAY_MS);
  };

  class StopForToday extends Error {}

  try {
    for (const row of pending) {
      const raw = rawByKey.get(`${row.name}|${row.source}`);
      const text = raw ? englishText(kind, raw) : "";
      if (!text) {
        if (!dryRun) {
          await db
            .update(compendioTraduzioniIa)
            .set({ descrizioneIta: "", updatedAt: new Date() })
            .where(and(eq(compendioTraduzioniIa.kind, kind), eq(compendioTraduzioniIa.name, row.name), eq(compendioTraduzioniIa.source, row.source)));
        }
        continue;
      }
      if (batchChars + text.length > DESCRIPTION_CHAR_BUDGET && batch.length > 0) {
        await flush();
      }
      batch.push({ name: row.name, source: row.source, text });
      batchChars += text.length;
    }
    await flush();
  } catch (err) {
    if (!(err instanceof StopForToday)) throw err;
  }
}

async function runCategory(kind, { dryRun, namesOnly, descriptionsOnly }) {
  const { loadEnglish, officialTable } = CATEGORIES[kind];
  console.log(`\n=== ${KIND_LABELS[kind]} ===`);
  console.log(`  Scarico dati inglesi...`);
  const entries = await loadEnglish();
  console.log(`  ${entries.length} voci trovate.`);

  await ensureQueueRows(kind, entries, dryRun);
  await applyOfficialShortcut(kind, officialTable, dryRun);

  if (!descriptionsOnly) await translateNamesForCategory(kind, dryRun);
  if (!namesOnly) {
    const rawByKey = new Map(entries.map((e) => [`${e.name}|${e.source}`, e]));
    await translateDescriptionsForCategory(kind, rawByKey, dryRun);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const namesOnly = args.includes("--names-only");
  const descriptionsOnly = args.includes("--descriptions-only");
  const only = args.find((a) => !a.startsWith("--"));

  const keys = only ? [only] : Object.keys(CATEGORIES);
  for (const key of keys) {
    if (!CATEGORIES[key]) {
      console.error(`Categoria sconosciuta: ${key}. Valide: ${Object.keys(CATEGORIES).join(", ")}`);
      continue;
    }
    await runCategory(key, { dryRun, namesOnly, descriptionsOnly });
  }
  console.log("\nFatto (per questa esecuzione — rilancia lo script per continuare da dove si è fermato).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
