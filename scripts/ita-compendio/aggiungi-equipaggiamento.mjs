// Porta nel Compendio l'equipaggiamento comune del Manuale del Giocatore: armi, armature,
// attrezzatura da avventuriero, munizioni, focus da incantatore, cavalcature e veicoli.
//
// Nel tab "Oggetti comuni" e nell'autocompletamento della scheda queste voci comparivano solo in
// inglese ("Handaxe" invece di "Ascia"): il testo ufficiale italiano non c'era per nessuna delle
// 259 voci PHB. Il capitolo 5 è quasi tutto tabelle, quindi qui il valore è il NOME stampato, più
// le poche descrizioni che il manuale dà (l'acido, il fuoco dell'alchimista, le corde...).
//
// Il COSTO fa da prova dell'abbinamento: è un numero, identico in ogni lingua. La tabella italiana
// lo dà in monete d'oro/argento/rame, 5etools in monete di rame; se convertito non coincide,
// l'abbinamento è sbagliato e la voce viene saltata invece di essere scritta a caso.
//
// Uso: node --env-file=../../.env.local aggiungi-equipaggiamento.mjs [--applica]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

import { pulisciTestoOcr } from "../../lib/ocr-cleanup.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const RAW = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/";

// valore di una moneta in monete di rame, come in 5etools
const MONETA = { mo: 100, ma: 10, mr: 1, me: 50, mp: 1000 };

const inRame = (costo) => {
  const m = costo?.match(/^([\d.]+)\s+(mo|ma|mr|me|mp)$/);
  return m ? Math.round(parseFloat(m[1]) * MONETA[m[2]]) : null;
};

const [base, items] = await Promise.all([
  fetch(`${RAW}items-base.json`).then((r) => r.json()),
  fetch(`${RAW}items.json`).then((r) => r.json()),
]);
// Qualche voce dell'equipaggiamento italiano, nei dati inglesi, sta sotto il Manuale del DM invece
// che sotto quello del Giocatore (le imbarcazioni, la pozione di guarigione): la mappa lo dichiara
// voce per voce con il campo "fonte", e la chiave dell'indice tiene conto della fonte.
const perNome = new Map(
  [...(base.baseitem ?? []), ...(items.item ?? [])].map((i) => [`${i.name}|${i.source}`, i]),
);

const mappa = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "mappa-equipaggiamento-phb.json"), "utf-8"));
const parsed = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "parsed", "phb-equipaggiamento.json"), "utf-8"));
const voci = new Map(parsed.map((v) => [v.nome, v]));

const esistenti = await sql`SELECT nome, nome_inglese FROM compendio_ita_oggetto`;
const giaInTabella = new Set(esistenti.map((r) => r.nome));
const giaAgganciati = new Set(esistenti.filter((r) => r.nome_inglese).map((r) => r.nome_inglese));

const daInserire = [];
const saltate = [];

for (const [nomeParsato, valore] of Object.entries(mappa.voci)) {
  if (nomeParsato.startsWith("_")) continue;
  const scheda = voci.get(nomeParsato);
  const fonteInglese = valore.fonte ?? "PHB";
  const inglese = perNome.get(`${valore.en}|${fonteInglese}`);
  const nomeItaliano = valore.it ?? nomeParsato;

  if (!scheda) { saltate.push(`${nomeItaliano} — non è fra le voci estratte`); continue; }
  if (!inglese) { saltate.push(`${nomeItaliano} — "${valore.en}" non è una voce ${fonteInglese} di 5etools`); continue; }
  if (giaInTabella.has(nomeItaliano) || giaAgganciati.has(valore.en)) { saltate.push(`${nomeItaliano} — già in tabella`); continue; }

  const costoIta = inRame(scheda.costo);
  if (costoIta != null && inglese.value != null && costoIta !== inglese.value) {
    saltate.push(`${nomeItaliano} — costo ${scheda.costo} (${costoIta} mr) ma "${valore.en}" vale ${inglese.value} mr`);
    continue;
  }

  daInserire.push({
    nome: nomeItaliano,
    en: valore.en,
    fonte: fonteInglese,
    categoria: inglese.type?.split("|")[0] ?? "",
    descrizione: scheda.descrizione ? pulisciTestoOcr(scheda.descrizione) : "",
  });
}

console.log(`${daInserire.length} voci da aggiungere, ${saltate.length} saltate`);
for (const v of daInserire) console.log(`  + ${v.nome} = ${v.en}${v.descrizione ? ` (${v.descrizione.length} caratteri)` : ""}`);
if (saltate.length > 0) {
  console.log("\nsaltate:");
  for (const s of saltate) console.log(`  - ${s}`);
}

if (applica) {
  for (const v of daInserire) {
    // l'equipaggiamento comune non ha rarità né sintonia: sono campi degli oggetti magici
    await sql`
      INSERT INTO compendio_ita_oggetto (nome, categoria, rarita, sintonia, descrizione, fonte, nome_inglese, fonte_inglese)
      VALUES (${v.nome}, ${v.categoria}, '', false, ${v.descrizione}, 'phb', ${v.en}, ${v.fonte})`;
  }
  console.log(`\ninserite ${daInserire.length} voci`);
} else {
  console.log("\n[PROVA] nessuna scrittura: aggiungere --applica");
}
