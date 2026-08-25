// Secondo passaggio di abbinamento nomi italiani -> inglesi, per le voci che link-names-ai.mjs
// non riesce a chiudere.
//
// Perché serve: nel primo passaggio il modello PROPONE liberamente un nome inglese e la rete di
// sicurezza scrive solo se quel nome esiste davvero. Funziona, ma scarta anche i casi in cui il
// modello ha sbagliato di pochissimo — "Cordons of Arrows" invece di "Cordon of Arrows", "Send"
// invece di "Sending", "Illusory Terrain" invece di "Hallucinatory Terrain". La voce è
// riconosciuta correttamente, è il nome esatto a sfuggire.
//
// Qui si ribalta l'impostazione: invece di far proporre un nome a mano libera, si costruisce una
// ROSA di candidati che esistono per certo, filtrando l'elenco inglese con i dati strutturali che
// la riga italiana già possiede (livello e scuola per gli incantesimi, rarità e categoria per gli
// oggetti, grado sfida e tipo per i mostri), e si chiede al modello soltanto di SCEGLIERE fra
// quelli — oppure di rispondere "nessuno". La rete di sicurezza resta identica e anzi si rafforza:
// la scelta deve appartenere alla rosa di QUELLA voce, quindi un nome inventato non ha modo di
// entrare nel database.
//
// Uso: node --env-file=../../.env.local link-names-rosa.mjs <incantesimi|mostri|oggetti|talenti> [--dry-run]
import { neon } from "@neondatabase/serverless";
import { askGemini } from "../../lib/gemini.ts";

const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
const sql = neon(process.env.DATABASE_URL);
const categoria = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

const TABELLE = {
  incantesimi: "compendio_ita_incantesimo",
  mostri: "compendio_ita_mostro",
  oggetti: "compendio_ita_oggetto",
  talenti: "compendio_ita_talento",
};
if (!TABELLE[categoria]) {
  console.error("categoria: incantesimi | mostri | oggetti | talenti");
  process.exit(1);
}

const fetchJson = async (u) => (await fetch(u)).json();

// Attenzione al falso amico, che è la trappola classica di D&D in italiano: "Evocazione" traduce
// Conjuration e "Invocazione" traduce Evocation, NON viceversa.
const SCUOLE = {
  abiurazione: "A",
  ammaliamento: "E",
  divinazione: "D",
  evocazione: "C",
  illusione: "I",
  invocazione: "V",
  necromanzia: "N",
  trasmutazione: "T",
};

const RARITA = {
  comune: "common",
  "non comune": "uncommon",
  raro: "rare",
  rara: "rare",
  "molto raro": "very rare",
  "molto rara": "very rare",
  leggendario: "legendary",
  leggendaria: "legendary",
  artefatto: "artifact",
};

const TIPI_MOSTRO = {
  aberrazione: "aberration",
  bestia: "beast",
  celestiale: "celestial",
  costrutto: "construct",
  drago: "dragon",
  elementale: "elemental",
  fata: "fey",
  immondo: "fiend",
  gigante: "giant",
  umanoide: "humanoid",
  melma: "ooze",
  mostruosità: "monstrosity",
  vegetale: "plant",
  "non morto": "undead",
};

// Categoria italiana -> come comincia il nome inglese ufficiale di quella famiglia.
const FAMIGLIE = [
  ["anello", /^Ring/i],
  ["bacchetta", /^Wand/i],
  ["verga", /^Rod/i],
  ["bastone", /^Staff/i],
  ["pozione", /^(Potion|Oil|Philter|Elixir)/i],
  ["pergamena", /^(Scroll|Spell Scroll)/i],
  ["olio", /^Oil/i],
  ["armatura", /(Armor|Mail|Plate|Leather|Breastplate)/i],
  ["corazza", /(Armor|Mail|Plate|Breastplate)/i],
  ["scudo", /Shield/i],
];

const normalizza = (s) => (s ?? "").toString().trim().toLowerCase();

