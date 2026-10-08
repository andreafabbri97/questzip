// Rimette a posto i campi NUMERICI delle schede dei mostri prendendoli da 5etools.
//
// Il Manuale dei Mostri italiano è una scansione: nello stat block i valori stanno in colonne
// strettissime e l'OCR li storpia ("187 (lSdlO + 105)" per "187 (15d10 + 105)"), li perde (135
// schede senza PE) o li fa colare nel campo accanto ("avvelenato SAC 7 (-2)" fra le immunità,
// perché la colonna delle caratteristiche è finita lì dentro). In 50 schede le caratteristiche
// erano proprio sbagliate: la Banshee aveva Forza 16 invece di 1.
//
// Sono tutti numeri, identici in ogni lingua: non si "correggono" indovinando la cifra giusta, si
// RIPRENDONO dall'originale. Dal manuale italiano resta solo ciò che è testo (il tipo di armatura
// fra parentesi, l'ordine in cui il manuale elenca tiri salvezza e abilità, i linguaggi).
//
// La condizione per toccare una scheda è che l'abbinamento italiano->inglese sia PROVATO dai
// numeri che si leggono ancora: i punti ferita devono coincidere, e con loro la classe armatura o
// il grado di sfida. Una scheda agganciata al mostro sbagliato (o a un'altra edizione) non supera
// la prova, resta com'è e finisce nell'elenco da guardare a mano.
//
// Uso: node --env-file=../../.env.local ripara-numeri-mostri.mjs [--applica] [--elenco]
import { neon } from "@neondatabase/serverless";
import { risolviCopie } from "../../lib/fivetools/risolvi-copia.ts";

const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const elenco = process.argv.includes("--elenco");
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

// Il manuale italiano da cui viene la riga e l'edizione inglese a cui deve essere agganciata. Una
// riga del Manuale dei Mostri 2014 legata alla ristampa 2024 può avere gli stessi punti ferita e
// caratteristiche diverse: lì i numeri di 5etools non sono quelli della pagina italiana.
const FONTE_ATTESA = {
  mm: "MM",
  multiverso: "MPMM",
  bigby: "BGG",
  fizban: "FTD",
  dragonlance: "DSotDQ",
  ravenloft: "VRGR",
};

// Schede in cui la prova dei numeri non si può fare perché i numeri sono proprio ciò che manca
// (classe armatura e punti ferita vuoti) o perché il parser ha fuso due schede della stessa
// pagina. L'abbinamento è stato verificato a mano, una per una.
const VERIFICATE_A_MANO = new Set([
  "EMPIREO|mm",
  "SCRUTATORE|multiverso",
  "SCIAME DI RATTI CRANICI|multiverso",
]);

const CARATTERISTICHE = [
  ["str", "FOR", "For"],
  ["dex", "DES", "Des"],
  ["con", "COS", "Cos"],
  ["int", "INT", "Int"],
  ["wis", "SAG", "Sag"],
  ["cha", "CAR", "Car"],
];

const ABILITA = {
  acrobatics: "Acrobazia",
  "animal handling": "Addestrare Animali",
  arcana: "Arcano",
  athletics: "Atletica",
  deception: "Inganno",
  history: "Storia",
  insight: "Intuizione",
  intimidation: "Intimidire",
  investigation: "Indagare",
  medicine: "Medicina",
  nature: "Natura",
  perception: "Percezione",
  performance: "Intrattenere",
  persuasion: "Persuasione",
  religion: "Religione",
  "sleight of hand": "Rapidità di Mano",
  stealth: "Furtività",
  survival: "Sopravvivenza",
};

const PE_PER_SFIDA = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100, "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
  "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900, "11": 7200, "12": 8400, "13": 10000,
  "14": 11500, "15": 13000, "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000, "26": 90000, "27": 105000,
  "28": 120000, "29": 135000, "30": 155000,
};

/** Le lettere che l'OCR mette al posto delle cifre, dentro un valore che è solo numerico. */
const cifre = (s) =>
  s.replace(/[lI]/g, "1").replace(/S/g, "5").replace(/[Oo]/g, "0").replace(/\s+/g, "");

