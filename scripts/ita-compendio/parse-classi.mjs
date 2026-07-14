// Estrae i privilegi di classe dal Manuale del Giocatore. NON include la tabella di
// progressione livelli: nel testo estratto linearmente le celle della tabella escono in un
// ordine sparso e irrecuperabile senza un'estrazione basata sulle coordinate geometriche dei
// caratteri nella pagina (un lavoro a sé, non tentato qui). Estrae invece: dado vita, punti
// ferita, competenze, equipaggiamento e i privilegi di classe base con il livello dedotto dal
// testo stesso ("Al 3° livello...", "A partire dal 5° livello..."). NON include le sottoclassi
// (troppa prosa frammista, stesso tipo di rischio già visto per le razze, ma moltiplicato).
//
// Uso: node parse-classi.mjs <chiave_libro>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const CLASS_NAMES = [
  "Barbaro", "Bardo", "Chierico", "Druido", "Guerriero", "Ladro",
  "Mago", "Monaco", "Paladino", "Ranger", "Stregone", "Warlock",
];

const SECTION_LABELS = ["Dadi Vita", "Punti Ferita al 1° Livello", "Punti Ferita ai Livelli Successivi", "Armature", "Armi", "Strumenti", "Tiri Salvezza", "Abilità"];
const SECTION_FIELD_RE = new RegExp(`^(${SECTION_LABELS.join("|")}):\\s*(.*)$`);
const SUBSECTION_HEADINGS = new Set(["PUNTI FERITA", "COMPETENZE", "EQUIPAGGIAMENTO"]);

function compact(line) {
  return line.replace(/\s+/g, "").toUpperCase();
}

function isPageHeaderNoise(line) {
  const c = compact(line);
  return c.includes("CAPITOLO") && c.includes("CLASSI");
}

// intestazione di privilegio: ogni parola inizia con maiuscola, niente due punti, corta —
// stesso principio delle intestazioni di sottorazza (tollera il rendering small-caps che a
// volte estrae le lettere successive alla prima come minuscole)
function isFeatureHeading(line) {
  if (line.length > 45 || line.length < 3) return false;
  if (line.includes(":") || line.includes(".")) return false;
  if (isPageHeaderNoise(line)) return false;
  if (SUBSECTION_HEADINGS.has(line)) return false;
  const words = line.replace(/[()]/g, "").split(/\s+/);
  return words.length <= 6 && words.every((w) => /^[A-ZÀ-Þ]/.test(w) || /^\d/.test(w));
}

function extractLevel(text) {
  const m = text.match(/(\d+)°\s*livello/);
  return m ? Number(m[1]) : 1;
}

