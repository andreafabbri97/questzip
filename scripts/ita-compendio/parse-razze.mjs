// Estrae le razze dal Manuale del Giocatore. Formato: "TRATTI DEGLI <RAZZA>" (maiuscolo) seguito
// da un paragrafo introduttivo, poi una lista di tratti "Etichetta. Descrizione." sulla stessa
// riga (es. "Età. Gli elfi raggiungono la maturità..."), poi eventuali sottorazze con lo stesso
// schema, introdotte da un titolo TUTTO MAIUSCOLO (es. "ELFO ALTO"). Solo 9 razze nel PHB: a
// differenza di incantesimi/mostri qui l'elenco delle intestazioni è hardcoded (nessun bisogno
// di un'euristica generica per un set così piccolo e noto).
//
// Uso: node parse-razze.mjs <chiave_libro>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const RACE_HEADINGS = [
  { anchor: "TRATTIDEGLIELFI", nome: "Elfo" },
  { anchor: "TRATTIDEGLIHALFLING", nome: "Halfling" },
  { anchor: "TRATTIDEINANI", nome: "Nano" },
  { anchor: "TRATTIDEGLIUMANI", nome: "Umano" },
  { anchor: "TRATTIDEIDRAGONIDI", nome: "Draconide" },
  { anchor: "TRATTIDEGLIGNOMI", nome: "Gnomo" },
  { anchor: "TRATTIDEIMEZZELFI", nome: "Mezzelfo" },
  { anchor: "TRATTIDEIMEZZORCHI", nome: "Mezzorco" },
  { anchor: "TRATTIDEITIEFLING", nome: "Tiefling" },
];

// stessa corruzione "g" letta come altro carattere già vista in incantesimi/mostri, qui
// concentrata in alcune sezioni (Halfling, Mezzorco, Elfo Oscuro, Draconide): correzioni
// mirate trovate ispezionando l'output, non un fix generico (rischierebbe di correggere "g"
// legittime altrove)
const TEXT_FIXES = [
  [/Puntessi/g, "Punteggi"],
  [/Taslia\b/g, "Taglia"],
  [/Corassioso/g, "Coraggioso"],
  [/Asilità Ha\/flins/g, "Agilità Halfling"],
  [/Linsuassi/g, "Linguaggi"],
  [/Ma6ia/g, "Magia"],
  [/Soliìo/g, "Soffio"],
  [/LinguaUi/g, "Linguaggi"],
];
function fixText(text) {
  return TEXT_FIXES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

const HEADING_STOPWORDS = new Set(["di", "dei", "del", "della", "degli", "delle", "e"]);
function titleCaseHeading(raw) {
  let isFirstWord = true;
  return raw
    .toLowerCase()
    .split(/(\s+|[()])/)
    .map((part) => {
      if (!/^[a-zà-ÿ]/.test(part)) return part;
      const keepLower = !isFirstWord && HEADING_STOPWORDS.has(part);
      isFirstWord = false;
      return keepLower ? part : part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

function compact(line) {
  return line.replace(/\s+/g, "").toUpperCase();
}

// una riga "Etichetta. Descrizione" ha, prima del primo punto, solo parole con iniziale
// maiuscola o piccoli connettivi (di/dei/del/...), fino a un massimo di 6 parole/50 caratteri:
// distingue un tratto vero (es. "Incremento dei Punteggi di Caratteristica.") da una normale
// frase che termina per caso con un punto a metà riga
const CONNECTORS = new Set(["di", "dei", "del", "della", "degli", "delle", "dell'", "nel", "nell'", "e", "a", "con", "alle", "ai", "al"]);
function matchTraitLabel(line) {
  const dotIndex = line.indexOf(". ");
  if (dotIndex === -1 || dotIndex > 55) return null;
  const label = line.slice(0, dotIndex);
  const rest = line.slice(dotIndex + 2);
  if (!rest.trim()) return null;
  // i riquadri laterali "cosa pensano le altre razze" hanno la stessa forma "Nome. Testo" di
  // un tratto vero, ma il testo è sempre una citazione tra virgolette: le escludiamo così
  if (rest.trim().startsWith('"')) return null;
  const words = label.split(/\s+/);
  if (words.length > 6) return null;
  // la prima parola dev'essere un vero contenuto (mai un connettivo: scarta frasi come
  // "di Greyhawk e Forgotten Realms." che per coincidenza passerebbero il resto del controllo)
  if (CONNECTORS.has(words[0]) || !/^[A-ZÀ-Þ]/.test(words[0])) return null;
  const valid = words.every((w) => CONNECTORS.has(w) || /^[A-ZÀ-Þ]/.test(w));
  if (!valid) return null;
  return { label, rest };
}

function isPageHeaderNoise(line) {
  const compactLine = compact(line);
  return compactLine.includes("CAPITOLO") && compactLine.includes("RAZZE");
}

// titolo di sottorazza: ogni parola inizia con maiuscola (2-4 parole) SENZA punto — a differenza
// di un tratto ("Etichetta. Testo") è solo un'intestazione autonoma. Non richiediamo che TUTTA
// la parola sia maiuscola (solo l'iniziale) perché il rendering small-caps del PDF a volte
// estrae le lettere successive alla prima come minuscole (es. "ELFO OSCURO (DRow)")
function isSubraceHeading(line) {
  if (line.length > 40 || line.length < 3) return false;
  if (line.includes(".")) return false;
  if (isPageHeaderNoise(line)) return false;
  const words = line.replace(/[()]/g, "").split(/\s+/);
  return words.length <= 5 && words.every((w) => /^[A-ZÀ-Þ]/.test(w) || /^\d/.test(w));
}

function loadLines(bookKey) {
  const raw = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, `${bookKey}.json`), "utf-8"));
  const lines = [];
  for (const page of raw.pages) {
    for (const line of page.text.split("\n")) {
      const t = line.trim();
      if (t) lines.push(t);
    }
  }
  return lines;
}

function parseTraitsBlock(lines, start, end) {
  const traits = [];
  const introLines = [];
  const subraces = [];
  let activeSubrace = null;
  // il testo di un tratto continua sulle righe seguenti finché non inizia il prossimo tratto/
  // sottorazza: la lista "traits"/sottorazza tiene un riferimento all'ultimo tratto aperto
  let openTrait = null;

  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (isPageHeaderNoise(line)) continue;

    const traitMatch = matchTraitLabel(line);
    if (traitMatch) {
      const target = activeSubrace ? activeSubrace.tratti : traits;
      openTrait = { nome: traitMatch.label, testo: traitMatch.rest };
      target.push(openTrait);
      continue;
    }
    // una sottorazza può comparire solo DOPO che il tratto "Sottorazze" è stato dichiarato nella
    // razza principale: un sottotitolo narrativo prima di quel punto (es. "SEMPRE ENTUSIASTI")
    // non è mai una vera sottorazza, anche se ha la stessa forma tipografica
    const sottorazzeDichiarate = traits.some((t) => t.nome === "Sottorazze");
    if (sottorazzeDichiarate && isSubraceHeading(line)) {
      // il testo narrativo della razza SUCCESSIVA inizia molto prima della sua sezione
      // "TRATTI ...", quindi ricade nel blocco di questa razza: due intitolazioni di
      // sottorazza di fila senza nessun tratto vero in mezzo è il segno che siamo finiti
      // fuori dalle sottorazze reali e dentro quel testo — ci fermiamo qui
      if (activeSubrace && activeSubrace.tratti.length === 0) break;
      activeSubrace = { nome: line, tratti: [] };
      subraces.push(activeSubrace);
      openTrait = null;
      continue;
    }
    if (openTrait) {
      openTrait.testo += " " + line;
      continue;
    }
    if (traits.length === 0 && !activeSubrace) introLines.push(line);
  }

  // l'ultima sottorazza aperta senza tratti è quasi certamente un falso positivo di cui sopra
  if (subraces.length > 0 && subraces.at(-1).tratti.length === 0) subraces.pop();

  return { introduzione: introLines.join(" "), tratti: traits, sottorazze: subraces };
}

