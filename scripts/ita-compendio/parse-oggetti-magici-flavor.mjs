// "Oggetti Magici (Dm e Book of many things).pdf" è in realtà un file misto: le pagine 0-7
// sono un estratto INGLESE del supplement "Book of Many Things" (screenshot di bassa qualità),
// le pagine 8+ sono il vero catalogo italiano "OGGETTI MAGICI A-Z" del Manuale del DM,
// gestito invece da parse-oggetti-magici.mjs (parser strutturato nome/categoria/rarità/
// descrizione, caricato in compendio_ita_oggetto). Questo script si limita quindi alle sole
// pagine 0-7: le schede oggetto inglesi che contengono esistono già, pulite e complete, nel
// tab Oggetti del Compendio (fonte 5etools) — verificato a campione prima di scrivere questo
// script (7 nomi OCR confrontati con items.json del mirror, 5/7 trovati identici, gli altri 2
// leggermente storpiati dall'OCR ma chiaramente gli stessi) — quindi estrae solo il testo di
// ambientazione/consigli per il master intorno agli oggetti (es. "come gestire la ricchezza
// dei giocatori"), che non è coperto altrove.
const MAX_PAGE_INDEX = 7; // 0-based: pagine 0-7 incluse, il resto è il catalogo italiano
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const RARITY_RE_G = /\b(Common|Uncommon|Very Rare|Rare|Legendary|Artifact)\b/gi;
const RARITY_RE = /\b(Common|Uncommon|Very Rare|Rare|Legendary|Artifact)\b/i;
const TYPE_RE = /\b(Wondrous Item|Weapon|Armor|Ring|Wand|Rod|Staff|Potion|Scroll|Ammunition)\b/i;

// Un blocco è una scheda-oggetto (da scartare, già coperta dal tab Oggetti) se all'inizio ha
// "<tipo> ... <rarità>" (apertura standard di ogni scheda 5e), oppure se è una tabella
// riepilogativa nome/rarità (tante parole di rarità ravvicinate, niente prosa vera).
function isItemOrTableBlock(text) {
  const trimmed = text.trim();
  if (/^(Magic Item|Rarity)\b/i.test(trimmed)) return true;
  const rarityMatches = trimmed.match(RARITY_RE_G) ?? [];
  if (rarityMatches.length >= 3) return true;
  const head = trimmed.slice(0, 120);
  return TYPE_RE.test(head) && RARITY_RE.test(head);
}

const STOPWORDS = new Set([
  "This", "That", "These", "Those", "When", "While", "Your", "You", "Once", "Also",
  "Each", "Other", "Some", "Many", "Only", "Even", "Very", "Chapter", "Magic", "Item",
  "Items", "Table", "Wondrous", "Requires", "Attunement", "Following", "Instead",
  "Their", "There", "They", "With", "From", "Into", "About", "After", "Before",
]);

function cleanText(raw) {
  return raw
    .replace(/�/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function dominantKeyword(text) {
  const words = text.match(/\b[A-Z][a-z]{3,}\b/g) ?? [];
  const counts = new Map();
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 1;
  for (const [w, c] of counts) {
    if (c > bestCount) {
      best = w;
      bestCount = c;
    }
  }
  return best;
}

const data = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, "oggetti_magici.json"), "utf-8"));

const pages = data.pages
  .filter((p) => p.page <= MAX_PAGE_INDEX)
  .map((p) => {
    const blocks = (p.text ?? "")
      .split("\n")
      .map(cleanText)
      .filter((b) => b.length >= 60 && !isItemOrTableBlock(b));
    const text = blocks.join("\n\n");
    return { page: p.page + 1, text, keyword: dominantKeyword(text) };
  })
  .filter((p) => p.text.length >= 80);

const sections = [];
let current = null;
for (const p of pages) {
  const sameTopic = current && current.keyword === p.keyword && p.keyword !== null;
  const closeEnough = current && p.page - current.lastPage <= 2;
  if (sameTopic && closeEnough) {
    current.pages.push(p);
    current.lastPage = p.page;
  } else {
    if (current) sections.push(current);
    current = { keyword: p.keyword, pages: [p], firstPage: p.page, lastPage: p.page };
  }
}
if (current) sections.push(current);

const merged = [];
for (const s of sections) {
  if (s.keyword === null && merged.length > 0) {
    const prev = merged[merged.length - 1];
    prev.pages.push(...s.pages);
    prev.lastPage = s.lastPage;
  } else {
    merged.push(s);
  }
}

const out = merged.map((s) => ({
  titolo:
    s.keyword && s.pages.length > 1
      ? `${s.keyword} (pagine ${s.firstPage}-${s.lastPage})`
      : s.keyword
        ? `${s.keyword} (pagina ${s.firstPage})`
        : `Oggetti Magici (pagine ${s.firstPage}-${s.lastPage})`,
  testo: s.pages.map((p) => p.text).join("\n\n"),
  pagina: s.firstPage,
  fonte: "oggetti_magici",
}));

writeFileSync(
  path.join(PARSED_DIR, "oggetti_magici-regole.json"),
  JSON.stringify(out, null, 2),
  "utf-8",
);
console.log(
  `${out.length} sezioni tematiche (da ${pages.length} pagine con testo di ambientazione) -> parsed/oggetti_magici-regole.json`,
);
for (const s of out.slice(0, 25)) console.log(`  ${s.titolo}`);
