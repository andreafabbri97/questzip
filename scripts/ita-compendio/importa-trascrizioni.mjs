// Porta nel database le voci TRASCRITTE A MANO leggendo le pagine dei manuali, per le schede in
// cui l'estrazione automatica non è riparabile a regole (testo troncato, due schede fuse, la
// didascalia di un'illustrazione finita in mezzo).
//
// Il file sta in parsed/, che è fuori dal repository: contiene testo dei manuali. Forma:
//   { "tabella": "compendio_ita_talento", "fonte": "tasha",
//     "voci": [ { "nome": "...", "descrizione": "...", "prerequisito": "..." } ] }
// Ogni voce è cercata per nome + fonte e aggiorna SOLO le colonne che elenca: nome inglese,
// aggancio e tutto il resto della riga restano come sono (niente seed, che li azzererebbe).
//
// Una scheda che nel database non c'è proprio (l'estrazione l'ha saltata: è successo con due dei
// sei mephit) si dichiara con "_nuova": true e si scrive per intero, compresi nome_inglese e
// fonte_inglese: servono ad agganciarla alla voce del Compendio e a controllarne i numeri.
// Rilanciando il file la riga esiste già, e la voce torna a essere un normale aggiornamento.
//
// Uso: node --env-file=../../.env.local importa-trascrizioni.mjs <file.json> [--applica]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const file = process.argv[2];
const applica = process.argv.includes("--applica");
if (!file) {
  console.error("Uso: node importa-trascrizioni.mjs <file.json> [--applica]");
  process.exit(1);
}

const TABELLE_AMMESSE = new Set([
  "compendio_ita_talento",
  "compendio_ita_incantesimo",
  "compendio_ita_oggetto",
  "compendio_ita_mostro",
]);

const { tabella, fonte, voci } = JSON.parse(readFileSync(file, "utf-8"));
if (!TABELLE_AMMESSE.has(tabella)) {
  console.error(`Tabella non ammessa: ${tabella}`);
  process.exit(1);
}

// Anche una trascrizione fatta a occhio si controlla: per mostri e oggetti i dadi del testo
// italiano devono essere quelli dell'originale su 5etools. Se non tornano ho letto male un numero
// (o ho saltato un'azione), e la voce non entra finché non la ricontrollo sulla pagina — a meno
// di --forza, per i casi in cui la differenza è voluta ed è stata verificata.
const forza = process.argv.includes("--forza");
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
// "Nome inglese|FONTE" -> il testo originale in cui contare i dadi
let originali = null;
if (tabella === "compendio_ita_mostro") {
  const { risolviCopie } = await import("../../lib/fivetools/risolvi-copia.ts");
  const index = await (await fetch(`${B}/bestiary/index.json`)).json();
  const files = await Promise.all(
    [...new Set(Object.values(index))].map((f) => fetch(`${B}/bestiary/${f}`).then((r) => r.json()).catch(() => ({}))),
  );
  const template = await fetch(`${B}/bestiary/template.json`).then((r) => r.json()).catch(() => ({}));
  const creature = risolviCopie(files.flatMap((f) => f.monster ?? []), template.monsterTemplate ?? []);
  const sezioni = ["trait", "action", "bonus", "reaction", "legendary", "mythic", "spellcasting"];
  originali = new Map(creature.map((m) => [`${m.name}|${m.source}`, JSON.stringify(sezioni.map((s) => m[s] ?? null))]));
} else if (tabella === "compendio_ita_oggetto") {
  const [items, variants] = await Promise.all([
    fetch(`${B}/items.json`).then((r) => r.json()),
    fetch(`${B}/magicvariants.json`).then((r) => r.json()),
  ]);
  originali = new Map();
  for (const x of [...(items.item ?? []), ...(items.itemGroup ?? [])]) {
    originali.set(`${x.name}|${x.source}`, JSON.stringify(x.entries ?? null));
  }
  for (const x of variants.magicvariant ?? []) {
    originali.set(`${x.name}|${x.inherits?.source ?? x.source}`, JSON.stringify(x.inherits?.entries ?? x.entries ?? null));
  }
}
function dadi(testo) {
  const conta = new Map();
  for (const m of testo.matchAll(/\b(\d+)d(\d+)\b/g)) conta.set(m[0], (conta.get(m[0]) ?? 0) + 1);
  return conta;
}
function differenzeDiDadi(italiano, inglese) {
  const a = dadi(italiano);
  const b = dadi(inglese);
  const diff = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const d = (a.get(k) ?? 0) - (b.get(k) ?? 0);
    if (d !== 0) diff.push(`${d > 0 ? "+" : ""}${d}×${k}`);
  }
  return diff;
}

