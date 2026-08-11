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

// 18 dei 41 talenti avevano lo stesso artefatto di spaziatura già noto altrove nella pipeline
// (es. "C E C Chino Magico" invece di "Cecchino Magico") — corretto ora alla fonte con un
// dizionario verificato a mano in parse-talenti.mjs (NAME_FIXES), quindi qui sotto le chiavi sono
// già i nomi PULITI. Restano comunque override esplicite (non lasciate alla traduzione
// automatica) perché anche col nome corretto la traduzione letterale spesso non combacia col
// termine ufficiale del feat (es. "Carica" -> "Charge", non "Charger").
const KNOWN_TALENTI_PHB = {
  "abile": "Skilled",
  "carica": "Charger",
  "iniziato alla magia": "Magic Initiate",
  "aggressore selvaggio": "Savage Attacker",
  "combattente a due armi": "Dual Wielder",
  "combattente in sella": "Mounted Combatant",
  "condottiero ispiratore": "Inspiring Leader",
  "corazze leggere": "Lightly Armored",
  "corazze medie": "Moderately Armored",
  "corazze pesanti": "Heavily Armored",
  "cecchino magico": "Spell Sniper",
  "duellante difensivo": "Defensive Duelist",
  "esperto di balestre": "Crossbow Expert",
  "incantatore rituale": "Ritual Caster",
  "incantatore da guerra": "War Caster",
  "linguista": "Linguist",
  "lottatore": "Grappler",
  "lottatore da taverna": "Tavern Brawler",
  "maestro d'armi": "Weapon Master",
  "maestro d'armi possenti": "Great Weapon Master",
  "maestro degli scudi": "Shield Master",
  "maestro delle armature medie": "Medium Armor Master",
  "maestro delle armi su asta": "Polearm Master",
  "mente acuta": "Keen Mind",
  "mobilità": "Mobile",
  "osservatore": "Observant",
  "robusto": "Tough",
  "sterminatore di maghi": "Mage Slayer",
  "tenace": "Durable",
};

