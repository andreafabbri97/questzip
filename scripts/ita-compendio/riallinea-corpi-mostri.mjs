// Riporta nel database il TESTO di tratti e azioni dei mostri dopo una correzione del parser,
// senza rifare il seed (che cancellerebbe nomi, agganci all'inglese e numeri già sistemati).
//
// Nasce da un difetto di parse-mostri.mjs rimasto nascosto per mesi: le schede venivano tagliate
// alla prima intestazione non riconosciuta ("AZIONI BONUS", o "AZ I O N I" a lettere staccate), e
// in 335 mostri su 661 mancava tutto ciò che veniva dopo — spesso le azioni intere. A schermo non
// dava alcun errore: la scheda si apriva, semplicemente più corta.
//
// Qui si rilegge l'uscita del parser (parsed/<libro>-mostri.json, rigenerata con
// `node parse-mostri.mjs <libro>`) e la si confronta con ciò che c'è nel database. La prova che
// il testo nuovo è migliore non è la lunghezza, è la NOTAZIONE DEI DADI: "2d6" si scrive uguale
// in ogni lingua, quindi i dadi della scheda italiana devono essere gli stessi dell'originale su
// 5etools. Il testo nuovo entra solo se si avvicina di più a quell'elenco (o se, a parità di
// dadi, aggiunge testo: un'azione bonus senza danni non ha dadi da contare), e mai se è tanto più
// lungo dell'originale da far pensare che si sia mangiato la prosa della pagina.
//
// Uso: node --env-file=../../.env.local riallinea-corpi-mostri.mjs [--applica] [--elenco]
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { pulisciCorpoScheda } from "../../lib/ocr-cleanup.ts";
import { togliTestatinePagina } from "../../lib/testatine-pagina.ts";
import { togliProsaDiPagina } from "../../lib/prosa-di-pagina.ts";
import { risolviCopie } from "../../lib/fivetools/risolvi-copia.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const elenco = process.argv.includes("--elenco");
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

// colonna del database <- campo dell'uscita del parser
const SEZIONI = [
  ["tratti", "tratti"],
  ["azioni", "azioni"],
  ["azioni_bonus", "azioniBonus"],
  ["reazioni", "reazioni"],
  ["azioni_leggendarie", "azioniLeggendarie"],
];
const SEZIONI_INGLESI = ["trait", "action", "bonus", "reaction", "legendary", "mythic", "spellcasting"];

const normalizzaNome = (n) =>
  String(n ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

const cifre = (s) => s.replace(/[lI]/g, "1").replace(/S/g, "5").replace(/[Oo]/g, "0").replace(/\s+/g, "");
function numeroIniziale(testo) {
  const m = cifre(String(testo ?? "").split(/[({,]/)[0]).match(/^\d+/);
  return m ? Number(m[0]) : null;
}
const impronta = (ca, pf, sfida) => `${numeroIniziale(ca)}|${numeroIniziale(pf)}|${String(sfida ?? "").trim().split(" ")[0]}`;

/** Elenco (con ripetizioni) dei dadi nominati in un testo: "2d6" due volte conta due. */
function dadi(testo) {
  const conta = new Map();
  for (const m of testo.matchAll(/\b(\d+)d(\d+)\b/g)) {
    const k = `${m[1]}d${m[2]}`;
    conta.set(k, (conta.get(k) ?? 0) + 1);
  }
  return conta;
}

/** Quanti dadi separano due elenchi: quelli che mancano più quelli di troppo. */
function scarto(a, b) {
  let n = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) n += Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0));
  return n;
}

function testoInglese(valore) {
  if (typeof valore === "string") return valore;
  if (Array.isArray(valore)) return valore.map(testoInglese).join(" ");
  if (valore && typeof valore === "object") return Object.values(valore).map(testoInglese).join(" ");
  return "";
}

