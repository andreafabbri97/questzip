// Porta nel Compendio i mostri che il parser aveva estratto ma che il seed teneva fuori.
//
// seed.mjs scarta una scheda se "numericSuspect": basta che UNA delle sei caratteristiche sia
// finita in un'altra colonna del PDF perché l'intero mostro resti fuori dal Compendio. Erano 306
// schede su 679 — con il testo italiano ufficiale già estratto, invisibile.
//
// La differenza rispetto al seed è che qui la scheda arriva già abbinata alla sua voce inglese
// (mappa-mostri-<libro>.json), e allora i buchi si possono chiudere: punteggi di caratteristica,
// CA, punti ferita e grado di sfida sono NUMERI, non traduzioni — sono identici nelle due edizioni,
// e 5etools li ha in chiaro. Si prende dal manuale italiano ciò che è testo (nome, tratti, azioni,
// reazioni) e da 5etools solo ciò che l'OCR ha perso. Il grado di sfida estratto, quando c'è, deve
// coincidere con quello inglese: è la prova che l'abbinamento è giusto, e se non torna la scheda
// viene saltata invece che inserita a caso.
//
// Uso: node --env-file=../../.env.local aggiungi-mostri-da-manuali.mjs <chiave_libro> [--applica]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const [libro] = process.argv.slice(2);
const applica = process.argv.includes("--applica");

// chiave libro italiano -> file del bestiario 5etools e sigla della fonte inglese
const BESTIARI = {
  mm: { file: "bestiary-mm.json", fonte: "MM" },
  multiverso: { file: "bestiary-mpmm.json", fonte: "MPMM" },
  fizban: { file: "bestiary-ftd.json", fonte: "FTD" },
  bigby: { file: "bestiary-bgg.json", fonte: "BGG" },
  dragonlance: { file: "bestiary-dsotdq.json", fonte: "DSotDQ" },
  ravenloft: { file: "bestiary-vrgr.json", fonte: "VRGR" },
};

if (!BESTIARI[libro]) {
  console.error(`Uso: aggiungi-mostri-da-manuali.mjs <${Object.keys(BESTIARI).join("|")}> [--applica]`);
  process.exit(1);
}

const RAW = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/bestiary/";
const CARATTERISTICHE = [
  ["FOR", "str"],
  ["DES", "dex"],
  ["COS", "con"],
  ["INT", "int"],
  ["SAG", "wis"],
  ["CAR", "cha"],
];

const gradoSfida = (m) => {
  const cr = typeof m.cr === "object" ? m.cr?.cr : m.cr;
  return cr == null ? null : String(cr).trim();
};

