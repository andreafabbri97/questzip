// Porta nel Compendio i talenti dei manuali diversi dal Manuale del Giocatore.
//
// parse-talenti.mjs sa isolare il capitolo dei talenti solo nel Manuale del Giocatore: negli altri
// libri i talenti sono dentro capitoli più grandi (le "Opzioni di Personalizzazione" del Calderone
// di Tasha, i "Talenti razziali" della Guida di Xanathar, i talenti di ambientazione di
// Dragonlance) e non c'è un confine di capitolo affidabile su cui fermarsi. Invece di inseguire
// quel confine libro per libro, il parser prende largo — anche righe che talenti non sono — e la
// selezione la fa questo script: entrano SOLO le voci elencate in mappa-talenti-<libro>.json, cioè
// quelle che sono state riconosciute una per una e abbinate alla loro voce inglese.
//
// Uso: node --env-file=../../.env.local aggiungi-talenti-da-manuali.mjs <chiave_libro> [--applica]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { pulisciTestoOcr } from "../../lib/ocr-cleanup.ts";
import { togliTestatinePagina } from "../../lib/testatine-pagina.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const [libro] = process.argv.slice(2);
const applica = process.argv.includes("--applica");

const FONTI = { phb: "PHB", tasha: "TCE", xanathar: "XGE", dragonlance: "DSotDQ", bigby: "BGG", fizban: "FTD" };
if (!FONTI[libro]) {
  console.error(`Uso: aggiungi-talenti-da-manuali.mjs <${Object.keys(FONTI).join("|")}> [--applica]`);
  process.exit(1);
}

const inglesi = await fetch(
  "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/feats.json",
).then((r) => r.json());
const perNome = new Map(
  inglesi.feat.filter((f) => f.source === FONTI[libro]).map((f) => [f.name, f]),
);

const mappa = JSON.parse(readFileSync(path.join(SCRIPT_DIR, `mappa-talenti-${libro}.json`), "utf-8"));
// I testi trascritti a mano stanno sotto parsed/ (gitignored) e non dentro la mappa: sono paragrafi
// interi dei manuali, e questo repository è pubblico. La mappa qui tracciata contiene solo
// l'abbinamento dei nomi, che è lavoro nostro.
const trascritti = (() => {
  try {
    return JSON.parse(readFileSync(path.join(SCRIPT_DIR, "parsed", "testi-trascritti.json"), "utf-8")).talenti ?? {};
  } catch {
    return {};
  }
})();
const parsed = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "parsed", `${libro}-talenti.json`), "utf-8"));
const voci = new Map(parsed.map((t) => [t.nome, t]));

const esistenti = await sql.query(
  `SELECT nome, nome_inglese FROM compendio_ita_talento WHERE fonte = $1`,
  [libro],
);
const giaInTabella = new Set(esistenti.map((r) => r.nome));
const giaAgganciati = new Set(esistenti.filter((r) => r.nome_inglese).map((r) => r.nome_inglese));

const daInserire = [];
const saltati = [];

for (const [nomeParsato, valore] of Object.entries(mappa)) {
  if (nomeParsato.startsWith("_")) continue;
  const nomeInglese = typeof valore === "string" ? valore : valore.en;
  const nomeItaliano = (typeof valore === "string" ? null : valore.it) ?? nomeParsato;
  const scheda = voci.get(nomeParsato);

  // una voce può portarsi dietro il proprio testo: serve per i pochi talenti il cui titolo, nel
  // PDF, è stampato in tondo invece che in maiuscoletto e che quindi il parser non vede come
  // intestazione (il Cuoco del Calderone di Tasha). In quei casi il testo è trascritto a mano.
  const testoAMano = (typeof valore === "object" ? valore.testo : null) ?? trascritti[nomeItaliano] ?? null;
  if (!scheda && !testoAMano) { saltati.push(`${nomeParsato} — non è fra le voci estratte`); continue; }
  if (!perNome.has(nomeInglese)) { saltati.push(`${nomeParsato} — "${nomeInglese}" non è un talento ${FONTI[libro]}`); continue; }
  if (giaInTabella.has(nomeItaliano) || giaAgganciati.has(nomeInglese)) { saltati.push(`${nomeParsato} — già in tabella`); continue; }

  daInserire.push({
    nome: nomeItaliano,
    nomeInglese,
    prerequisito: (typeof valore === "object" ? valore.prerequisito : null) ?? scheda?.prerequisito ?? "",
    descrizione: testoAMano ?? pulisciTestoOcr(togliTestatinePagina(scheda.descrizione ?? "")),
  });
}

console.log(`${libro}: ${daInserire.length} talenti da aggiungere, ${saltati.length} saltati`);
for (const t of daInserire) console.log(`  + ${t.nome} = ${t.nomeInglese} (${t.descrizione.length} caratteri)`);
if (saltati.length > 0) {
  console.log("\nsaltati:");
  for (const s of saltati) console.log(`  - ${s}`);
}

if (applica) {
  for (const t of daInserire) {
    await sql.query(
      `INSERT INTO compendio_ita_talento (nome, prerequisito, descrizione, fonte, nome_inglese, fonte_inglese)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [t.nome, t.prerequisito, t.descrizione, libro, t.nomeInglese, FONTI[libro]],
    );
  }
  console.log(`\ninseriti ${daInserire.length} talenti`);
} else {
  console.log("\n[PROVA] nessuna scrittura: aggiungere --applica");
}
