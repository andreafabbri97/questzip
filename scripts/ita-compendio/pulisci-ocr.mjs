// Applica lib/ocr-cleanup.ts a tutte le colonne di testo del Compendio italiano, e segnala (senza
// toccarle) le voci in cui l'OCR ha prodotto rumore invece di testo.
// Uso: node --env-file=../../.env.local pulisci-ocr.mjs [--dry-run]
import { neon } from "@neondatabase/serverless";
import { pulisciNumeriStatBlock, pulisciTestoOcr, quotaIlleggibile } from "../../lib/ocr-cleanup.ts";

const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes("--dry-run");

const CAMPI = {
  compendio_ita_incantesimo: ["descrizione", "tempo_di_lancio", "gittata", "componenti", "durata"],
  compendio_ita_mostro: ["tratti", "azioni", "azioni_leggendarie", "reazioni", "sensi", "linguaggi"],
  compendio_ita_oggetto: ["descrizione"],
  compendio_ita_talento: ["descrizione", "prerequisito"],
  compendio_ita_razza: ["introduzione"],
  compendio_ita_classe: ["equipaggiamento", "armature", "armi", "strumenti", "abilita"],
  compendio_ita_regola: ["testo"],
};

// Campi NUMERICI degli stat block: vanno puliti con una regola diversa dal testo descrittivo
// (unire due cifre separate da uno spazio e' giusto in "1 4" ma sbagliato in "2 o 3 bersagli").
// Nel PDF stanno in colonne strettissime e l'OCR li spezza di continuo: 69 mostri mostravano
// "CA 1 4" invece di "CA 14".
const CAMPI_NUMERICI = {
  compendio_ita_mostro: [
    "classe_armatura", "punti_ferita", "velocita", "sfida", "pe",
    "tiri_salvezza", "abilita", "sensi",
  ],
};

let numeriModificati = 0;
for (const [tabella, colonne] of Object.entries(CAMPI_NUMERICI)) {
  const righe = await sql.query(`SELECT id, ${colonne.join(", ")} FROM ${tabella}`);
  for (const riga of righe) {
    const patch = {};
    for (const c of colonne) {
      const v = riga[c];
      if (typeof v !== "string" || !v) continue;
      const pulito = pulisciNumeriStatBlock(v);
      if (pulito !== v) patch[c] = pulito;
    }
    const chiavi = Object.keys(patch);
    if (chiavi.length === 0) continue;
    numeriModificati++;
    if (!dryRun) {
      const set = chiavi.map((c, i) => `${c} = $${i + 1}`).join(", ");
      await sql.query(`UPDATE ${tabella} SET ${set} WHERE id = $${chiavi.length + 1}`, [
        ...chiavi.map((c) => patch[c]),
        riga.id,
      ]);
    }
  }
}
console.log(`${dryRun ? "[PROVA] " : ""}stat block con numeri ricomposti: ${numeriModificati}`);

let modificate = 0;
const illeggibili = [];

for (const [tabella, colonne] of Object.entries(CAMPI)) {
  const righe = await sql.query(`SELECT id, ${colonne.join(", ")} FROM ${tabella}`);
  for (const riga of righe) {
    const patch = {};
    for (const c of colonne) {
      const v = riga[c];
      if (typeof v !== "string" || !v) continue;
      const pulito = pulisciTestoOcr(v);
      if (pulito !== v) patch[c] = pulito;
      if (quotaIlleggibile(v) > 0.5) {
        illeggibili.push({ tabella, id: riga.id, campo: c, estratto: v.trim().slice(0, 60) });
      }
    }
    const chiavi = Object.keys(patch);
    if (chiavi.length === 0) continue;
    modificate++;
    if (!dryRun) {
      const set = chiavi.map((c, i) => `${c} = $${i + 1}`).join(", ");
      await sql.query(`UPDATE ${tabella} SET ${set} WHERE id = $${chiavi.length + 1}`, [
        ...chiavi.map((c) => patch[c]),
        riga.id,
      ]);
    }
  }
  console.log(`${tabella.padEnd(26)} controllata`);
}

console.log(`\n${dryRun ? "[PROVA] " : ""}righe ripulite: ${modificate}`);
console.log(`voci con rumore OCR (>50% parole illeggibili): ${illeggibili.length}`);
for (const x of illeggibili.slice(0, 15)) {
  console.log(`  ${x.tabella.replace("compendio_ita_", "")}.${x.campo}: ${JSON.stringify(x.estratto)}`);
}