async function elencoInglese() {
  if (categoria === "incantesimi") {
    const libri = ["phb", "xge", "tce", "xphb", "scc", "ftd", "aag", "bmt"];
    const files = await Promise.all(
      libri.map((b) => fetchJson(`${RAW_BASE}/spells/spells-${b}.json`).catch(() => ({}))),
    );
    return files.flatMap((f) =>
      (f.spell ?? []).map((s) => ({
        name: s.name,
        source: s.source,
        livello: s.level,
        scuola: s.school,
      })),
    );
  }
  if (categoria === "oggetti") {
    // magicvariants.json, non solo items.json: gli oggetti magici piu' iconici (Flame Tongue,
    // Dragon Slayer, Adamantine Armor, le armi +1/+2/+3) sono varianti generiche e vivono li'.
    const [f, mv] = await Promise.all([
      fetchJson(`${RAW_BASE}/items.json`),
      fetchJson(`${RAW_BASE}/magicvariants.json`).catch(() => ({})),
    ]);
    // itemGroup incluso: le voci "di famiglia" (Anello di Resistenza, Corno del Valhalla,
    // Pergamena Magica) stanno li', non fra gli oggetti singoli.
    const diretti = [...(f.item ?? []), ...(f.itemGroup ?? [])].map((i) => ({
      name: i.name,
      source: i.source ?? "DMG",
      rarita: normalizza(i.rarity),
      tipo: normalizza(i.type),
    }));
    const varianti = (mv.magicvariant ?? [])
      .filter((v) => v.inherits?.source)
      .map((v) => ({
        name: v.name,
        source: v.inherits.source,
        rarita: normalizza(v.inherits.rarity),
        tipo: normalizza(v.type),
      }));
    return [...diretti, ...varianti];
  }
  if (categoria === "talenti") {
    const f = await fetchJson(`${RAW_BASE}/feats.json`);
    return (f.feat ?? []).map((x) => ({ name: x.name, source: x.source }));
  }
  const index = await fetchJson(`${RAW_BASE}/bestiary/index.json`);
  const files = await Promise.all(
    Object.values(index).map((f) => fetchJson(`${RAW_BASE}/bestiary/${f}`).catch(() => ({}))),
  );
  return files.flatMap((f) =>
    (f.monster ?? []).map((m) => ({
      name: m.name,
      source: m.source,
      tipo: normalizza(typeof m.type === "object" ? m.type?.type : m.type),
      sfida: normalizza(typeof m.cr === "object" ? m.cr?.cr : m.cr),
    })),
  );
}

/** Candidati che condividono con la riga italiana i dati strutturali: sono fatti oggettivi
 * (livello, scuola, rarità, grado sfida), non opinioni di traduzione, quindi restringono la rosa
 * senza rischiare di escludere quello giusto. */
function costruisciRosa(riga, inglesi) {
  if (categoria === "incantesimi") {
    const scuola = SCUOLE[normalizza(riga.scuola)];
    return inglesi.filter(
      (e) => e.livello === riga.livello && (!scuola || normalizza(e.scuola) === normalizza(scuola)),
    );
  }
  if (categoria === "oggetti") {
    // Si parte dal filtro piu' selettivo e affidabile: la FAMIGLIA, che la categoria italiana
    // dichiara in chiaro ("Anello", "Pozione", "Arma..."). La rarita' viene applicata dopo, e solo
    // se non svuota la rosa: molte voci italiane hanno la rarita' mancante o scritta in forme che
    // non mappano, e in quei casi filtrare per rarita' toglieva proprio il candidato giusto.
    // Le voci italiane di questa tabella vengono tutte dal catalogo del Manuale del DM: limitare i
    // candidati a DMG/XDMG toglie di mezzo migliaia di oggetti di altri manuali che non possono
    // essere la risposta, e tiene il prompt abbastanza piccolo da non sbattere contro il limite di
    // token al minuto dell'API (che e' quello che fa fallire le richieste, non la quota giornaliera).
    const soloDmg = inglesi.filter((e) => e.source === "DMG" || e.source === "XDMG");
    let rosa = soloDmg.length > 0 ? soloDmg : inglesi;
    const categoriaIta = normalizza(riga.categoria);
    if (categoriaIta.startsWith("arma")) {
      // Il nome inglese di un'arma magica non comincia con "Weapon" (Flame Tongue, Dragon
      // Slayer...), ma il codice di tipo la identifica: GV = variante generica, M/R = mischia e
      // distanza.
      const armi = rosa.filter((e) => /^(gv|m|r)/.test(e.tipo ?? ""));
      if (armi.length > 0) rosa = armi;
    } else {
      const famiglia = FAMIGLIE.find(([it]) => categoriaIta.startsWith(it));
      if (famiglia) {
        const ristretta = rosa.filter((e) => famiglia[1].test(e.name));
        if (ristretta.length > 0) rosa = ristretta;
      }
    }
    const rarita = RARITA[normalizza(riga.rarita)];
    if (rarita) {
      // "varies" e' la rarita' delle voci di famiglia (Corno del Valhalla, Pergamena Magica), che
      // raccolgono varianti di rarita' diversa: vanno tenute qualunque sia la rarita' italiana.
      const perRarita = rosa.filter((e) => e.rarita === rarita || e.rarita === "varies");
      if (perRarita.length > 0) rosa = perRarita;
    }
    return rosa;
  }
  if (categoria === "mostri") {
    const tipo = TIPI_MOSTRO[normalizza(riga.tipo)];
    const sfida = normalizza(riga.sfida);
    return inglesi.filter(
      (e) => (!tipo || e.tipo === tipo) && (!sfida || e.sfida === sfida),
    );
  }
  return inglesi;
}

