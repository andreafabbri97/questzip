// Estrae nome+descrizione delle sottoclassi dal testo REALE dei PDF italiani già estratti
// (scripts/ita-compendio/extracted/<libro>.json), al posto della sola traduzione IA usata finora
// (vedi scripts/ita-compendio/seed-subclasses.mjs — popolava solo name/source in inglese come
// chiave, mai testo italiano ufficiale). Approccio prudente in due passi, stesso principio del
// resto della pipeline ("meglio mancare l'abbinamento che rischiare un falso positivo silenzioso"):
//
// 1. Individua nel testo grezzo le righe "tutto maiuscolo" (intestazioni di sezione nel PDF —
//    nomi di sottoclassi, ma anche nomi di privilegi, intestazioni di pagina ricorrenti...).
//    Le intestazioni ricorrenti (es. "CAPITOLO 3 I CLASSI" su ogni pagina) vengono scartate
//    perché compaiono troppe volte per essere un nome di sottoclasse.
// 2. Per ogni sottoclasse, confronta il nome ATTUALMENTE salvato (quasi sempre una traduzione IA,
//    mai verificata) con le intestazioni candidate, ignorando spazi/maiuscole/accenti (gli OCR
//    spesso spezzano le lettere con spazi extra, es. "M I STICO"). Se combacia ESATTAMENTE con UNA
//    sola intestazione, il nome IA era già corretto: il paragrafo che segue quell'intestazione
//    (fino alla prossima intestazione) diventa la nuova descrizione, testo vero del manuale.
//    Se NON combacia (probabile nome sbagliato, come già capitato con "Ingannatore Arcano" o
//    "La Lama Incantata"), la riga viene SALTATA e segnalata — mai riscritta a modo di indovinello:
//    va verificata a mano leggendo il testo vero (stesso procedimento fatto finora), poi aggiunta
//    a fix-known-translations.mjs.
//
// Uso: node --env-file=../../.env.local parse-subclasses-pdf.mjs <bookKey> [--dry-run]
// dove <bookKey> è una chiave di scripts/ita-compendio/extracted/ (es. "phb", "xanathar", "tasha").
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { compendioTraduzioniIa } from "../../lib/db/schema.ts";
import { and, eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

// bookKey (extracted/<key>.json) -> codice fonte 5etools delle sottoclassi che contiene.
const BOOK_SOURCES = {
  phb: "PHB",
  xanathar: "XGE",
  tasha: "TCE",
  costa_spada: "SCAG",
  fizban: "FTD",
  ravenloft: "VRGR",
  dragonlance: "DSotDQ",
  bigby: "BGG",
};

const CLASS_FILES = [
  "artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk",
  "mystic", "paladin", "ranger", "rogue", "sidekick", "sorcerer", "warlock", "wizard",
];

function normalize(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function fetchJson(url) {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

function isHeadingLine(line) {
  const t = line.trim();
  if (t.length < 3 || t.length > 60) return false;
  const letters = t.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
  if (letters.length < 3) return false;
  const upper = letters.replace(/[a-zà-öø-ÿ]/g, "");
  return upper.length / letters.length > 0.8;
}

const bookKey = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!bookKey || !BOOK_SOURCES[bookKey]) {
  console.error(`Uso: node parse-subclasses-pdf.mjs <${Object.keys(BOOK_SOURCES).join("|")}> [--dry-run]`);
  process.exit(1);
}
const bookSource = BOOK_SOURCES[bookKey];

const extractedPath = path.join(__dirname, "extracted", `${bookKey}.json`);
const extracted = JSON.parse(fs.readFileSync(extractedPath, "utf8"));

// Un unico testo concatenato (con marcatori di pagina) così i paragrafi a cavallo tra due pagine
// non vengono spezzati a metà — le posizioni dei candidati si calcolano su QUESTO testo.
let fullText = "";
const pageBreaks = [];
for (const p of extracted.pages) {
  pageBreaks.push({ offset: fullText.length, page: p.page });
  fullText += p.text + "\n";
}

const lines = fullText.split("\n");
let offset = 0;
const candidates = []; // { text, normalized, offset (inizio riga), end (fine riga, prima del \n) }
for (const line of lines) {
  if (isHeadingLine(line)) {
    candidates.push({ text: line.trim(), normalized: normalize(line), offset, end: offset + line.length });
  }
  offset += line.length + 1;
}

// Intestazioni ricorrenti (headers/footer di pagina, es. "CAPITOLO 3 I CLASSI" su quasi ogni
// pagina) — non possono essere il nome di UNA sottoclasse specifica, si scartano dai candidati.
const counts = new Map();
for (const c of candidates) counts.set(c.normalized, (counts.get(c.normalized) ?? 0) + 1);
const realCandidates = candidates.filter((c) => (counts.get(c.normalized) ?? 0) <= 4);

console.log(`${bookKey}: ${lines.length} righe, ${candidates.length} candidati grezzi, ${realCandidates.length} dopo aver scartato le intestazioni ricorrenti.`);

const classFiles = await Promise.all(CLASS_FILES.map((b) => fetchJson(`${RAW_BASE}/class/class-${b}.json`)));
const allSubclasses = classFiles.flatMap((f) => f?.subclass ?? []);
// Alcune sottoclassi compaiono più volte nei dati 5etools (es. ristampate in più file classe) —
// dedup per name+source prima di processarle, altrimenti verrebbero lette/scritte due volte.
const seenKeys = new Set();
const bookSubclasses = allSubclasses.filter((s) => {
  if (s.source !== bookSource) return false;
  const key = `${s.name}|${s.source}`;
  if (seenKeys.has(key)) return false;
  seenKeys.add(key);
  return true;
});
console.log(`Sottoclassi attese per fonte ${bookSource}: ${bookSubclasses.length}`);

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

let matched = 0;
const needsReview = [];

for (const sub of bookSubclasses) {
  const [existing] = await db
    .select()
    .from(compendioTraduzioniIa)
    .where(
      and(
        eq(compendioTraduzioniIa.kind, "classi"),
        eq(compendioTraduzioniIa.name, sub.name),
        eq(compendioTraduzioniIa.source, sub.source),
      ),
    );
  if (!existing || !existing.nomeIta) {
    needsReview.push({ name: sub.name, source: sub.source, reason: "nessun nome IA salvato" });
    continue;
  }

  const target = normalize(existing.nomeIta);
  const hits = realCandidates.filter((c) => c.normalized === target);
  if (hits.length !== 1) {
    needsReview.push({
      name: sub.name,
      source: sub.source,
      nomeIaAttuale: existing.nomeIta,
      reason: hits.length === 0 ? "nessuna intestazione combacia" : `${hits.length} intestazioni combaciano (ambiguo)`,
    });
    continue;
  }

  const heading = hits[0];
  const nextIndex = realCandidates.findIndex((c) => c.offset === heading.offset) + 1;
  const nextHeading = realCandidates[nextIndex];
  const bodyStart = heading.end;
  const bodyEnd = nextHeading ? nextHeading.offset : bodyStart + 2000;
  const rawBody = fullText.slice(bodyStart, bodyEnd);

  // Ripulisce interruzioni di riga OCR (spazi doppi, a-capo nel mezzo di una frase) in un unico
  // paragrafo leggibile — stessa idea di flattenEntries per il resto della pipeline, qui a mano
  // perché il testo è grezzo (nessuna struttura FiveEntry).
  let paragraph = rawBody
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();

  // Tasha's Cauldron (e solo quello, tra i libri qui gestiti) intercala battute satiriche a
  // margine firmate "TASHA" (a volte "TASHA.", col punto attaccato) prima del vero paragrafo
  // introduttivo — es. "Lasciare che sia la magia a tenere le redini è una pessima idea, ma non
  // sono mica tua madre. Vivi senza rimpianti. TASHA. Molti luoghi del multiverso...". La battuta
  // non è testo di regolamento, la si scarta tenendo solo ciò che segue l'ultima occorrenza della
  // firma (qualunque punteggiatura la segua).
  const tashaSignature = /\bTASHA\.?\s*/;
  if (tashaSignature.test(paragraph)) {
    const parts = paragraph.split(tashaSignature);
    paragraph = parts[parts.length - 1].trim();
  }
  // Simboli OCR isolati rimasti in testa (es. "©" al posto di virgolette di apertura).
  paragraph = paragraph.replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ0-9]+/, "").trim();

  if (paragraph.length < 40) {
    needsReview.push({ name: sub.name, source: sub.source, nomeIaAttuale: existing.nomeIta, reason: "paragrafo estratto troppo corto, probabile confine sbagliato" });
    continue;
  }

  // descrizioneIta NON è un paragrafo semplice: è "Nome (Liv. N): testo" una riga per privilegio
  // (scritto da self-translate-fetch.mjs, letto da parseIaClassText in compendio-detail.tsx per
  // l'elenco espandibile "Liv. X · Nome" in scheda) — si sostituisce SOLO la prima riga (il nome
  // e il paragrafo introduttivo della sottoclasse) con la versione presa dal manuale vero,
  // mantenendo intatte le righe successive (gli altri privilegi, ancora di origine IA finché non
  // vengono verificati anche quelli).
  const existingLines = (existing.descrizioneIta ?? "").split("\n");
  const firstLineMatch = existingLines[0]?.match(/^(.*?) \(Liv\. (\d+)\):/);
  const level = firstLineMatch ? firstLineMatch[2] : "?";
  const restLines = existingLines.slice(1);
  const newDescrizione = [`${existing.nomeIta} (Liv. ${level}): ${paragraph}`, ...restLines].join("\n");

  matched++;
  console.log(`✓ ${sub.name} (${sub.source}) -> "${existing.nomeIta}": ${paragraph.slice(0, 90)}...`);
  if (!dryRun) {
    await db
      .update(compendioTraduzioniIa)
      .set({ descrizioneIta: newDescrizione })
      .where(
        and(
          eq(compendioTraduzioniIa.kind, "classi"),
          eq(compendioTraduzioniIa.name, sub.name),
          eq(compendioTraduzioniIa.source, sub.source),
        ),
      );
  }
}

console.log(`\n${matched}/${bookSubclasses.length} sottoclassi aggiornate con testo ufficiale.`);
console.log(`${needsReview.length} da verificare a mano:`);
for (const r of needsReview) {
  console.log(`  - ${r.name} (${r.source}) — attuale: "${r.nomeIaAttuale ?? "?"}" — ${r.reason}`);
}
if (dryRun) console.log("\n(--dry-run: nessuna scrittura sul DB)");
