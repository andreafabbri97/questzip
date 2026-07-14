// Estrae le schede dei mostri dal testo grezzo di un manuale (vedi extract_pdf.py).
// A differenza degli incantesimi, questo libro ha rumore OCR anche nei NUMERI (dadi, CA, PF),
// non solo nei nomi — per questo ogni voce numerica viene annotata con un flag "sospetta" da
// incrociare in un secondo momento con i dati inglesi già presenti in 5etools, invece di
// fidarsi ciecamente del testo estratto.
//
// Uso: node parse-mostri.mjs <chiave_libro>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

// la taglia concorda in genere col nome del tipo di mostro ("Drago Medio" ma "Aberrazione
// Media"), quindi serve la forma sia maschile che femminile
const SIZES = [
  "Minuscolo", "Minuscola",
  "Piccolo", "Piccola",
  "Medio", "Media",
  "Grande",
  "Enorme",
  "Mastodontico", "Mastodontica",
];
const SIZE_TYPE_RE = new RegExp(
  `^([A-Za-zÀ-ÿ/][A-Za-zÀ-ÿ\\s/'\\-]*?)\\s+(${SIZES.join("|")})\\s*(\\([^)]*\\))?,\\s*(.+)$`,
);
const ALIGNMENT_HINT_RE = /(legale|caotic|neutral|bene|buon|malvagi|allineamento)/i;

const ABILITY_KEYS = ["FOR", "DES", "COS", "INT", "SAG", "CAR"];
// il blocco caratteristiche a volte finisce su una riga sola ("FOR 18 (+4) DES 14 (+2) ..."),
// a volte spezzato su più righe (un'etichetta, poi il suo valore, per 12 righe totali) — dipende
// da come la pagina è impaginata in colonne. Invece di assumere una struttura posizionale fissa,
// cerchiamo le 6 coppie etichetta+valore ovunque compaiano in un blocco di testo unito.
// il modificatore fra parentesi ha spesso un artefatto 0/1 scambiato per O/l/I, a volte con
// uno spazio spurio dopo il segno (es. "+ l" invece di "+1")
const MOD_RE = `[+\\-]?\\s*[\\dOolLI]+`;
const ABILITY_PAIR_RE = new RegExp(`(FOR|DES|COS|INT|SAG|CAR)\\s+(\\d+)\\s*[\\({]\\s*(${MOD_RE})\\s*[\\)}]`, "gi");

function normalizeModifier(raw) {
  const cleaned = raw.replace(/\s+/g, "").replace(/[Oo]/g, "0").replace(/[lLI]/g, "1");
  return cleaned.startsWith("+") || cleaned.startsWith("-") ? cleaned : `+${cleaned}`;
}

const CHALLENGE_RE = /^Sfida\s+([\d/]+)\s*\(\s*([\d.,]+)\s*PE\)/i;

const OPTIONAL_FIELD_LABELS = [
  "Tiri Salvezza",
  "Abilità",
  "Vulnerabilità ai Danni",
  "Resistenza ai Danni",
  "Immunità ai Danni",
  "Immunità alle Condizioni",
  "Sensi",
  "Linguaggi",
];
const OPTIONAL_FIELD_RE = new RegExp(`^(${OPTIONAL_FIELD_LABELS.join("|")})\\s+(.*)$`);

const SECTION_HEADING_RE = /^(AZIONI LEGGENDARIE|AZIONI DA MITO|AZIONI|REAZIONI|TRATTI)$/;

function isPageNumberNoise(line) {
  const compact = line.replace(/\s+/g, "");
  return /^[0-9IlOo]{1,5}$/.test(compact) && compact.length <= 5;
}

function loadLines(bookKey) {
  const raw = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, `${bookKey}.json`), "utf-8"));
  const lines = [];
  for (const page of raw.pages) {
    for (const line of page.text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || isPageNumberNoise(trimmed)) continue;
      lines.push(trimmed);
    }
  }
  return { lines, nome: raw.nome };
}

// confronta una riga con un'etichetta nota tollerando lo scambio l/1 e o/0 visto ovunque nel
// testo estratto (es. "C1asse Armatura" invece di "Classe Armatura")
function lineStartsWithLabel(line, label) {
  return line.replace(/1/g, "l").replace(/0/g, "o").startsWith(label);
}

function findChallengeAnchors(lines) {
  const anchors = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CHALLENGE_RE);
    if (m) anchors.push({ lineIndex: i, cr: m[1], pe: m[2] });
  }
  return anchors;
}

