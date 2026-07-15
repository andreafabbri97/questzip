// Costa della Spada resta testo OCR grezzo (164 pagine di lore/nomi propri, non riscrivibile
// a mano come le Regole Principali) ma raggruppato per argomento invece che per pagina: si
// individua il nome proprio più ricorrente su ogni pagina (luoghi, fazioni, capitoli) e si
// uniscono le pagine consecutive che condividono lo stesso argomento dominante in un'unica
// sezione. Euristica, non perfetta (l'OCR rumoroso rovina spesso i nomi propri), ma molto
// meglio di "pagina 47" per orientarsi.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const STOPWORDS = new Set([
  "Costa", "Spada", "Guida", "Degli", "Avventurieri", "Della", "Dungeons", "Dragons",
  "Capitolo", "Questo", "Questa", "Quando", "Questi", "Queste", "Tabella", "Alla",
  "Sono", "Come", "Loro", "Ogni", "Anche", "Altri", "Altre", "Molti", "Molte",
]);

function cleanText(raw) {
  return raw
    .replace(/�/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function dominantKeyword(text) {
  const words = text.match(/\b[A-ZÀ-Ý][a-zà-ÿ]{3,}\b/g) ?? [];
  const counts = new Map();
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  let best = null;
  let bestCount = 1; // richiede almeno 2 occorrenze per essere un tema, non un accenno isolato
  for (const [w, c] of counts) {
    if (c > bestCount) {
      best = w;
      bestCount = c;
    }
  }
  return best;
}

const data = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, "costa_spada.json"), "utf-8"));
const pages = data.pages
  .map((p) => ({ page: p.page + 1, text: cleanText(p.text ?? ""), keyword: dominantKeyword(p.text ?? "") }))
  .filter((p) => p.text.length >= 80);

const sections = [];
let current = null;
for (const p of pages) {
  const sameTopic = current && current.keyword === p.keyword && p.keyword !== null;
  const closeEnough = current && p.page - current.lastPage <= 2; // tollera 1 pagina "muta" in mezzo
  if (sameTopic && closeEnough) {
    current.pages.push(p);
    current.lastPage = p.page;
  } else {
    if (current) sections.push(current);
    current = { keyword: p.keyword, pages: [p], firstPage: p.page, lastPage: p.page };
  }
}
if (current) sections.push(current);

// unisce le sezioni senza un argomento dominante chiaro (keyword null) alla sezione precedente,
// invece di creare tante mini-sezioni "senza titolo" da una pagina sola
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
        : `Costa della Spada (pagine ${s.firstPage}-${s.lastPage})`,
  testo: s.pages.map((p) => p.text).join("\n\n"),
  pagina: s.firstPage,
  fonte: "costa_spada",
}));

writeFileSync(path.join(PARSED_DIR, "costa_spada-regole.json"), JSON.stringify(out, null, 2), "utf-8");
console.log(`${out.length} sezioni tematiche (da ${pages.length} pagine) -> parsed/costa_spada-regole.json`);
for (const s of out.slice(0, 25)) console.log(`  ${s.titolo}`);
