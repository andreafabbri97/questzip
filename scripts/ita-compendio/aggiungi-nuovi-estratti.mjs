// Aggiunge al Compendio le voci che una nuova passata del parser ha recuperato, SENZA rifare il
// seed.
//
// Il seed cancella e reinserisce tutte le righe di un libro, e con esse i collegamenti
// nome_inglese/fonte_inglese e le correzioni OCR già applicate: quando si migliora un parser e ne
// escono tre schede in più, rifare il seed costerebbe molto più di quanto guadagni. Qui si
// inseriscono solo le voci che nel database ancora non ci sono.
//
// Con --riallinea si sistema anche il danno collaterale: finché una scheda non veniva riconosciuta,
// la descrizione di quella PRECEDENTE se la inglobava (il corpo di un incantesimo arriva fino alla
// scheda dopo). Recuperare la scheda persa non basta quindi a chiudere il buco — va anche riscritta
// la descrizione che l'aveva assorbita. Si riscrivono solo le righe che si ACCORCIANO, e di almeno
// 200 caratteri: una riga che si allunga o cambia di poco è quasi sempre una correzione manuale già
// applicata in passato, e sovrascriverla la perderebbe.
//
// Uso: node --env-file=../../.env.local aggiungi-nuovi-estratti.mjs <categoria> <chiave_libro> [--applica] [--riallinea]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { pulisciTestoOcr } from "../../lib/ocr-cleanup.ts";
import { togliTestatinePagina } from "../../lib/testatine-pagina.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const [categoria, libro] = process.argv.slice(2);
const applica = process.argv.includes("--applica");

const CONFIG = {
  incantesimi: {
    file: (l) => `${l}-incantesimi.json`,
    tabella: "compendio_ita_incantesimo",
    colonne: ["nome", "livello", "scuola", "rituale", "tempo_di_lancio", "gittata", "componenti", "durata", "descrizione", "fonte"],
    valori: (x, l) => [
      x.nome, x.livello, x.scuola, x.rituale,
      x.tempoDiLancio ?? "", x.gittata ?? "", x.componenti ?? "", x.durata ?? "",
      pulisciTestoOcr(togliTestatinePagina(x.descrizione ?? "")), l,
    ],
  },
};

if (!CONFIG[categoria] || !libro) {
  console.error("Uso: aggiungi-nuovi-estratti.mjs <incantesimi> <chiave_libro> [--applica]");
  process.exit(1);
}
const cfg = CONFIG[categoria];

const parsed = JSON.parse(
  readFileSync(path.join(SCRIPT_DIR, "parsed", cfg.file(libro)), "utf-8"),
);
const voci = Array.isArray(parsed) ? parsed : parsed[categoria] ?? [];

const riallinea = process.argv.includes("--riallinea");

const esistenti = await sql.query(
  `SELECT nome, descrizione FROM ${cfg.tabella} WHERE fonte = $1`,
  [libro],
);
const giaPresenti = new Set(esistenti.map((r) => r.nome));
const descrizioniAttuali = new Map(esistenti.map((r) => [r.nome, r.descrizione]));

// Il confronto per stabilire cos'è "nuovo" ignora le maiuscole: una voce che differisce dal nome
// già in tabella solo per la grafia È la stessa voce. Contandola come nuova la si inseriva una
// seconda volta, e --rinomina finiva per allineare anche l'originale, lasciando due righe identiche.
const giaPresentiMinuscolo = new Set([...giaPresenti].map((n) => n.toLowerCase()));
const nuove = voci.filter((v) => !giaPresentiMinuscolo.has(v.nome.toLowerCase()));
console.log(`${voci.length} voci nel file, ${giaPresenti.size} già nel Compendio, ${nuove.length} nuove`);
for (const n of nuove) console.log(`  + ${n.nome}${n.livello !== undefined ? ` (liv ${n.livello}, ${n.scuola})` : ""}`);

// --rinomina corregge la GRAFIA dei nomi già presenti, ma solo quando cambiano le maiuscole e
// nient'altro: nei manuali articoli e preposizioni nei titoli restano minuscoli ("Interdizione alle
// Lame", "Camminare sull'Acqua") e le prime passate del parser li avevano maiuscolati. Il vincolo
// "stesse lettere, stessi spazi" fa sì che questa opzione non possa mai sostituire un nome con un
// altro nome: al massimo ne cambia il maiuscolo/minuscolo.
const rinomina = process.argv.includes("--rinomina");
const soloMaiuscole = (a, b) => a !== b && a.toLowerCase() === b.toLowerCase();

const daRinominare = rinomina
  ? voci
      .map((v) => ({ v, attuale: [...giaPresenti].find((n) => soloMaiuscole(n, v.nome)) }))
      .filter((x) => x.attuale)
      .map((x) => ({ da: x.attuale, a: x.v.nome }))
  : [];
if (rinomina) {
  console.log(`\n${daRinominare.length} nomi da correggere nella grafia`);
  for (const r of daRinominare) console.log(`  ~ ${r.da}  ->  ${r.a}`);
}

const SOGLIA_ACCORCIAMENTO = 200;
const daRiallineare = [];
if (riallinea) {
  const indiceDescrizione = cfg.colonne.indexOf("descrizione");
  for (const v of voci) {
    const attuale = descrizioniAttuali.get(v.nome);
    if (attuale === undefined) continue;
    const nuova = cfg.valori(v, libro)[indiceDescrizione];
    if (attuale.length - nuova.length < SOGLIA_ACCORCIAMENTO) continue;
    daRiallineare.push({ nome: v.nome, nuova, da: attuale.length, a: nuova.length });
  }
  console.log(`\n${daRiallineare.length} descrizioni si accorciano (avevano inglobato la scheda successiva)`);
  for (const r of daRiallineare) console.log(`  ~ ${r.nome}: ${r.da} -> ${r.a} caratteri`);
}

if (applica && nuove.length > 0) {
  const segnaposto = cfg.colonne.map((_, i) => `$${i + 1}`).join(", ");
  for (const n of nuove) {
    await sql.query(
      `INSERT INTO ${cfg.tabella} (${cfg.colonne.join(", ")}) VALUES (${segnaposto})`,
      cfg.valori(n, libro),
    );
  }
  console.log(`\ninserite ${nuove.length} voci`);
}

if (applica && daRiallineare.length > 0) {
  for (const r of daRiallineare) {
    await sql.query(
      `UPDATE ${cfg.tabella} SET descrizione = $1 WHERE fonte = $2 AND nome = $3`,
      [r.nuova, libro, r.nome],
    );
  }
  console.log(`riallineate ${daRiallineare.length} descrizioni`);
}

if (applica && daRinominare.length > 0) {
  for (const r of daRinominare) {
    await sql.query(
      `UPDATE ${cfg.tabella} SET nome = $1 WHERE fonte = $2 AND nome = $3`,
      [r.a, libro, r.da],
    );
  }
  console.log(`corretti ${daRinominare.length} nomi`);
}

if (!applica) {
  console.log("\n[PROVA] nessuna scrittura: aggiungere --applica");
}
