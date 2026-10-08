// Ricostruisce le sezioni della Guida degli Avventurieri alla Costa della Spada dalla lettura
// fatta con l'OCR di Windows (ocr_windows_pdf.py), che di ogni parola dà anche la posizione.
//
// Prima il libro era il testo di easyocr, pagina per pagina: le due colonne una dentro l'altra,
// le etichette delle cartine in mezzo alle frasi, e per titolo la parola con la maiuscola più
// frequente della pagina («Tamal», «Gyrt», «Potrebbe»). Qui invece:
// - l'ordine di lettura, i capoversi e i titoli vengono dalla geometria della pagina
//   (lib/ordine-di-lettura.ts), e ciò che sta sopra una cartina o un'illustrazione si scarta;
// - le sezioni sono quelle dell'indice del libro, con il loro titolo: i capitoli, le loro parti
//   e, dove il libro è un elenco di voci (le divinità, i luoghi), una sezione per voce;
// - i riquadri di approfondimento restano interi, dopo il capoverso in cui cadevano;
// - le tabelle, che dalla geometria non si ricostruiscono, si leggono dalla pagina e si
//   trascrivono in parsed/costa_spada-ritocchi.json (fuori dal repository, come ogni testo dei
//   manuali): a ogni zona indicata lì corrisponde il testo da mettere al suo posto, o niente.
//
// Scrive parsed/costa_spada-regole.json; nel database lo carica ricarica-regole.mjs.
//
// Uso: node sezioni-costa-spada.mjs [--mostra "<titolo>"] [--titoli] [--scarti] [--refusi]
import { writeFileSync } from "node:fs";
import { cuciPagine, ordineDiLettura, quotaMaiuscole, unisciRighe } from "../../lib/ordine-di-lettura.ts";
import { pulisciLetturaWindows } from "../../lib/lettura-windows.ts";
import { fraseDaMaiuscoletto, nomiConMaiuscola, titoloLeggibile } from "../../lib/titolo-leggibile.ts";
import { SEGNAPOSTO, apriLettura, apriPulizie } from "./lettura-windows.mjs";

const QUI = new URL("./", import.meta.url);
const lettura = apriLettura("costa_spada");
const dati = lettura.dati;

// Le pagine si contano da zero come nel PDF; il numero stampato è l'indice meno uno. Prima
// della 8 ci sono copertina, riconoscimenti, indice e cartina; dopo la 158 l'indice analitico.
const PRIMA_PAGINA = 8;
const ULTIMA_PAGINA = 158;
const numeroStampato = (indice) => indice - 1;

// L'indice del libro. `voci`: le parti che sono un elenco (una divinità, un luogo dopo l'altro),
// dove ogni titolo di voce apre una sezione sua.
const INDICE = [
  {
    capitolo: "Capitolo 1: Benvenuti nei Reami",
    capolettera: "N",
    sezioni: ["La Costa della Spada e il Nord", "Toril e le Sue Terre", "Il Tempo nei Reami", "Una Breve Storia", "La Magia nei Reami", "Le Religioni nei Reami", "Gli Dèi del Faerûn"],
    voci: ["Gli Dèi del Faerûn"],
  },
  {
    capitolo: "Capitolo 2: La Costa della Spada e il Nord",
    capolettera: "Q",
    sezioni: ["L'Alleanza dei Lord", "Rocche Naniche del Nord", "Regni delle Isole", "Reami Indipendenti", "L'Underdark"],
    voci: ["L'Alleanza dei Lord", "Rocche Naniche del Nord", "Regni delle Isole", "Reami Indipendenti"],
  },
  {
    capitolo: "Capitolo 3: Razze dei Reami",
    capolettera: "F",
    sezioni: ["Elfi", "Halfling", "Nani", "Umani", "Dragonidi", "Gnomi", "Mezzelfi", "Mezzorchi", "Tiefling"],
  },
  {
    capitolo: "Capitolo 4: Classi",
    capolettera: "T",
    sezioni: ["Barbari", "Bardi", "Chierici", "Druidi", "Guerrieri", "Ladri", "Maghi", "Monaci", "Paladini", "Ranger", "Stregoni", "Warlock", "Trucchetti per Maghi, Stregoni e Warlock"],
  },
  {
    capitolo: "Capitolo 5: Background",
    capolettera: "",
    sezioni: [
      "Agente della Fazione", "Artigiano di Clan", "Cacciatore di Taglie Urbano", "Cavaliere dell'Ordine", "Cortigiano", "Ereditiere",
      "Membro della Tribù Uthgardt", "Membro della Vigilanza Cittadina", "Nobile di Waterdeep", "Studioso Isolato", "Veterano Mercenario", "Viaggiatore Straniero",
    ],
  },
  {
    capitolo: "Appendice: Opzioni di Classe negli Altri Mondi",
    capolettera: "L",
    sezioni: ["Dragonlance", "Eberron", "Greyhawk", "Mondi Personalizzati"],
  },
];