function titleCase(raw) {
  const stop = new Set(["di", "dei", "del", "della", "degli", "delle", "e", "a"]);
  let first = true;
  return raw
    .toLowerCase()
    .split(/(\s+)/)
    .map((w) => {
      if (!/^[a-zà-ÿ]/.test(w)) return w;
      const keep = !first && stop.has(w);
      first = false;
      return keep ? w : w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
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

function findClassAnchors(lines) {
  const privilegiAnchors = [];
  for (let i = 0; i < lines.length; i++) {
    if (compact(lines[i]) === "PRIVILEGIDICLASSE") privilegiAnchors.push(i);
  }

  const anchors = [];
  for (const idx of privilegiAnchors) {
    for (let i = idx - 1; i >= 0 && i > idx - 250; i--) {
      // confronto tollerante a spazi spuri del rendering small-caps (es. "C H IERICO")
      const nome = CLASS_NAMES.find((n) => compact(lines[i]) === n.toUpperCase());
      if (nome) {
        anchors.push({ nome, nameLineIndex: i, privilegiLineIndex: idx });
        break;
      }
    }
  }
  return anchors;
}

function parseSections(lines, start, end) {
  const fields = {};
  // tra l'ancora "PRIVILEGI DI CLASSE" e la prima sottosezione vera c'è sempre una riga
  // introduttiva ("Un barbaro ottiene i seguenti privilegi di classe."): la saltiamo
  let cursor = start;
  while (cursor < end && !SUBSECTION_HEADINGS.has(lines[cursor]) && cursor < start + 5) cursor++;
  let activeSubsection = null;

  while (cursor < end && SUBSECTION_HEADINGS.has(lines[cursor])) {
    activeSubsection = lines[cursor];
    cursor++;
    while (cursor < end) {
      const line = lines[cursor];
      if (SUBSECTION_HEADINGS.has(line)) break;
      const m = line.match(SECTION_FIELD_RE);
      if (m) {
        fields[m[1]] = m[2];
        cursor++;
        continue;
      }
      if (activeSubsection === "EQUIPAGGIAMENTO" || activeSubsection === "PUNTI FERITA") {
        // testo libero (intro equipaggiamento, elenco scelte (a)/(b)): lo accumuliamo a parte
        fields[`_${activeSubsection}_extra`] = ((fields[`_${activeSubsection}_extra`] ?? "") + " " + line).trim();
        cursor++;
        continue;
      }
      // riga di continuazione dell'ultimo campo (es. lista abilità su più righe)
      const lastLabel = Object.keys(fields).at(-1);
      if (lastLabel && !lastLabel.startsWith("_")) {
        fields[lastLabel] += " " + line;
        cursor++;
        continue;
      }
      break;
    }
  }
  return { fields, next: cursor };
}

function parseFeatures(lines, start, end) {
  const features = [];
  let openFeature = null;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (isPageHeaderNoise(line)) continue;
    if (isFeatureHeading(line)) {
      openFeature = { nome: titleCase(line), testo: "" };
      features.push(openFeature);
      continue;
    }
    if (openFeature) openFeature.testo += (openFeature.testo ? " " : "") + line;
  }
  return features.map((f) => ({ ...f, livello: extractLevel(f.testo) }));
}

function parseBook(bookKey) {
  const lines = loadLines(bookKey);
  const anchors = findClassAnchors(lines);

  const classes = anchors.map((anchor, idx) => {
    const { fields, next } = parseSections(lines, anchor.privilegiLineIndex + 1, lines.length);
    // confine del blocco: fino al prossimo nome di classe trovato, con un tetto di sicurezza
    const nextAnchor = anchors[idx + 1];
    const end = nextAnchor ? nextAnchor.nameLineIndex : Math.min(lines.length, next + 600);
    const features = parseFeatures(lines, next, end);

    return {
      nome: anchor.nome,
      dadoVita: fields["Dadi Vita"] ?? null,
      puntiFerita1Livello: fields["Punti Ferita al 1° Livello"] ?? null,
      puntiFeritaSuccessivi: fields["Punti Ferita ai Livelli Successivi"] ?? null,
      armature: fields["Armature"] ?? null,
      armi: fields["Armi"] ?? null,
      strumenti: fields["Strumenti"] ?? null,
      tiriSalvezza: fields["Tiri Salvezza"] ?? null,
      abilita: fields["Abilità"] ?? null,
      equipaggiamento: fields["_EQUIPAGGIAMENTO_extra"] ?? null,
      privilegi: features,
      fonte: bookKey,
    };
  });

  return classes;
}

function main() {
  const bookKey = process.argv[2];
  if (!bookKey) {
    console.error("Uso: node parse-classi.mjs <chiave_libro>");
    process.exit(1);
  }

  const classes = parseBook(bookKey);
  mkdirSync(PARSED_DIR, { recursive: true });
  const outPath = path.join(PARSED_DIR, `${bookKey}-classi.json`);
  writeFileSync(outPath, JSON.stringify(classes, null, 2), "utf-8");

  console.log(`${classes.length} classi trovate su ${CLASS_NAMES.length} attese -> ${outPath}`);
  for (const c of classes) {
    console.log(`  ${c.nome}: ${c.privilegi.length} privilegi, dado vita=${c.dadoVita ? "ok" : "MANCANTE"}`);
  }
  const missing = CLASS_NAMES.filter((n) => !classes.some((c) => c.nome === n));
  if (missing.length > 0) console.log("Classi non trovate:", missing.join(", "));
}

main();
