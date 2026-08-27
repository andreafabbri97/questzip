// Controlla che ogni riga di testo ufficiale italiano sia agganciata alla voce inglese GIUSTA,
// confrontando dati oggettivi che non dipendono dalla traduzione:
//   - incantesimi: livello e scuola;
//   - oggetti: rarità.
// (I mostri hanno un controllo a sé, su CA e PF: verifica-abbinamenti-mostri.mjs.)
//
// Serve perché l'abbinamento italiano→inglese è stato fatto in parte dal modello: un nome tradotto
// che somiglia a un altro basta a farlo sbagliare, e allora aprendo "Forcecage" nel Compendio
// compariva il testo ufficiale di "Allucinazione di Forza" — un incantesimo diverso. Sono errori
// silenziosi: la scheda si vede bene, dice solo cose sbagliate.
//
// Uso: node --env-file=../../.env.local verifica-abbinamenti.mjs [--scollega]
//   --scollega  riporta a "non abbinata" ogni riga incoerente: meglio la traduzione al volo del
//               testo giusto che il testo ufficiale di un'altra voce.
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
const scollega = process.argv.includes("--scollega");

const fetchJson = async (u) => {
  try {
    const r = await fetch(u);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
};

// "Evocazione" traduce Conjuration e "Invocazione" traduce Evocation: il falso amico classico.
const SCUOLE = {
  abiurazione: "A", ammaliamento: "E", divinazione: "D", evocazione: "C",
  illusione: "I", invocazione: "V", necromanzia: "N", trasmutazione: "T",
};
const RARITA = {
  comune: "common", "non comune": "uncommon", raro: "rare", rara: "rare",
  "molto raro": "very rare", "molto rara": "very rare",
  leggendario: "legendary", leggendaria: "legendary", artefatto: "artifact",
};
const norm = (s) => (s ?? "").toString().trim().toLowerCase();

// La notazione dei dadi non cambia fra inglese e italiano: e' il confronto piu' selettivo che si
// possa fare senza capire il testo. La rarita' da sola non basta — "Diadema Incandescente" e
// "Headband of Intellect" sono entrambi "non comune", ma il primo lancia raggio rovente (2d6 per
// raggio) e il secondo non tira alcun dado.
const dadi = (testo) => {
  const trovati = String(testo).match(/\d+d\d+/g) ?? [];
  return [...new Set(trovati.map((d) => d.toLowerCase()))].sort().join(",");
};

const appiattisci = (entries) => {
  const pezzi = [];
  const visita = (e) => {
    if (typeof e === "string") pezzi.push(e);
    else if (Array.isArray(e)) e.forEach(visita);
    else if (e && typeof e === "object") visita(e.entries ?? e.items ?? []);
  };
  visita(entries ?? []);
  return pezzi.join(" ");
};

const SPELL_BOOKS = [
  "aag", "ai", "aitfr-avt", "bmt", "efa", "egw", "ftd", "frhof",
  "ggr", "idrotf", "llk", "phb", "sato", "scc", "tce", "xge", "xphb",
];

async function controllaIncantesimi() {
  const files = await Promise.all(SPELL_BOOKS.map((b) => fetchJson(`${RAW_BASE}/spells/spells-${b}.json`)));
  const perChiave = new Map();
  for (const f of files) for (const s of f?.spell ?? []) perChiave.set(`${s.name}|${s.source}`, s);

  const righe = await sql`
    SELECT id, nome, livello, scuola, nome_inglese, fonte_inglese
    FROM compendio_ita_incantesimo WHERE nome_inglese IS NOT NULL`;
  const sbagliati = [];
  for (const r of righe) {
    const en = perChiave.get(`${r.nome_inglese}|${r.fonte_inglese}`);
    if (!en) { sbagliati.push({ r, motivo: "voce inglese inesistente" }); continue; }
    const motivi = [];
    if (en.level !== r.livello) motivi.push(`livello ${r.livello} vs ${en.level}`);
    const scuolaAttesa = SCUOLE[norm(r.scuola)];
    if (scuolaAttesa && norm(en.school) !== norm(scuolaAttesa)) {
      motivi.push(`scuola ${r.scuola} (${scuolaAttesa}) vs ${en.school}`);
    }
    if (motivi.length > 0) sbagliati.push({ r, motivo: motivi.join("; ") });
  }
  return { nome: "incantesimi", tabella: "compendio_ita_incantesimo", totale: righe.length, sbagliati };
}

async function controllaOggetti() {
  const [items, varianti] = await Promise.all([
    fetchJson(`${RAW_BASE}/items.json`),
    fetchJson(`${RAW_BASE}/magicvariants.json`),
  ]);
  const perChiave = new Map();
  for (const i of [...(items?.item ?? []), ...(items?.itemGroup ?? [])]) {
    perChiave.set(`${i.name}|${i.source ?? "DMG"}`, { rarity: i.rarity, testo: appiattisci(i.entries) });
  }
  for (const v of varianti?.magicvariant ?? []) {
    if (v.inherits?.source) perChiave.set(`${v.name}|${v.inherits.source}`, { rarity: v.inherits.rarity, testo: appiattisci(v.inherits.entries) });
  }

  const righe = await sql`
    SELECT id, nome, rarita, descrizione, nome_inglese, fonte_inglese
    FROM compendio_ita_oggetto WHERE nome_inglese IS NOT NULL`;
  const sbagliati = [];
  for (const r of righe) {
    const en = perChiave.get(`${r.nome_inglese}|${r.fonte_inglese}`);
    if (!en) { sbagliati.push({ r, motivo: "voce inglese inesistente" }); continue; }
    const motivi = [];
    const attesa = RARITA[norm(r.rarita)];
    // "varies" è la rarità delle voci di famiglia (Anello di Resistenza): raccolgono varianti di
    // rarità diversa, quindi qualunque valore italiano è compatibile.
    if (attesa && norm(en.rarity) !== "varies" && norm(en.rarity) !== attesa) {
      motivi.push(`rarità "${r.rarita}" (${attesa}) vs "${en.rarity}"`);
    }
    const dadiEn = dadi(en.testo);
    const dadiIt = dadi(r.descrizione);
    // Si segnala solo quando ENTRAMBI hanno dadi e sono insiemi disgiunti: se uno dei due non ne
    // ha, il silenzio non dimostra nulla (il testo italiano puo' essere piu' sintetico).
    if (dadiEn && dadiIt && !dadiEn.split(",").some((d) => dadiIt.includes(d))) {
      motivi.push(`dadi ${dadiEn} vs ${dadiIt}`);
    }
    if (motivi.length > 0) sbagliati.push({ r, motivo: motivi.join("; ") });
  }
  return { nome: "oggetti", tabella: "compendio_ita_oggetto", totale: righe.length, sbagliati };
}

let totale = 0;
for (const controllo of [controllaIncantesimi, controllaOggetti]) {
  const { nome, tabella, totale: n, sbagliati } = await controllo();
  console.log(`${nome}: ${n} abbinamenti controllati — incoerenti: ${sbagliati.length}`);
  for (const s of sbagliati) {
    console.log(`    "${s.r.nome}" -> ${s.r.nome_inglese} [${s.r.fonte_inglese}]: ${s.motivo}`);
  }
  totale += sbagliati.length;
  if (scollega && sbagliati.length > 0) {
    for (const s of sbagliati) {
      await sql.query(`UPDATE ${tabella} SET nome_inglese = NULL, fonte_inglese = NULL WHERE id = $1`, [s.r.id]);
    }
    console.log(`    scollegate ${sbagliati.length} righe`);
  }
}
console.log(`\ntotale abbinamenti incoerenti: ${totale}${scollega ? " (scollegati)" : ""}`);
