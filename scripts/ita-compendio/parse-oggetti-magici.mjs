// Catalogo "OGGETTI MAGICI A-Z" del Manuale del DM italiano, scoperto per caso dentro un PDF
// privato che sembrava solo un estratto inglese del "Book of Many Things" (vedi
// parse-oggetti-magici-flavor.mjs per le pagine 0-7, in inglese). Le pagine 8+ sono invece
// screenshot del vero Manuale del DM italiano — leggibili via OCR nonostante il Manuale del DM
// digitale abbia il font offuscato (problema completamente aggirato: qui si legge l'immagine
// resa, non il font).
//
// A differenza degli incantesimi (estratti da testo digitale pulito riga per riga), qui il
// testo arriva dall'OCR con `paragraph=True`: ogni voce è di solito UN SOLO blocco continuo
// "NOME <categoria>, <rarità> [(richiede sintonia)] <descrizione>", senza interruzioni di riga
// affidabili fra nome/campi/descrizione. Il parser quindi non cerca righe separate come per gli
// incantesimi, ma individua dentro ogni blocco il punto dove inizia "<categoria>, <rarità>" e
// usa quella posizione per separare nome (prima) da descrizione (dopo).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const MIN_ITEM_PAGE = 8; // 0-based: pagine 0-7 sono l'estratto inglese (vedi sopra)

const CATEGORY_RE =
  /(Oggetto meraviglioso|Armatura|Arma|Anello|Bastone|Bacchetta|Verga|Munizioni|Scudo|Pozione|Pergamena)(\s*\([^)]{1,40}\))?/i;
const RARITY_RE = /(molto rar[oa]|rar[oa]|non comune|comune|leggendari[oa]|rarit[aà]\s*variabile|artefatto)/i;
// "<categoria>[,;]? <rarità>" ravvicinati: è l'apertura standard di ogni scheda oggetto 5e
const HEADER_RE = new RegExp(`${CATEGORY_RE.source}[,;]?\\s*${RARITY_RE.source}`, "i");

const STOPWORDS = new Set(["di", "del", "della", "dei", "delle", "e", "o", "a", "il", "la", "le", "i", "gli", "lo", "da", "in", "su", "con", "per"]);

// stessa euristica dei parser precedenti (incantesimi/mostri): 0/1 dentro una parola sono quasi
// sempre O/I storpiati dal riconoscimento, mai cifre vere in un nome
function fixDigitLetterConfusion(raw) {
  return raw
    .split(/(\s+)/)
    .map((token) => (/[a-zà-ÿ]/i.test(token) ? token.replace(/0/g, "o").replace(/1/g, "i") : token))
    .join("");
}

// artefatto ricorrente specifico di questo OCR: la elle minuscola/I maiuscola scambiata per la
// cifra 1 in contesti numerici ("+l" invece di "+1", "Id6" invece di "1d6") — l'inverso del
// problema 0/1→o/i già visto nei nomi, quindi un fix separato e mirato solo a questi due
// pattern inequivocabili (mai parole italiane vere).
function fixNumericOcr(text) {
  return text
    .replace(/\+l\b/g, "+1")
    .replace(/-l\b/g, "-1")
    .replace(/\bId(\d)/g, "1d$1");
}

function titleCaseItalian(raw) {
  const words = fixDigitLetterConfusion(raw).trim().toLowerCase().split(/\s+/).filter(Boolean);
  return words
    .map((w, i) => {
      if (i > 0 && STOPWORDS.has(w)) return w;
      return w.replace(/(^|[-'])([a-zà-ÿ])/g, (m, sep, letter) => sep + letter.toUpperCase());
    })
    .join(" ");
}

function isPageFurnitureNoise(block) {
  // intestazioni/indici di pagina: righe corte con più nomi in Capital Case senza punteggiatura
  // di frase, o numeri di pagina/capitolo isolati (già scartati altrove per lunghezza minima,
  // qui si scartano quelli abbastanza lunghi da superarla comunque)
  if (/^CAPITOLO\s+\d/i.test(block.trim())) return true;
  if (block.length < 200 && !/[.:]/.test(block) && HEADER_RE.test(block) === false) return true;
  return false;
}

function parsePage(pageText) {
  const blocks = pageText.split("\n").map((b) => b.trim()).filter(Boolean);
  const items = [];
  for (const block of blocks) {
    if (block.length < 40) continue;
    const match = block.match(HEADER_RE);
    if (!match || match.index === undefined) continue;
    if (isPageFurnitureNoise(block)) continue;

    const namePart = block.slice(0, match.index).trim();
    if (!namePart || namePart.length > 60) continue; // nome troppo lungo = probabile falso positivo

    let rest = block.slice(match.index + match[0].length).trim();
    const sintoniaMatch = rest.match(/^\(?\s*richiede sintonia[^)]*\)?/i);
    const sintonia = Boolean(sintoniaMatch);
    if (sintoniaMatch) rest = rest.slice(sintoniaMatch[0].length).trim();

    const categoria = titleCaseItalian(match[1]) + (match[2] ? ` ${match[2].trim()}` : "");
    const rarita = match[3].toLowerCase().replace(/\s+/g, " ");

    items.push({
      nome: titleCaseItalian(namePart),
      categoria,
      rarita,
      sintonia,
      descrizione: fixNumericOcr(rest),
      fonte: "oggetti_magici",
    });
  }
  return items;
}

function main() {
  const data = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, "oggetti_magici.json"), "utf-8"));
  const items = data.pages
    .filter((p) => p.page >= MIN_ITEM_PAGE)
    .flatMap((p) => parsePage(p.text ?? ""));

  // alcune voci si spezzano fra pagine consecutive (l'ultimo blocco di una pagina continua
  // nella prima riga della successiva): non gestito qui, restano descrizioni troncate — meglio
  // segnalarle come sospette che tentare di ricucire pagine con un'euristica fragile
  mkdirSync(PARSED_DIR, { recursive: true });
  const outPath = path.join(PARSED_DIR, "oggetti_magici-oggetti.json");
  writeFileSync(outPath, JSON.stringify(items, null, 2), "utf-8");

  console.log(`${items.length} oggetti magici trovati -> ${outPath}`);
  const suspicious = items.filter((i) => i.descrizione.length < 30 || i.nome.length < 3);
  console.log(`voci sospette (descrizione troppo corta o nome troppo corto): ${suspicious.length}`);
  if (suspicious.length > 0) {
    console.log(suspicious.slice(0, 15).map((i) => i.nome).join(", "));
  }
}

main();