/** Cerca all'indietro da un'ancora "Sfida" la riga taglia/tipo/allineamento e il nome sopra di essa. */
function findHeaderStart(lines, challengeLineIndex) {
  for (let i = challengeLineIndex - 1; i >= 0 && i > challengeLineIndex - 40; i--) {
    const m = lines[i].match(SIZE_TYPE_RE);
    if (!m || !ALIGNMENT_HINT_RE.test(m[4])) continue;

    // conferma che sia una vera scheda mostro e non una frase di testo narrativo che per
    // coincidenza combacia col pattern taglia/tipo/allineamento: dev'esserci "Classe Armatura"
    // (con tolleranza OCR) entro le prossime righe
    const hasArmorClassNearby = lines
      .slice(i + 1, i + 4)
      .some((l) => lineStartsWithLabel(l, "Classe Armatura"));
    if (!hasArmorClassNearby) continue;

    // la riga nome è quella immediatamente sopra (può essere su 1 riga sola)
    const nameLineIndex = i - 1;
    if (nameLineIndex < 0) return null;
    return {
      nameLineIndex,
      sizeTypeLineIndex: i,
      tipo: m[1].trim(),
      taglia: m[2],
      allineamento: m[4].trim(),
    };
  }
  return null;
}

function parseAbilities(lines, start) {
  // finestra generosa: il blocco (su una riga o spezzato) sta sempre entro le prime ~15 righe
  const windowEnd = Math.min(lines.length, start + 15);
  const windowLines = lines.slice(start, windowEnd);

  // mappa ogni offset di carattere nel blob alla riga sorgente, per sapere di quante righe
  // avanzare il cursore una volta trovato l'ultimo match (il blob unisce le righe con " ")
  const lineStartOffsets = [];
  let offset = 0;
  for (const l of windowLines) {
    lineStartOffsets.push(offset);
    offset += l.length + 1;
  }
  const blob = windowLines.join(" ");

  const abilities = {};
  let lastEndOffset = 0;
  for (const match of blob.matchAll(ABILITY_PAIR_RE)) {
    const key = match[1].toUpperCase();
    const score = Number(match[2]);
    abilities[key] = { score, mod: normalizeModifier(match[3]) };
    lastEndOffset = Math.max(lastEndOffset, match.index + match[0].length);
  }
  for (const key of ABILITY_KEYS) if (!(key in abilities)) abilities[key] = null;

  let linesConsumed = windowLines.length;
  for (let i = 0; i < lineStartOffsets.length; i++) {
    if (lineStartOffsets[i] >= lastEndOffset) {
      linesConsumed = i;
      break;
    }
  }
  return { abilities, next: start + Math.max(1, linesConsumed) };
}

