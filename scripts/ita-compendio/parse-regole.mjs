// Contenuto di regole generali (non incantesimi/mostri/razze/classi): le "Regole principali".
// Il PDF è una scansione pura senza text layer, estratta via OCR (ocr_extract_pdf.py, easyocr) —
// qualità nettamente inferiore al resto del compendio (che legge testo vero dai PDF, non lo
// riconosce da un'immagine), quindi qui NON si tenta un parsing per sezione: il testo OCR è
// troppo rumoroso per un rilevamento affidabile dei titoli dei paragrafi (i titoli finiscono
// spesso incollati al testo del corpo dallo stesso OCR). Si tiene una sezione per pagina, con
// una pulizia minima.
//
// La "Guida agli Avventurieri della Costa della Spada" passava di qui anche lei. Ora si legge
// con l'OCR di Windows, che dà la posizione delle parole, e le sezioni le fa
// sezioni-costa-spada.mjs: rilanciare questo script su quel libro riscriverebbe
// parsed/costa_spada-regole.json nella forma vecchia, una sezione per pagina.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const BOOKS = {
  regole_base: "Regole Principali",
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
