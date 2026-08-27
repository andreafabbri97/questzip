// Controlla che ogni descrizione italiana di un talento corrisponda DAVVERO al suo talento
// inglese, e non a quello accanto.
//
// Serve perche' la traduzione a lotti chiedeva al modello un array "nello stesso ordine" e
// abbinava le risposte per POSIZIONE: bastava che ne saltasse una e ne aggiungesse un'altra
// (il conteggio tornava, quindi il controllo sulla lunghezza non se ne accorgeva) perche' tutte
// le descrizioni successive slittassero di uno. Nel Compendio il talento "Adepto Occulto" si e'
// cosi' ritrovato addosso il testo di "Resistente".
//
// Il confronto usa due segnali che sopravvivono alla traduzione:
//   - la notazione dei dadi (1d6, 2d8...), che in italiano si scrive identica;
//   - il rapporto di lunghezza fra originale e traduzione, che per l'italiano sta in una banda
//     stretta (l'italiano e' piu' lungo dell'inglese, ma non il doppio ne' la meta').
//
// Uso: node --env-file=../../.env.local verifica-traduzioni-talenti.mjs
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

const appiattisci = (entries) => {
  const pezzi = [];
  const visita = (e) => {
    if (typeof e === "string") pezzi.push(e);
    else if (Array.isArray(e)) e.forEach(visita);
    else if (e && typeof e === "object") {
      if (e.name) pezzi.push(e.name);
      visita(e.entries ?? e.items ?? []);
    }
  };
  visita(entries ?? []);
  return pezzi.join(" ");
};

const dadi = (testo) => {
  const trovati = String(testo).match(/\b\d+d\d+\b/g) ?? [];
  return [...new Set(trovati.map((d) => d.toLowerCase()))].sort();
};

const feats = await (await fetch(`${RAW_BASE}/feats.json`)).json();
const perChiave = new Map();
for (const f of feats.feat ?? []) perChiave.set(`${f.name}|${f.source}`, appiattisci(f.entries));

const righe = await sql`
  SELECT name, source, nome_ita, descrizione_ita
  FROM compendio_traduzione_ia
  WHERE kind = 'talenti' AND descrizione_ita IS NOT NULL AND descrizione_ita <> ''`;

let controllati = 0;
let senzaOriginale = 0;
const sospetti = [];

for (const r of righe) {
  const originale = perChiave.get(`${r.name}|${r.source}`);
  if (!originale) { senzaOriginale++; continue; }
  controllati++;
  const motivi = [];

  const dadiEn = dadi(originale);
  const dadiIt = dadi(r.descrizione_ita);
  if (dadiEn.join(",") !== dadiIt.join(",")) {
    motivi.push(`dadi ${dadiEn.join("/") || "nessuno"} vs ${dadiIt.join("/") || "nessuno"}`);
  }

  const rapporto = r.descrizione_ita.length / Math.max(1, originale.length);
  if (rapporto < 0.55 || rapporto > 1.9) motivi.push(`lunghezza x${rapporto.toFixed(2)}`);

  if (motivi.length > 0) sospetti.push(`${r.name} [${r.source}] "${r.nome_ita}" — ${motivi.join("; ")}`);
}

console.log(`talenti controllati: ${controllati} (senza originale inglese: ${senzaOriginale})`);
console.log(`sospetti: ${sospetti.length}`);
for (const s of sospetti) console.log("  -", s);
