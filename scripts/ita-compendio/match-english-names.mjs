// Abbina ogni entry italiana già nel DB (incantesimi/mostri/razze/classi/oggetti/talenti) con
// la sua controparte inglese di 5etools, per far funzionare la ricerca delle menzioni #Nome in
// chat anche digitando il nome italiano (fino ad ora funzionava solo in inglese).
//
// Stessa tecnica di abbinamento già usata da cross-validate-mostri.mjs — traduce il nome
// ITALIANO in inglese (direzione opposta al resto dell'app, che traduce sempre EN->IT) e lo
// confronta con l'elenco inglese completo della categoria — generalizzata alle altre 5
// categorie e spostata offline: farlo dal vivo per centinaia di candidati ad ogni tasto premuto
// in chat non è praticabile (troppe chiamate all'endpoint di traduzione).
//
// Idempotente: salta le righe che hanno già un nomeInglese (riavviabile in sicurezza se
// interrotto, o per abbinare solo contenuto aggiunto dopo un primo giro).
//
// Uso: node --env-file=../../.env.local match-english-names.mjs [categoria]
//   categoria facoltativa: incantesimi|mostri|razze|classi|oggetti|talenti (default: tutte)

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq, isNull } from "drizzle-orm";
import {
  compendioItaClassi,
  compendioItaIncantesimi,
  compendioItaMostri,
  compendioItaOggetti,
  compendioItaRazze,
  compendioItaTalenti,
} from "../../lib/db/schema.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(SCRIPT_DIR, "translate-cache.json");
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL non impostato. Uso: node --env-file=../../.env.local match-english-names.mjs");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

function loadCache() {
  if (!existsSync(CACHE_PATH)) return {};
  return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
}
function saveCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

// Google Translate rende alcuni termini D&D specifici alla lettera invece che col nome
// ufficiale (es. "Draconide" -> "Draconid" invece di "Dragonborn") — stesso principio del
// piccolo dizionario KNOWN_EN_TO_IT già usato in lib/fivetools/translate.ts per le classi,
// verificato prima ancora di guardare la cache.
const KNOWN_IT_TO_EN = {
  draconide: "Dragonborn",
  // Stesse 13 classi base già note come mal tradotte anche nella direzione EN->IT (vedi
  // KNOWN_EN_TO_IT in lib/fivetools/translate.ts) — mappatura invertita a mano, non affidata a
  // Google Translate per gli stessi identici termini già noti come inaffidabili.
  barbaro: "Barbarian",
  bardo: "Bard",
  chierico: "Cleric",
  druido: "Druid",
  guerriero: "Fighter",
  ladro: "Rogue",
  mago: "Wizard",
  monaco: "Monk",
  paladino: "Paladin",
  stregone: "Sorcerer",
  artefice: "Artificer",
};

// I 41 talenti hanno lo stesso artefatto di spaziatura già noto altrove in questa pipeline
// (es. "C E C Chino Magico" invece di "Cecchino Magico") — tradurre il nome grezzo così com'è
// produce risultati inutilizzabili (Google Translate segmenta sulle parole spezzate). Elenco PHB
// fisso e noto, mappato a mano una volta sola invece di provare a "ripulire" la spaziatura
// (impossibile distinguerla in modo affidabile da una spaziatura multi-parola vera).
const KNOWN_TALENTI_PHB = {
  // Questi tre hanno il nome pulito (nessun artefatto di spaziatura) ma la traduzione
  // automatica letterale non combacia col termine ufficiale del feat (es. "Carica" -> "Charge",
  // non "Charger") — stesso principio degli altri override, non un problema di OCR qui.
  "abile": "Skilled",
  "carica": "Charger",
  "iniziato alla magia": "Magic Initiate",
  "aggre s sore selvaggio": "Savage Attacker",
  "c ombattente a due armi": "Dual Wielder",
  "c ombattente in sella": "Mounted Combatant",
  "c ondottiero i spiratore": "Inspiring Leader",
  "c orazze leggere": "Lightly Armored",
  "c orazze medie": "Moderately Armored",
  "c orazze pesanti": "Heavily Armored",
  "c e c chino magico": "Spell Sniper",
  "duellante d i fensivo": "Defensive Duelist",
  "e sperto di balestre": "Crossbow Expert",
  "incantatore rituale": "Ritual Caster",
  "incantatore da guerra": "War Caster",
  "lingui sta": "Linguist",
  "lottatore": "Grappler",
  "lottatore da taverna": "Tavern Brawler",
  "mae stro d 'armi": "Weapon Master",
  "mae stro d 'armi pos senti": "Great Weapon Master",
  "mae stro degli scudi": "Shield Master",
  "mae stro delle armature medie": "Medium Armor Master",
  "mae stro delle armi su asta": "Polearm Master",
  "mente acuta": "Keen Mind",
  "mobilità": "Mobile",
  "o s servatore": "Observant",
  "robusto": "Tough",
  "sterminatore di maghi": "Mage Slayer",
  "tenace": "Durable",
};

