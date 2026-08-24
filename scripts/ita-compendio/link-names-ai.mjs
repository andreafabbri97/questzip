// Collega i nomi UFFICIALI italiani (compendio_ita_*) alla loro controparte inglese usando l'IA.
//
// Perché serve: match-english-names.mjs traduce l'italiano in inglese con Google Translate e
// confronta — funziona per i nomi letterali ma fallisce su tutta la terminologia D&D, dove il nome
// italiano ufficiale non è una traduzione parola-per-parola ("Bacche Benefiche" = Goodberry,
// "Blocca Persone" = Hold Person). Restavano così centinaia di voci ufficiali scollegate, e l'app
// ripiegava sul nome INVENTATO dalla cache IA — con errori visibili ("Compprendi Linguaggi") o
// termini non ufficiali ("Lama Affilata" al posto di Parare Lame).
//
// Qui l'abbinamento lo fa il modello, che la terminologia D&D la conosce: gli si danno i nomi
// italiani non collegati e l'elenco inglese della stessa categoria, e restituisce le coppie.
// Conservativo per costruzione: scrive SOLO se il nome inglese proposto esiste davvero
// nell'elenco, e non tocca mai una riga già collegata.
//
// Uso: node --env-file=../../.env.local link-names-ai.mjs <incantesimi|mostri|oggetti> [--dry-run]
import { neon } from "@neondatabase/serverless";
import { askGemini } from "../../lib/gemini.ts";

const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
const sql = neon(process.env.DATABASE_URL);
const categoria = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

const CONFIG = {
  incantesimi: { tabella: "compendio_ita_incantesimo", libri: ["phb", "xge", "tce", "xphb"] },
  mostri: { tabella: "compendio_ita_mostro" },
  oggetti: { tabella: "compendio_ita_oggetto" },
};
if (!CONFIG[categoria]) {
  console.error("categoria: incantesimi | mostri | oggetti");
  process.exit(1);
}

const fetchJson = async (u) => (await fetch(u)).json();

async function elencoInglese() {
  if (categoria === "incantesimi") {
    const files = await Promise.all(
      CONFIG.incantesimi.libri.map((b) => fetchJson(`${RAW_BASE}/spells/spells-${b}.json`).catch(() => ({}))),
    );
    return files.flatMap((f) => (f.spell ?? []).map((s) => ({ name: s.name, source: s.source })));
  }
  if (categoria === "oggetti") {
    const f = await fetchJson(`${RAW_BASE}/items.json`);
    return (f.item ?? []).map((i) => ({ name: i.name, source: i.source }));
  }
  const index = await fetchJson(`${RAW_BASE}/bestiary/index.json`);
  const files = await Promise.all(
    Object.values(index).map((f) => fetchJson(`${RAW_BASE}/bestiary/${f}`).catch(() => ({}))),
  );
  return files.flatMap((f) => (f.monster ?? []).map((m) => ({ name: m.name, source: m.source })));
}

const { tabella } = CONFIG[categoria];
const daCollegare = await sql.query(
  `SELECT id, nome, fonte FROM ${tabella} WHERE nome_inglese IS NULL ORDER BY nome`,
);
console.log(`${daCollegare.length} voci italiane da collegare in ${tabella}`);
if (daCollegare.length === 0) process.exit(0);

const inglesi = await elencoInglese();
const perNome = new Map();
for (const e of inglesi) if (!perNome.has(e.name)) perNome.set(e.name, e);
console.log(`${perNome.size} nomi inglesi distinti disponibili`);

const LOTTO = 60;
let collegati = 0;
const irrisolti = [];

for (let i = 0; i < daCollegare.length; i += LOTTO) {
  const lotto = daCollegare.slice(i, i + LOTTO);
  const prompt = `Sei un esperto di Dungeons & Dragons 5e e conosci i nomi UFFICIALI italiani dei manuali tradotti.

Per ogni nome italiano qui sotto, indica il corrispondente nome INGLESE ufficiale. Usa esclusivamente nomi che esistono davvero in D&D 5e. Se non sei sicuro, usa null: meglio nessun abbinamento che uno sbagliato.

Nomi italiani (categoria: ${categoria}):
${lotto.map((r, n) => `${n + 1}. ${r.nome}`).join("\n")}

Rispondi SOLO con un array JSON, un oggetto per riga nell'ordine dato:
[{"it": "<nome italiano>", "en": "<nome inglese o null>"}]
Nessun testo attorno, nessun blocco markdown.`;

  const raw = await askGemini({ prompt });
  if (!raw) {
    console.log(`lotto ${i / LOTTO + 1}: nessuna risposta (quota?) — mi fermo qui`);
    break;
  }
  let coppie;
  try {
    coppie = JSON.parse(raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim());
  } catch {
    console.log(`lotto ${i / LOTTO + 1}: risposta non JSON, salto`);
    continue;
  }

  for (const c of coppie) {
    const riga = lotto.find((r) => r.nome === c.it);
    if (!riga || !c.en) { if (riga) irrisolti.push(riga.nome); continue; }
    const eng = perNome.get(c.en);
    // La rete di sicurezza: il nome proposto deve esistere davvero nell'elenco 5etools.
    if (!eng) { irrisolti.push(`${riga.nome} -> "${c.en}" (inesistente)`); continue; }
    if (!dryRun) {
      await sql.query(
        `UPDATE ${tabella} SET nome_inglese = $1, fonte_inglese = $2 WHERE id = $3`,
        [eng.name, eng.source, riga.id],
      );
    }
    collegati++;
    if (collegati <= 15) console.log(`  ✓ ${riga.nome} -> ${eng.name} (${eng.source})`);
  }
  console.log(`lotto ${i / LOTTO + 1}/${Math.ceil(daCollegare.length / LOTTO)}: ${collegati} collegati finora`);
}

console.log(`\n${dryRun ? "[PROVA] " : ""}collegati: ${collegati} / ${daCollegare.length}`);
console.log(`irrisolti: ${irrisolti.length}`);
for (const x of irrisolti.slice(0, 20)) console.log("  -", x);