// Nomi di incantesimo per cui la traduzione automatica IT->EN produce un sinonimo plausibile ma
// diverso dal nome ufficiale 5etools, quindi né il confronto esatto né quello per somiglianza di
// token (jaccard) riescono a collegarli — stesso principio di KNOWN_TALENTI_PHB sopra, ma qui il
// problema non è spaziatura rotta, è proprio scelta lessicale del traduttore (es. "Deflagrazione
// Occulta" -> "Occult Blast" invece di "Eldritch Blast", zero token in comune con "Eldritch").
// Coppie note per aver rotto tre E2E (compendio-official-names, compendio-cross-source-names,
// mention-name-consistency) quando un reseed ha azzerato il collegamento nomeInglese/fonteInglese
// precedentemente stabilito — prima non c'era un modo per lo script di ricostruirle da solo.
const KNOWN_INCANTESIMI_PHB = {
  "deflagrazione occulta": "Eldritch Blast",
  "fiotto acido": "Acid Splash",
  "punizione collerica": "Wrathful Smite",
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

// La traduzione IT->EN letterale spesso riordina le parole o sceglie un sinonimo diverso dal
// nome ufficiale ("Armatura di Agathys" -> "Agathys armor" invece di "Armor of Agathys",
// "Nystul's Magical Aura" invece di "Nystul's Magic Aura") — un confronto per stringa esatta
// (normalizeName sopra) manca la maggioranza di questi casi. Fallback per token: spezza in
// parole, scarta le più comuni preposizioni/articoli inglesi e appiattisce i plurali più
// semplici (systematic mismatch di sinonimo come "Aiuto"->"Help" invece di "Aid" resta
// volutamente NON abbinato: nessun token in comune, meglio mancare l'abbinamento che rischiare
// di collegare due incantesimi diversi).
const STOPWORDS = new Set(["of", "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "with", "from"]);
// Soglia alta e margine minimo sul secondo classificato di proposito: un nome D&D corto
// ("Fulmine" -> "Lightning") normalizza a un solo token generico condiviso da diversi
// incantesimi veri ("Call Lightning", "Lightning Bolt"...) — abbinare quello sbagliato è
// PEGGIO di non trovare nulla (mostrerebbe il contenuto di un incantesimo diverso). Meglio
// mancare l'abbinamento in caso di ambiguità che rischiare un falso positivo silenzioso.
const FUZZY_THRESHOLD = 0.6;
const FUZZY_MIN_MARGIN = 0.15;
const FUZZY_MIN_TOKENS = 2;

function tokenize(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t));
}

function jaccard(tokensA, tokensB) {
  const a = new Set(tokensA);
  const b = new Set(tokensB);
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return intersection / union;
}

// Un solo indice per token costruito una volta per categoria (non per riga) — findFuzzyMatch
// sotto lo riusa per ogni entry italiana ancora da abbinare.
function buildFuzzyIndex(uniqueEnglishEntries) {
  return uniqueEnglishEntries.map((entry) => ({ entry, tokens: tokenize(entry.name) }));
}

function findFuzzyMatch(translatedName, fuzzyIndex) {
  const targetTokens = tokenize(translatedName);
  if (targetTokens.length < FUZZY_MIN_TOKENS) return null;
  let best = null;
  let bestScore = 0;
  let secondScore = 0;
  for (const { entry, tokens } of fuzzyIndex) {
    const score = jaccard(targetTokens, tokens);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = entry;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  if (bestScore < FUZZY_THRESHOLD) return null;
  if (bestScore - secondScore < FUZZY_MIN_MARGIN) return null;
  return best;
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

async function matchCategory({ label, table, loadEnglish, cache, overrides = {}, dryRun = false }) {
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
  const fuzzyIndex = buildFuzzyIndex([...byName.values()]);

  let matched = 0;
  let fuzzyMatched = 0;
  for (const row of rows) {
    const englishName = await translateItToEn(row.nome, cache, overrides);
    if (!englishName) continue;
    const exact = byName.get(normalizeName(englishName));
    const match = exact ?? findFuzzyMatch(englishName, fuzzyIndex);
    if (match) {
      if (!exact) {
        fuzzyMatched++;
        console.log(`  [fuzzy] "${row.nome}" ("${englishName}") -> "${match.name}" (${match.source})`);
      }
      if (!dryRun) {
        await db
          .update(table)
          .set({ nomeInglese: match.name, fonteInglese: match.source })
          .where(eq(table.id, row.id));
      }
      matched++;
    }
  }
  saveCache(cache);
  console.log(`${label}: ${matched}/${rows.length} abbinati (di cui ${fuzzyMatched} solo per somiglianza di parole)${dryRun ? " [DRY RUN, nulla scritto]" : ""}.`);
}

async function main() {
  const cache = loadCache();
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const only = args.find((a) => !a.startsWith("--"));

  const categories = {
    incantesimi: () =>
      matchCategory({
        label: "Incantesimi",
        table: compendioItaIncantesimi,
        loadEnglish: loadEnglishSpells,
        cache,
        overrides: KNOWN_INCANTESIMI_PHB,
        dryRun,
      }),
    mostri: () =>
      matchCategory({ label: "Mostri", table: compendioItaMostri, loadEnglish: loadEnglishCreatures, cache, dryRun }),
    razze: () =>
      matchCategory({ label: "Razze", table: compendioItaRazze, loadEnglish: loadEnglishRaces, cache, dryRun }),
    classi: () =>
      matchCategory({ label: "Classi", table: compendioItaClassi, loadEnglish: loadEnglishClasses, cache, dryRun }),
    oggetti: () =>
      matchCategory({ label: "Oggetti", table: compendioItaOggetti, loadEnglish: loadEnglishItems, cache, dryRun }),
    talenti: () =>
      matchCategory({
        label: "Talenti",
        table: compendioItaTalenti,
        loadEnglish: loadEnglishFeats,
        cache,
        overrides: KNOWN_TALENTI_PHB,
        dryRun,
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
