// Recupera le schede di mostro che parse-mostri.mjs scarta perché il NOME non c'è.
//
// In una quarantina di schede del Manuale dei Mostri l'estrazione perde la riga del titolo o la
// storpia ("DEMONP" per Demone d'Ombra), e senza nome la scheda viene buttata anche se il blocco
// delle statistiche è lì, intero. Ma quel blocco è un'impronta: classe armatura, punti ferita,
// grado di sfida e le sei caratteristiche sono NUMERI, identici in ogni lingua, e messi insieme
// bastano quasi sempre a riconoscere una sola creatura in tutto il manuale inglese.
//
// Lo script quindi non indovina: prende l'impronta di ogni scheda orfana, la cerca nel bestiario
// inglese e accetta l'abbinamento SOLO quando il candidato è uno. Dove i candidati sono zero o
// più d'uno lo dichiara e passa oltre, perché è lì che un abbinamento sbagliato entrerebbe senza
// che nessuno se ne accorga.
//
// Non scrive niente: stampa cosa si può recuperare e con quale nome inglese, così l'inserimento
// vero si fa con aggiungi-mostri-da-manuali.mjs a mappa aggiornata.
//
// Uso: node recupera-mostri-per-impronta.mjs [chiave_libro]
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const libro = process.argv[2] ?? "mm";
const FONTI = { mm: "MM", multiverso: "MPMM", fizban: "FTD", bigby: "BGG", dragonlance: "DSotDQ", ravenloft: "VRGR" };
const FILE_BESTIARIO = {
  mm: "bestiary-mm.json",
  multiverso: "bestiary-mpmm.json",
  fizban: "bestiary-ftd.json",
  bigby: "bestiary-bgg.json",
  dragonlance: "bestiary-dsotdq.json",
  ravenloft: "bestiary-vrgr.json",
};

const CHALLENGE_RE = /^Sfida\s+([\d\s/]+|-)\s*(?:\(\s*([\d.,]+)\s*PE\))?/i;
const CA_RE = /^Classe\s+Armatura\s+(\d+)/i;
const PF_RE = /^Punti\s+Ferita\s+(\d+)\s*\(([^)]*)\)/i;

// L'OCR scambia le cifre con le lettere che somigliano: "lS" per 15, "2O" per 20, "S" per 5.
const numero = (grezzo) => {
  const pulito = grezzo
    .replace(/[lI]/g, "1")
    .replace(/[OoQ]/g, "0")
    .replace(/[Ss]/g, "5")
    .replace(/[^\d]/g, "");
  return pulito ? Number(pulito) : null;
};

/** Le sei caratteristiche, che nel PDF escono come righe alterne "FOR" / "20 (+5)". */
function caratteristicheVicine(righe, da, a) {
  const valori = [];
  for (let i = da; i < a; i++) {
    if (!/^(FOR|DES|COS|INT|SAG|CAR|cos|SAC|SACi|DE5)/i.test(righe[i])) continue;
    const m = righe[i + 1]?.match(/^\s*([\dlIOoSs]{1,2})\s*[({]/);
    if (m) valori.push(numero(m[1]));
  }
  return valori;
}

const raw = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "extracted", `${libro}.json`), "utf-8"));
const righe = [];
const paginaDi = [];
for (const pagina of raw.pages) {
  for (const linea of (pagina.text ?? "").split("\n")) {
    const t = linea.trim();
    if (!t) continue;
    righe.push(t);
    paginaDi.push(pagina.page);
  }
}

/**
 * Il nome italiano da proporre: il titolo in maiuscolo più vicino sopra la scheda.
 *
 * Non è una certezza come l'impronta numerica — fra il titolo e il blocco delle statistiche il
 * manuale mette la prosa, e le colonne che l'estrazione mescola possono allontanarli parecchio —
 * quindi si riporta insieme alla pagina, e la mappa si compila guardando.
 */
