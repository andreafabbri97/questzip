// Controlla che ogni descrizione tradotta dall'IA corrisponda DAVVERO alla sua voce inglese, e non
// a quella accanto.
//
// Serve perché fino a poco fa la traduzione a lotti chiedeva al modello un array "nello stesso
// ordine" e abbinava le risposte per POSIZIONE: bastava che ne saltasse una e ne aggiungesse
// un'altra (il conteggio tornava, quindi il controllo sulla lunghezza non se ne accorgeva) perché
// tutte le descrizioni successive slittassero di uno. Il talento "Adepto Occulto" si è così
// ritrovato addosso il testo di "Resistente". L'abbinamento ora è per chiave, ma le voci tradotte
// PRIMA di quella correzione vanno ricontrollate una per una.
//
// Il confronto usa due segnali che sopravvivono alla traduzione:
//   - la notazione dei dadi (1d6, 2d8...), che in italiano si scrive identica;
//   - il rapporto di lunghezza fra originale e traduzione, che per l'italiano sta in una banda
//     larga ma non illimitata.
//
// Uso: node --env-file=../../.env.local verifica-traduzioni.mjs [categoria] [--azzera]
//   --azzera  cancella la descrizione delle voci sospette, così l'app ricade sulla traduzione al
//             volo (giusta anche se meno curata) invece di mostrare con sicurezza il testo di
//             un'altra voce, e il prossimo giro dello script di traduzione le rifà.
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
const args = process.argv.slice(2);
const azzera = args.includes("--azzera");
const soloCategoria = args.find((a) => !a.startsWith("--"));

