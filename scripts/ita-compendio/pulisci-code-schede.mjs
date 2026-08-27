// Toglie dalle schede del Compendio il testo che non gli appartiene.
//
// I parser prendevano il corpo di una scheda "fino alla scheda successiva". Ma tra una scheda e
// l'altra il manuale mette la prosa: la storia dei giganti, i racconti d'apertura, i riquadri, a
// volte un capitolo intero. Tutta quella roba finiva in coda all'ultimo campo della scheda prima.
// Nel Compendio si vedeva: il Ghoul del Manuale dei Mostri con 34.000 caratteri di azioni, la Spia
// della Guida a Ravenloft con 105.000, i Linguaggi del tiefling che contenevano l'apertura del
// capitolo sulle classi. I parser adesso chiudono la scheda al punto giusto (fineStatBlock in
// parse-mostri.mjs, isTitoloDiSezione in parse-razze.mjs); questo script riporta al nuovo confine
// le schede già in tabella, senza rifare il seed — che cancellerebbe nomi inglesi e correzioni.
//
// Un campo si riscrive SOLO se si accorcia: se si allungasse vorrebbe dire che il nuovo confine ha
// preso qualcosa in più, ed è l'opposto di ciò che si vuole qui. E la scheda si salta del tutto se
// resterebbe senza contenuto o senza le azioni: in poche pagine le colonne del PDF sono uscite
// mescolate (il Plesiosauro ha addosso i tratti dell'Allosauro) e lì il confine cade nel posto
// sbagliato — meglio lasciarle come stanno che perderne il contenuto.
//
// Uso: node --env-file=../../.env.local pulisci-code-schede.mjs <mostri|razze> [--applica]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const [categoria] = process.argv.slice(2);
const applica = process.argv.includes("--applica");

const CONFIG = {
  mostri: {
    tabella: "compendio_ita_mostro",
    file: (l) => `${l}-mostri.json`,
    libri: ["mm", "ravenloft", "dragonlance", "multiverso", "fizban", "bigby"],
    campi: [
      ["tratti", "tratti"],
      ["azioni", "azioni"],
      ["reazioni", "reazioni"],
      ["azioniLeggendarie", "azioni_leggendarie"],
    ],
    // un mostro senza azioni non è una scheda: se il nuovo confine gliele toglie, è il confine a
    // essere sbagliato
    indispensabile: "azioni",
  },
  razze: {
    tabella: "compendio_ita_razza",
    file: (l) => `${l}-razze.json`,
    libri: ["phb"],
    campi: [
      ["introduzione", "introduzione"],
      ["tratti", "tratti"],
      ["sottorazze", "sottorazze"],
    ],
    indispensabile: "tratti",
  },
};

const cfg = CONFIG[categoria];
if (!cfg) {
  console.error("Uso: pulisci-code-schede.mjs <mostri|razze> [--applica]");
  process.exit(1);
}

// tratti/sottorazze sono jsonb: il confronto va fatto sulla stessa rappresentazione testuale
const testo = (valore) => {
  if (valore == null) return "";
  return typeof valore === "string" ? valore : JSON.stringify(valore);
};

let aggiornate = 0;
let caratteriTolti = 0;
const saltate = [];

for (const libro of cfg.libri) {
  const parsed = JSON.parse(
    readFileSync(path.join(SCRIPT_DIR, "parsed", cfg.file(libro)), "utf-8"),
  );
  const voci = Array.isArray(parsed) ? parsed : Object.values(parsed).find(Array.isArray) ?? [];
  const colonne = cfg.campi.map(([, c]) => c);
  const righe = await sql.query(
    `SELECT nome, ${colonne.join(", ")} FROM ${cfg.tabella} WHERE fonte = $1`,
    [libro],
  );
  const perNome = new Map(righe.map((r) => [r.nome, r]));

  for (const v of voci) {
    const attuale = perNome.get(v.nome);
    if (!attuale) continue;

    const nuovi = {};
    let tolti = 0;
    for (const [chiave, colonna] of cfg.campi) {
      const prima = testo(attuale[colonna]);
      const dopo = testo(v[chiave]);
      if (dopo.length < prima.length) {
        nuovi[colonna] = v[chiave] ?? null;
        tolti += prima.length - dopo.length;
      }
    }
    if (tolti < 200) continue;

    const perdeIlNecessario =
      testo(attuale[cfg.indispensabile]).length > 0 && testo(v[cfg.indispensabile]).length === 0;
    const restaVuota = cfg.campi.every(([chiave]) => !testo(v[chiave]).trim());
    if (perdeIlNecessario || restaVuota) {
      saltate.push(`${v.nome} [${libro}] — ${restaVuota ? "resterebbe vuota" : `perderebbe: ${cfg.indispensabile}`}`);
      continue;
    }

    aggiornate++;
    caratteriTolti += tolti;
    if (applica) {
      const daScrivere = Object.keys(nuovi);
      await sql.query(
        `UPDATE ${cfg.tabella}
         SET ${daScrivere.map((c, i) => `${c} = $${i + 1}`).join(", ")}
         WHERE fonte = $${daScrivere.length + 1} AND nome = $${daScrivere.length + 2}`,
        [
          ...daScrivere.map((c) => {
            const valore = nuovi[c];
            return typeof valore === "string" || valore === null ? valore : JSON.stringify(valore);
          }),
          libro,
          v.nome,
        ],
      );
    }
  }
}

console.log(
  `${applica ? "" : "[PROVA] "}${aggiornate} schede ripulite, ${caratteriTolti.toLocaleString("it-IT")} caratteri di testo estraneo rimossi`,
);
if (saltate.length > 0) {
  console.log(`\nsaltate (colonne del PDF uscite mescolate, ${saltate.length}):`);
  for (const s of saltate) console.log(`  - ${s}`);
}
if (!applica) console.log("\naggiungere --applica per scrivere");
