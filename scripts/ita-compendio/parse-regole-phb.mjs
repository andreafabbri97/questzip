// Regole vere del Manuale del Giocatore (non incantesimi/razze/classi/oggetti, già estratti
// altrove): Capitolo 6 "Opzioni di Personalizzazione" (multiclasse), Capitolo 7 "Usare i
// Punteggi di Caratteristica", Capitolo 8 "All'Avventura", Capitolo 9 "Combattimento",
// Capitolo 10 "Magia" (regole generali, non la lista incantesimi del Cap. 11), Appendice A
// "Condizioni". A differenza di Regole Principali/Costa della Spada (OCR da scansioni, vedi
// parse-regole.mjs), qui il testo è digitale VERO — stessa qualità del resto del compendio,
// quindi niente badge "scansionato" e una sezione per CAPITOLO (non per pagina): il confine
// capitolo è affidabile (verificato manualmente contro l'indice).
//
// RIFLUSSO IN PARAGRAFI (non solo pulizia riga per riga): l'estrazione grezza di 5etools/PyMuPDF
// va a capo a ogni riga VISIVA del PDF (giustificato a due colonne), non a ogni vero paragrafo —
// mostrare quelle righe una sotto l'altra così com'erano (bug segnalato dall'utente con
// screenshot, "sembra copia incolla su un blocco note") non è leggibile. Qui le righe vengono
// invece RICOMPOSTE in paragrafi fluidi: si accumulano finché non si incontra un vero punto
// elenco ("•", glifo reale nel testo, non un'euristica indovinata) o il cambio di pagina, con un
// controllo di continuità tra pagine (se la pagina successiva inizia con una minuscola, è la
// prosecuzione dello stesso paragrafo interrotto dal salto pagina, non un paragrafo nuovo).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

// Confini 0-based verificati contro l'indice del libro (extracted/phb.json: l'indice di pagina
// del JSON combacia 1:1 col numero di pagina stampato per queste pagine).
const CHAPTERS = [
  { titolo: "Capitolo 6: Opzioni di Personalizzazione", start: 163, end: 173 },
  { titolo: "Capitolo 7: Usare i Punteggi di Caratteristica", start: 173, end: 181 },
  { titolo: "Capitolo 8: All'Avventura", start: 181, end: 189 },
  { titolo: "Capitolo 9: Combattimento", start: 189, end: 201 },
  { titolo: "Capitolo 10: Magia", start: 201, end: 207 },
  { titolo: "Appendice A: Condizioni", start: 290, end: 293 },
];

const data = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, "phb.json"), "utf-8"));

// Righe da scartare del tutto: intestazioni di pagina ripetute, numeri di pagina isolati, e un
// singolo glifo decorativo "•"/"r" lasciato dal capolettera del capitolo (non un vero elenco).
// Le intestazioni ripetute ("CAPITOLO N I Titolo") a volte hanno lo stesso artefatto di
// spaziatura small-caps visto altrove nella pipeline ("C A P I TOLO" invece di "CAPITOLO") — un
// confronto sulla riga letterale le lasciava passare, finendo nel mezzo del testo riflussato
// (numeri di pagina compresi, es. "...seguenti: CA PITOLO 6 I OPZION I DI PERSONALIZZAZI O N E 1
// 69"). Bug reale trovato con un audit del testo generato, non a occhio. Confronto sulla versione
// COMPATTA (spazi rimossi), stesso principio già in uso in parse-mostri.mjs/parse-talenti.mjs per
// lo stesso artefatto.
function isNoise(line) {
  const t = line.trim();
  if (!t) return true;
  const compact = t.replace(/\s+/g, "");
  if (/^CAPITOLO\d/i.test(compact)) return true;
  if (/^APPENDICE[A-Z]/i.test(compact) && compact.length < 40) return true;
  if (/^\d{1,3}$/.test(t)) return true;
  if (t === "•" || t === "r") return true;
  return false;
}

