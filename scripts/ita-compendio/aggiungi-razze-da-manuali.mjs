// Porta nel Compendio le razze dei manuali diversi dal Manuale del Giocatore.
//
// In italiano il Compendio aveva solo dieci razze — le nove del Manuale del Giocatore più il
// Rinato — mentre le trenta di Mostri del Multiverso di Mordenkainen erano tutte in traduzione
// automatica, pur avendo il PDF italiano di quel manuale.
//
// Entrano SOLO le voci elencate in mappa-razze-<libro>.json, e ognuna deve superare una verifica
// che non dipende dalla lingua: TAGLIA e VELOCITÀ. Il manuale italiano scrive la velocità in metri
// e 5etools in piedi (9 metri = 30 piedi), la taglia a parole ("È di taglia media") contro un
// codice ("M"): due numeri e un codice che devono combaciare, altrimenti la razza viene saltata
// invece di essere scritta su un abbinamento indovinato. È lo stesso principio già usato per il
// grado di sfida dei mostri e per il costo dell'equipaggiamento.
//
// Uso: node --env-file=../../.env.local aggiungi-razze-da-manuali.mjs <chiave_libro> [--applica]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

import { pulisciTestoOcr } from "../../lib/ocr-cleanup.ts";
import { togliTestatinePagina } from "../../lib/testatine-pagina.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const [libro] = process.argv.slice(2);
const applica = process.argv.includes("--applica");
// Le schede già inserite restano ferme alla versione del parser con cui sono entrate: con
// --riallinea vengono riscritte con quella corrente, senza toccare le altre fonti né gli
// abbinamenti inglesi già verificati.
const riallinea = process.argv.includes("--riallinea");

const FONTI = { multiverso: "MPMM", fizban: "FTD", ravenloft: "VRGR", dragonlance: "DSotDQ", dm_manuale: "DMG", tasha: "TCE" };
if (!FONTI[libro]) {
  console.error(`Uso: aggiungi-razze-da-manuali.mjs <${Object.keys(FONTI).join("|")}> [--applica]`);
  process.exit(1);
}

// Nei manuali italiani le distanze sono in metri: 1,5 metri = 5 piedi, la conversione ufficiale.
const PIEDI_PER_METRO = 10 / 3;
const TAGLIE = { minuscola: "T", piccola: "S", media: "M", grande: "L", enorme: "H" };

/** Velocità base in piedi, letta dal tratto "Velocità" del manuale ("La velocità base è di 9 metri"). */
function velocitaInPiedi(tratti) {
  // Di norma la velocità è un tratto suo ("Velocità. La velocità base è di 9 metri"), ma nelle
  // razze mostruose del Manuale del DM sta dentro l'elenco dei privilegi ("velocità 6 m, volare
  // 15"): se il tratto dedicato non c'è, si cerca in tutto il testo della scheda.
  const dedicato = tratti.find((t) => /^velocit/i.test(t.nome));
  const testo = dedicato?.testo ?? tratti.map((t) => t.testo).join(" ");
  // la parola "velocità" deve esserci: senza, il primo numero del testo sarebbe la scurovisione
  // ("scurovisione 18 m"), e l'aarakocra risulterebbe correre a 60 piedi
  const m = testo.match(/velocit[àa][^.;]*?(\d+(?:[.,]\d+)?)\s*(?:metri|m)\b/i);
  return m ? Math.round(parseFloat(m[1].replace(",", ".")) * PIEDI_PER_METRO) : null;
}

/** Codici di taglia citati dal tratto "Taglia" ("È di taglia Piccola o Media" -> ["S","M"]). */
function taglieDichiarate(tratti) {
  // stessa ragione della velocità: nella tabella del Manuale del DM la taglia è una voce
  // dell'elenco dei privilegi ("taglia Piccola"), non un tratto a sé
  const tratto = tratti.find((t) => /^taglia/i.test(t.nome));
  const testo = (tratto?.testo ?? tratti.map((t) => t.testo).join(" ")).toLowerCase();
  return Object.entries(TAGLIE)
    .filter(([parola]) => new RegExp(`taglia\\s+(?:\\w+\\s+o\\s+)?${parola}|\\bo\\s+${parola}\\b`).test(testo))
    .map(([, codice]) => codice);
}

const inglesi = await fetch(
  "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/races.json",
).then((r) => r.json());
const perNome = new Map(
  inglesi.race.filter((r) => r.source === FONTI[libro]).map((r) => [r.name, r]),
);

const mappa = JSON.parse(readFileSync(path.join(SCRIPT_DIR, `mappa-razze-${libro}.json`), "utf-8"));
const parsed = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "parsed", `${libro}-razze.json`), "utf-8"));
const schede = new Map(parsed.map((r) => [r.nome, r]));

const esistenti = await sql`SELECT nome, nome_inglese FROM compendio_ita_razza`;
const giaInTabella = new Set(esistenti.map((r) => r.nome));
const giaAgganciate = new Set(esistenti.filter((r) => r.nome_inglese).map((r) => r.nome_inglese));