function numeroIniziale(testo) {
  const testa = String(testo ?? "").split(/[({,]/)[0];
  const m = cifre(testa).match(/^\d+/);
  return m ? Number(m[0]) : null;
}

const migliaia = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// La colonna delle caratteristiche colata in un campo di testo: "CAR 6 (-2)", "SAC 14 (+2)",
// "I NT 3 (-4)", "CAR 7 (-2}". SAC è SAG letto male.
const COLATA = /\s*\b(?:FOR|DES|COS|I ?NT|SAG|SAC|CAR)\s+[\dlISOo][\dlISOo ]*\s*[({][^(){}]{0,8}[)}]?/g;

// Le etichette dei campi successivi dello stat block, rimaste attaccate al campo precedente:
// "Furtività +5, Percezione +12 Resistenze ai Danni necrotico".
const ETICHETTE = [
  ["Vulnerabilità ai Danni", "vulnerabilita_danni"],
  ["Resistenze ai Danni", "resistenza_danni"],
  ["Immunità ai Danni", "immunita_danni"],
  ["Immunità alle Condizioni", "immunita_condizioni"],
];

const CAMPI_TESTO = [
  "tiri_salvezza", "abilita", "vulnerabilita_danni", "resistenza_danni", "immunita_danni",
  "immunita_condizioni", "sensi", "linguaggi",
];

/** Separa dal valore le etichette dei campi successivi rimaste attaccate in coda. */
function staccaEtichette(valore) {
  let resto = valore;
  const staccati = {};
  for (;;) {
    let primo = null;
    for (const [etichetta, campo] of ETICHETTE) {
      const i = resto.indexOf(etichetta);
      if (i !== -1 && (primo === null || i < primo.i)) primo = { i, etichetta, campo };
    }
    if (!primo) break;
    const coda = resto.slice(primo.i + primo.etichetta.length);
    resto = resto.slice(0, primo.i);
    // La coda può contenere a sua volta un'altra etichetta: si rientra nel ciclo su quella.
    const interno = staccaEtichette(coda.trim());
    staccati[primo.campo] = interno.resto;
    Object.assign(staccati, interno.staccati);
  }
  return { resto: resto.trim(), staccati };
}

// "I nfernale", "I nganno": la I maiuscola staccata dal resto della parola. Elenco chiuso, perché
// "I nani" e "I nemici" sono italiano corretto e una regola generale li incollerebbe.
const I_STACCATA = /\bI (n(?:fernale|ganno|tuizione|dagare|timidire|trattenere|debolimento|visibil[ei]))/g;

const pulisciTesto = (v) =>
  v
    .replace(COLATA, "")
    .replace(I_STACCATA, "I$1")
    .replace(/[\s\\@~|<>=_]+$/, "")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

/** "30 ft." -> "9 m", coi decimali all'italiana: i multipli di 5 piedi sono multipli di 1,5 m. */
const inMetri = (piedi) => String((piedi * 3) / 10).replace(".", ",");

function velocitaAttese(speed) {
  const attese = new Set();
  const visita = (v) => {
    if (typeof v === "number") attese.add(inMetri(v));
    else if (v && typeof v === "object") for (const x of Object.values(v)) visita(x);
  };
  visita(speed);
  return attese;
}

/** Corregge le cifre lette come lettere nei valori in metri, se il risultato torna con 5etools. */
function riparaVelocita(valore, speed) {
  const attese = velocitaAttese(speed);
  if (attese.size === 0) return valore;
  const riparata = valore.replace(
    /(^|[\s,(])([\dlISOo][\dlISOo ]*(?:,\s?[\dS])?)\s?m\b/g,
    (_m, prima, numero) => `${prima}${cifre(numero)} m`,
  );
  const numeri = [...riparata.matchAll(/(\d+(?:,\d)?) m\b/g)].map((m) => m[1]);
  return numeri.length > 0 && numeri.every((n) => attese.has(n)) ? riparata : valore;
}

/** Ricostruisce "Des +5, Cos +7" tenendo l'ordine del manuale italiano quando lo si legge ancora. */
function ricostruisciElenco(valoreItaliano, attesi) {
  // attesi: Map nome italiano -> bonus ("+5")
  const ordine = [];
  for (const nome of attesi.keys()) {
    const i = valoreItaliano.toLowerCase().indexOf(nome.toLowerCase());
    ordine.push([nome, i]);
  }
  const tuttiTrovati = ordine.every(([, i]) => i !== -1);
  const nomi = tuttiTrovati
    ? ordine.sort((a, b) => a[1] - b[1]).map(([n]) => n)
    : [...attesi.keys()];
  return nomi.map((n) => `${n} ${attesi.get(n)}`).join(", ");
}

const index = await (await fetch(`${B}/bestiary/index.json`)).json();
const files = await Promise.all(
  [...new Set(Object.values(index))].map((f) =>
    fetch(`${B}/bestiary/${f}`).then((r) => r.json()).catch(() => ({})),
  ),
);
const template = await fetch(`${B}/bestiary/template.json`).then((r) => r.json()).catch(() => ({}));
const creature = risolviCopie(files.flatMap((f) => f.monster ?? []), template.monsterTemplate ?? []);
const perChiave = new Map(creature.map((m) => [`${m.name}|${m.source}`, m]));

const righe = await sql`SELECT * FROM compendio_ita_mostro ORDER BY nome`;

const esito = { riparate: 0, intatte: 0, campi: {}, daGuardare: [] };
const esempi = {};
const conta = (campo, prima, dopo, nome) => {
  esito.campi[campo] = (esito.campi[campo] ?? 0) + 1;
  (esempi[campo] ??= []).length < 3 && esempi[campo].push(`${nome}: ${JSON.stringify(prima)} -> ${JSON.stringify(dopo)}`);
};

for (const r of righe) {
  const patch = {};
  const imposta = (campo, valore) => {
    const attuale = patch[campo] ?? r[campo];
    const uguale =
      typeof valore === "object" ? JSON.stringify(valore) === JSON.stringify(attuale) : valore === (attuale ?? "");
    if (!uguale) patch[campo] = valore;
  };

  // 1) Quello che non dipende dall'abbinamento: la colonna colata e le etichette attaccate.
  for (const campo of CAMPI_TESTO) {
    const valore = patch[campo] ?? r[campo];
    if (typeof valore !== "string" || !valore) continue;
    const { resto, staccati } = staccaEtichette(valore);
    imposta(campo, pulisciTesto(resto));
    for (const [altro, testo] of Object.entries(staccati)) {
      // Si recupera solo se il campo giusto è vuoto: se ha già il suo testo, quello vale di più.
      if (!(patch[altro] ?? r[altro])) imposta(altro, pulisciTesto(testo));
    }
  }

  // 2) I numeri, solo dove l'abbinamento è provato.
  const eng = r.nome_inglese ? perChiave.get(`${r.nome_inglese}|${r.fonte_inglese}`) : null;
  const pfEng = typeof eng?.hp === "object" ? eng.hp.average : null;
  const formula = typeof eng?.hp === "object" ? eng.hp.formula : null;
  const primaCa = eng?.ac?.[0];
  const caEng = typeof primaCa === "object" ? primaCa?.ac : primaCa;
  const gsEng = eng?.cr == null ? null : String(typeof eng.cr === "object" ? eng.cr.cr : eng.cr);

  const pfIta = numeroIniziale(r.punti_ferita);
  const caIta = numeroIniziale(r.classe_armatura);
  const gsIta = (r.sfida ?? "").trim().split(" ")[0] || null;

  const conferma = (ita, en) => ita != null && en != null && String(ita) === String(en);
  const pfOk = conferma(pfIta, pfEng);
  const caOk = conferma(caIta, caEng);
  const gsOk = conferma(gsIta, gsEng);
  const provato =
    eng != null &&
    FONTE_ATTESA[r.fonte] === r.fonte_inglese &&
    ((pfOk && (caOk || gsOk)) ||
      (pfIta == null && pfEng != null && caOk && gsOk) ||
      VERIFICATE_A_MANO.has(`${r.nome}|${r.fonte}`));

  if (provato) {
    if (pfEng != null) imposta("punti_ferita", formula ? `${pfEng} (${formula})` : String(pfEng));
    if (caEng != null) {
      const resto = String(r.classe_armatura ?? "")
        .replace(/^[\dlISOo ]+/, "")
        .replace(/\{/g, "(")
        .replace(/\}/g, ")")
        .trim();
      imposta("classe_armatura", resto ? `${caEng} ${resto}` : String(caEng));
    }
    if (gsEng != null && PE_PER_SFIDA[gsEng] != null) {
      imposta("sfida", gsEng);
      imposta("pe", migliaia(PE_PER_SFIDA[gsEng]));
    }
    if (CARATTERISTICHE.every(([en]) => typeof eng[en] === "number")) {
      const car = {};
      for (const [en, sigla] of CARATTERISTICHE) {
        const mod = Math.floor((eng[en] - 10) / 2);
        car[sigla] = { mod: `${mod >= 0 ? "+" : ""}${mod}`, score: eng[en] };
      }
      // Stesso ordine di chiavi della riga esistente, o il confronto le vedrebbe sempre diverse.
      const ordinata = Object.fromEntries(Object.keys(r.caratteristiche ?? car).map((k) => [k, car[k]]));
      imposta("caratteristiche", ordinata);
    }
    if (eng.save && Object.values(eng.save).every((v) => typeof v === "string")) {
      const attesi = new Map(
        CARATTERISTICHE.filter(([en]) => eng.save[en]).map(([en, , nome]) => [nome, eng.save[en]]),
      );
      imposta("tiri_salvezza", ricostruisciElenco(patch.tiri_salvezza ?? r.tiri_salvezza ?? "", attesi));
    }
    if (eng.skill && Object.entries(eng.skill).every(([k, v]) => ABILITA[k] && typeof v === "string")) {
      const attesi = new Map(
        Object.entries(eng.skill)
          .map(([k, v]) => [ABILITA[k], v])
          .sort((a, b) => a[0].localeCompare(b[0], "it")),
      );
      imposta("abilita", ricostruisciElenco(patch.abilita ?? r.abilita ?? "", attesi));
    }
    if (r.velocita && eng.speed) imposta("velocita", riparaVelocita(r.velocita, eng.speed));
  } else if (r.nome_inglese) {
    esito.daGuardare.push(
      `${r.nome} [${r.fonte}] -> ${r.nome_inglese} (${r.fonte_inglese}): PF ${JSON.stringify(r.punti_ferita)} vs ${pfEng}, CA ${JSON.stringify(r.classe_armatura)} vs ${caEng}, GS ${JSON.stringify(r.sfida)} vs ${gsEng}`,
    );
  }

  const chiavi = Object.keys(patch);
  if (chiavi.length === 0) {
    esito.intatte++;
    continue;
  }
  esito.riparate++;
  for (const c of chiavi) conta(c, r[c], patch[c], r.nome);
  if (applica) {
    const set = chiavi.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await sql.query(`UPDATE compendio_ita_mostro SET ${set} WHERE id = $${chiavi.length + 1}`, [
      ...chiavi.map((c) => (typeof patch[c] === "object" ? JSON.stringify(patch[c]) : patch[c])),
      r.id,
    ]);
  }
}

console.log(`${applica ? "" : "[PROVA] "}schede riparate: ${esito.riparate} — già a posto: ${esito.intatte}`);
for (const [campo, n] of Object.entries(esito.campi).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${campo.padEnd(22)} ${n}`);
  for (const e of esempi[campo]) console.log(`      ${e}`);
}
console.log(`\nabbinamento non provato, lasciate com'erano: ${esito.daGuardare.length}`);
if (elenco || esito.daGuardare.length <= 25) for (const d of esito.daGuardare) console.log(`  - ${d}`);