// Gli altri numeri che non cambiano con la lingua: classi difficoltà, bonus di attacco e danni
// medi. I dadi da soli non bastano — leggendo una pagina ho preso un "CD 14" per "CD 13", e il
// controllo dei dadi non poteva accorgersene. Le distanze restano fuori: i piedi diventano metri.
const FAMIGLIE_DI_NUMERI = [
  [
    "CD",
    /\bCD (?:del tiro salvezza (?:sull'incantesimo|dell'incantesimo|degli incantesimi) )?(\d+)\b/g,
    /\{@dc (\d+)\}/g,
  ],
  ["bonus di attacco", /([+\-−]\d+) al tiro per colpire/g, /\{@hit ([+\-]?\d+)\}/g],
  ["danno medio", /(\d+) \(\d+d\d+/g, /(\d+) \(\{@(?:damage|dice) \d+d\d+/g],
];
function differenzeDiNumeri(italiano, inglese) {
  const diff = [];
  for (const [etichetta, modelloIta, modelloEng] of FAMIGLIE_DI_NUMERI) {
    const conta = (testo, modello) => {
      const c = new Map();
      for (const m of testo.matchAll(modello)) {
        const n = Number(m[1].replace("−", "-"));
        c.set(n, (c.get(n) ?? 0) + 1);
      }
      return c;
    };
    const a = conta(italiano, modelloIta);
    const b = conta(inglese, modelloEng);
    const pezzi = [];
    for (const k of [...new Set([...a.keys(), ...b.keys()])].sort((x, y) => x - y)) {
      const d = (a.get(k) ?? 0) - (b.get(k) ?? 0);
      if (d !== 0) pezzi.push(`${d > 0 ? "+" : ""}${d}×${k}`);
    }
    if (pezzi.length > 0) diff.push(`${etichetta}: ${pezzi.join(", ")}`);
  }
  return diff;
}

// Le sezioni di testo di una scheda: in una scheda nuova i dadi si contano solo qui, perché
// l'originale con cui si confronta non comprende i punti ferita («21 (6d6)»).
const SEZIONI_MOSTRO = ["tratti", "azioni", "azioni_bonus", "reazioni", "azioni_leggendarie"];

// Le colonne jsonb (le caratteristiche) arrivano come oggetti: si confrontano e si scrivono come
// JSON, con le chiavi in ordine perché Postgres le restituisce in un ordine suo.
function inChiaro(valore) {
  if (valore === null || typeof valore !== "object") return valore ?? "";
  const ordina = (v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordina(v[k])]))
      : v;
  return JSON.stringify(ordina(valore));
}
const perLaQuery = (valore) => (valore !== null && typeof valore === "object" ? JSON.stringify(valore) : valore);
const segnaposto = (valore, n) => (valore !== null && typeof valore === "object" ? `$${n}::jsonb` : `$${n}`);

let aggiornate = 0;
let create = 0;
let respinte = 0;
for (const voce of voci) {
  // "_differenze_verificate" non e' una colonna: e' la nota con cui una voce dichiara che i suoi
  // numeri sono diversi dall'originale PERCHE' cosi' e' stampato sul manuale italiano (un refuso
  // di stampa, o un valore precedente a un'errata). Chi trascrive la scrive dopo aver riguardato
  // la pagina, e il controllo la lascia passare senza bisogno di --forza su tutto il file.
  const { nome, _differenze_verificate: verificate, _nuova: nuova, ...campi } = voce;
  const colonne = Object.keys(campi);
  // I nomi delle colonne finiscono nel testo della query: solo identificatori semplici.
  if (colonne.some((c) => !/^[a-z_]+$/.test(c))) {
    console.error(`✗ ${nome}: nome di colonna non valido`);
    continue;
  }
  // "fonte" è quella del file e "id" lo assegna il database: una voce non li può riscrivere.
  if (colonne.includes("id") || colonne.includes("fonte")) {
    console.error(`✗ ${nome}: "id" e "fonte" non sono colonne che una voce può impostare`);
    continue;
  }
  const daLeggere = [...new Set(["id", ...colonne, ...(originali ? ["nome_inglese", "fonte_inglese"] : [])])];
  const righe = await sql.query(`SELECT ${daLeggere.join(", ")} FROM ${tabella} WHERE nome = $1 AND fonte = $2`, [nome, fonte]);
  const daCreare = righe.length === 0 && Boolean(nuova);
  if (righe.length !== 1 && !daCreare) {
    console.error(`✗ ${nome}: ${righe.length} righe trovate, attesa una sola`);
    continue;
  }
  // Una scheda nuova si aggancia con i nomi che porta con sé: senza l'originale non c'è modo di
  // controllarne i numeri, e nel Compendio resterebbe una riga che nessuna voce mostra.
  const aggancio = daCreare ? campi : righe[0];
  if (daCreare && originali && !originali.has(`${campi.nome_inglese}|${campi.fonte_inglese}`)) {
    console.error(`✗ ${nome}: scheda nuova senza originale («${campi.nome_inglese}|${campi.fonte_inglese}» non esiste)`);
    respinte++;
    continue;
  }
  // La tabella non ha vincoli di unicità: se la scheda esiste già sotto un altro nome («Mephit del
  // Vapore» scritto in minuscolo, o storpiato dall'OCR) la ricerca per nome non la trova, e
  // l'inserimento ne creerebbe una seconda agganciata allo stesso originale.
  if (daCreare && originali) {
    const gemelle = await sql.query(
      `SELECT nome, fonte FROM ${tabella} WHERE nome_inglese = $1 AND fonte_inglese = $2`,
      [campi.nome_inglese, campi.fonte_inglese],
    );
    if (gemelle.length > 0) {
      console.error(`✗ ${nome}: «${campi.nome_inglese}|${campi.fonte_inglese}» ha già una scheda (${gemelle.map((g) => `«${g.nome}» [${g.fonte}]`).join(", ")}): non è nuova, va corretto il nome`);
      respinte++;
      continue;
    }
  }
  if (daCreare && !originali) {
    console.error(`✗ ${nome}: per questa tabella non si possono creare voci nuove (manca l'originale con cui controllarle)`);
    respinte++;
    continue;
  }
  if (originali) {
    const inglese = originali.get(`${aggancio.nome_inglese}|${aggancio.fonte_inglese}`);
    if (inglese) {
      const daControllare = nuova && tabella === "compendio_ita_mostro" ? SEZIONI_MOSTRO.map((c) => campi[c]) : Object.values(campi);
      const italiano = daControllare.filter((v) => typeof v === "string").join("\n");
      const dadiDiversi = differenzeDiDadi(italiano, inglese);
      // Per i mostri si confrontano anche CD, bonus di attacco e danni medi; negli oggetti le
      // stesse formule compaiono in tabelle che in italiano hanno un'altra forma.
      const numeriDiversi = tabella === "compendio_ita_mostro" ? differenzeDiNumeri(italiano, inglese) : [];
      const diff = [...(dadiDiversi.length > 0 ? [`dadi: ${dadiDiversi.join(", ")}`] : []), ...numeriDiversi];
      if (diff.length > 0) {
        const passa = forza || Boolean(verificate);
        const esito = verificate ? ` — verificata sulla pagina: ${verificate}` : forza ? ", importata lo stesso" : " — da ricontrollare sulla pagina";
        console.error(`${passa ? "!" : "✗"} ${nome}: numeri diversi dall'originale (${diff.join(" | ")})${esito}`);
        if (!passa) {
          respinte++;
          continue;
        }
      }
    }
  }
  if (daCreare) {
    create++;
    console.log(`+ ${nome}: scheda nuova (${colonne.length} colonne, agganciata a «${campi.nome_inglese}|${campi.fonte_inglese}»)`);
    if (applica) {
      const tutte = ["nome", "fonte", ...colonne];
      const valori = [nome, fonte, ...colonne.map((c) => campi[c])];
      await sql.query(
        `INSERT INTO ${tabella} (${tutte.join(", ")}) VALUES (${valori.map((v, i) => segnaposto(v, i + 1)).join(", ")})`,
        valori.map(perLaQuery),
      );
    }
    continue;
  }
  const cambiate = colonne.filter((c) => inChiaro(righe[0][c]) !== inChiaro(campi[c]));
  if (cambiate.length === 0) continue;
  aggiornate++;
  console.log(`✓ ${nome}: ${cambiate.map((c) => `${c} ${String(inChiaro(righe[0][c])).length} -> ${String(inChiaro(campi[c])).length} car`).join(", ")}`);
  if (applica) {
    const set = cambiate.map((c, i) => `${c} = ${segnaposto(campi[c], i + 1)}`).join(", ");
    await sql.query(`UPDATE ${tabella} SET ${set} WHERE id = $${cambiate.length + 1}`, [
      ...cambiate.map((c) => perLaQuery(campi[c])),
      righe[0].id,
    ]);
  }
}
console.log(`\n${applica ? "" : "[PROVA] "}voci aggiornate: ${aggiornate} su ${voci.length}`);
if (create > 0) console.log(`schede nuove: ${create}`);
if (respinte > 0) console.log(`respinte dal controllo dei numeri: ${respinte}`);
