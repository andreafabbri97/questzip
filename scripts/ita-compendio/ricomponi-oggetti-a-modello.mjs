// Scrive nella cache delle traduzioni la descrizione degli oggetti "a modello" di 5etools: le
// famiglie (Anelli e Pozioni di Resistenza, Pietre Ioun, Tatuaggi Assorbenti, Granate...) le cui
// voci non hanno un testo proprio ma un rimando `{#itemEntry Nome|FONTE}` al testo comune.
//
// La traduzione automatica aveva tradotto il rimando alla lettera («{#itemEntry Anello di
// Resistenza|DMG}») o aveva restituito il solo nome, e l'app non scioglieva il rimando nemmeno in
// inglese: 101 oggetti non hanno mai mostrato una descrizione. Qui il testo comune è tradotto una
// volta (traduzioni-modelli-oggetti.json) e riempito con i valori di ogni voce: tipo di danno,
// gemma, tipo di drago.
//
// Per ogni voce:
//   - rimando + nient'altro: la descrizione è il testo comune. Se in cache c'è già una traduzione
//     vera (non il rimando, non il solo nome) resta quella;
//   - rimando + testo proprio (le Pietre Ioun, le granate): testo comune, poi il testo proprio già
//     tradotto che sta in cache, o quello scritto nel file alla voce "specifiche";
//   - il nome si riallinea allo schema della famiglia, dove il file ne indica uno.
// I dadi del risultato devono essere quelli dell'originale, altrimenti la voce non si scrive.
// Rilanciabile: una seconda esecuzione non trova niente da cambiare.
//
// Uso: node --env-file=../../.env.local ricomponi-oggetti-a-modello.mjs [--applica]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { indiceModelli, sciogliRimandiOggetto } from "../../lib/fivetools/rimando-oggetto.ts";
import { classificaBlocchi } from "../../lib/testo-strutturato.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
const scarica = async (f) => (await fetch(`${RAW_BASE}/${f}`)).json();

const traduzioni = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "traduzioni-modelli-oggetti.json"), "utf-8"));
const [oggetti, base, varianti] = await Promise.all([
  scarica("items.json"),
  scarica("items-base.json"),
  scarica("magicvariants.json"),
]);
const modelliInglesi = indiceModelli(base.itemEntry);