const pulisci = (t) => pulisciCorpoScheda(togliTestatinePagina(t ?? "")).trim();
// Dall'uscita del parser si toglie anche la prosa della pagina, PRIMA del confronto: a parità di
// dadi il testo "più lungo" vinceva proprio perché si portava dietro la coda. Non lo si fa sul
// testo già in tabella: lì la stessa pulizia passa da togli-prosa-schede.mjs, che prima di
// scrivere controlla di non aver tagliato troppo.
const pulisciNuovo = (t) => togliProsaDiPagina(pulisci(t));

const index = await (await fetch(`${B}/bestiary/index.json`)).json();
const files = await Promise.all(
  [...new Set(Object.values(index))].map((f) => fetch(`${B}/bestiary/${f}`).then((r) => r.json()).catch(() => ({}))),
);
const template = await fetch(`${B}/bestiary/template.json`).then((r) => r.json()).catch(() => ({}));
const creature = risolviCopie(files.flatMap((f) => f.monster ?? []), template.monsterTemplate ?? []);
const perChiave = new Map(creature.map((m) => [`${m.name}|${m.source}`, m]));

const righe = await sql`
  SELECT id, nome, fonte, nome_inglese, fonte_inglese, classe_armatura, punti_ferita, sfida,
         tratti, azioni, azioni_bonus, reazioni, azioni_leggendarie
  FROM compendio_ita_mostro ORDER BY fonte, nome`;

const schedePerLibro = new Map();
function schedeDi(libro) {
  if (!schedePerLibro.has(libro)) {
    let schede = [];
    try {
      schede = JSON.parse(readFileSync(path.join(__dirname, "parsed", `${libro}-mostri.json`), "utf-8"));
    } catch {
      // libro senza bestiario estratto: le sue righe restano come sono
    }
    schedePerLibro.set(libro, schede);
  }
  return schedePerLibro.get(libro);
}

// Le schede trascritte a mano dalle pagine (parsed/trascritti-mostri-*.json) non si sostituiscono
// mai con l'uscita del parser: sono già il testo giusto, e proprio per questo sono più CORTE di
// quelle rigenerate, che si portano dietro righe di rumore. A parità di dadi il criterio "più
// lungo è meglio" le avrebbe sovrascritte alla prima esecuzione successiva.
const trascritteAMano = new Set();
// Le schede i cui numeri sono diversi dall'originale perche' cosi' e' stampato sul manuale italiano.
const differenzeVerificate = new Set();
for (const file of readdirSync(path.join(__dirname, "parsed")).filter((f) => /^trascritti-mostri-.*\.json$/.test(f))) {
  const { fonte, voci } = JSON.parse(readFileSync(path.join(__dirname, "parsed", file), "utf-8"));
  for (const voce of voci ?? []) {
    trascritteAMano.add(`${voce.nome}|${fonte}`);
    if (voce._differenze_verificate) differenzeVerificate.add(`${voce.nome}|${fonte}`);
  }
}

const esito = { sostituite: 0, ripulite: 0, intatte: 0, protette: 0, verificate: 0, senzaScheda: [], scartate: [], ancoraDiverse: [] };
let dadiRecuperati = 0;