const pulisci = (testo) => pulisciTestoOcr(togliTestatinePagina(testo));

const daInserire = [];
const saltate = [];
const senzaVerifica = [];

for (const [nomeParsato, valore] of Object.entries(mappa)) {
  if (nomeParsato.startsWith("_")) continue;
  const scheda = schede.get(nomeParsato);
  const nomeItaliano = valore.it ?? nomeParsato;
  const inglese = perNome.get(valore.en);

  if (!scheda) { saltate.push(`${nomeItaliano} — "${nomeParsato}" non è fra le schede estratte`); continue; }
  if (!inglese) { saltate.push(`${nomeItaliano} — "${valore.en}" non è una razza ${FONTI[libro]} di 5etools`); continue; }
  const giaPresente = giaInTabella.has(nomeItaliano) || giaAgganciate.has(valore.en);
  if (giaPresente && !riallinea) { saltate.push(`${nomeItaliano} — già in tabella`); continue; }

  // la velocità inglese può essere un numero o un oggetto (chi vola o nuota): quella a piedi è
  // sempre la stessa, ed è l'unica che il tratto italiano dichiara in metri
  const velocitaEn = typeof inglese.speed === "number" ? inglese.speed : inglese.speed?.walk;
  const velocitaIt = velocitaInPiedi(scheda.tratti);
  // Nella tabella del Manuale del DM la velocità è scritta solo quando NON è quella standard
  // (l'aarakocra vola, il marinide nuota): dove manca non c'è niente da confrontare, e la razza
  // entra ugualmente ma viene contata a parte, così non sembra verificata come le altre.
  if (velocitaIt == null) senzaVerifica.push(nomeItaliano);
  if (velocitaIt != null && velocitaEn != null && velocitaIt !== velocitaEn) {
    saltate.push(`${nomeItaliano} — velocità ${velocitaIt} piedi ma "${valore.en}" ne ha ${velocitaEn}`);
    continue;
  }

  // il manuale può lasciare la taglia a scelta ("Piccola o Media"): basta che le due liste si
  // tocchino, non che siano identiche
  const taglieIt = taglieDichiarate(scheda.tratti);
  const taglieEn = inglese.size ?? [];
  if (taglieIt.length > 0 && taglieEn.length > 0 && !taglieIt.some((t) => taglieEn.includes(t))) {
    saltate.push(`${nomeItaliano} — taglia ${taglieIt.join("/")} ma "${valore.en}" è ${taglieEn.join("/")}`);
    continue;
  }

  // Alcune razze sono stampate come schede separate ma in 5etools sono una sola con più varianti
  // (i quattro genasi): la prima porta il nome inglese, le altre entrano come sue sottorazze.
  const sottorazze = (valore.sottorazzeDa ?? [])
    .map((n) => schede.get(n))
    .filter(Boolean)
    .map((s) => ({
      nome: s.nome,
      tratti: s.tratti.map((t) => ({ nome: t.nome, testo: pulisci(t.testo) })),
    }));

  daInserire.push({
    aggiorna: giaPresente,
    nome: nomeItaliano,
    en: valore.en,
    introduzione: pulisci(scheda.introduzione ?? ""),
    tratti: scheda.tratti.map((t) => ({ nome: t.nome, testo: pulisci(t.testo) })),
    sottorazze: sottorazze.length > 0 ? sottorazze : scheda.sottorazze ?? [],
    verifica: `${velocitaIt} piedi, taglia ${taglieIt.join("/") || "?"}`,
  });
}

const nuove = daInserire.filter((r) => !r.aggiorna).length;
console.log(`${libro}: ${nuove} razze da aggiungere, ${daInserire.length - nuove} da riallineare, ${saltate.length} saltate`);
for (const r of daInserire) {
  console.log(`  ${r.aggiorna ? "~" : "+"} ${r.nome} = ${r.en} (${r.tratti.length} tratti, ${r.sottorazze.length} sottorazze — ${r.verifica})`);
}
if (saltate.length > 0) {
  console.log("\nsaltate:");
  for (const s of saltate) console.log(`  - ${s}`);
}

if (applica) {
  for (const r of daInserire) {
    if (r.aggiorna) {
      await sql`
        UPDATE compendio_ita_razza
           SET introduzione = ${r.introduzione},
               tratti = ${JSON.stringify(r.tratti)}::jsonb,
               sottorazze = ${JSON.stringify(r.sottorazze)}::jsonb
         WHERE fonte = ${libro} AND nome_inglese = ${r.en}`;
      continue;
    }
    await sql`
      INSERT INTO compendio_ita_razza (nome, introduzione, tratti, sottorazze, fonte, nome_inglese, fonte_inglese)
      VALUES (${r.nome}, ${r.introduzione}, ${JSON.stringify(r.tratti)}::jsonb,
              ${JSON.stringify(r.sottorazze)}::jsonb, ${libro}, ${r.en}, ${FONTI[libro]})`;
  }
  console.log(`\ninserite ${daInserire.length} razze`);
} else {
  console.log("\n[PROVA] nessuna scrittura: aggiungere --applica");
}