// Ogni pagina diventa una lista di "blocchi" (paragrafo o punto elenco), riflludendo le righe
// visive del PDF in prosa continua tramite spazi invece che a-capo.
function pageBlocks(raw) {
  const lines = (raw ?? "").split("\n").filter((l) => !isNoise(l));
  const blocks = []; // { type: "p" | "li", text }
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const isBullet = line.startsWith("•");
    const content = (isBullet ? line.slice(1) : line).trim();
    if (isBullet) {
      blocks.push({ type: "li", text: content });
    } else if (blocks.length > 0) {
      blocks[blocks.length - 1].text += (blocks[blocks.length - 1].text.endsWith("-") ? "" : " ") + content;
    } else {
      blocks.push({ type: "p", text: content });
    }
  }
  return blocks;
}

function assembleChapter(start, end) {
  const allBlocks = [];
  for (let i = start; i < end; i++) {
    const pageBlk = pageBlocks(data.pages[i].text);
    if (pageBlk.length === 0) continue;
    // Continuità tra pagine: se il primo blocco della pagina inizia con una minuscola, è la
    // prosecuzione del blocco con cui la pagina precedente si era interrotta (stesso tipo).
    const prev = allBlocks[allBlocks.length - 1];
    const first = pageBlk[0];
    if (prev && prev.type === first.type && /^[a-zàèéìòù]/.test(first.text)) {
      prev.text += " " + first.text;
      allBlocks.push(...pageBlk.slice(1));
    } else {
      allBlocks.push(...pageBlk);
    }
  }

  // Righe "- voce" consecutive raggruppate in un unico blocco elenco (separate da "\n" semplice,
  // così RegoleTesto le riconosce come lista); i paragrafi restano separati da riga vuota.
  const parts = [];
  let liBuffer = [];
  const flushLi = () => {
    if (liBuffer.length) {
      parts.push(liBuffer.map((t) => `- ${t}`).join("\n"));
      liBuffer = [];
    }
  };
  for (const b of allBlocks) {
    if (b.type === "li") {
      liBuffer.push(b.text);
    } else {
      flushLi();
      parts.push(b.text);
    }
  }
  flushLi();
  return parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
}

// Ogni capitolo apre con un capolettera decorativo (prima lettera enorme, resto della prima
// parola/riga in small-caps) — l'estrazione perde SEMPRE quella prima lettera perché il
// capolettera è un elemento grafico separato dal flusso di testo normale del PDF. Pattern
// verificato a mano su tutti e 6 i capitoli (non un'euristica generica applicata alla cieca):
// sostituzione del PREFISSO del primo paragrafo (non più dell'intera prima riga, dato che ora le
// righe sono riaccorpate in blocchi di prosa).
const FIRST_WORD_FIXES = {
  "Capitolo 6: Opzioni di Personalizzazione": ["ENTRE", "MENTRE"],
  "Capitolo 7: Usare i Punteggi di Caratteristica": ["E S E I", "LE SEI"],
  "Capitolo 8: All'Avventura": ["VVENTURARSI", "AVVENTURARSI"],
  "Capitolo 9: Combattimento": ["L CLANGORE", "IL CLANGORE"],
  "Capitolo 10: Magia": ["A MAGIA", "LA MAGIA"],
  "Appendice A: Condizioni": ["E CONDIZIONI", "LE CONDIZIONI"],
};

const sections = CHAPTERS.map(({ titolo, start, end }) => {
  let testo = assembleChapter(start, end);
  const fix = FIRST_WORD_FIXES[titolo];
  if (fix && testo.startsWith(fix[0])) testo = fix[1] + testo.slice(fix[0].length);
  // Artefatto residuo del capolettera del Cap. 8, dentro la stessa prima parola.
  testo = testo.replace("TOM BA DEGLI ORRORI", "TOMBA DEGLI ORRORI");
  return { titolo, testo, pagina: start + 1, fonte: "phb_regole" };
});

const outPath = path.join(PARSED_DIR, "phb-regole.json");
writeFileSync(outPath, JSON.stringify(sections, null, 2), "utf-8");
for (const s of sections) console.log(`${s.titolo}: ${s.testo.length} caratteri`);
console.log(`-> ${outPath}`);