async function translateItToEn(text, cache, overrides = {}) {
  const normalizedKey = text.trim().toLowerCase();
  const override = overrides[normalizedKey];
  if (override) return override;

  const known = KNOWN_IT_TO_EN[normalizedKey];
  if (known) return known;

  const key = `it>en:${text}`;
  if (cache[key]) return cache[key];
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=it&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const segments = data[0] ?? [];
  const translated = segments.map((s) => s[0]).join("");
  if (translated) cache[key] = translated;
  return translated || null;
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

// Stessi identici endpoint di lib/fivetools/data.ts (non importabile qui: usa l'alias "@/" che
// il resolver ESM nativo di Node non capisce, stesso motivo per cui anche gli altri script di
// questa cartella non lo importano) — elenco libri incantesimi/classi tenuto minimo, qui basta
// il pool combinato per la ricerca per nome, non serve filtrare per libro come fa l'app.
async function loadEnglishSpells() {
  const books = [
    "aag", "ai", "aitfr-avt", "bmt", "efa", "egw", "ftd", "frhof",
    "ggr", "idrotf", "llk", "phb", "sato", "scc", "tce", "xge", "xphb",
  ];
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
  return (file?.item ?? []).filter((item) => item.rarity && item.rarity !== "none");
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
  const books = [
    "artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk",
    "mystic", "paladin", "ranger", "rogue", "sidekick", "sorcerer", "warlock", "wizard",
  ];
  const files = await Promise.all(books.map((b) => fetchJson(`${RAW_BASE}/class/class-${b}.json`)));
  return files.flatMap((f) => f?.class ?? []);
}

async function matchCategory({ label, table, loadEnglish, cache, overrides = {} }) {
  const rows = await db.select().from(table).where(isNull(table.nomeInglese));
  if (rows.length === 0) {
    console.log(`${label}: nessuna riga da abbinare (già tutte fatte, o tabella vuota).`);
    return;
  }
  console.log(`${label}: scarico i dati inglesi...`);
  const englishEntries = await loadEnglish();
  console.log(`${label}: ${rows.length} righe italiane da abbinare contro ${englishEntries.length} candidati inglesi.`);

  // A parità di nome, preferisce la fonte "principale" (Manuale del Giocatore, 2014 o 2024)
  // invece di una ristampa/variante minore trovata per prima solo per l'ordine del file JSON —
  // es. "Elfo" esiste anche in fonti minori oltre al PHB, e senza questa preferenza il primo
  // trovato nel file combinato vince a caso.
  const sourceRank = (source) => (source === "PHB" ? 0 : source === "XPHB" ? 1 : 2);
  const byName = new Map();
  for (const entry of englishEntries) {
    const key = normalizeName(entry.name);
    const existing = byName.get(key);
    if (!existing || sourceRank(entry.source) < sourceRank(existing.source)) {
      byName.set(key, entry);
    }
  }

  let matched = 0;
  for (const row of rows) {
    const englishName = await translateItToEn(row.nome, cache, overrides);
    const match = englishName ? byName.get(normalizeName(englishName)) : null;
    if (match) {
      await db
        .update(table)
        .set({ nomeInglese: match.name, fonteInglese: match.source })
        .where(eq(table.id, row.id));
      matched++;
    }
  }
  saveCache(cache);
  console.log(`${label}: ${matched}/${rows.length} abbinati.`);
}

async function main() {
  const cache = loadCache();
  const only = process.argv[2];

  const categories = {
    incantesimi: () =>
      matchCategory({ label: "Incantesimi", table: compendioItaIncantesimi, loadEnglish: loadEnglishSpells, cache }),
    mostri: () =>
      matchCategory({ label: "Mostri", table: compendioItaMostri, loadEnglish: loadEnglishCreatures, cache }),
    razze: () =>
      matchCategory({ label: "Razze", table: compendioItaRazze, loadEnglish: loadEnglishRaces, cache }),
    classi: () =>
      matchCategory({ label: "Classi", table: compendioItaClassi, loadEnglish: loadEnglishClasses, cache }),
    oggetti: () =>
      matchCategory({ label: "Oggetti", table: compendioItaOggetti, loadEnglish: loadEnglishItems, cache }),
    talenti: () =>
      matchCategory({
        label: "Talenti",
        table: compendioItaTalenti,
        loadEnglish: loadEnglishFeats,
        cache,
        overrides: KNOWN_TALENTI_PHB,
      }),
  };

  const keys = only ? [only] : Object.keys(categories);
  for (const key of keys) {
    if (!categories[key]) {
      console.error(`Categoria sconosciuta: ${key}. Valide: ${Object.keys(categories).join(", ")}`);
      continue;
    }
    await categories[key]();
  }
  console.log("Fatto.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
