// Toglie dalle schede dei mostri la prosa della pagina che togli-prosa-schede non può riconoscere
// da sola, perché non comincia con uno stacco visibile: la descrizione dell'animale subito dopo
// l'ultimo attacco («Uno squalo gigante è lungo 9 metri…»), il capoverso di un altro mostro rimasto
// in coda («otyugh evita di attaccare…» nell'Orsogufo), il racconto finito in mezzo a un'azione.
//
// Si trovano confrontando la lunghezza di ogni sezione con quella dell'originale: 320 caratteri di
// azioni dove l'originale ne ha 100 sono un attacco e una descrizione. Quali righe togliere lo dice
// un file di parsed/, scritto guardando il testo:
//
//   { "voci": [ { "nome": "SQUALO GIGANTE", "fonte": "mm", "sezione": "azioni",
//                 "da": "Uno squalo gigante è lungo 9 metri e normalmente",
//                 "fino": null } ] }
//
// "da" è la prima riga da togliere, intera; "fino" è la prima riga che resta (null: si toglie fino
// in fondo alla sezione). Tutte e due devono comparire una volta sola nella sezione.
//
// Prima di scrivere si controlla che il testo tolto non contenga dadi: la prosa non ne ha, e un
// taglio che ne porta via uno ha preso un pezzo di scheda. Rilanciabile: se la riga "da" non c'è
// più, la voce è già stata sistemata.
//
// Uso: node --env-file=../../.env.local togli-prosa-indicata.mjs <file.json> [--applica]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const file = process.argv[2];
const applica = process.argv.includes("--applica");
if (!file) {
  console.error("Uso: node togli-prosa-indicata.mjs <file.json> [--applica]");
  process.exit(1);
}

const SEZIONI = ["tratti", "azioni", "azioni_bonus", "reazioni", "azioni_leggendarie"];
const { voci } = JSON.parse(readFileSync(file, "utf-8"));
let sistemate = 0;
let giaFatte = 0;
let caratteri = 0;
const respinte = [];

// Più tagli possono riguardare la stessa sezione: si leggono le righe una volta per scheda e i
// tagli si applicano uno dopo l'altro sul testo già accorciato.
const perScheda = new Map();
for (const voce of voci) {
  const chiave = `${voce.nome}|${voce.fonte}`;
  perScheda.set(chiave, [...(perScheda.get(chiave) ?? []), voce]);
}

for (const [chiave, tagli] of perScheda) {
  const [nome, fonte] = chiave.split("|");
  const righe = await sql.query(`SELECT id, ${SEZIONI.join(", ")} FROM compendio_ita_mostro WHERE nome = $1 AND fonte = $2`, [nome, fonte]);
  if (righe.length !== 1) {
    respinte.push(`${nome} [${fonte}]: ${righe.length} righe trovate, attesa una sola`);
    continue;
  }
  const nuovi = {};
  for (const voce of tagli) {
    const etichetta = `${nome} [${fonte}] ${voce.sezione}`;
    if (!SEZIONI.includes(voce.sezione)) {
      respinte.push(`${etichetta}: sezione sconosciuta`);
      continue;
    }
    const linee = (nuovi[voce.sezione] ?? righe[0][voce.sezione] ?? "").split("\n");
    const inizi = linee.flatMap((l, i) => (l === voce.da ? [i] : []));
    if (inizi.length === 0) {
      // «Non c'è più» vuol dire già tolta solo se non ne resta traccia: se l'inizio della riga si
      // trova ancora nella scheda, la riga del file è scritta in un altro modo (uno spazio, un a
      // capo diverso) e il taglio NON è stato fatto.
      const traccia = voce.da.trim().slice(0, 40);
      const resta = traccia.length >= 8 && SEZIONI.some((s) => (nuovi[s] ?? righe[0][s] ?? "").includes(traccia));
      if (resta) respinte.push(`${etichetta}: la riga «${traccia}…» c'è ancora, ma non è scritta come nel file`);
      else giaFatte++;
      continue;
    }
    if (inizi.length > 1) {
      respinte.push(`${etichetta}: la riga «${voce.da.slice(0, 50)}» compare ${inizi.length} volte`);
      continue;
    }
    const inizio = inizi[0];
    const fini = voce.fino == null ? [linee.length] : linee.flatMap((l, i) => (i > inizio && l === voce.fino ? [i] : []));
    if (fini.length !== 1) {
      respinte.push(`${etichetta}: la riga a cui fermarsi «${String(voce.fino).slice(0, 50)}» compare ${fini.length} volte dopo l'inizio`);
      continue;
    }
    const tolto = linee.slice(inizio, fini[0]).join("\n");
    if (/\b\d+d\d+\b/.test(tolto)) {
      respinte.push(`${etichetta}: il testo da togliere contiene dei dadi («${tolto.match(/\b\d+d\d+\b/)[0]}»)`);
      continue;
    }
    nuovi[voce.sezione] = [...linee.slice(0, inizio), ...linee.slice(fini[0])].join("\n").trimEnd();
    sistemate++;
    caratteri += tolto.length;
    console.log(`✓ ${etichetta}: via ${tolto.length} caratteri («${tolto.replace(/\s+/g, " ").slice(0, 60)}…»)`);
  }
  const colonne = Object.keys(nuovi);
  if (applica && colonne.length > 0) {
    await sql.query(
      `UPDATE compendio_ita_mostro SET ${colonne.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1`,
      [righe[0].id, ...colonne.map((c) => nuovi[c])],
    );
  }
}

for (const r of respinte) console.log(`✗ ${r}`);
console.log(
  `\n${applica ? "" : "[PROVA] "}tratti di prosa tolti: ${sistemate} (${caratteri} caratteri); già sistemati: ${giaFatte}; respinti: ${respinte.length}`,
);
