// Ricuce nel database le parole che l'estrazione dal PDF ha spezzato con uno spazio:
// «contu ndenti», «i nferiore», «u n attacco», «ri poso l u ngo» (vedi lib/parole-spezzate.ts).
//
// La regola unisce i pezzi solo se insieme fanno una parola conosciuta e almeno uno, da solo, non
// lo è: non indovina. Il vocabolario è un dizionario italiano più le parole del gioco prese dai
// testi puliti del Compendio (vocabolario.mjs). Le schede trascritte a mano non hanno parole
// spezzate, quindi la passata non le tocca.
//
// Senza --applica segnala soltanto. --elenco stampa TUTTE le ricuciture distinte: vanno lette
// prima di applicare, come ogni riparazione fatta a regole.
//
// Uso: node --env-file=../../.env.local ricuci-parole-spezzate.mjs [--applica] [--elenco] [--rigenera]
import { neon } from "@neondatabase/serverless";
import { ricuciParoleSpezzate } from "../../lib/parole-spezzate.ts";
import { caricaVocabolario } from "./vocabolario.mjs";

const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const elenco = process.argv.includes("--elenco");

const CAMPI = {
  compendio_ita_mostro: ["tratti", "azioni", "azioni_bonus", "azioni_leggendarie", "reazioni", "sensi", "linguaggi", "abilita", "tiri_salvezza"],
  compendio_ita_incantesimo: ["descrizione"],
  compendio_ita_oggetto: ["descrizione"],
  compendio_ita_talento: ["descrizione", "prerequisito"],
  compendio_ita_razza: ["introduzione"],
  compendio_ita_regola: ["testo"],
};

const vocabolario = await caricaVocabolario(sql, { rigenera: process.argv.includes("--rigenera") });
console.log(`vocabolario: ${vocabolario.dimensione} parole`);

// Le Regole sono prosa lunga, piena di parole vere ma rare: lì «una parola che non si vede mai»
// non prova niente («tratti di aspro terreno» diventava «diaspro», la gemma). Si unisce solo dove
// un pezzo non è una parola affatto.
const PROSA = new Set(["compendio_ita_regola"]);
const prudente = { ...vocabolario, soloPezziEstranei: true };

const conteggi = new Map();
let righeToccate = 0;
for (const [tabella, colonne] of Object.entries(CAMPI)) {
  const righe = await sql.query(`SELECT id, ${colonne.join(", ")} FROM ${tabella}`);
  let toccate = 0;
  for (const riga of righe) {
    const patch = {};
    for (const c of colonne) {
      if (typeof riga[c] !== "string" || !riga[c]) continue;
      const { testo, ricuciture } = ricuciParoleSpezzate(riga[c], PROSA.has(tabella) ? prudente : vocabolario);
      if (testo === riga[c]) continue;
      patch[c] = testo;
      for (const r of ricuciture) {
        const chiave = `${r.prima} -> ${r.dopo}`;
        conteggi.set(chiave, (conteggi.get(chiave) ?? 0) + 1);
      }
    }
    const chiavi = Object.keys(patch);
    if (chiavi.length === 0) continue;
    toccate++;
    if (applica) {
      const set = chiavi.map((c, i) => `${c} = $${i + 1}`).join(", ");
      await sql.query(`UPDATE ${tabella} SET ${set} WHERE id = $${chiavi.length + 1}`, [...chiavi.map((c) => patch[c]), riga.id]);
    }
  }
  righeToccate += toccate;
  console.log(`${tabella.padEnd(28)} ${toccate} su ${righe.length}`);
}

// La cache delle traduzioni: un centinaio di voci (quasi tutte mostri) non sono traduzioni ma
// copie del testo dei PDF, con le stesse parole spezzate. Si leggono solo le righe che hanno il
// segno più sicuro, una consonante isolata davanti a una parola: la cache è grande, e ogni lettura
// del database consuma la quota di trasferimento che l'app condivide con la produzione.
{
  const righe = await sql`
    SELECT kind, name, source, descrizione_ita FROM compendio_traduzione_ia
    WHERE descrizione_ita ~ '(^|[^[:alpha:]''])[b-df-hj-np-tv-z] [[:lower:]]{2,}'`;
  let toccate = 0;
  for (const riga of righe) {
    const { testo, ricuciture } = ricuciParoleSpezzate(riga.descrizione_ita, vocabolario);
    if (testo === riga.descrizione_ita) continue;
    toccate++;
    for (const r of ricuciture) {
      const chiave = `${r.prima} -> ${r.dopo}`;
      conteggi.set(chiave, (conteggi.get(chiave) ?? 0) + 1);
    }
    if (applica) {
      await sql`
        UPDATE compendio_traduzione_ia SET descrizione_ita = ${testo}, updated_at = now()
        WHERE kind = ${riga.kind} AND name = ${riga.name} AND source = ${riga.source}`;
    }
  }
  righeToccate += toccate;
  console.log(`${"compendio_traduzione_ia".padEnd(28)} ${toccate} su ${righe.length} lette`);
}

const ordinate = [...conteggi].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
const totale = ordinate.reduce((n, [, v]) => n + v, 0);
console.log(`\n${applica ? "" : "[PROVA] "}righe ricucite: ${righeToccate} — ricuciture: ${totale} (${ordinate.length} diverse)`);
for (const [chiave, n] of elenco ? ordinate : ordinate.slice(0, 40)) console.log(`${String(n).padStart(5)}  ${chiave}`);
if (!elenco && ordinate.length > 40) console.log(`  … altre ${ordinate.length - 40}: --elenco le stampa tutte`);