function titoloVicino(inizio) {
  for (let i = inizio; i >= 0 && i > inizio - 400; i--) {
    const riga = righe[i];
    const lettere = riga.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (lettere.length < 3 || lettere.length > 40) continue;
    if (lettere !== lettere.toUpperCase()) continue;
    if (/^(CLASSE|PUNTI|VELOCIT|SENSI|LINGUAGGI|SFIDA|AZIONI|REAZIONI|TRATTI|FOR|DES|COS|INT|SAG|CAR|CAPITOLO|APPENDICE)/i.test(riga)) continue;
    return { titolo: riga.replace(/\s+/g, " "), riga: i };
  }
  return null;
}

/**
 * Nome italiano di ogni scheda, dall'"Indice delle schede delle statistiche" in fondo al manuale.
 *
 * È la fonte giusta per il nome, molto più del titolo che sta vicino alla scheda: quello, con le
 * colonne che l'estrazione mescola, può essere il titolo della scheda accanto (per il Glabrezu
 * proponeva "SAC"). L'indice invece dice nome e PAGINA, e la pagina noi la sappiamo.
 *
 * Le pagine dell'indice sono quelle STAMPATE, il PDF ne ha una in meno per la copertina: l'offset
 * si verifica su un caso noto (il Glabrezu è a pagina 58 dell'indice e a pagina 57 del PDF).
 */
const OFFSET_PAGINA = 1;
// L'indice delle schede sta in fondo al libro, e va dichiarato: cercare "la pagina con più righe
// nella forma Nome, numero" sembrava più furbo ma pesca l'INDICE GENERALE a inizio volume, che ha
// la stessa forma e rimanda ai capitoli invece che alle schede. Dichiarato solo per il Manuale dei
// Mostri: negli altri manuali l'indice o non c'è o i suoi numeri di pagina non corrispondono alle
// schede — in Mostri del Multiverso dava "Abishai verde" per l'Abishai ROSSO, e un nome sbagliato
// è peggio di nessun nome.
const PAGINA_INDICE = { mm: 350 };

const nomiPerPagina = new Map();
for (const pagina of raw.pages) {
  if (!PAGINA_INDICE[libro] || pagina.page < PAGINA_INDICE[libro]) continue;
  for (const linea of (pagina.text ?? "").split("\n")) {
    const m = linea.trim().match(/^(.{3,44}?),\s*([0-9OoIl]{1,3})$/);
    if (!m) continue;
    const numeroPagina = Number(m[2].replace(/[Oo]/g, "0").replace(/[Il]/g, "1"));
    if (!nomiPerPagina.has(numeroPagina)) nomiPerPagina.set(numeroPagina, []);
    nomiPerPagina.get(numeroPagina).push(m[1].trim());
  }
}

/**
 * Quando su una pagina ci sono più schede, il nome inglese scioglie l'ambiguità: "Glabrezu" e
 * "Dretch" stanno entrambi a pagina 58, ma ognuno somiglia solo al proprio. Si confrontano i
 * bigrammi (misura di Dice), che regge bene i refusi dell'estrazione — "Chasme" contro "Chnsme" —
 * e la scelta si accetta solo se il primo stacca nettamente il secondo, altrimenti resta da
 * decidere a mano.
 */
const senzaAccenti = (t) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");

function somiglianza(a, b) {
  const bigrammi = (t) => new Set(Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2)));
  const x = bigrammi(senzaAccenti(a));
  const y = bigrammi(senzaAccenti(b));
  if (x.size === 0 || y.size === 0) return 0;
  const comuni = [...x].filter((g) => y.has(g)).length;
  return (2 * comuni) / (x.size + y.size);
}

function scegliNome(candidati, nomeInglese) {
  if (candidati.length === 0) return null;
  if (candidati.length === 1) return { nome: candidati[0], sicuro: true };
  const ordinati = candidati
    .map((c) => ({ nome: c, punteggio: somiglianza(c, nomeInglese) }))
    .sort((a, b) => b.punteggio - a.punteggio);
  const [primo, secondo] = ordinati;
  const sicuro = primo.punteggio >= 0.4 && primo.punteggio - (secondo?.punteggio ?? 0) >= 0.2;
  return { nome: primo.nome, sicuro, punteggio: primo.punteggio };
}

const inglesi = await fetch(
  `https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/bestiary/${FILE_BESTIARIO[libro]}`,
).then((r) => r.json());

const gradoInglese = (cr) => (typeof cr === "object" ? cr?.cr : cr) ?? null;