const modificatore = (punteggio) => {
  const mod = Math.floor((punteggio - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
};

const bestiario = await fetch(RAW + BESTIARI[libro].file).then((r) => r.json());
const perNome = new Map(bestiario.monster.map((m) => [m.name, m]));

const mappa = JSON.parse(
  readFileSync(path.join(SCRIPT_DIR, `mappa-mostri-${libro}.json`), "utf-8"),
);
const parsed = JSON.parse(
  readFileSync(path.join(SCRIPT_DIR, "parsed", `${libro}-mostri.json`), "utf-8"),
);
const voci = new Map((Array.isArray(parsed) ? parsed : parsed.mostri).map((m) => [m.nome, m]));

const giaInTabella = new Set(
  (await sql.query(`SELECT nome FROM compendio_ita_mostro WHERE fonte = $1`, [libro])).map((r) => r.nome),
);
const giaAgganciati = new Set(
  (
    await sql.query(
      `SELECT nome_inglese FROM compendio_ita_mostro WHERE fonte_inglese = $1 AND nome_inglese IS NOT NULL`,
      [BESTIARI[libro].fonte],
    )
  ).map((r) => r.nome_inglese),
);

const daInserire = [];
const saltati = [];

for (const [nomeParsato, valore] of Object.entries(mappa)) {
  if (nomeParsato.startsWith("_")) continue; // righe di nota nel file
  const nomeInglese = typeof valore === "string" ? valore : valore.en;
  const nomeItaliano = (typeof valore === "string" ? null : valore.it) ?? nomeParsato;

  const scheda = voci.get(nomeParsato);
  if (!scheda) { saltati.push(`${nomeParsato} — non è fra le schede estratte`); continue; }
  const inglese = perNome.get(nomeInglese);
  if (!inglese) { saltati.push(`${nomeParsato} — "${nomeInglese}" non esiste in 5etools`); continue; }
  if (giaInTabella.has(nomeItaliano)) { saltati.push(`${nomeParsato} — già in tabella`); continue; }
  if (giaAgganciati.has(nomeInglese)) { saltati.push(`${nomeParsato} — "${nomeInglese}" già agganciato`); continue; }

  // alcune schede non hanno grado di sfida (gli evocabili come lo Spirito Draconico): nel PDF
  // la casella è un trattino, in 5etools il campo manca del tutto
  const sfidaGrezza = scheda.sfida == null ? "" : String(scheda.sfida).trim();
  const sfidaIta = sfidaGrezza === "" || sfidaGrezza === "-" ? null : sfidaGrezza;
  const sfidaEng = gradoSfida(inglese);
  const sfidaTorna = sfidaIta === null || sfidaIta === sfidaEng;

  // le caratteristiche perse dall'OCR si riprendono dalla scheda inglese: sono numeri identici
  const caratteristiche = { ...(scheda.caratteristiche ?? {}) };
  const recuperate = [];
  for (const [sigla, chiave] of CARATTERISTICHE) {
    if (caratteristiche[sigla]) continue;
    const punteggio = inglese[chiave];
    if (typeof punteggio !== "number") continue;
    caratteristiche[sigla] = { score: punteggio, mod: modificatore(punteggio) };
    recuperate.push(sigla);
  }
  const incomplete = CARATTERISTICHE.filter(([s]) => !caratteristiche[s]).map(([s]) => s);

  if (!sfidaTorna) { saltati.push(`${nomeParsato} — sfida ${sfidaIta} ma "${nomeInglese}" è ${sfidaEng}`); continue; }
  if (incomplete.length > 0) { saltati.push(`${nomeParsato} — restano senza valore: ${incomplete.join(", ")}`); continue; }

  daInserire.push({ scheda, nomeItaliano, nomeInglese, caratteristiche, recuperate });
}

console.log(`${libro}: ${daInserire.length} schede da aggiungere, ${saltati.length} saltate`);
for (const d of daInserire) {
  const nota = d.recuperate.length > 0 ? ` (da 5etools: ${d.recuperate.join(", ")})` : "";
  console.log(`  + ${d.nomeItaliano} = ${d.nomeInglese}${nota}`);
}
if (saltati.length > 0) {
  console.log("\nsaltate:");
  for (const s of saltati) console.log(`  - ${s}`);
}

if (applica) {
  for (const d of daInserire) {
    const m = d.scheda;
    await sql.query(
      `INSERT INTO compendio_ita_mostro
        (nome, tipo, taglia, allineamento, classe_armatura, punti_ferita, velocita, caratteristiche,
         tiri_salvezza, abilita, vulnerabilita_danni, resistenza_danni, immunita_danni,
         immunita_condizioni, sensi, linguaggi, sfida, pe, tratti, azioni, azioni_leggendarie,
         reazioni, numeric_suspect, fonte, nome_inglese, fonte_inglese)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,false,$23,$24,$25)`,
      [
        d.nomeItaliano, m.tipo ?? "", m.taglia ?? "", m.allineamento ?? "",
        m.classeArmatura ?? "", m.puntiFerita ?? "", m.velocita ?? "",
        JSON.stringify(d.caratteristiche),
        m.tiriSalvezza ?? "", m.abilita ?? "", m.vulnerabilitaDanni ?? "", m.resistenzaDanni ?? "",
        m.immunitaDanni ?? "", m.immunitaCondizioni ?? "", m.sensi ?? "", m.linguaggi ?? "",
        m.sfida ?? "", m.pe ?? "", m.tratti ?? "", m.azioni ?? "", m.azioniLeggendarie ?? "",
        m.reazioni ?? "", libro, d.nomeInglese, BESTIARI[libro].fonte,
      ],
    );
  }
  console.log(`\ninserite ${daInserire.length} schede`);
} else {
  console.log("\n[PROVA] nessuna scrittura: aggiungere --applica");
}