const RIMANDO = /^\{#itemEntry ([^|}]+)(?:\|([^|}]*))?\}$/;
const tutti = [
  ...oggetti.item,
  ...(oggetti.itemGroup ?? []),
  ...base.baseitem,
  // Le varianti generiche tengono i dati sotto "inherits": qui serve la forma di una voce.
  ...varianti.magicvariant.filter((v) => v.inherits?.source).map((v) => ({ ...v.inherits, name: v.name })),
];
const aModello = tutti.filter((o) => (o.entries ?? []).some((e) => typeof e === "string" && RIMANDO.test(e.trim())));

const cache = await sql`SELECT name, source, nome_ita, descrizione_ita FROM compendio_traduzione_ia WHERE kind = 'oggetti'`;
const inCache = new Map(cache.map((r) => [`${r.name}|${r.source}`, r]));

const normalizza = (s) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const dadi = (testo) => (testo.match(/\b\d+d\d+\b/g) ?? []).sort().join(" ");

/** Riempie `{{chiave}}`; restituisce null se una chiave non ha un valore tradotto. */
function riempi(riga, valori) {
  let manca = null;
  const out = riga.replace(/\{\{(\w+)\}\}/g, (_, chiave) => {
    if (valori[chiave] === undefined) manca = chiave;
    return valori[chiave] ?? "";
  });
  return manca ? { manca } : { testo: out };
}

/** I valori di una voce, tradotti: tipo di danno nelle sue forme, più i dettagli del modello. */
function valoriDi(oggetto, modello) {
  const tipi = oggetto.resist ?? [];
  const elenco = (tabella) => (tipi.length > 0 && tipi.every((t) => tabella?.[t]) ? tipi.map((t) => tabella[t]).join(" e ") : undefined);
  return {
    danni: elenco(traduzioni.danni),
    danni2024: elenco(traduzioni.danni2024),
    aDanno: elenco(traduzioni.aDanno),
    tipoDanno: elenco(traduzioni.tipoDanno),
    elemento: elenco(modello.elemento),
    detail1: modello.detail1?.[oggetto.detail1],
    detail2: modello.detail2?.[oggetto.detail2],
  };
}

const esito = { scritte: 0, create: 0, invariate: 0, lasciate: [], saltate: [] };
const daScrivere = [];

for (const oggetto of aModello) {
  const chiave = `${oggetto.name}|${oggetto.source}`;
  const rimando = oggetto.entries.find((e) => typeof e === "string" && RIMANDO.test(e.trim())).trim().match(RIMANDO);
  const chiaveModello = `${rimando[1]}|${rimando[2] || "DMG"}`;
  const modello = traduzioni.modelli[chiaveModello];
  if (!modello) { esito.saltate.push(`${chiave}: il modello «${chiaveModello}» non è tradotto`); continue; }

  const valori = valoriDi(oggetto, modello);
  const righeModello = [];
  let manca = null;
  for (const riga of modello.righe) {
    const r = riempi(riga, valori);
    if (r.manca) manca = r.manca;
    else righeModello.push(r.testo);
  }
  if (manca) { esito.saltate.push(`${chiave}: manca il valore «${manca}» (resist ${JSON.stringify(oggetto.resist)}, detail1 ${oggetto.detail1}, detail2 ${oggetto.detail2})`); continue; }

  const nome = modello.nomi?.[oggetto.name] ?? (modello.nome ? riempi(modello.nome, valori).testo : undefined);
  const riga = inCache.get(chiave);
  const nomi = new Set([riga?.nome_ita, oggetto.name, nome].map(normalizza).filter(Boolean));

  // Ciò che in cache non è né il rimando tradotto, né il testo comune, né il nome ripetuto.
  let proprie = (riga?.descrizione_ita ?? "")
    .split("\n")
    .map((r) => r.trim())
    .filter((r) => r && !/^\{#itemEntry [^}]*\}$/.test(r) && !righeModello.includes(r));
  if (proprie.length > 0 && nomi.has(normalizza(proprie[0]))) proprie = proprie.slice(1);
  // Stessa prova che fa l'app: tolto il nome (anche scritto in un altro modo) resta qualcosa?
  if (classificaBlocchi(proprie, { nomiVoce: [...nomi], originaleApreConTitolo: false }).length === 0) proprie = [];

  const haTestoProprio = oggetto.entries.length > 1;
  if (!haTestoProprio && proprie.length > 0) {
    // Il rimando è tutta la descrizione, ma in cache c'è una traduzione vera: resta quella.
    esito.lasciate.push(chiave);
    if (nome && riga && riga.nome_ita !== nome) daScrivere.push({ chiave, oggetto, nome, descrizione: riga.descrizione_ita, riga });
    continue;
  }
  if (haTestoProprio) {
    const scritte = modello.specifiche?.[chiave];
    if (scritte) proprie = scritte;
    if (proprie.length === 0) { esito.saltate.push(`${chiave}: ha un testo proprio oltre al rimando, ma non è tradotto né in cache né nel file`); continue; }
  }

  const descrizione = [...righeModello, ...proprie].join("\n");
  const inglese = JSON.stringify(sciogliRimandiOggetto(oggetto.entries, oggetto, modelliInglesi));
  if (dadi(descrizione) !== dadi(inglese)) {
    esito.saltate.push(`${chiave}: i dadi non tornano (italiano «${dadi(descrizione)}», originale «${dadi(inglese)}»)`);
    continue;
  }
  if (!riga && !nome) { esito.saltate.push(`${chiave}: non è in cache e il file non le dà un nome`); continue; }
  if (riga && riga.descrizione_ita === descrizione && (!nome || riga.nome_ita === nome)) { esito.invariate++; continue; }
  daScrivere.push({ chiave, oggetto, nome: nome ?? riga.nome_ita, descrizione, riga });
}

// I nomi delle voci di famiglia che hanno il testo per esteso: solo il nome, la descrizione resta.
for (const [chiave, nome] of Object.entries(traduzioni.nomiFuoriModello ?? {})) {
  if (chiave.startsWith("_")) continue;
  const riga = inCache.get(chiave);
  if (!riga) { esito.saltate.push(`${chiave}: nome da correggere, ma la voce non è in cache`); continue; }
  if (riga.nome_ita === nome) { esito.invariate++; continue; }
  const [name, source] = chiave.split("|");
  daScrivere.push({ chiave, oggetto: { name, source }, nome, descrizione: riga.descrizione_ita, riga });
}

for (const { chiave, oggetto, nome, descrizione, riga } of daScrivere) {
  if (riga) esito.scritte++;
  else esito.create++;
  const cambi = [
    riga && riga.nome_ita !== nome ? `nome «${riga.nome_ita}» -> «${nome}»` : null,
    !riga ? `nuova («${nome}»)` : null,
    riga && riga.descrizione_ita !== descrizione ? `descrizione ${(riga.descrizione_ita ?? "").length} -> ${(descrizione ?? "").length} car` : null,
  ].filter(Boolean);
  console.log(`${riga ? "✓" : "+"} ${chiave}: ${cambi.join(", ")}`);
  if (applica) {
    await sql`
      INSERT INTO compendio_traduzione_ia (kind, name, source, nome_ita, descrizione_ita, updated_at)
      VALUES ('oggetti', ${oggetto.name}, ${oggetto.source}, ${nome}, ${descrizione}, now())
      ON CONFLICT (kind, name, source) DO UPDATE
        SET nome_ita = excluded.nome_ita,
            descrizione_ita = excluded.descrizione_ita,
            updated_at = now()`;
  }
}

console.log(`\n${applica ? "" : "[PROVA] "}oggetti a modello: ${aModello.length} — aggiornati: ${esito.scritte}, creati: ${esito.create}, già a posto: ${esito.invariate}`);
console.log(`con una traduzione vera già in cache, lasciata com'è: ${esito.lasciate.length}`);
console.log(`saltati: ${esito.saltate.length}`);
for (const s of esito.saltate) console.log(`  - ${s}`);
