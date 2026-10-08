// Riparazione MIRATA dei nomi dei mostri dopo la correzione di parse-mostri.mjs (titoli andati a
// capo nel PDF, estratti a metà: "DELLE TEMPESTE" invece di "QUINTESSENZA DI GIGANTE DELLE
// TEMPESTE"). Un re-seed completo rimetterebbe a posto i nomi ma CANCELLA e reinserisce tutte le
// righe del libro, azzerando nome_inglese/fonte_inglese e la pulizia OCR gia' applicata: qui si
// aggiorna quindi solo la colonna "nome" delle righe sbagliate.
//
// L'abbinamento fra riga vecchia e scheda nuova NON usa il nome (che e' proprio cio' che e'
// sbagliato) ma CA e PF, che il parser non ha toccato: sono la stessa scheda, quindi combaciano.
// Se una riga non trova esattamente un candidato, viene lasciata stare e segnalata.
//
// Uso: node --env-file=../../.env.local ripara-nomi-mostri.mjs [--applica] [--elenco]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { pulisciNumeriStatBlock } from "../../lib/ocr-cleanup.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const LIBRI = ["multiverso", "bigby", "fizban", "mm", "dragonlance", "ravenloft"];

let rinominate = 0;
const irrisolte = [];
const scartate = [];

for (const libro of LIBRI) {
  const parsed = JSON.parse(
    readFileSync(path.join(SCRIPT_DIR, "parsed", `${libro}-mostri.json`), "utf-8"),
  );
  const nuovi = Array.isArray(parsed) ? parsed : parsed.monsters ?? [];
  const nomiNuovi = new Set(nuovi.map((m) => m.nome));

  const righe = await sql.query(
    "SELECT id, nome, classe_armatura, punti_ferita FROM compendio_ita_mostro WHERE fonte = $1",
    [libro],
  );
  const nomiInDb = new Set(righe.map((r) => r.nome));

  for (const riga of righe) {
    // Se il nome esiste ancora fra quelli prodotti dal parser, la riga e' gia' a posto.
    if (nomiNuovi.has(riga.nome)) continue;

    const chiave = `${pulisciNumeriStatBlock(riga.classe_armatura ?? "")}|${pulisciNumeriStatBlock(riga.punti_ferita ?? "")}`;
    if (chiave === "|") { irrisolte.push(`${riga.nome} [${libro}] (niente CA/PF per il confronto)`); continue; }

    const candidati = nuovi.filter(
      (m) =>
        `${pulisciNumeriStatBlock(m.classeArmatura ?? "")}|${pulisciNumeriStatBlock(m.puntiFerita ?? "")}` === chiave &&
        !nomiInDb.has(m.nome),
    );
    if (candidati.length !== 1) {
      irrisolte.push(`${riga.nome} [${libro}] (${candidati.length} candidati con stessi CA/PF)`);
      continue;
    }
    const nuovo = candidati[0].nome;
    // Lo script ripara i titoli TRONCATI: il nome nuovo deve contenere quello vecchio e
    // completarlo. Senza questo controllo, rilanciato mesi dopo proponeva 42 rinomine tutte al
    // contrario — i nomi nel database nel frattempo erano stati corretti a mano o dalla pulizia
    // OCR, e venivano riportati a quelli grezzi del parser («DRETCH» -> «DEMONP», «ZARIEL» ->
    // «ZARI EL», «UFFICIALE DELL'ARMATA DEL DRAGO» -> «UFFICIALE DELLYRMATA DEL DRAGO»).
    const completa = nuovo.length > riga.nome.length && nuovo.toUpperCase().includes(riga.nome.toUpperCase());
    if (!completa) {
      scartate.push(`${riga.nome} [${libro}] (il parser dice «${nuovo}»: non è un completamento)`);
      continue;
    }
    console.log(`${riga.nome} [${libro}] -> ${nuovo}`);
    if (applica) {
      await sql.query("UPDATE compendio_ita_mostro SET nome = $1 WHERE id = $2", [nuovo, riga.id]);
    }
    nomiInDb.delete(riga.nome);
    nomiInDb.add(nuovo);
    rinominate++;
  }
}

console.log(`\n${applica ? "" : "[PROVA] "}righe rinominate: ${rinominate}`);
console.log(`non risolte: ${irrisolte.length}`);
for (const x of irrisolte) console.log("  -", x);
console.log(`scartate perché non completano il nome: ${scartate.length}`);
if (process.argv.includes("--elenco")) for (const x of scartate) console.log("  -", x);