for (const r of righe) {
  const eng = r.nome_inglese ? perChiave.get(`${r.nome_inglese}|${r.fonte_inglese}`) : null;
  const dadiEng = dadi(JSON.stringify(SEZIONI_INGLESI.map((s) => eng?.[s] ?? null)));
  const lunghezzaEng = eng ? SEZIONI_INGLESI.map((s) => testoInglese(eng[s])).join(" ").length : 0;

  const vecchio = Object.fromEntries(SEZIONI.map(([colonna]) => [colonna, pulisci(r[colonna])]));
  const testoVecchio = Object.values(vecchio).join("\n");

  // La scheda rigenerata: per nome, e dove il nome nel database è stato corretto a mano (o quello
  // letto dal PDF è storpiato) per impronta numerica, che deve però indicarne una sola.
  const schede = schedeDi(r.fonte);
  const perNome = schede.filter((s) => normalizzaNome(s.nome) === normalizzaNome(r.nome));
  const chiaveImpronta = impronta(r.classe_armatura, r.punti_ferita, r.sfida);
  const perImpronta = schede.filter((s) => impronta(s.classeArmatura, s.puntiFerita, s.sfida) === chiaveImpronta);
  const scheda = perNome.length === 1 ? perNome[0] : perImpronta.length === 1 ? perImpronta[0] : null;

  let scelto = vecchio;
  let motivo = null;
  if (trascritteAMano.has(`${r.nome}|${r.fonte}`)) {
    esito.protette++;
  } else if (!scheda) {
    esito.senzaScheda.push(`${r.nome} [${r.fonte}]`);
  } else {
    const nuovo = Object.fromEntries(SEZIONI.map(([colonna, campo]) => [colonna, pulisciNuovo(scheda[campo])]));
    const testoNuovo = Object.values(nuovo).join("\n");
    const scartoVecchio = eng ? scarto(dadi(testoVecchio), dadiEng) : null;
    const scartoNuovo = eng ? scarto(dadi(testoNuovo), dadiEng) : null;
    const troppoLungo = eng && testoNuovo.length > Math.max(2.4 * lunghezzaEng, lunghezzaEng + 1500);
    const migliore =
      eng &&
      (scartoNuovo < scartoVecchio ||
        (scartoNuovo === scartoVecchio && testoNuovo.length > testoVecchio.length * 1.05));
    // E nemmeno troppo corto: se scende sotto l'originale e sotto ciò che c'era, ha perso qualcosa.
    const troppoCorto = eng && testoNuovo.length < Math.min(testoVecchio.length, 0.95 * lunghezzaEng);
    if (migliore && !troppoLungo && !troppoCorto) {
      scelto = nuovo;
      motivo = "sostituita";
      dadiRecuperati += scartoVecchio - scartoNuovo;
    } else if (migliore && troppoLungo) {
      esito.scartate.push(`${r.nome} [${r.fonte}]: nuovo testo ${testoNuovo.length} car contro ${lunghezzaEng} dell'originale`);
    }
  }

  const testoScelto = Object.values(scelto).join("\n");
  if (eng) {
    const residuo = scarto(dadi(testoScelto), dadiEng);
    if (residuo > 0 && differenzeVerificate.has(`${r.nome}|${r.fonte}`)) esito.verificate++;
    else if (residuo > 0) esito.ancoraDiverse.push([residuo, `${r.nome} [${r.fonte}] (${testoScelto.length} car / ${lunghezzaEng} orig.)`]);
  }

  const cambiate = SEZIONI.map(([colonna]) => colonna).filter((c) => scelto[c] !== (r[c] ?? ""));
  if (cambiate.length === 0) {
    esito.intatte++;
    continue;
  }
  if (motivo === "sostituita") esito.sostituite++;
  else esito.ripulite++;
  if (applica) {
    const set = cambiate.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await sql.query(`UPDATE compendio_ita_mostro SET ${set} WHERE id = $${cambiate.length + 1}`, [
      ...cambiate.map((c) => scelto[c]),
      r.id,
    ]);
  }
}

console.log(`${applica ? "" : "[PROVA] "}schede col testo sostituito: ${esito.sostituite} (dadi recuperati: ${dadiRecuperati})`);
console.log(`schede solo ripulite sul posto: ${esito.ripulite} — invariate: ${esito.intatte}`);
console.log(`trascritte a mano, lasciate come sono: ${esito.protette}`);
console.log(`senza una scheda rigenerata da confrontare: ${esito.senzaScheda.length}`);
console.log(`testo nuovo scartato perché troppo lungo rispetto all'originale: ${esito.scartate.length}`);
console.log(`dadi ancora diversi dall'originale: ${esito.ancoraDiverse.length} schede`);
console.log(`diversi dall'originale perché così è stampato sul manuale (verificate sulla pagina): ${esito.verificate}`);
if (elenco) {
  for (const s of esito.scartate) console.log(`  scartata: ${s}`);
  for (const s of esito.senzaScheda) console.log(`  senza scheda: ${s}`);
  for (const [n, s] of esito.ancoraDiverse.sort((a, b) => b[0] - a[0])) console.log(`  ${String(n).padStart(2)} dadi diversi: ${s}`);
}