function parseBook(bookKey) {
  const { lines, nome } = loadLines(bookKey);
  const anchors = findChallengeAnchors(lines);

  const monsters = [];
  const skipped = [];

  for (let idx = 0; idx < anchors.length; idx++) {
    const anchor = anchors[idx];
    const header = findHeaderStart(lines, anchor.lineIndex);
    if (!header) {
      skipped.push({ reason: "header non trovato", lineIndex: anchor.lineIndex });
      continue;
    }

    const nomeMostro = lines[header.nameLineIndex];
    // scarta falsi positivi ovvi: la riga "nome" non deve essere a sua volta una riga di campo
    if (/^(Classe Armatura|Punti Ferita|Velocità|Sfida)/.test(nomeMostro)) {
      skipped.push({ reason: "nome non plausibile", nomeMostro });
      continue;
    }

    let cursor = header.sizeTypeLineIndex + 1;
    const fields = {};
    for (const label of ["Classe Armatura", "Punti Ferita", "Velocità"]) {
      const line = lines[cursor] ?? "";
      if (lineStartsWithLabel(line, label)) {
        fields[label] = line.slice(label.length).trim();
        cursor++;
      } else {
        fields[label] = null;
      }
    }

    const { abilities, next } = parseAbilities(lines, cursor);
    cursor = next;

    const optional = {};
    while (cursor < anchor.lineIndex) {
      const line = lines[cursor];
      const m = line.match(OPTIONAL_FIELD_RE);
      if (m) {
        optional[m[1]] = m[2];
        cursor++;
      } else {
        // riga di continuazione del campo precedente (liste lunghe su più righe)
        const lastLabel = Object.keys(optional).at(-1);
        if (lastLabel) optional[lastLabel] += " " + line;
        cursor++;
      }
    }

    // corpo: dall'ancora Sfida fino al prossimo mostro (o alla prossima ancora Sfida - il suo header)
    const nextAnchor = anchors[idx + 1];
    const bodyEnd = nextAnchor ? findHeaderStart(lines, nextAnchor.lineIndex)?.nameLineIndex ?? nextAnchor.lineIndex : lines.length;
    let bodyLines = lines.slice(anchor.lineIndex + 1, bodyEnd);

    // certe pagine hanno un layout a colonna laterale che fa finire una caratteristica (quasi
    // sempre CAR, l'ultima delle sei) fuori ordine, letta DOPO la riga "Sfida" invece che nel
    // blocco iniziale: la recuperiamo cercandola nel corpo e la togliamo da lì
    const displacedValueRe = new RegExp(`^(\\d+)\\s*[\\({]\\s*(${MOD_RE})\\s*[\\)}]`);
    for (const key of ABILITY_KEYS) {
      if (abilities[key]) continue;
      for (let i = 0; i < bodyLines.length - 1; i++) {
        if (bodyLines[i].toUpperCase() !== key) continue;
        const valueMatch = bodyLines[i + 1].match(displacedValueRe);
        if (!valueMatch) continue;
        abilities[key] = { score: Number(valueMatch[1]), mod: normalizeModifier(valueMatch[2]) };
        bodyLines = [...bodyLines.slice(0, i), ...bodyLines.slice(i + 2)];
        break;
      }
    }

    const sections = { tratti: [], azioni: [], azioniLeggendarie: [], reazioni: [] };
    let activeSectionKey = "tratti";
    for (const line of bodyLines) {
      const sectionMatch = line.match(SECTION_HEADING_RE);
      if (sectionMatch) {
        const heading = sectionMatch[1];
        activeSectionKey =
          heading === "AZIONI" ? "azioni"
          : heading === "AZIONI LEGGENDARIE" || heading === "AZIONI DA MITO" ? "azioniLeggendarie"
          : heading === "REAZIONI" ? "reazioni"
          : "tratti";
        continue;
      }
      sections[activeSectionKey].push(line);
    }

    const abilityValues = Object.values(abilities);
    const numericSuspect =
      !fields["Classe Armatura"] ||
      !fields["Punti Ferita"] ||
      abilityValues.some((a) => a === null);

    monsters.push({
      nome: nomeMostro,
      tipo: header.tipo,
      taglia: header.taglia,
      allineamento: header.allineamento,
      classeArmatura: fields["Classe Armatura"],
      puntiFerita: fields["Punti Ferita"],
      velocita: fields["Velocità"],
      caratteristiche: abilities,
      tiriSalvezza: optional["Tiri Salvezza"] ?? null,
      abilita: optional["Abilità"] ?? null,
      vulnerabilitaDanni: optional["Vulnerabilità ai Danni"] ?? null,
      resistenzaDanni: optional["Resistenza ai Danni"] ?? null,
      immunitaDanni: optional["Immunità ai Danni"] ?? null,
      immunitaCondizioni: optional["Immunità alle Condizioni"] ?? null,
      sensi: optional["Sensi"] ?? null,
      linguaggi: optional["Linguaggi"] ?? null,
      sfida: anchor.cr,
      pe: anchor.pe,
      tratti: sections.tratti.join("\n"),
      azioni: sections.azioni.join("\n"),
      azioniLeggendarie: sections.azioniLeggendarie.join("\n"),
      reazioni: sections.reazioni.join("\n"),
      numericSuspect,
      fonte: bookKey,
    });
  }

  return { nome, monsters, skipped };
}

function main() {
  const bookKey = process.argv[2];
  if (!bookKey) {
    console.error("Uso: node parse-mostri.mjs <chiave_libro>");
    process.exit(1);
  }

  const { nome, monsters, skipped } = parseBook(bookKey);
  mkdirSync(PARSED_DIR, { recursive: true });
  const outPath = path.join(PARSED_DIR, `${bookKey}-mostri.json`);
  writeFileSync(outPath, JSON.stringify(monsters, null, 2), "utf-8");

  const suspectCount = monsters.filter((m) => m.numericSuspect).length;
  console.log(`${nome}: ${monsters.length} mostri trovati -> ${outPath}`);
  console.log(`voci con dati numerici sospetti (da incrociare con l'inglese): ${suspectCount}`);
  console.log(`ancore "Sfida" scartate per header non trovato: ${skipped.length}`);
  const counts = {};
  for (const m of monsters) counts[m.nome] = (counts[m.nome] || 0) + 1;
  const dups = Object.entries(counts).filter(([, c]) => c > 1);
  console.log(`nomi duplicati: ${dups.length}`);
  if (dups.length > 0) console.log(dups.slice(0, 10));
}

main();