/**
 * L'impronta come CHIAVE, per ritrovare la stessa scheda dal parser.
 *
 * Classe armatura, punti ferita e grado di sfida bastano a distinguere le schede fra loro e non
 * dipendono da come l'estrazione ha reso il titolo — che è appunto il pezzo mancante. Del grado si
 * tengono solo le cifre, perché intorno l'OCR lascia di tutto ("Sfida 9 (S.000 PE}").
 */
const impronta = (ca, pf, sfida) => `${ca}|${pf}|${sfida.match(/^Sfida\s+([\d/]+)/i)?.[1] ?? "?"}`;

/** Ogni scheda italiana orfana: il blocco statistiche che sta sopra un'ancora "Sfida". */
const orfane = [];
const improntePerLibro = new Map();
for (let i = 0; i < righe.length; i++) {
  if (!CHALLENGE_RE.test(righe[i])) continue;
  // si risale fino alla riga "Classe Armatura" che apre questo blocco
  let inizio = -1;
  for (let j = i - 1; j >= 0 && j > i - 60; j--) {
    if (CHALLENGE_RE.test(righe[j])) break;
    if (CA_RE.test(righe[j])) { inizio = j; break; }
  }
  if (inizio === -1) continue;

  // Ogni scheda del libro entra nel conteggio delle impronte, non solo quelle senza nome: la
  // collisione che conta è con le schede NORMALI (il Basilisco letto correttamente e un'orfana con
  // gli stessi numeri), non fra orfane. Un'impronta usata da più di una scheda non identifica
  // nessuno e va lasciata stare.
  const caTutte = numero(righe[inizio].match(CA_RE)[1]);
  const pfTutte = numero(righe[inizio + 1]?.match(PF_RE)?.[1] ?? "");
  if (caTutte != null && pfTutte != null) {
    const k = impronta(caTutte, pfTutte, righe[i]);
    improntePerLibro.set(k, (improntePerLibro.get(k) ?? 0) + 1);
  }

  // il nome sta due righe sopra "Classe Armatura" (nome, tipo/allineamento, CA): se lì non c'è
  // una riga di tipo/allineamento la scheda è una di quelle che il parser perde
  const tipo = righe[inizio - 1] ?? "";
  const nome = righe[inizio - 2] ?? "";
  const haTipo = /(immondo|celestiale|drago|umanoide|bestia|costrutto|elementale|folletto|gigante|melma|mostruosit|non morto|vegetale|aberrazione)/i.test(tipo);
  const nomePlausibile = /^[A-ZÀ-Ù][A-ZÀ-Ù'\s,-]{2,40}$/.test(nome);
  if (haTipo && nomePlausibile) continue;

  orfane.push({
    riga: i,
    pagina: paginaDi[inizio],
    titolo: titoloVicino(inizio - 1),
    nomeGrezzo: nome,
    tipo,
    ca: numero(righe[inizio].match(CA_RE)[1]),
    pf: numero(righe[inizio + 1]?.match(PF_RE)?.[1] ?? ""),
    formulaPf: righe[inizio + 1]?.match(PF_RE)?.[2] ?? "",
    sfida: righe[i].replace(/\s+/g, " "),
    caratteristiche: caratteristicheVicine(righe, inizio, i),
  });
}

console.log(`${orfane.length} schede senza un nome utilizzabile\n`);

let certe = 0;
const proposte = [];
const abbinati = [];
const daDecidere = [];
for (const scheda of orfane) {
  if (scheda.ca == null || scheda.pf == null) continue;
  const candidati = inglesi.monster.filter((m) => {
    const ca = Array.isArray(m.ac) ? (typeof m.ac[0] === "object" ? m.ac[0].ac : m.ac[0]) : m.ac;
    const pf = m.hp?.average;
    if (ca !== scheda.ca || pf !== scheda.pf) return false;
    // le caratteristiche, quando l'estrazione le ha rese leggibili, stringono ulteriormente
    const punteggi = [m.str, m.dex, m.con, m.int, m.wis, m.cha];
    return scheda.caratteristiche.every((v) => v == null || punteggi.includes(v));
  });

  if (candidati.length === 1) {
    certe++;
    proposte.push({ ...scheda, en: candidati[0].name, cr: gradoInglese(candidati[0].cr) });
  } else {
    proposte.push({ ...scheda, en: null, quanti: candidati.length });
  }
}

for (const p of proposte) {
  const descrizioneImpronta = `CA ${p.ca}, PF ${p.pf}, ${p.sfida}`;
  if (p.en) {
    const candidati = nomiPerPagina.get(p.pagina + OFFSET_PAGINA) ?? [];
    const scelta = scegliNome(candidati, p.en);
    if (scelta?.sicuro) {
      abbinati.push({ it: scelta.nome, en: p.en, impronta: impronta(p.ca, p.pf, p.sfida) });
    }
    else daDecidere.push({ en: p.en, pagina: p.pagina + OFFSET_PAGINA, candidati });
    const proposto = scelta
      ? `${scelta.sicuro ? "" : "? "}"${scelta.nome}"${candidati.length > 1 ? ` (fra ${candidati.length})` : ""}`
      : "(non nell'indice)";
    console.log(`  ✓ p.${p.pagina + OFFSET_PAGINA} ${p.en} (grado ${p.cr}) — italiano: ${proposto} — ${descrizioneImpronta}`);
  } else {
    console.log(`  · riga ${p.riga}: ${p.quanti} candidati — ${impronta} — nome letto: ${JSON.stringify(p.nomeGrezzo)}`);
  }
}
console.log(`\nriconosciute con certezza: ${certe} su ${orfane.length} (fonte ${FONTI[libro]})`);
console.log(`con nome italiano dall'indice: ${abbinati.length} | da decidere a mano: ${daDecidere.length}`);
if (daDecidere.length > 0) {
  console.log("\nda decidere (il nome inglese è certo, l'italiano no):");
  for (const d of daDecidere) console.log(`  - ${d.en} (p.${d.pagina}) fra ${JSON.stringify(d.candidati)}`);
}

// La proposta si scrive in parsed/ (gitignored) e non nella mappa vera: quella si aggiorna dopo
// averla guardata, perché è la mappa a decidere che cosa entra nel Compendio.
const uscita = path.join(SCRIPT_DIR, "parsed", `${libro}-mostri-per-impronta.json`);
writeFileSync(uscita, JSON.stringify(abbinati, null, 2), "utf-8");

// Se i nomi sono già stati rivisti a mano, si produce anche il file che serve al PARSER: impronta
// -> nome italiano stampato. È quello che permette a parse-mostri.mjs di dare un nome a una scheda
// il cui titolo l'estrazione ha perso, invece di buttarla.
try {
  const rivisti = JSON.parse(readFileSync(path.join(SCRIPT_DIR, `nomi-mostri-rivisti-${libro}.json`), "utf-8"));
  // Un'impronta condivisa da più schede non identifica nessuno: quattro creature del manuale
  // hanno tutte classe armatura 12, 22 punti ferita e grado 1/2. Quelle si lasciano stare — è
  // meglio perdere un nome che darne uno sbagliato a una scheda.
  const quante = improntePerLibro;

  const perImpronta = {};
  const senzaNome = [];
  const ambigue = [];
  for (const a of abbinati) {
    if (quante.get(a.impronta) > 1) ambigue.push(`${a.it} (${a.impronta})`);
    else if (rivisti[a.en]) perImpronta[a.impronta] = rivisti[a.en];
    else senzaNome.push(a.en);
  }
  if (ambigue.length > 0) console.log(`  impronte ambigue, lasciate stare: ${ambigue.join(", ")}`);
  const fileParser = path.join(SCRIPT_DIR, `nomi-per-impronta-${libro}.json`);
  writeFileSync(fileParser, JSON.stringify(perImpronta, null, 2) + "\n", "utf-8");
  console.log(`${Object.keys(perImpronta).length} impronte con nome rivisto -> ${fileParser}`);
  if (senzaNome.length > 0) console.log(`  ancora da rivedere: ${senzaNome.join(", ")}`);
} catch {
  console.log(`(nessun nomi-mostri-rivisti-${libro}.json: i nomi vanno ancora rivisti a mano)`);
}
console.log(`\nproposta scritta in ${uscita}`);
