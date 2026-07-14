// Estrae le schede degli incantesimi dal testo grezzo di un manuale (vedi extract_pdf.py)
// e le trasforma in voci strutturate. Formato atteso (tipografia standard dei manuali ufficiali):
//
//   NOME INCANTESIMO
//   <Scuola> di <N>° livello [(rituale)]      oppure      Trucchetto di <Scuola>
//   Tempo di Lancio: ...
//   Gittata: ...
//   Componenti: ...
//   Durata: ...
//   <descrizione, eventualmente su più paragrafi, incluso "Ai Livelli Superiori.">
//
// Uso: node parse-spells.mjs <chiave_libro>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const FIELD_LABELS = ["Tempo di Lancio", "Gittata", "Componenti", "Durata"];
const FIELD_RE = new RegExp(`^(${FIELD_LABELS.join("|")}):\\s*(.*)$`);

const SUBTITLE_LEVELED_RE = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-']*?)\s+di\s+(\d)°\s*livello(\s*\(rituale\))?$/;
const SUBTITLE_CANTRIP_RE = /^Trucchetto\s+di\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-']*)$/;

// le 8 scuole di magia ufficiali (terminologia PHB ITA): usate per scartare i falsi positivi,
// cioè frasi normali che per coincidenza terminano con "... di N° livello" (es. dentro il
// paragrafo "Ai Livelli Superiori") ma non sono davvero un sottotitolo di incantesimo.
const SCHOOLS = new Set([
  "abiurazione",
  "ammaliamento",
  "divinazione",
  "evocazione",
  "illusione",
  "invocazione",
  "necromanzia",
  "trasmutazione",
]);

const STOPWORDS = new Set(["di", "del", "della", "dei", "delle", "e", "o", "a", "il", "la", "le", "i", "gli", "lo", "da", "in", "su", "con", "per"]);

// nei nomi non compaiono mai cifre vere (quelle sono solo nelle descrizioni, es. "1d6"): in
// un "token" (sequenza senza spazi) che contiene anche lettere, uno 0/1 è quasi sempre un
// errore di estrazione del font per O/I, non una cifra vera
function fixDigitLetterConfusion(raw) {
  return raw
    .split(/(\s+)/)
    .map((token) => {
      if (!/[a-zà-ÿ]/i.test(token)) return token;
      return token.replace(/0/g, "o").replace(/1/g, "i");
    })
    .join("");
}

// spazi spuri e parole tronche note, trovate ispezionando l'elenco completo delle voci estratte
// (stesso artefatto: il font inserisce uno spazio indebito, es. "C Omunione" invece di "Comunione")
const NAME_FIXES = new Map([
  ["braccia di radar", "Braccia di Hadar"],
  ["cerchio di thletrasporto", "Cerchio di Teletrasporto"],
  ["disco fluttuante di thnser", "Disco Fluttuante di Tenser"],
  ["c omunione con la natura", "Comunione con la Natura"],
  ["scrigno segreto d i leomund", "Scrigno Segreto di Leomund"],
  ["respirare sott'acq.ua", "Respirare Sott'Acqua"],
]);

function titleCaseItalian(raw) {
  const words = fixDigitLetterConfusion(raw).trim().toLowerCase().split(/\s+/);
  const cased = words
    .map((w, i) => {
      if (i > 0 && STOPWORDS.has(w)) return w;
      return w.replace(/(^|[-'/])([a-zà-ÿ])/g, (m, sep, letter) => sep + letter.toUpperCase());
    })
    .join(" ");
  return NAME_FIXES.get(cased.toLowerCase()) ?? cased;
}

function isHeaderNoise(line) {
  const compact = line.replace(/\s+/g, "").toUpperCase();
  if (compact.includes("INCANTESIMI") && compact.includes("CAPITOLO")) return true;
  if (compact.includes("INCANTESIMI") && compact.length < 25) return true;
  return false;
}

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
      if (!trimmed) continue;
      if (isHeaderNoise(trimmed) || isPageNumberNoise(trimmed)) continue;
      lines.push(trimmed);
    }
  }
  return { lines, nome: raw.nome };
}