function parseBook(bookKey) {
  const lines = loadLines(bookKey);
  const anchors = [];
  for (let i = 0; i < lines.length; i++) {
    const c = compact(lines[i]);
    const heading = RACE_HEADINGS.find((h) => c === h.anchor);
    if (heading) anchors.push({ lineIndex: i, nome: heading.nome });
  }

  const fixTrait = (t) => ({ nome: fixText(t.nome), testo: fixText(t.testo) });

  const races = anchors.map((anchor, idx) => {
    const end = idx + 1 < anchors.length ? anchors[idx + 1].lineIndex : Math.min(lines.length, anchor.lineIndex + 400);
    const { introduzione, tratti, sottorazze } = parseTraitsBlock(lines, anchor.lineIndex + 1, end);
    return {
      nome: anchor.nome,
      introduzione: fixText(introduzione),
      tratti: tratti.map(fixTrait),
      sottorazze: sottorazze.map((s) => ({
        nome: titleCaseHeading(fixText(s.nome)),
        tratti: s.tratti.map(fixTrait),
      })),
      fonte: bookKey,
    };
  });

  return races;
}

function main() {
  const bookKey = process.argv[2];
  if (!bookKey) {
    console.error("Uso: node parse-razze.mjs <chiave_libro>");
    process.exit(1);
  }

  const races = parseBook(bookKey);
  mkdirSync(PARSED_DIR, { recursive: true });
  const outPath = path.join(PARSED_DIR, `${bookKey}-razze.json`);
  writeFileSync(outPath, JSON.stringify(races, null, 2), "utf-8");

  console.log(`${races.length} razze trovate -> ${outPath}`);
  for (const r of races) {
    console.log(`  ${r.nome}: ${r.tratti.length} tratti, ${r.sottorazze.length} sottorazze`);
  }
}

main();
