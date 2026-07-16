// Talenti (Feats) dal Manuale del Giocatore italiano — capitolo "TALENTI" (Cap. 6), testo
// digitale pulito come per incantesimi/classi (extract_pdf.py, non OCR). Formato: NOME TALENTO
// (tutto maiuscolo, spesso con spazi indebiti in mezzo per via del rendering small-caps, es.
// "C E C CHINO MAGICO" invece di "CECCHINO MAGICO" — stesso artefatto già visto per classi/
// incantesimi) seguito opzionalmente da "Prerequisito: ..." e poi la descrizione.
//
// A differenza degli incantesimi non c'è un secondo sottotitolo affidabile ("di N° livello")
// per ancorare l'inizio scheda: qui l'unico segnale è "riga tutta maiuscola, abbastanza corta,
// seguita da prosa in minuscolo". Non serve però correggere gli spazi indebiti nel nome: il
// confronto con il nome inglese tradotto (in app/compendio/page.tsx) normalizza già togliendo
// spazi e accenti (normalizeItaName), quindi "C E C CHINO MAGICO" e "Cecchino Magico" combaciano
// comunque — qui si ripulisce solo per leggibilità, senza inseguire la spaziatura perfetta.
//
// Uso: node parse-talenti.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const CHAPTER_START_RE = /^TALENTI\s*$/;
const CHAPTER_END_RE = /^CAPITOLO\s*7/i;

const STOPWORDS = new Set(["di", "del", "della", "dei", "delle", "e", "o", "a", "il", "la", "le", "i", "gli", "lo", "da", "in", "su", "con", "per"]);

function fixDigitLetterConfusion(raw) {
  return raw
    .split(/(\s+)/)
    .map((token) => (/[a-zà-ÿ]/i.test(token) ? token.replace(/0/g, "o").replace(/1/g, "i") : token))
    .join("");
}

function titleCaseItalian(raw) {
  const words = fixDigitLetterConfusion(raw).replace(/\s+/g, " ").trim().toLowerCase().split(" ").filter(Boolean);
  return words
    .map((w, i) => (i > 0 && STOPWORDS.has(w) ? w : w.replace(/(^|[-'])([a-zà-ÿ])/g, (m, sep, l) => sep + l.toUpperCase())))
    .join(" ");
}

// una riga-titolo è (quasi) tutta maiuscola, abbastanza corta, e non un'intestazione di
// pagina/capitolo o un numero isolato. Il controllo di esclusione lavora sulla versione
// "compatta" (senza spazi) perché lo stesso artefatto che spezza i nomi dei talenti
// ("C E C CHINO") spezza allo stesso modo le intestazioni ricorrenti di pagina.
function isHeadingCandidate(line) {
  const compact = line.replace(/[^A-Za-zÀ-Ý']/g, "");
  if (compact.length < 4 || compact.length > 40) return false;
  if (compact !== compact.toUpperCase()) return false;
  if (/^\d+$/.test(line.trim())) return false;
  if (/CAPITOLO|TALENTI|OPZIONIDIPERSONALIZZAZIONE/i.test(compact)) return false;
  return true;
}

function loadFeatLines(bookKey) {
  const raw = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, `${bookKey}.json`), "utf-8"));
  const lines = [];
  let inChapter = false;
  for (const page of raw.pages) {
    for (const rawLine of page.text.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      if (!inChapter) {
        if (CHAPTER_START_RE.test(line)) inChapter = true;
        continue;
      }
      if (CHAPTER_END_RE.test(line)) return lines;
      lines.push(line);
    }
  }
  return lines;
}

function findHeadings(lines) {
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    if (!isHeadingCandidate(lines[i])) continue;
    // un titolo vero è seguito da prosa vera (maiuscola o minuscola, le frasi italiane iniziano
    // spesso con maiuscola) — l'unico segnale utile è che la riga dopo NON sia a sua volta tutta
    // maiuscola (che sarebbe più probabilmente un titolo che va a capo su due righe fisiche)
    const next = lines[i + 1] ?? "";
    if (!next || isHeadingCandidate(next)) continue;
    headings.push({ lineIndex: i, nome: titleCaseItalian(lines[i]) });
  }
  return headings;
}

function extractFeat(lines, start, end) {
  let prerequisito = "";
  let bodyStart = start;
  if (/^prerequisito/i.test(lines[start] ?? "")) {
    prerequisito = lines[start].replace(/^prerequisito\s*:\s*/i, "");
    bodyStart = start + 1;
  }
  const bodyLines = lines.slice(bodyStart, end);
  const paragraphs = [];
  for (const line of bodyLines) {
    const startsNewParagraph = /^•/.test(line) || paragraphs.length === 0;
    if (startsNewParagraph) paragraphs.push(line);
    else paragraphs[paragraphs.length - 1] += " " + line;
  }
  return { prerequisito, descrizione: paragraphs.join("\n\n") };
}

function main() {
  const lines = loadFeatLines("phb");
  const headings = findHeadings(lines);

  const feats = headings.map((h, idx) => {
    const bodyStart = h.lineIndex + 1;
    const bodyEnd = idx + 1 < headings.length ? headings[idx + 1].lineIndex : lines.length;
    const { prerequisito, descrizione } = extractFeat(lines, bodyStart, bodyEnd);
    return { nome: h.nome, prerequisito, descrizione, fonte: "phb" };
  });

  mkdirSync(PARSED_DIR, { recursive: true });
  const outPath = path.join(PARSED_DIR, "phb-talenti.json");
  writeFileSync(outPath, JSON.stringify(feats, null, 2), "utf-8");

  console.log(`${feats.length} talenti trovati -> ${outPath}`);
  const suspicious = feats.filter((f) => f.descrizione.length < 20);
  console.log(`voci sospette (descrizione troppo corta): ${suspicious.length}`);
  if (suspicious.length > 0) console.log(suspicious.map((f) => f.nome).join(", "));
  console.log(feats.map((f) => f.nome).join(", "));
}

main();
