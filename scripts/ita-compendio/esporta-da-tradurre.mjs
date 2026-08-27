// Esporta in un file JSON le voci del Compendio ancora senza descrizione italiana, col loro testo
// inglese. Serve a tradurle SENZA passare da Gemini: la quota di quella chiave e' per le
// funzionalita' che usano le persone mentre giocano (assistente regole, import scheda), non per la
// manutenzione dei dati. Il file viene tradotto e poi riscritto nel database da
// importa-tradotte.mjs.
//
// Uso: node --env-file=../../.env.local esporta-da-tradurre.mjs <categoria> [limite]
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
const sql = neon(process.env.DATABASE_URL);
const categoria = process.argv[2];
const limite = Number(process.argv[3] ?? 1000);

const fetchJson = async (u) => {
  const r = await fetch(u);
  return r.ok ? r.json() : null;
};

/** Stesso appiattimento usato altrove: la struttura "entries" diventa testo semplice. */
function appiattisci(entries) {
  const pezzi = [];
  const visita = (e) => {
    if (typeof e === "string") pezzi.push(e);
    else if (Array.isArray(e)) e.forEach(visita);
    else if (e && typeof e === "object") {
      if (e.name) pezzi.push(`${e.name}:`);
      visita(e.entries ?? e.items ?? []);
    }
  };
  visita(entries ?? []);
  return pezzi.join(" ").replace(/\{@\w+ ([^}|]+)(\|[^}]*)?\}/g, "$1").replace(/\s+/g, " ").trim();
}

async function originali() {
  if (categoria === "scelteClasse") {
    const f = await fetchJson(`${RAW_BASE}/optionalfeatures.json`);
    return new Map((f?.optionalfeature ?? []).map((x) => [`${x.name}|${x.source}`, appiattisci(x.entries)]));
  }
  if (categoria === "oggetti") {
    const [items, varianti] = await Promise.all([
      fetchJson(`${RAW_BASE}/items.json`),
      fetchJson(`${RAW_BASE}/magicvariants.json`),
    ]);
    const m = new Map();
    for (const i of [...(items?.item ?? []), ...(items?.itemGroup ?? [])]) {
      m.set(`${i.name}|${i.source ?? "DMG"}`, appiattisci(i.entries));
    }
    for (const v of varianti?.magicvariant ?? []) {
      if (v.inherits?.source) m.set(`${v.name}|${v.inherits.source}`, appiattisci(v.inherits.entries));
    }
    return m;
  }
  throw new Error(`categoria non gestita: ${categoria}`);
}

const testi = await originali();
const righe = await sql`
  SELECT name, source, nome_ita FROM compendio_traduzione_ia
  WHERE kind = ${categoria} AND descrizione_ita IS NULL ORDER BY name`;

const voci = [];
for (const r of righe) {
  const testo = testi.get(`${r.name}|${r.source}`);
  if (!testo) continue;
  voci.push({ chiave: `${r.name}|${r.source}`, nomeIta: r.nome_ita, en: testo });
  if (voci.length >= limite) break;
}

const out = path.join(SCRIPT_DIR, `da-tradurre-${categoria}.json`);
writeFileSync(out, JSON.stringify(voci, null, 1), "utf-8");
console.log(`${voci.length} voci esportate in ${out}`);
console.log(`caratteri totali: ${voci.reduce((n, v) => n + v.en.length, 0)}`);
