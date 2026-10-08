// Rimette nella sezione giusta il testo di una scheda di mostro finito in quella sbagliata.
//
// Quando l'estrazione non riconosce il titolo «AZIONI» (il maiuscoletto letto male, o rimasto in
// mezzo al testo come una riga qualunque), tutta la scheda finisce nei tratti e le azioni restano
// vuote. Il controllo dei dadi non se ne accorge, perché li conta sull'intera scheda: il testo c'è
// tutto, è solo nel riquadro sbagliato. Si trovano confrontando sezione per sezione con
// l'originale (quali sezioni ha, e se in italiano sono vuote).
//
// Dove tagliare lo dice un file di parsed/, scritto guardando i titoletti della scheda:
//
//   { "voci": [ { "nome": "HEZROU", "fonte": "mm", "da": "tratti",
//                 "tagli": [ ["azioni", "Multiattacco"] ] } ] }
//
// Ogni taglio è [sezione di arrivo, come comincia la sua prima riga]: da quella riga in poi, fino
// al taglio successivo, il testo passa alla sezione di arrivo; ciò che sta prima resta dov'era.
// Le righe che sono solo il titolo di una sezione («AZIONI», «AZIONI BONUS») si tolgono, e così
// quelle elencate in "togli" (i pezzi della tabella delle caratteristiche rimasti in mezzo). Con
// "spoglia" si toglie un prefisso dall'inizio delle righe spostate («Azione Bonus — »).
//
// Prima di scrivere si controlla che non si perda niente: i dadi della scheda devono restare gli
// stessi, e la sezione di arrivo deve essere vuota. Rilanciabile: una scheda già sistemata non ha
// più la riga da cui tagliare, e viene saltata.
//
// Uso: node --env-file=../../.env.local risuddividi-sezioni.mjs <file.json> [--applica]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const file = process.argv[2];
const applica = process.argv.includes("--applica");
if (!file) {
  console.error("Uso: node risuddividi-sezioni.mjs <file.json> [--applica]");
  process.exit(1);
}

const SEZIONI = ["tratti", "azioni", "azioni_bonus", "reazioni", "azioni_leggendarie"];
const TITOLO_DI_SEZIONE = /^\s*(AZIONI|AZIONI BONUS|REAZIONI|AZIONI LEGGENDARIE|TRATTI)\s*$/;
const dadi = (testo) => (testo.match(/\b\d+d\d+\b/g) ?? []).sort().join(" ");

const { voci } = JSON.parse(readFileSync(file, "utf-8"));
let sistemate = 0;
let giaFatte = 0;
const respinte = [];
for (const voce of voci) {
  const chiave = `${voce.nome} [${voce.fonte}]`;
  if (!SEZIONI.includes(voce.da) || voce.tagli.some(([arrivo]) => !SEZIONI.includes(arrivo))) {
    respinte.push(`${chiave}: sezione sconosciuta`);
    continue;
  }
  const righe = await sql.query(`SELECT id, ${SEZIONI.join(", ")} FROM compendio_ita_mostro WHERE nome = $1 AND fonte = $2`, [voce.nome, voce.fonte]);
  if (righe.length !== 1) {
    respinte.push(`${chiave}: ${righe.length} righe trovate, attesa una sola`);
    continue;
  }
  const riga = righe[0];
  const linee = (riga[voce.da] ?? "").split("\n");

  // Dove comincia ogni pezzo: la prima riga, dopo il taglio precedente, che comincia così.
  const inizi = [];
  let da = 0;
  for (const [arrivo, comeComincia] of voce.tagli) {
    const i = linee.findIndex((l, n) => n >= da && l.trimStart().startsWith(comeComincia));
    if (i < 0) break;
    inizi.push([arrivo, i]);
    da = i + 1;
  }
  if (inizi.length === 0) {
    giaFatte++;
    continue;
  }
  if (inizi.length !== voce.tagli.length) {
    // Se le sezioni dei tagli che mancano sono già piene, la scheda è stata sistemata in una
    // passata precedente (il primo taglio può ritrovare la riga rimasta al suo posto).
    const mancanti = voce.tagli.slice(inizi.length).map(([arrivo]) => arrivo);
    if (mancanti.every((arrivo) => (riga[arrivo] ?? "").trim())) giaFatte++;
    else respinte.push(`${chiave}: trovati ${inizi.length} tagli su ${voce.tagli.length}`);
    continue;
  }

  const daTogliere = new Set(voce.togli ?? []);
  const pulisci = (pezzo) =>
    pezzo
      .filter((l) => !TITOLO_DI_SEZIONE.test(l) && !daTogliere.has(l.trim()))
      .map((l) => (voce.spoglia && l.startsWith(voce.spoglia) ? l.slice(voce.spoglia.length) : l))
      .join("\n")
      .trim();

  const nuovi = { [voce.da]: pulisci(linee.slice(0, inizi[0][1])) };
  let conflitto = null;
  inizi.forEach(([arrivo, inizio], n) => {
    const fine = n + 1 < inizi.length ? inizi[n + 1][1] : linee.length;
    const pezzo = pulisci(linee.slice(inizio, fine));
    if (arrivo !== voce.da && (riga[arrivo] ?? "").trim() && !voce.aggiungi) conflitto = arrivo;
    nuovi[arrivo] = [arrivo === voce.da ? nuovi[arrivo] : (riga[arrivo] ?? "").trim(), pezzo].filter(Boolean).join("\n");
  });
  if (conflitto) {
    respinte.push(`${chiave}: la sezione «${conflitto}» non è vuota (aggiungere "aggiungi": true se il testo va accodato)`);
    continue;
  }

  const prima = SEZIONI.map((s) => riga[s] ?? "").join("\n");
  const dopo = SEZIONI.map((s) => nuovi[s] ?? riga[s] ?? "").join("\n");
  if (dadi(prima) !== dadi(dopo)) {
    respinte.push(`${chiave}: i dadi cambierebbero («${dadi(prima)}» -> «${dadi(dopo)}»)`);
    continue;
  }

  sistemate++;
  console.log(`✓ ${chiave}: ${Object.keys(nuovi).map((s) => `${s} ${(riga[s] ?? "").length} -> ${nuovi[s].length}`).join(", ")}`);
  if (applica) {
    const colonne = Object.keys(nuovi);
    const set = colonne.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await sql.query(`UPDATE compendio_ita_mostro SET ${set} WHERE id = $${colonne.length + 1}`, [...colonne.map((c) => nuovi[c]), riga.id]);
  }
}

console.log(`\n${applica ? "" : "[PROVA] "}schede risuddivise: ${sistemate} — già a posto: ${giaFatte} — respinte: ${respinte.length}`);
for (const r of respinte) console.log(`  ✗ ${r}`);
