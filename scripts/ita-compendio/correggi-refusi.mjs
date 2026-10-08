// Applica al database un elenco di refusi corretti A MANO, uno per uno.
//
// È l'ultimo anello della pulizia: ciò che resta dopo le regole (pulisci-ocr, ricuci-parole-
// spezzate, togli-righe-illeggibili) sono refusi singoli che nessuna regola può indovinare —
// «hestia» per bestia, «farza» per forza, «Roe&ia» per Roccia. Si trovano con parole-sospette.mjs,
// si correggono guardando la frase (e la pagina, se la frase non basta), e si scrivono in un file
// di parsed/, che sta fuori dal repository perché contiene pezzi di testo dei manuali:
//
//   { "tabella": "compendio_ita_mostro",
//     "voci": [ { "nome": "DRAGO D'ORO ANTICO", "fonte": "mm",
//                 "correzioni": [ ["hestia o in un umanoide", "bestia o in un umanoide"] ] } ] }
//
// Ogni correzione è una coppia [com'è, come deve essere]. Il testo da correggere deve comparire
// UNA volta sola nelle colonne di testo della voce: se non c'è, o c'è due volte, la correzione non
// si applica e viene segnalata (va resa più precisa allungando il pezzo). Se non c'è ma c'è già il
// testo corretto, è stata applicata in una passata precedente: lo script è rilanciabile.
//
// Una voce può anche avere "rinomina": "NOME GIUSTO", per il refuso che sta nel nome stesso
// («AQ,UILA GIGANTE», «MOLO OH»): la riga cambia nome solo se quello nuovo non è già di un'altra.
//
// Uso: node --env-file=../../.env.local correggi-refusi.mjs <file.json> [--applica]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const file = process.argv[2];
const applica = process.argv.includes("--applica");
if (!file) {
  console.error("Uso: node correggi-refusi.mjs <file.json> [--applica]");
  process.exit(1);
}

// [colonna del nome, colonne di testo]
const TABELLE = {
  compendio_ita_mostro: [
    "nome",
    [
      "tratti", "azioni", "azioni_bonus", "reazioni", "azioni_leggendarie",
      "tipo", "allineamento", "velocita", "sensi", "linguaggi", "abilita", "tiri_salvezza",
      "vulnerabilita_danni", "resistenza_danni", "immunita_danni", "immunita_condizioni",
    ],
  ],
  compendio_ita_oggetto: ["nome", ["descrizione"]],
  compendio_ita_incantesimo: ["nome", ["descrizione"]],
  compendio_ita_talento: ["nome", ["descrizione", "prerequisito"]],
  compendio_ita_regola: ["titolo", ["testo"]],
};

const { tabella, voci } = JSON.parse(readFileSync(file, "utf-8"));
if (!Object.hasOwn(TABELLE, tabella)) {
  console.error(`Tabella non ammessa: ${tabella}`);
  process.exit(1);
}
const [colonnaNome, colonne] = TABELLE[tabella];
const volte = (testo, pezzo) => (pezzo ? testo.split(pezzo).length - 1 : 0);

let applicate = 0;
let giaFatte = 0;
const respinte = [];
for (const voce of voci) {
  const cerca = (nome) =>
    sql.query(`SELECT id, ${colonne.join(", ")} FROM ${tabella} WHERE ${colonnaNome} = $1 AND fonte = $2`, [nome, voce.fonte]);
  let righe = await cerca(voce.nome);
  // "rinomina": il refuso sta nel nome della voce («AQ,UILA GIGANTE»). Se il nome vecchio non c'è
  // più e quello nuovo sì, è già stata rinominata: le correzioni si cercano sotto il nome nuovo.
  if (voce.rinomina) {
    const conNomeNuovo = await cerca(voce.rinomina);
    if (righe.length === 1 && conNomeNuovo.length === 0) {
      if (applica) await sql.query(`UPDATE ${tabella} SET ${colonnaNome} = $1 WHERE id = $2`, [voce.rinomina, righe[0].id]);
      applicate++;
    } else if (righe.length === 0 && conNomeNuovo.length === 1) {
      righe = conNomeNuovo;
      giaFatte++;
    } else {
      respinte.push(`${voce.nome} [${voce.fonte}]: non si può rinominare in «${voce.rinomina}» (${righe.length} col nome vecchio, ${conNomeNuovo.length} col nuovo)`);
      continue;
    }
  }
  if (righe.length !== 1) {
    respinte.push(`${voce.nome} [${voce.fonte}]: ${righe.length} righe trovate, attesa una sola`);
    continue;
  }
  const riga = righe[0];
  const nuovi = Object.fromEntries(colonne.map((c) => [c, riga[c] ?? ""]));
  for (const [da, a] of voce.correzioni ?? []) {
    const dove = colonne.filter((c) => volte(nuovi[c], da) > 0);
    const quante = colonne.reduce((n, c) => n + volte(nuovi[c], da), 0);
    // Una correzione che AGGIUNGE testo (la frase troncata completata dalla pagina) contiene il
    // proprio "com'è": se il testo corretto c'è già, rilanciarla lo aggiungerebbe un'altra volta.
    // È già fatta solo se OGNI «com'è» rimasto sta dentro un testo già completato: se ce n'è uno
    // in più, da qualche parte c'è ancora la frase troncata, ma non si può dire quale delle
    // occorrenze sia (la prima potrebbe essere quella già completata), e si lascia decidere a mano.
    const completate = colonne.reduce((n, c) => n + volte(nuovi[c], a), 0);
    const aggiunge = a.includes(da);
    if (aggiunge && completate > 0 && quante === completate * volte(a, da)) {
      giaFatte++;
    } else if (aggiunge && completate > 0) {
      respinte.push(`${voce.nome} [${voce.fonte}]: «${da}» è già stata completata altrove ma compare ancora da sola: allungare il pezzo`);
    } else if (quante === 1) {
      nuovi[dove[0]] = nuovi[dove[0]].replace(da, () => a);
      applicate++;
    } else if (quante === 0 && colonne.some((c) => volte(nuovi[c], a) > 0)) {
      giaFatte++;
    } else {
      respinte.push(`${voce.nome} [${voce.fonte}]: «${da}» compare ${quante} volte`);
    }
  }
  const cambiate = colonne.filter((c) => nuovi[c] !== (riga[c] ?? ""));
  if (cambiate.length > 0 && applica) {
    const set = cambiate.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await sql.query(`UPDATE ${tabella} SET ${set} WHERE id = $${cambiate.length + 1}`, [...cambiate.map((c) => nuovi[c]), riga.id]);
  }
}

console.log(`${applica ? "" : "[PROVA] "}correzioni applicate: ${applicate} — già fatte: ${giaFatte} — respinte: ${respinte.length}`);
for (const r of respinte) console.log(`  ✗ ${r}`);