function findHeadings(lines) {
  const headings = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const subtitle = lines[i + 1];
    const leveled = subtitle.match(SUBTITLE_LEVELED_RE);
    const cantrip = subtitle.match(SUBTITLE_CANTRIP_RE);
    const scuolaCandidata = (leveled?.[1] ?? cantrip?.[1] ?? "").trim().toLowerCase();
    if ((!leveled && !cantrip) || !SCHOOLS.has(scuolaCandidata)) continue;

    const nameLine = lines[i];
    // scarta falsi positivi: la riga nome non deve essere a sua volta un'etichetta di campo
    // o un'altra sottotitolo (evita di agganciarsi a righe spurie)
    if (FIELD_RE.test(nameLine)) continue;
    if (nameLine.match(SUBTITLE_LEVELED_RE) || nameLine.match(SUBTITLE_CANTRIP_RE)) continue;

    headings.push({
      lineIndex: i,
      nome: titleCaseItalian(nameLine),
      livello: leveled ? Number(leveled[2]) : 0,
      scuola: titleCaseItalian(leveled ? leveled[1] : cantrip[1]),
      rituale: Boolean(leveled && leveled[3]),
    });
  }
  return headings;
}

function extractFields(lines, start, end) {
  const fields = { "Tempo di Lancio": "", Gittata: "", Componenti: "", Durata: "" };
  let active = null;
  let bodyStart = start;

  for (let i = start; i < end; i++) {
    const line = lines[i].replace(/^[•\-]\s*/, "");
    const match = line.match(FIELD_RE);
    if (match) {
      active = match[1];
      fields[active] = match[2];
      bodyStart = i + 1;
      continue;
    }
    if (active && fields[active] !== undefined) {
      // una riga di continuazione (es. componenti materiali lunghe) appartiene al campo attivo
      // finché non iniziano tutti e 4 i campi e comincia la descrizione vera e propria
      const allFieldsSeen = FIELD_LABELS.every((l) => fields[l] !== "");
      if (!allFieldsSeen) {
        fields[active] += " " + line;
        bodyStart = i + 1;
        continue;
      }
    }
    break;
  }

  // le righe nel PDF sono spezzate per impaginazione, non per paragrafo: le uniamo con uno
  // spazio, tranne quando inizia un vero paragrafo nuovo (es. "Ai Livelli Superiori.")
  const bodyLines = lines.slice(bodyStart, end);
  const paragraphs = [];
  for (const line of bodyLines) {
    const startsNewParagraph = /^(Ai Livelli Superiori\.|•)/.test(line) || paragraphs.length === 0;
    if (startsNewParagraph) paragraphs.push(line);
    else paragraphs[paragraphs.length - 1] += " " + line;
  }
  const descrizione = paragraphs.join("\n\n");
  return { fields, descrizione, bodyStart };
}

function parseBook(bookKey) {
  const { lines, nome } = loadLines(bookKey);
  const headings = findHeadings(lines);

  const spells = headings.map((h, idx) => {
    const fieldsStart = h.lineIndex + 2;
    const fieldsEnd = idx + 1 < headings.length ? headings[idx + 1].lineIndex : lines.length;
    const { fields, descrizione } = extractFields(lines, fieldsStart, fieldsEnd);
    return {
      nome: h.nome,
      livello: h.livello,
      scuola: h.scuola,
      rituale: h.rituale,
      tempoDiLancio: fields["Tempo di Lancio"],
      gittata: fields.Gittata,
      componenti: fields.Componenti,
      durata: fields.Durata,
      descrizione,
      fonte: bookKey,
    };
  });

  return { nome, spells };
}

function main() {
  const bookKey = process.argv[2];
  if (!bookKey) {
    console.error("Uso: node parse-spells.mjs <chiave_libro>");
    process.exit(1);
  }

  const { nome, spells } = parseBook(bookKey);
  mkdirSync(PARSED_DIR, { recursive: true });
  const outPath = path.join(PARSED_DIR, `${bookKey}-incantesimi.json`);
  writeFileSync(outPath, JSON.stringify(spells, null, 2), "utf-8");

  console.log(`${nome}: ${spells.length} incantesimi trovati -> ${outPath}`);
  const suspicious = spells.filter(
    (s) => !s.tempoDiLancio || !s.gittata || !s.componenti || !s.durata || s.descrizione.length < 20,
  );
  console.log(`voci sospette (campo mancante o descrizione troppo corta): ${suspicious.length}`);
  if (suspicious.length > 0) {
    console.log(suspicious.slice(0, 10).map((s) => s.nome).join(", "));
  }
}

main();
