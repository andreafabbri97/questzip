// Rimette gli accenti ai testi presi dal Calderone Omnicomprensivo di Tasha.
//
// Lo strato di testo di quel PDF ha perso le vocali accentate in modo sistematico ("pud" per può,
// "piti" per più, "é" al posto di ogni "è", "velocita"): vedi ripristinaAccentiPersi in
// lib/ocr-cleanup.ts. Riguarda tutto ciò che è stato estratto da lì: 21 incantesimi, 15 talenti,
// una razza, e il paragrafo introduttivo delle sottoclassi (la riga che porta il nome della
// sottoclasse, scritta da parse-subclasses-pdf.mjs — le altre righe sono traduzioni e gli accenti
// li hanno).
//
// La regola vale SOLO per i testi di questo manuale, per questo non sta in pulisci-ocr.mjs che
// passa su tutto il Compendio.
//
// Uso: node --env-file=../../.env.local ripara-accenti-tasha.mjs [--applica]
import { neon } from "@neondatabase/serverless";
import { pulisciTestoOcr, ripristinaAccentiPersi } from "../../lib/ocr-cleanup.ts";

const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");

const TABELLE = {
  compendio_ita_incantesimo: ["descrizione", "tempo_di_lancio", "gittata", "componenti", "durata"],
  compendio_ita_talento: ["descrizione", "prerequisito"],
  compendio_ita_razza: ["introduzione", "tratti", "sottorazze"],
  compendio_ita_oggetto: ["descrizione"],
};

const ripara = (testo) => pulisciTestoOcr(ripristinaAccentiPersi(testo));

/** Applica la riparazione a ogni stringa di una struttura (le razze tengono i tratti in JSON). */
function profondo(valore) {
  if (typeof valore === "string") return ripara(valore);
  if (Array.isArray(valore)) return valore.map(profondo);
  if (valore && typeof valore === "object") {
    return Object.fromEntries(Object.entries(valore).map(([k, v]) => [k, k === "nome" ? v : profondo(v)]));
  }
  return valore;
}

let righeToccate = 0;
const esempi = [];
for (const [tabella, colonne] of Object.entries(TABELLE)) {
  const righe = await sql.query(`SELECT id, nome, ${colonne.join(", ")} FROM ${tabella} WHERE fonte = 'tasha'`);
  let toccate = 0;
  for (const riga of righe) {
    const patch = {};
    for (const c of colonne) {
      if (riga[c] == null) continue;
      const nuovo = profondo(riga[c]);
      if (JSON.stringify(nuovo) !== JSON.stringify(riga[c])) patch[c] = nuovo;
    }
    const chiavi = Object.keys(patch);
    if (chiavi.length === 0) continue;
    toccate++;
    if (esempi.length < 4 && typeof patch[chiavi[0]] === "string") {
      const prima = riga[chiavi[0]];
      const i = [...prima].findIndex((ch, k) => ch !== patch[chiavi[0]][k]);
      esempi.push(`${riga.nome}: …${prima.slice(Math.max(0, i - 30), i + 30)}… -> …${patch[chiavi[0]].slice(Math.max(0, i - 30), i + 30)}…`);
    }
    if (applica) {
      const set = chiavi.map((c, i) => `${c} = $${i + 1}`).join(", ");
      await sql.query(`UPDATE ${tabella} SET ${set} WHERE id = $${chiavi.length + 1}`, [
        ...chiavi.map((c) => (typeof patch[c] === "object" ? JSON.stringify(patch[c]) : patch[c])),
        riga.id,
      ]);
    }
  }
  righeToccate += toccate;
  console.log(`${tabella.padEnd(28)} ${toccate} su ${righe.length}`);
}

// Le introduzioni delle sottoclassi di Tasha: solo la riga che porta il nome della sottoclasse.
const sottoclassi = await sql`
  SELECT name, source, nome_ita, descrizione_ita FROM compendio_traduzione_ia
  WHERE kind = 'classi' AND source = 'TCE' AND descrizione_ita IS NOT NULL AND nome_ita IS NOT NULL`;
let introToccate = 0;
for (const s of sottoclassi) {
  const righe = s.descrizione_ita.split("\n");
  const prefisso = `${s.nome_ita} (Liv. `;
  const nuove = righe.map((r) => (r.startsWith(prefisso) ? ripara(r) : r));
  const nuova = nuove.join("\n");
  if (nuova === s.descrizione_ita) continue;
  introToccate++;
  if (applica) {
    await sql`UPDATE compendio_traduzione_ia SET descrizione_ita = ${nuova}, updated_at = now()
              WHERE kind = 'classi' AND name = ${s.name} AND source = ${s.source}`;
  }
}
console.log(`${"introduzioni di sottoclasse".padEnd(28)} ${introToccate} su ${sottoclassi.length}`);
console.log(`\n${applica ? "" : "[PROVA] "}righe riparate: ${righeToccate + introToccate}`);
for (const e of esempi) console.log(`  ${e}`);