// Le lettere che l'OCR di questo libro sbaglia nel maiuscoletto, oltre a quelle che
// correggiMaiuscoletto sistema da sola: la «G» letta «C», la «I» letta «r» o «l» accanto a una «V».
const TITOLI_LETTI_MALE = [
  [/\bD[RL]V[I1]NITÀ\b/gi, "DIVINITÀ"],
  [/\bUTHCARDT\b/g, "UTHGARDT"],
  [/\bDECLI\b/g, "DEGLI"],
  [/\bLINGUACCI\b/g, "LINGUAGGI"],
  [/\bTIEFLINC\b/g, "TIEFLING"],
  [/\bEl\b/g, "E I"],
  [/\bWIND STROM\b/g, "WINDSTROM"],
  [/\bGloco\b/g, "GIOCO"],
];

const chiave = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function titolo(maiuscolo) {
  let t = maiuscolo;
  for (const [cerca, metti] of TITOLI_LETTI_MALE) t = t.replace(cerca, metti);
  return titoloLeggibile(t);
}

const ripulisci = pulisciLetturaWindows;

// Segna, in testa a una riga, che è l'apertura in maiuscoletto del capoverso che segue.
const APERTURA = "\u0001";
const CHIUDE_FRASE = /[.!?:;…]["»”'’)\]]*$/;


const scartate = [];

/** Testatine, numeri di pagina e fregi ai bordi: non sono testo. */
function daScartare(riga, pagina) {
  if (SEGNAPOSTO.test(riga.testo)) return false;
  // La testatina sta in fondo. L'ultima riga di una colonna piena arriva quasi alla stessa
  // altezza: lì la testatina si riconosce da com'è scritta (maiuscoletto, o il solo numero).
  if (riga.y0 > pagina.altezza * 0.945) return true;
  if (riga.y0 > pagina.altezza * 0.93 && (quotaMaiuscole(riga.testo) >= 0.7 || !/\p{Ll}{3}/u.test(riga.testo))) return true;
  if (riga.y1 < pagina.altezza * 0.02) return true;
  if (riga.x1 < pagina.larghezza * 0.07 || riga.x0 > pagina.larghezza * 0.93) return true;
  // La didascalia sotto il simbolo di una divinità, anche spezzata su due righe («SIMBOLO» e
  // «DI JERGAL», con la D letta O): sta accanto al testo, e in mezzo alle sue righe lo spezzerebbe.
  if (quotaMaiuscole(riga.testo) >= 0.7 && /^(SIMBOL[O0]\b.*|[OD0][Il1] \p{Lu}[\p{Lu} ]+)$/u.test(riga.testo)) return true;
  return !/[\p{L}\p{N}]/u.test(riga.testo);
}

/** «Linguaggi: Due a scelta»: nelle schede dei background ogni etichetta apre una riga sua. */
const SCHEDA = /^(Competenze? (nell[ea']|negli|degli|nei)|Linguaggi|Equipaggiamento)\b[^.]{0,30}:/;
// Nei riquadri gli elenchi sono fatti allo stesso modo, una voce per riga: «Cormyr: pollice,
// falco, …», «Bedine: Midani».
const VOCE_DI_RIQUADRO = /^\p{Lu}[\p{L}' -]{1,24}: \S/u;
const apreCapoverso = (riga) => SCHEDA.test(riga.testo) || (riga.sfondo === "riquadro" && VOCE_DI_RIQUADRO.test(riga.testo));

/**
 * I blocchi di una pagina, tolto ciò che non è testo del libro: le didascalie dei simboli delle
 * divinità e i riquadri «finti» (due righe su una macchia della carta), che tornano testo normale.
 */
function blocchiDi(indice) {
  const pagina = lettura.pagina(indice);
  const blocchi = ordineDiLettura(pagina, { daScartare, apreCapoverso, altoComeTitolo: Infinity });
  const out = [];
  for (let i = 0; i < blocchi.length; ) {
    if (blocchi[i].sfondo !== "riquadro") {
      out.push(blocchi[i]);
      i++;
      continue;
    }
    let fine = i;
    while (fine < blocchi.length && blocchi[fine].sfondo === "riquadro") fine++;
    const gruppo = blocchi.slice(i, fine);
    const caratteri = gruppo.reduce((n, b) => n + b.testo.length, 0);
    if (caratteri >= 200) out.push(...gruppo);
    else out.push(...gruppo.map((b) => ({ ...b, sfondo: "carta" })));
    i = fine;
  }
  return out
    .map((b, i) => {
      if (b.tipo !== "titolo" || SEGNAPOSTO.test(b.testo) || b.sfondo === "riquadro") return b;
      // Più del doppio del titolo di un capitolo: è la scritta disegnata dentro una pianta.
      if (/^SIMBOL[O0]\b/.test(b.testo) || b.grandezza > 3) return null;
      // Una riga in maiuscoletto con il capoverso attaccato sotto, che prosegue in minuscolo: ne
      // è l'inizio (la prima riga dopo un titolo è scritta così), non un titolo.
      const dopo = out[i + 1];
      const attaccato = dopo?.tipo === "capoverso" && !dopo.staccato;
      if (b.grandezza >= 0.92) return b.grandezza < 1.05 && attaccato && /^\p{Ll}/u.test(dopo.testo) ? { ...b, tipo: "capoverso", testo: APERTURA + b.testo } : b;
      // Più piccola del testo: o è quell'inizio, o è una didascalia.
      return attaccato ? { ...b, tipo: "capoverso", testo: APERTURA + b.testo } : null;
    })
    .filter((b, i) => {
      if (b === null) scartate.push(`${indice}: ${out[i].testo}`);
      return b !== null;
    });
}

// --- dal libro alle sezioni -------------------------------------------------------------------

const pagine = [];
for (let indice = PRIMA_PAGINA; indice <= ULTIMA_PAGINA; indice++) {
  if (dati.pagine[indice]) pagine.push({ pagina: indice, blocchi: blocchiDi(indice) });
}
const pezzi = cuciPagine(pagine);
// I nomi propri del libro: servono a ridare la maiuscola a quelli scritti in maiuscoletto.
const prosaDelLibro = pezzi
  .filter((p) => p.tipo === "capoverso" && !p.testo.startsWith(APERTURA))
  .map((p) => p.testo)
  .join("\n");
// Solo le parole che nel libro non compaiono mai in minuscolo: «Mondo» sta in «Dorso del Mondo»,
// ma «mondo» è una parola comune.
const inMinuscolo = new Set(prosaDelLibro.match(/(?<!\p{L})\p{Ll}+/gu) ?? []);
const nomiDelLibro = new Set([...nomiConMaiuscola(prosaDelLibro)].filter((nome) => !inMinuscolo.has(nome.toLowerCase())));

const sezioni = [];
const avvisi = [];
let capitolo = -1;
let parte = null;
let corrente = null;
const trovate = new Set();
const titoliVisti = [];
const aperture = [];

function apri(nome, pagina) {
  corrente = { titolo: nome, pagina: numeroStampato(pagina), pezzi: [] };
  sezioni.push(corrente);
}

for (let i = 0; i < pezzi.length; i++) {
  const pezzo = pezzi[i];
  const ritocco = pezzo.testo.match(SEGNAPOSTO);
  const dopo = pezzi[i + 1];
  if (ritocco) {
    const tabella = lettura.zona(pezzo.pagina, Number(ritocco[1]));
    // Una tabella in cima alla colonna può cadere in mezzo a un capoverso: prima il capoverso
    // finisce (ciò che segue comincia in minuscolo), poi viene la tabella.
    // Le tabelle possono essere più d'una di fila (una pagina intera, poi mezza della seguente).
    let seguito = i + 1;
    while (pezzi[seguito] && SEGNAPOSTO.test(pezzi[seguito].testo)) seguito++;
    const prima = corrente?.pezzi.at(-1);
    const coda = pezzi[seguito];
    if (prima?.tipo === "capoverso" && !CHIUDE_FRASE.test(prima.testo) && coda?.tipo === "capoverso" && !coda.riquadro && /^\p{Ll}/u.test(coda.testo)) {
      prima.testo = unisciRighe(prima.testo, ripulisci(coda.testo));
      pezzi.splice(seguito, 1);
    }
    corrente?.pezzi.push({ tipo: "fisso", testo: tabella });
    continue;
  }

  if (pezzo.tipo !== "titolo") {
    // La prima riga dopo un titolo, in maiuscoletto: è l'inizio del capoverso che segue.
    if (pezzo.testo.startsWith(APERTURA)) {
      const apreIlCapitolo = corrente !== null && corrente.pezzi.length === 0 && corrente.titolo === INDICE[capitolo]?.capitolo;
      const inizio = fraseDaMaiuscoletto(pezzo.testo.slice(APERTURA.length), nomiDelLibro, apreIlCapitolo ? INDICE[capitolo].capolettera : "");
      aperture.push(inizio);
      if (dopo?.tipo === "capoverso") pezzi[i + 1] = { ...dopo, testo: `${inizio} ${dopo.testo}` };
      else corrente?.pezzi.push({ tipo: "capoverso", testo: inizio });
      continue;
    }
    if (!corrente) continue;
    corrente.pezzi.push({ tipo: pezzo.tipo, testo: ripulisci(pezzo.testo) });
    continue;
  }

  const nome = titolo(pezzo.testo);
  titoliVisti.push(`${pezzo.pagina} [${pezzo.grandezza}${pezzo.riquadro ? " R" : ""}] ${nome}`);
  const k = chiave(nome);
  if (!pezzo.riquadro && pezzo.grandezza >= 1.8 && /^(capitolo|appendice)\b/.test(k)) {
    capitolo++;
    parte = null;
    apri(INDICE[capitolo].capitolo, pezzo.pagina);
    continue;
  }
  const delCapitolo = INDICE[capitolo];
  const sezione = delCapitolo?.sezioni.find((s) => chiave(s) === k);
  if (!pezzo.riquadro && sezione && pezzo.grandezza >= 1.7 && !trovate.has(sezione)) {
    trovate.add(sezione);
    parte = sezione;
    apri(sezione, pezzo.pagina);
    continue;
  }
  if (!pezzo.riquadro && pezzo.grandezza >= 1.38 && delCapitolo?.voci?.includes(parte)) {
    apri(nome, pezzo.pagina);
    continue;
  }
  if (!corrente) continue;
  corrente.pezzi.push({ tipo: "titolo", testo: nome });
}

for (const c of INDICE) for (const s of c.sezioni) if (!trovate.has(s)) avvisi.push(`sezione dell'indice non trovata: ${s}`);

const conRefusi = (sezione, testo) => lettura.conRefusi(sezione, testo, avvisi);

const pulizie = await apriPulizie();
const conPulizie = pulizie.pulisci;
const riparazioni = pulizie.riparazioni;

const fuori = sezioni
  .filter((s) => s.pezzi.some((p) => p.tipo !== "titolo"))
  .map((s, ordine) => ({
    titolo: s.titolo,
    // Le pulizie anche dopo le correzioni a mano: ciò che si carica deve essere già fermo.
    testo: conPulizie(conRefusi(s.titolo, conPulizie(s.pezzi.map((p) => p.testo).join("\n\n")))),
    pagina: s.pagina,
    fonte: "costa_spada",
    ordine,
  }));

avvisi.push(...lettura.ritocchiInutili());

// Un capoverso di prosa (ha almeno una frase finita) che non chiude l'ultima è quasi sempre un
// pezzo di pagina rimasto fuori posto, o un'etichetta di cartina finita in coda al testo. Gli
// elenchi di nomi e le righe delle schede («Linguaggi: Due a scelta») non hanno punti e non contano.
for (const s of fuori) {
  for (const capoverso of s.testo.split("\n\n")) {
    const daSaltare = /^([—–]|Tabella\b|- )/.test(capoverso);
    if (!daSaltare && /[.!?] \p{Lu}/u.test(capoverso) && !CHIUDE_FRASE.test(capoverso)) {
      avvisi.push(`capoverso sospeso in «${s.titolo}» (p. ${s.pagina}): …${capoverso.slice(-60)}`);
    }
  }
}

const argomento = (nome) => (process.argv.includes(nome) ? (process.argv[process.argv.indexOf(nome) + 1] ?? "") : null);
const daMostrare = argomento("--mostra");
if (daMostrare !== null) {
  for (const s of fuori.filter((x) => chiave(x.titolo).includes(chiave(daMostrare)))) console.log(`===== ${s.titolo} (p. ${s.pagina})\n${s.testo}\n`);
} else if (process.argv.includes("--titoli")) {
  console.log(titoliVisti.join("\n"));
} else if (process.argv.includes("--scarti")) {
  console.log(scartate.join("\n"));
  console.log(`\n--- righe in maiuscoletto rese come inizio di capoverso\n${aperture.join("\n")}`);
} else if (process.argv.includes("--refusi")) {
  for (const [r, volte] of [...riparazioni].sort((a, b) => b[1] - a[1])) console.log(`${String(volte).padStart(4)} ${r}`);
} else {
  writeFileSync(new URL("parsed/costa_spada-regole.json", QUI), JSON.stringify(fuori, null, 2), "utf-8");
  for (const s of fuori) console.log(`${String(s.pagina).padStart(3)}  ${s.titolo}  (${s.testo.length})`);
  console.log(`\n${fuori.length} sezioni, ${fuori.reduce((n, s) => n + s.testo.length, 0)} caratteri -> parsed/costa_spada-regole.json`);
  console.log(`${scartate.length} didascalie scartate (--scarti per vederle), ${avvisi.length} avvisi`);
  for (const a of avvisi) console.log(`! ${a}`);
}
