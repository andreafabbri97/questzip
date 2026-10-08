// Sostituisce nel database le Regole di una fonte con quelle di parsed/<chiave>-regole.json.
//
// seed.mjs fa la stessa cosa, ma per tutti i libri insieme e una riga alla volta: se si ferma a
// metà la fonte resta mezza vuota, e ricaricare tutto il Compendio per cambiare un libro solo
// cancellerebbe le correzioni fatte a mano sugli altri. Qui si tocca una fonte, e la sostituzione
// è una transazione: o entrano tutte le sezioni nuove o restano le vecchie.
//
// Prima di cancellare salva le righe che c'erano: in parsed/<chiave>-regole-prima.json la prima
// volta (è la versione da cui si è partiti, e resta), poi in un file con la data.
//
// Tre cose le rifiuta, a meno di --forza:
// - una fonte che non è fatta per essere rigenerata: le Regole del Manuale del Giocatore e del
//   Master sono state corrette nel database dopo il caricamento, e dal file tornerebbero indietro;
// - un file con la fonte sbagliata per quel libro;
// - un file molto più piccolo di ciò che sostituisce (un parser interrotto a metà).
//
// Senza --applica dice soltanto che cosa cambierebbe. Dopo --applica va svuotata la cache del
// Compendio (invalida-cache.mjs), altrimenti l'app resta sulle sezioni di prima.
//
// Uso: node --env-file=../../.env.local ricarica-regole.mjs <chiave> [--applica] [--forza]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const [chiave] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const applica = process.argv.includes("--applica");
const forza = process.argv.includes("--forza");
if (!chiave) {
  console.error("Uso: node --env-file=../../.env.local ricarica-regole.mjs <chiave> [--applica] [--forza]");
  process.exit(1);
}

// Le fonti il cui testo nel database è esattamente quello del file, e si possono rifare.
const RIGENERABILI = new Set(["costa_spada"]);
// La fonte delle righe non ha sempre il nome del libro.
const FONTE_DEL_LIBRO = { phb: "phb_regole", dm_manuale: "dm_regole" };

const sezioni = JSON.parse(readFileSync(new URL(`./parsed/${chiave}-regole.json`, import.meta.url), "utf-8"));
const fonti = [...new Set(sezioni.map((s) => s.fonte))];
// Un file vuoto, o che mescola più fonti, è un errore a monte: meglio fermarsi che svuotare la fonte.
if (sezioni.length === 0 || fonti.length !== 1 || sezioni.some((s) => !s.titolo || !s.testo)) {
  console.error(`parsed/${chiave}-regole.json non va bene: ${sezioni.length} sezioni, fonti ${JSON.stringify(fonti)}`);
  process.exit(1);
}
const [fonte] = fonti;

const sql = neon(process.env.DATABASE_URL);
const vecchie = await sql`SELECT id, titolo, testo, pagina, fonte, ordine FROM compendio_ita_regola WHERE fonte = ${fonte} ORDER BY pagina, ordine`;
const caratteri = (righe) => righe.reduce((n, r) => n + r.testo.length, 0);
console.log(`${fonte}: nel database ${vecchie.length} sezioni (${caratteri(vecchie)} caratteri), nel file ${sezioni.length} (${caratteri(sezioni)})`);

const ostacoli = [];
if (fonte !== (FONTE_DEL_LIBRO[chiave] ?? chiave)) ostacoli.push(`il file ha la fonte «${fonte}», per «${chiave}» ci si aspetta «${FONTE_DEL_LIBRO[chiave] ?? chiave}»`);
if (!RIGENERABILI.has(fonte)) ostacoli.push(`«${fonte}» non è fra le fonti rigenerabili: nel database può avere correzioni che il file non ha`);
if (vecchie.length > 0 && caratteri(sezioni) < caratteri(vecchie) * 0.6) ostacoli.push("il file è molto più piccolo di ciò che sostituirebbe");
for (const o of ostacoli) console.log(`${forza ? "!" : "✗"} ${o}`);

if (ostacoli.length > 0 && !forza) {
  console.log("Niente è stato cambiato: se è voluto, rilanciare con --forza.");
} else if (!applica) {
  console.log("[PROVA] niente è stato cambiato: rilanciare con --applica");
} else {
  // Ciò che si sta per cancellare si salva sempre. Il primo file non si sovrascrive mai.
  let copia = `${chiave}-regole-prima.json`;
  if (existsSync(new URL(`./parsed/${copia}`, import.meta.url))) copia = `${chiave}-regole-prima-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}.json`;
  if (vecchie.length > 0) writeFileSync(new URL(`./parsed/${copia}`, import.meta.url), JSON.stringify(vecchie, null, 1));

  await sql.transaction([
    sql`DELETE FROM compendio_ita_regola WHERE fonte = ${fonte}`,
    ...sezioni.map(
      (s, i) => sql`INSERT INTO compendio_ita_regola (titolo, testo, pagina, fonte, ordine) VALUES (${s.titolo}, ${s.testo}, ${s.pagina ?? null}, ${fonte}, ${s.ordine ?? i})`,
    ),
  ]);
  console.log(`${sezioni.length} sezioni caricate${vecchie.length > 0 ? `; quelle di prima sono in parsed/${copia}` : ""}`);
  console.log("Ora va svuotata la cache: node --env-file=../../.env.local invalida-cache.mjs https://questzip.vercel.app");
}