const fetchJson = async (u) => {
  try {
    const r = await fetch(u);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};

/** Appiattisce la struttura "entries" di 5etools in testo semplice. */
function appiattisci(entries) {
  const pezzi = [];
  const visita = (e) => {
    if (typeof e === "string") pezzi.push(e);
    else if (Array.isArray(e)) e.forEach(visita);
    else if (e && typeof e === "object") {
      if (e.name) pezzi.push(String(e.name));
      // Le righe delle TABELLE non entrano nel confronto: sono dati, non prosa, e una voce come
      // "Trinket" ha 100 righe di tabella che la traduzione giustamente non ripete — contarle
      // farebbe risultare troncata una descrizione perfettamente completa.
      visita(e.entries ?? e.items ?? []);
    }
  };
  visita(entries ?? []);
  return pezzi.join(" ");
}

const SPELL_BOOKS = [
  "aag", "ai", "aitfr-avt", "bmt", "efa", "egw", "ftd", "frhof",
  "ggr", "idrotf", "llk", "phb", "sato", "scc", "tce", "xge", "xphb",
];

async function originaliIncantesimi() {
  const files = await Promise.all(
    SPELL_BOOKS.map((b) => fetchJson(`${RAW_BASE}/spells/spells-${b}.json`)),
  );
  const mappa = new Map();
  for (const f of files)
    for (const s of f?.spell ?? [])
      mappa.set(`${s.name}|${s.source}`, appiattisci([...(s.entries ?? []), ...(s.entriesHigherLevel ?? [])]));
  return mappa;
}

async function originaliMostri() {
  const index = await fetchJson(`${RAW_BASE}/bestiary/index.json`);
  const files = await Promise.all(
    [...new Set(Object.values(index ?? {}))].map((f) => fetchJson(`${RAW_BASE}/bestiary/${f}`)),
  );
  const mappa = new Map();
  for (const f of files)
    for (const m of f?.monster ?? [])
      mappa.set(
        `${m.name}|${m.source}`,
        appiattisci([...(m.trait ?? []), ...(m.action ?? []), ...(m.bonus ?? []), ...(m.reaction ?? []), ...(m.legendary ?? [])]),
      );
  return mappa;
}

async function originaliOggetti() {
  const [items, varianti] = await Promise.all([
    fetchJson(`${RAW_BASE}/items.json`),
    fetchJson(`${RAW_BASE}/magicvariants.json`),
  ]);
  const mappa = new Map();
  for (const i of [...(items?.item ?? []), ...(items?.itemGroup ?? [])])
    mappa.set(`${i.name}|${i.source ?? "DMG"}`, appiattisci(i.entries));
  for (const v of varianti?.magicvariant ?? [])
    if (v.inherits?.source) mappa.set(`${v.name}|${v.inherits.source}`, appiattisci(v.inherits.entries));
  return mappa;
}

const daFile = (url, chiave) => async () => {
  const f = await fetchJson(url);
  const mappa = new Map();
  for (const x of f?.[chiave] ?? []) mappa.set(`${x.name}|${x.source}`, appiattisci(x.entries));
  return mappa;
};

const CATEGORIE = {
  incantesimi: originaliIncantesimi,
  mostri: originaliMostri,
  oggetti: originaliOggetti,
  razze: daFile(`${RAW_BASE}/races.json`, "race"),
  talenti: daFile(`${RAW_BASE}/feats.json`, "feat"),
  background: daFile(`${RAW_BASE}/backgrounds.json`, "background"),
  condizioni: daFile(`${RAW_BASE}/conditionsdiseases.json`, "condition"),
};

const dadi = (testo) => {
  const trovati = String(testo).match(/\b\d+d\d+\b/g) ?? [];
  return [...new Set(trovati.map((d) => d.toLowerCase()))].sort().join(",");
};

let totaleSospetti = 0;
for (const [kind, carica] of Object.entries(CATEGORIE)) {
  if (soloCategoria && soloCategoria !== kind) continue;
  const originali = await carica();
  const righe = await sql`
    SELECT name, source, nome_ita, descrizione_ita
    FROM compendio_traduzione_ia
    WHERE kind = ${kind} AND descrizione_ita IS NOT NULL AND descrizione_ita <> ''`;

  let controllati = 0;
  let senzaOriginale = 0;
  const sospetti = [];
  for (const r of righe) {
    const originale = originali.get(`${r.name}|${r.source}`);
    if (!originale || originale.length < 40) { senzaOriginale++; continue; }
    controllati++;
    const motivi = [];
    // I dadi sono il segnale più forte: sopravvivono identici alla traduzione. Si confronta solo
    // quando l'originale ne ha, altrimenti l'assenza non dice nulla.
    const dadiEn = dadi(originale);
    const dadiIt = dadi(r.descrizione_ita);
    if (dadiEn && dadiIt === "") motivi.push(`dadi spariti (${dadiEn})`);
    const rapporto = r.descrizione_ita.length / originale.length;
    // Solo il testo TROPPO CORTO e' un problema: e' il segno che il modello ha smesso di tradurre
    // a meta'. Il contrario non lo e' — dove c'e' il testo ufficiale italiano la descrizione e'
    // legittimamente molto piu' ricca delle poche righe di 5etools, e segnalarla sarebbe un falso
    // allarme su ogni razza e ogni background.
    if (rapporto < 0.35) motivi.push(`troncata (x${rapporto.toFixed(2)})`);
    if (motivi.length > 0) sospetti.push({ r, motivi });
  }

  console.log(`${kind}: ${controllati} controllati (${senzaOriginale} senza originale) — sospetti: ${sospetti.length}`);
  for (const s of sospetti.slice(0, 6)) {
    console.log(`    ${s.r.name} [${s.r.source}] "${s.r.nome_ita}" — ${s.motivi.join("; ")}`);
  }
  if (sospetti.length > 6) console.log(`    …e altri ${sospetti.length - 6}`);
  totaleSospetti += sospetti.length;

  if (azzera && sospetti.length > 0) {
    for (const s of sospetti) {
      await sql`
        UPDATE compendio_traduzione_ia SET descrizione_ita = NULL
        WHERE kind = ${kind} AND name = ${s.r.name} AND source = ${s.r.source}`;
    }
    console.log(`    azzerate ${sospetti.length} descrizioni: le rifarà il prossimo giro di traduzione`);
  }
}

console.log(`\ntotale sospetti: ${totaleSospetti}${azzera ? " (azzerati)" : ""}`);
