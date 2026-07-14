// Incrocia i mostri estratti dal PDF italiano con i dati inglesi affidabili di 5etools
// (stessa fonte già usata dal Compendio in app), per individuare/segnalare i numeri corrotti
// dal rumore OCR (es. "19dl0" invece di "19d10") invece di fidarsi ciecamente del testo estratto.
//
// Uso: node cross-validate-mostri.mjs <chiave_libro> [sourceCode5etools=MM]

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");
const CACHE_PATH = path.join(SCRIPT_DIR, "translate-cache.json");
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

function loadTranslateCache() {
  if (!existsSync(CACHE_PATH)) return {};
  return JSON.parse(readFileSync(CACHE_PATH, "utf-8"));
}

function saveTranslateCache(cache) {
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

async function translate(text, cache) {
  const key = `it>en:${text}`;
  if (cache[key]) return cache[key];
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=it&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const segments = data[0] ?? [];
  const translated = segments.map((s) => s[0]).join("");
  if (translated) cache[key] = translated;
  return translated || null;
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function loadEnglishCreatures(sourceCode) {
  const indexRes = await fetch(`${RAW_BASE}/bestiary/index.json`);
  const index = await indexRes.json();
  const file = index[sourceCode];
  if (!file) throw new Error(`Nessun file bestiario per la fonte ${sourceCode}`);
  const bestiaryRes = await fetch(`${RAW_BASE}/bestiary/${file}`);
  const bestiary = await bestiaryRes.json();
  return bestiary.monster ?? [];
}

function extractCr(creature) {
  if (!creature.cr) return null;
  return typeof creature.cr === "string" ? creature.cr : creature.cr.cr;
}

function extractAc(creature) {
  if (!creature.ac || creature.ac.length === 0) return null;
  const first = creature.ac[0];
  return typeof first === "number" ? first : first.ac;
}

function extractHp(creature) {
  if (!creature.hp) return null;
  return typeof creature.hp === "number" ? creature.hp : creature.hp.average ?? null;
}

function parseItalianCrToNumber(cr) {
  if (!cr) return null;
  if (cr.includes("/")) {
    const [num, den] = cr.split("/").map(Number);
    return num / den;
  }
  return Number(cr);
}

function parseItalianHpAverage(puntiFerita) {
  if (!puntiFerita) return null;
  const m = puntiFerita.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

function parseItalianAc(classeArmatura) {
  if (!classeArmatura) return null;
  const m = classeArmatura.match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

async function main() {
  const bookKey = process.argv[2];
  const sourceCode = process.argv[3] ?? "MM";
  if (!bookKey) {
    console.error("Uso: node cross-validate-mostri.mjs <chiave_libro> [sourceCode5etools]");
    process.exit(1);
  }

  const monsters = JSON.parse(readFileSync(path.join(PARSED_DIR, `${bookKey}-mostri.json`), "utf-8"));
  console.log(`Carico ${monsters.length} mostri italiani da ${bookKey}...`);

  console.log(`Scarico il bestiario inglese (${sourceCode}) da 5etools...`);
  const englishCreatures = await loadEnglishCreatures(sourceCode);
  const englishByName = new Map(englishCreatures.map((c) => [normalizeName(c.name), c]));
  console.log(`${englishCreatures.length} creature inglesi caricate.`);

  const cache = loadTranslateCache();
  let matched = 0;
  let mismatched = 0;
  let unmatched = 0;
  const report = [];

  for (const monster of monsters) {
    const englishName = await translate(monster.nome, cache);
    const match = englishName ? englishByName.get(normalizeName(englishName)) : null;

    if (!match) {
      unmatched++;
      monster.crossCheck = { status: "non_trovato", nomeIngleseTentato: englishName };
      continue;
    }

    matched++;
    const englishCr = extractCr(match);
    const englishAc = extractAc(match);
    const englishHp = extractHp(match);
    const italianCr = parseItalianCrToNumber(monster.sfida);
    const italianAc = parseItalianAc(monster.classeArmatura);
    const italianHp = parseItalianHpAverage(monster.puntiFerita);

    const crMatches = englishCr == null || italianCr == null || parseItalianCrToNumber(englishCr) === italianCr;
    const acMatches = englishAc == null || italianAc == null || englishAc === italianAc;
    // i PF italiani sono spesso corrotti dall'OCR: tolleranza di poche unità prima di segnalare
    const hpMatches = englishHp == null || italianHp == null || Math.abs(englishHp - italianHp) <= 2;

    if (!crMatches || !acMatches || !hpMatches) {
      mismatched++;
      report.push({
        nome: monster.nome,
        nomeInglese: match.name,
        cr: { it: monster.sfida, en: englishCr, match: crMatches },
        ac: { it: italianAc, en: englishAc, match: acMatches },
        hp: { it: italianHp, en: englishHp, match: hpMatches },
      });
    }

    monster.crossCheck = {
      status: crMatches && acMatches && hpMatches ? "ok" : "discrepanza",
      nomeInglese: match.name,
      crInglese: englishCr,
      acInglese: englishAc,
      hpInglese: englishHp,
    };
  }

  saveTranslateCache(cache);
  writeFileSync(
    path.join(PARSED_DIR, `${bookKey}-mostri.json`),
    JSON.stringify(monsters, null, 2),
    "utf-8",
  );

  console.log(`\nEsito incrocio: ${matched} trovati, ${unmatched} non trovati, ${mismatched} con discrepanze numeriche.`);
  if (report.length > 0) {
    writeFileSync(
      path.join(PARSED_DIR, `${bookKey}-mostri-discrepanze.json`),
      JSON.stringify(report, null, 2),
      "utf-8",
    );
    console.log(`Dettaglio discrepanze -> ${bookKey}-mostri-discrepanze.json`);
    console.log(report.slice(0, 5));
  }
}

main();
