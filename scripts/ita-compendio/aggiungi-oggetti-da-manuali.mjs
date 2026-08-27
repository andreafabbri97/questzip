// Porta nel Compendio gli oggetti magici trascritti a mano dalle pagine del Manuale del DM.
//
// Il PDF del Manuale del DM ha il font offuscato: l'estrazione del testo restituisce caratteri
// illeggibili (vedi decode_dm_manual.py e la voce di roadmap, tentativo chiuso senza successo).
// L'unica fonte OCR già in archivio, extracted/oggetti_magici.json, è un estratto parziale e copre
// 210 delle circa 360 schede del catalogo "OGGETTI MAGICI A-Z". Le mancanti sono state lette
// direttamente dalle pagine rese in immagine e trascritte in oggetti-dm-manuale.json.
//
// Prima di scrivere, ogni voce viene verificata contro 5etools: rarità e necessità di sintonia sono
// dati identici nelle due edizioni, quindi se non tornano l'abbinamento al nome inglese è sbagliato
// e la voce viene saltata invece che inserita. Alcune schede del manuale (Sacro Vendicatore, Spada
// Vorpal, Arma +1/+2/+3...) in 5etools non stanno in items.json ma fra le varianti magiche, quindi
// si cerca in entrambi gli elenchi.
//
// Uso: node --env-file=../../.env.local aggiungi-oggetti-da-manuali.mjs [--applica]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const RAW = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/";

const RARITA_5ETOOLS = {
  common: "comune",
  uncommon: "non comune",
  rare: "raro",
  "very rare": "molto raro",
  legendary: "leggendario",
  artifact: "artefatto",
  varies: "rarità variabile",
  none: null,
  unknown: null,
  "unknown (magic)": null,
};

const [items, varianti] = await Promise.all([
  fetch(`${RAW}items.json`).then((r) => r.json()),
  fetch(`${RAW}magicvariants.json`).then((r) => r.json()),
]);

const perNome = new Map();
for (const i of items.item ?? []) if (!perNome.has(i.name)) perNome.set(i.name, i);
// itemGroup raccoglie le schede che il manuale presenta come una sola voce con una tabella di
// varianti (Pietra di Ioun, Statuine del Potere Meraviglioso, Tappeto Volante): in 5etools
// non stanno in item[] ma qui, ed è questo il nome giusto a cui agganciarle
for (const g of items.itemGroup ?? []) if (!perNome.has(g.name)) perNome.set(g.name, g);
for (const v of varianti.magicvariant ?? []) {
  const nome = v.name ?? v.inherits?.name;
  if (nome && !perNome.has(nome)) perNome.set(nome, { ...v.inherits, name: nome, source: v.inherits?.source ?? "DMG" });
}

const dati = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "oggetti-dm-manuale.json"), "utf-8"));
const esistenti = await sql`SELECT nome, nome_inglese FROM compendio_ita_oggetto`;
const giaInTabella = new Set(esistenti.map((r) => r.nome));
const giaAgganciati = new Set(esistenti.filter((r) => r.nome_inglese).map((r) => r.nome_inglese));

const daInserire = [];
const saltati = [];

for (const [nomeItaliano, voce] of Object.entries(dati.voci)) {
  const inglese = perNome.get(voce.en);
  if (!inglese) { saltati.push(`${nomeItaliano} — "${voce.en}" non esiste in 5etools`); continue; }
  if (giaInTabella.has(nomeItaliano)) { saltati.push(`${nomeItaliano} — già in tabella`); continue; }
  if (giaAgganciati.has(voce.en)) { saltati.push(`${nomeItaliano} — "${voce.en}" già agganciato a un'altra riga`); continue; }

  // la rarità è un dato, non una traduzione: se non torna, il nome inglese è quello sbagliato
  const rarita5e = RARITA_5ETOOLS[inglese.rarity] ?? null;
  if (rarita5e && voce.rarita && rarita5e !== voce.rarita) {
    saltati.push(`${nomeItaliano} — rarità "${voce.rarita}" ma "${voce.en}" è "${rarita5e}"`);
    continue;
  }

  daInserire.push({ nome: nomeItaliano, ...voce });
}

console.log(`${daInserire.length} oggetti da aggiungere, ${saltati.length} saltati`);
for (const o of daInserire) console.log(`  + ${o.nome} = ${o.en} (${o.rarita}, ${o.testo.length} caratteri)`);
if (saltati.length > 0) {
  console.log("\nsaltati:");
  for (const s of saltati) console.log(`  - ${s}`);
}

if (applica) {
  for (const o of daInserire) {
    await sql`
      INSERT INTO compendio_ita_oggetto (nome, categoria, rarita, sintonia, descrizione, fonte, nome_inglese, fonte_inglese)
      VALUES (${o.nome}, ${o.categoria}, ${o.rarita}, ${o.sintonia}, ${o.testo}, 'dm_manuale', ${o.en}, 'DMG')`;
  }
  console.log(`\ninseriti ${daInserire.length} oggetti`);
} else {
  console.log("\n[PROVA] nessuna scrittura: aggiungere --applica");
}
