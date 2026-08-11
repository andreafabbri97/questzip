// Regole vere del Manuale del Giocatore (non incantesimi/razze/classi/oggetti, già estratti
// altrove): Capitolo 6 "Opzioni di Personalizzazione" (multiclasse), Capitolo 7 "Usare i
// Punteggi di Caratteristica", Capitolo 8 "All'Avventura", Capitolo 9 "Combattimento",
// Capitolo 10 "Magia" (regole generali, non la lista incantesimi del Cap. 11), Appendice A
// "Condizioni". A differenza di Regole Principali/Costa della Spada (OCR da scansioni, vedi
// parse-regole.mjs), qui il testo è digitale VERO — stessa qualità del resto del compendio,
// quindi niente badge "scansionato" e una sezione per CAPITOLO (non per pagina): il confine
// capitolo è affidabile (verificato manualmente contro l'indice), i sotto-titoli interni
// invece soffrono della stessa frammentazione small-caps vista altrove nella pipeline
// ("PU NTEGGI" invece di "PUNTEGGI") — troppo rumorosa per un rilevamento automatico
// affidabile, quindi un capitolo intero resta un'unica sezione ricercabile per testo.
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

function cleanPage(raw) {
  return (raw ?? "")
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (!t) return false;
      if (/^CAPITOLO\s*\d/i.test(t)) return false; // intestazione di pagina ripetuta
      if (/^APPENDICE\s*[A-Z]\s*[:�]/i.test(t) && t.length < 40) return false;
      if (/^\d{1,3}$/.test(t)) return false; // numero di pagina isolato
      return true;
    })
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// Ogni capitolo apre con un capolettera decorativo (prima lettera enorme, resto della prima
// parola/riga in small-caps) — l'estrazione perde SEMPRE quella prima lettera (e a volte lascia
// un glifo decorativo spurio su una riga a sé, es. "•"/"r") perché il capolettera è un elemento
// grafico separato dal flusso di testo normale del PDF, non un carattere nel font small-caps
// come il resto della riga. Pattern verificato a mano su tutti e 6 i capitoli (non un'euristica
// generica applicata alla cieca): ogni prima riga sostituita per intero con quella corretta.
const FIRST_LINE_FIXES = {
  "Capitolo 6: Opzioni di Personalizzazione": [
    "ENTRE LA COMBINAZIONE DI PUNTEGGI DI ",
    "MENTRE LA COMBINAZIONE DI PUNTEGGI DI ",
  ],
  "Capitolo 7: Usare i Punteggi di Caratteristica": [
    "E S E I CARATTERISTICHE FORNISCONO UNA DESCRIZIONE ",
    "LE SEI CARATTERISTICHE FORNISCONO UNA DESCRIZIONE ",
  ],
  "Capitolo 9: Combattimento": ["L CLANGORE DI UNA SPADA CHE COZZA CONTRO ", "IL CLANGORE DI UNA SPADA CHE COZZA CONTRO "],
  "Capitolo 10: Magia": ["A MAGIA PERMEA I MONDI DI D&D E SI MANIFESTA ", "LA MAGIA PERMEA I MONDI DI D&D E SI MANIFESTA "],
  "Appendice A: Condizioni": [
    "E CONDIZIONI ALTERANO LE CAPACITÀ DI UNA ",
    "LE CONDIZIONI ALTERANO LE CAPACITÀ DI UNA ",
  ],
};
// Capitolo 8 ha anche una riga decorativa spuria ("•") subito prima del capolettera perso.
const STRAY_DECORATION_LINES = new Set(["•", "r"]);

const sections = CHAPTERS.map(({ titolo, start, end }) => {
  let testo = data.pages
    .slice(start, end)
    .map((p) => cleanPage(p.text))
    .filter(Boolean)
    .join("\n\n");

  const lines = testo.split("\n");
  while (lines.length && STRAY_DECORATION_LINES.has(lines[0].trim())) lines.shift();
  const fix = FIRST_LINE_FIXES[titolo];
  if (fix && lines[0] === fix[0]) lines[0] = fix[1];
  if (titolo === "Capitolo 8: All'Avventura" && lines[0] === "VVENTURARSI NELL'ANTICA TOM BA DEGLI ORRORI, ") {
    lines[0] = "AVVENTURARSI NELL'ANTICA TOMBA DEGLI ORRORI, ";
  }
  testo = lines.join("\n");

  return { titolo, testo, pagina: start + 1, fonte: "phb_regole" };
});

const outPath = path.join(PARSED_DIR, "phb-regole.json");
writeFileSync(outPath, JSON.stringify(sections, null, 2), "utf-8");
for (const s of sections) console.log(`${s.titolo}: ${s.testo.length} caratteri`);
console.log(`-> ${outPath}`);