const tabella = TABELLE[categoria];
const colonne = {
  incantesimi: "id, nome, livello, scuola, descrizione",
  oggetti: "id, nome, categoria, rarita, descrizione",
  mostri: "id, nome, tipo, sfida, tratti",
  talenti: "id, nome, descrizione",
}[categoria];

const daCollegare = await sql.query(
  `SELECT ${colonne} FROM ${tabella} WHERE nome_inglese IS NULL ORDER BY nome`,
);
console.log(`${daCollegare.length} voci da collegare in ${tabella}`);
if (daCollegare.length === 0) process.exit(0);

const inglesi = await elencoInglese();
// A parità di nome tiene la prima fonte incontrata: l'aggancio fra edizioni sorelle (PHB/XPHB…)
// è gestito a valle da propaga-nomi-fonti.mjs, qui serve solo il nome giusto.
const perNome = new Map();
for (const e of inglesi) if (!perNome.has(e.name)) perNome.set(e.name, e);
console.log(`${perNome.size} nomi inglesi distinti disponibili`);

const MAX_ROSA = 3000;
const LOTTO = 4;
let collegati = 0;
const irrisolti = [];

for (let i = 0; i < daCollegare.length; i += LOTTO) {
  const lotto = daCollegare.slice(i, i + LOTTO);
  const rose = new Map();

  const blocchi = [];
  for (const riga of lotto) {
    const rosa = costruisciRosa(riga, [...perNome.values()]).slice(0, MAX_ROSA);
    if (rosa.length === 0) {
      irrisolti.push(`${riga.nome} (nessun candidato con questi dati)`);
      continue;
    }
    rose.set(riga.nome, rosa);
    const estratto = (riga.descrizione ?? riga.tratti ?? "").toString().replace(/\s+/g, " ").slice(0, 260);
    blocchi.push(
      `### ${riga.nome}\nDescrizione italiana: ${estratto}\nCandidati: ${rosa.map((c) => c.name).join(" | ")}`,
    );
  }
  if (blocchi.length === 0) continue;

  const prompt = `Sei un esperto di Dungeons & Dragons 5e e conosci i nomi ufficiali italiani dei manuali tradotti.

Per ogni voce qui sotto trovi il nome ITALIANO ufficiale, un estratto della sua descrizione italiana, e un elenco di CANDIDATI inglesi che esistono davvero. Scegli quale candidato è la stessa identica voce.

Regole:
- Devi scegliere ESATTAMENTE uno dei candidati elencati per quella voce, copiandone il nome alla lettera.
- Se nessun candidato è la stessa voce, rispondi null. Meglio nessun abbinamento che uno sbagliato.
- Fidati della descrizione più che dell'assonanza del nome: i nomi italiani ufficiali spesso non sono traduzioni letterali.

${blocchi.join("\n\n")}

Rispondi SOLO con un array JSON, un oggetto per voce:
[{"it": "<nome italiano>", "en": "<nome candidato scelto o null>"}]
Nessun testo attorno, nessun blocco markdown.`;

  if (i > 0) await new Promise((r) => setTimeout(r, 4000)); // rispetta il limite token/minuto
  const raw = await askGemini({ prompt });
  if (!raw) {
    console.log(`lotto ${Math.floor(i / LOTTO) + 1}: nessuna risposta (quota?) — mi fermo qui`);
    break;
  }
  let scelte;
  try {
    scelte = JSON.parse(raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim());
  } catch {
    console.log(`lotto ${Math.floor(i / LOTTO) + 1}: risposta non JSON, salto`);
    continue;
  }

  for (const s of scelte) {
    const riga = lotto.find((r) => r.nome === s.it);
    if (!riga) continue;
    if (!s.en) { irrisolti.push(`${riga.nome} (nessuna corrispondenza secondo il modello)`); continue; }
    const rosa = rose.get(riga.nome) ?? [];
    // Rete di sicurezza: la scelta deve appartenere alla rosa di QUESTA voce, non a un'altra e
    // tantomeno a un nome inventato.
    const eng = rosa.find((c) => c.name === s.en);
    if (!eng) { irrisolti.push(`${riga.nome} -> "${s.en}" (fuori dalla rosa)`); continue; }
    if (!dryRun) {
      await sql.query(
        `UPDATE ${tabella} SET nome_inglese = $1, fonte_inglese = $2 WHERE id = $3`,
        [eng.name, eng.source, riga.id],
      );
    }
    collegati++;
    console.log(`  ✓ ${riga.nome} -> ${eng.name} (${eng.source})`);
  }
}

console.log(`\n${dryRun ? "[PROVA] " : ""}collegati: ${collegati} / ${daCollegare.length}`);
console.log(`irrisolti: ${irrisolti.length}`);
for (const x of irrisolti) console.log("  -", x);
