// Contenuto di regole generali/lore (non incantesimi/mostri/razze/classi): "Regole
// principali" e "Guida agli Avventurieri della Costa della Spada". Entrambi i PDF sono
// scansioni pure senza text layer, estratte via OCR (ocr_extract_pdf.py, easyocr) — qualità
// nettamente inferiore al resto del compendio (che legge testo vero dai PDF, non lo
// riconosce da un'immagine), quindi qui NON si tenta un parsing per sezione: il testo OCR è
// troppo rumoroso per un rilevamento affidabile dei titoli dei paragrafi (i titoli finiscono
// spesso incollati al testo del corpo dallo stesso OCR). Si tiene una sezione per pagina, con
// una pulizia minima, ed è mostrato in app con un badge esplicito "testo scansionato".
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const BOOKS = {
  regole_base: "Regole Principali",
  costa_spada: "Guida agli Avventurieri della Costa della Spada",
};

function cleanText(raw) {
  return raw
    .replace(/�/g, "'") // il carattere di sostituzione OCR è quasi sempre un apostrofo/accento non riconosciuto
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const key = process.argv[2];
if (!key || !BOOKS[key]) {
  console.error(`Uso: node parse-regole.mjs <${Object.keys(BOOKS).join("|")}>`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, `${key}.json`), "utf-8"));
const sections = [];
for (const { page, text } of data.pages) {
  const cleaned = cleanText(text ?? "");
  if (cleaned.length < 80) continue; // pagina quasi vuota (copertina, separatore, ecc.)
  sections.push({
    titolo: `${BOOKS[key]} — pagina ${page + 1}`,
    testo: cleaned,
    pagina: page + 1,
    fonte: key,
  });
}

const outPath = path.join(PARSED_DIR, `${key}-regole.json`);
writeFileSync(outPath, JSON.stringify(sections, null, 2), "utf-8");
console.log(`${sections.length} sezioni (di ${data.pages.length} pagine) -> ${outPath}`);
