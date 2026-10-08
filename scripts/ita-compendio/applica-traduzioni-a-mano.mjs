// Scrive nella cache delle traduzioni (compendio_traduzione_ia) le descrizioni tradotte A MANO
// delle voci che ne erano prive: quelle per cui il Compendio, a ogni apertura, chiedeva una
// traduzione al volo consumando la quota dell'IA che serve agli utenti.
//
// Due file di parsed/ (fuori dal repository: sono testo dei manuali e sue traduzioni):
//   originali:  [ { "kind": "oggetti", "name": "Bead of Force", "source": "XDMG", "en": ["…", "…"] } ]
//   traduzioni: [ { "kind": "oggetti", "name": "Bead of Force", "source": "XDMG", "righe": ["…", "…"],
//                   "nome_ita": "…" (solo se va corretto anche il nome) } ]
// "en" e "righe" sono un blocco per riga, nello stesso ordine; le righe di una tabella diventano
// righe «1–2: testo», come le legge lib/testo-strutturato.ts.
//
// Una traduzione non si scrive se non passa i controlli che si possono fare senza rileggerla:
// - i dadi devono essere gli stessi dell'originale, uno per uno;
// - le CD pure («DC 15» ↔ «CD 15»);
// - la lunghezza deve stare fra 0,7 e 1,6 volte l'originale: fuori di lì manca un pezzo o ce n'è
//   uno di troppo.
// Rilanciabile: una voce già scritta uguale non viene toccata.
//
// Uso: node --env-file=../../.env.local applica-traduzioni-a-mano.mjs <originali.json> <traduzioni.json> [--applica]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const [fileOriginali, fileTraduzioni] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const applica = process.argv.includes("--applica");
if (!fileOriginali || !fileTraduzioni) {
  console.error("Uso: node applica-traduzioni-a-mano.mjs <originali.json> <traduzioni.json> [--applica]");
  process.exit(1);
}

const leggi = (f) => JSON.parse(readFileSync(f, "utf-8"));
const originali = new Map(leggi(fileOriginali).map((v) => [`${v.kind}|${v.name}|${v.source}`, v]));
const tradotte = leggi(fileTraduzioni);

const conta = (testo, modello) => {
  const c = new Map();
  for (const m of testo.matchAll(modello)) c.set(m[1], (c.get(m[1]) ?? 0) + 1);
  return c;
};
function diversi(a, b) {
  const out = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const d = (a.get(k) ?? 0) - (b.get(k) ?? 0);
    if (d !== 0) out.push(`${d > 0 ? "+" : ""}${d}×${k}`);
  }
  return out;
}

let scritte = 0;
let uguali = 0;
let scartate = 0;
const viste = new Set();
for (const v of tradotte) {
  const chiave = `${v.kind}|${v.name}|${v.source}`;
  if (viste.has(chiave)) {
    console.error(`✗ ${chiave}: tradotta due volte nel file`);
    scartate++;
    continue;
  }
  viste.add(chiave);
  const originale = originali.get(chiave);
  if (!originale) {
    console.error(`✗ ${chiave}: non è fra le voci da tradurre`);
    scartate++;
    continue;
  }
  const inglese = originale.en.join("\n");
  const italiano = v.righe.join("\n");
  const problemi = [
    ...diversi(conta(italiano, /\b(\d+d\d+)\b/g), conta(inglese, /\b(\d+d\d+)\b/g)).map((d) => `dadi ${d}`),
    ...diversi(conta(italiano, /\bCD (?:del tiro salvezza (?:degli incantesimi )?)?(\d+)\b/g), conta(inglese, /\bDC (\d+)\b/g)).map((d) => `CD ${d}`),
  ];
  const rapporto = italiano.length / Math.max(1, inglese.length);
  if (rapporto < 0.7 || rapporto > 1.6) problemi.push(`lunghezza ${rapporto.toFixed(2)}× l'originale`);
  if (problemi.length > 0) {
    console.error(`✗ ${chiave}: ${problemi.join(", ")}`);
    scartate++;
    continue;
  }

  const righe = await sql`SELECT nome_ita, descrizione_ita FROM compendio_traduzione_ia WHERE kind = ${v.kind} AND name = ${v.name} AND source = ${v.source}`;
  if (righe.length !== 1) {
    console.error(`✗ ${chiave}: ${righe.length} righe in cache`);
    scartate++;
    continue;
  }
  if (righe[0].descrizione_ita === italiano && (!v.nome_ita || righe[0].nome_ita === v.nome_ita)) {
    uguali++;
    continue;
  }
  scritte++;
  const nome = v.nome_ita && v.nome_ita !== righe[0].nome_ita ? `, nome «${righe[0].nome_ita}» -> «${v.nome_ita}»` : "";
  console.log(`✓ ${chiave}: ${(righe[0].descrizione_ita ?? "").length} -> ${italiano.length} car${nome}`);
  if (applica) {
    await sql`UPDATE compendio_traduzione_ia SET descrizione_ita = ${italiano}, nome_ita = ${v.nome_ita ?? righe[0].nome_ita}, updated_at = now()
              WHERE kind = ${v.kind} AND name = ${v.name} AND source = ${v.source}`;
  }
}
const mancanti = [...originali.keys()].filter((k) => !viste.has(k));
console.log(`\n${applica ? "" : "[PROVA] "}scritte: ${scritte} — già uguali: ${uguali} — scartate: ${scartate} — ancora senza traduzione: ${mancanti.length}`);
if (process.argv.includes("--elenco")) for (const m of mancanti) console.log(`  manca: ${m}`);
