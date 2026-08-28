// Estrae le schede dei mostri dal testo grezzo di un manuale (vedi extract_pdf.py).
// A differenza degli incantesimi, questo libro ha rumore OCR anche nei NUMERI (dadi, CA, PF),
// non solo nei nomi — per questo ogni voce numerica viene annotata con un flag "sospetta" da
// incrociare in un secondo momento con i dati inglesi già presenti in 5etools, invece di
// fidarsi ciecamente del testo estratto.
//
// Uso: node parse-mostri.mjs <chiave_libro>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizzaGradoSfida } from "../../lib/compendio-ocr.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

// la taglia concorda in genere col nome del tipo di mostro ("Drago Medio" ma "Aberrazione
// Media"), quindi serve la forma sia maschile che femminile
const SIZES = [
  "Minuscolo", "Minuscola",
  "Piccolo", "Piccola",
  "Medio", "Media",
  "Grande",
  "Enorme",
  "Mastodontico", "Mastodontica",
];
const SIZE_TYPE_RE = new RegExp(
  `^([A-Za-zÀ-ÿ/][A-Za-zÀ-ÿ\\s/'\\-]*?)\\s+(${SIZES.join("|")})\\s*(\\([^)]*\\))?,\\s*(.+)$`,
);
// variante usata in alcuni libri: "Umanoide di taglia Media" (senza virgola/allineamento)
const SIZE_TYPE_ALT_RE = new RegExp(
  `^([A-Za-zÀ-ÿ/][A-Za-zÀ-ÿ\\s/'\\-]*?)\\s+di taglia\\s+(${SIZES.join("|")})\\s*(\\([^)]*\\))?,?\\s*(.*)$`,
  "i",
);
// "qualsiasi allineamento" esce spesso spezzato dall'OCR ("qualsiasi a/lineamento", "o/lineamento"):
// tolte le barre resta una L sola, quindi il pattern ne ammette una o due. "qualsiasi" da solo
// basta come indizio, perché nelle schede compare unicamente in questa posizione.
const ALIGNMENT_HINT_RE = /(legal|caotic|neutr|bene|buon|malvag|all?ineamento|qualsiasi)/i;

const ABILITY_KEYS = ["FOR", "DES", "COS", "INT", "SAG", "CAR"];
// il blocco caratteristiche a volte finisce su una riga sola ("FOR 18 (+4) DES 14 (+2) ..."),
// a volte spezzato su più righe (un'etichetta, poi il suo valore, per 12 righe totali) — dipende
// da come la pagina è impaginata in colonne. Invece di assumere una struttura posizionale fissa,
// cerchiamo le 6 coppie etichetta+valore ovunque compaiano in un blocco di testo unito.
// il modificatore fra parentesi ha spesso un artefatto 0/1 scambiato per O/l/I, a volte con
// uno spazio spurio dopo il segno (es. "+ l" invece di "+1")
const MOD_RE = `[+\\-]?\\s*[\\dOolLI]+`;
// il punteggio stesso a volte ha uno spazio spurio in mezzo alle cifre (es. "1 6" invece di "16")
const SCORE_RE = `\\d(?:\\s?\\d)?`;
const ABILITY_PAIR_RE = new RegExp(`(FOR|DES|COS|INT|SAG|CAR)\\s+(${SCORE_RE})\\s*[\\({]\\s*(${MOD_RE})\\s*[\\)}]`, "gi");

function normalizeModifier(raw) {
  const cleaned = raw.replace(/\s+/g, "").replace(/[Oo]/g, "0").replace(/[lLI]/g, "1");
  return cleaned.startsWith("+") || cleaned.startsWith("-") ? cleaned : `+${cleaned}`;
}

// "Sfida -" (senza PE) è usata per PNG/creature senza minaccia in alcuni libri
// Le cifre del grado di sfida possono uscire separate da uno spazio spurio, come già visto per la
// Classe Armatura ("Classe Armatura 1 9"): "Sfida 1 7 (18.000 PE)" veniva letto come grado 1, e il
// mostro finiva in Compendio con la sfida sbagliata o veniva scartato per incoerenza (il Nagpa è 17,
// non 1). Si prende quindi tutto ciò che sta prima dei PE e si tolgono gli spazi interni.
const CHALLENGE_RE = /^Sfida\s+([\d\s/]+|-)\s*(?:\(\s*([\d.,]+)\s*PE\))?/i;


// Due nomi (su 342) con l'artefatto small-caps già noto altrove nella pipeline — trovati con un
// audit generale dei nomi, verificati a mano contro l'originale inglese: "n1"/"1" sono la stessa
// confusione cifra/lettera vista nei talenti (parse-talenti.mjs), qui applicata solo a questi due
// casi noti invece che a tutto il corpus (troppo rischioso distinguerla in modo affidabile da
// cifre vere in nomi che potrebbero contenerne). A livello di modulo (non dentro il loop per
// mostro): è una costante statica, ricrearla a ogni iterazione non serve a nulla.
const NOME_FIXES = {
  "DRAGO n1 BRONZO Cucc10Lo": "Drago di Bronzo Cucciolo",
  "ORSO P OLARE": "Orso Polare",
  // Nomi ricomposti da un titolo andato a capo (vedi COPPIE_DA_UNIRE): la giunzione è corretta,
  // ma le due metà portano con sé i refusi OCR della pagina, che qui vengono ripuliti.
  "D RAGO DELLA LUNOPIETRA CUCCIOLO": "Drago della Lunopietra Cucciolo",
  "GIGANTE DEL GELO DELL'.ACQUA MALVAGIA": "Gigante del Gelo dell'Acqua Malvagia",
  "SPIRITO DANNATO D'ACCIAIO GUERRIERO": "Spirito Dannato d'Acciaio Guerriero",
  // Stessa scheda spezzata dopo "DELLA", con "LUNOPIETRA" a sua volta diviso a metà dall'OCR.
  "DRAGO DELLA LUNO PIETRA ANTICO": "Drago della Lunopietra Antico",
  "DRAGO DELLA LUNO PIETRA ADULTO": "Drago della Lunopietra Adulto",
  // L'apostrofo di "d'Argento" è illeggibile in questa pagina e l'OCR lo rende ogni volta in modo
  // diverso, portandosi via anche la A: la scheda diventava così irrintracciabile per nome.
  "DRAGO DGENTO ADULTO": "Drago d'Argento Adulto",
  "DRAGO D%GENTO GIOVANE": "Drago d'Argento Giovane",
  "DRAGO n&RGENTO Cucc10Lo": "Drago d'Argento Cucciolo",
};

// alcuni libri usano "Lingue"/minuscole invece di "Linguaggi"/maiuscole: alias + case-insensitive
const OPTIONAL_FIELD_LABELS = [
  "Tiri Salvezza|Tiri salvezza",
  "Abilità",
  "Vulnerabilità ai Danni",
  "Resistenza ai Danni",
  "Immunità ai Danni",
  "Immunità alle Condizioni",
  "Sensi",
  "Linguaggi|Lingue",
];
const OPTIONAL_FIELD_RE = new RegExp(`^(${OPTIONAL_FIELD_LABELS.join("|")})\\s+(.*)$`, "i");

const SECTION_HEADING_RE = /^(AZIONI LEGGENDARIE|AZIONI DA MITO|AZIONI|REAZIONI|TRATTI)$/;

// Lo stat block finisce prima del prossimo mostro: in mezzo c'è la prosa del manuale (la storia dei
// giganti, i riquadri, a volte un capitolo intero). Senza un confine, tutto quel testo finiva nelle
// AZIONI dell'ultimo mostro prima della prosa — il Ghoul del Manuale dei Mostri arrivava a 34.000
// caratteri, la Spia della Guida a Ravenloft a 105.000. Il confine è la prima intestazione in
// maiuscolo che non sia una sezione dello stat block: dentro un blocco le uniche righe tutte
// maiuscole sono quelle (i nomi dei tratti sono in grassetto, non in maiuscolo), mentre le sigle
// delle caratteristiche (FOR, DES, CAR...) si fermano a tre lettere.
function fineStatBlock(bodyLines) {
  const indiceAzioni = bodyLines.findIndex((l) => /^AZIONI$/.test(l));
  for (let i = 0; i < bodyLines.length; i++) {
    const linea = bodyLines[i];
    if (SECTION_HEADING_RE.test(linea)) continue;
    // solo lettere maiuscole, spazi e apostrofi: le righe con cifre o punteggiatura sono avanzi
    // d'impaginazione ("DRAC!TO" al posto della testatina, ",.OGNI BEHOLDER È CONVINTO 01...") e
    // ricompaiono in mezzo a un blocco per intero, non alla sua fine
    if (!/^[A-ZÀ-Ù][A-ZÀ-Ù\s'’-]*$/.test(linea)) continue;
    if (linea.replace(/[^A-ZÀ-Ù]/g, "").length < 4) continue;
    // dopo un vero titolo comincia un periodo nuovo; una testatina cade invece in mezzo a una frase
    const seguente = bodyLines[i + 1];
    if (seguente && !/^[A-ZÀ-Ù"«]/.test(seguente)) continue;
    // e non si taglia mai prima delle AZIONI se nel blocco ci sono ancora: significherebbe buttare
    // via metà scheda per una riga sfuggita all'estrazione
    if (indiceAzioni > i) continue;
    return i;
  }
  return bodyLines.length;
}


function isPageNumberNoise(line) {
  const compact = line.replace(/\s+/g, "");
  return /^[0-9IlOo]{1,5}$/.test(compact) && compact.length <= 5;
}

// Caratteri di controllo C0 lasciati dall'OCR al posto di un carattere illeggibile: invisibili a
// schermo ma velenosi, perché spezzano ricerche e confronti. Un ESC finito dentro "DRAGO
// D'ARGENTO ADULTO" rendeva quella scheda irrintracciabile persino cercando "DGENTO".
const CARATTERI_DI_CONTROLLO = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

function loadLines(bookKey) {
  const raw = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, `${bookKey}.json`), "utf-8"));
  const lines = [];
  for (const page of raw.pages) {
    for (const line of page.text.replace(CARATTERI_DI_CONTROLLO, "").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || isPageNumberNoise(trimmed)) continue;
      lines.push(trimmed);
    }
  }
  return { lines, nome: raw.nome };
}

// confronta una riga con un'etichetta nota tollerando lo scambio l/1 e o/0 (es. "C1asse
// Armatura") e le maiuscole/minuscole (alcuni libri usano "Punti ferita" invece di "Punti Ferita")
function lineStartsWithLabel(line, label) {
  const normalized = line.replace(/1/g, "l").replace(/0/g, "o").toLowerCase();
  return normalized.startsWith(label.toLowerCase());
}

function findChallengeAnchors(lines) {
  const anchors = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CHALLENGE_RE);
    if (m) anchors.push({ lineIndex: i, cr: m[1] === "-" ? "-" : normalizzaGradoSfida(m[1]), pe: m[2] });
  }
  return anchors;
}

// Nei manuali impaginati su due colonne strette il nome della scheda va spesso a capo, e nel testo
// estratto diventa DUE righe ("QUINTESSENZA DI GIGANTE" + "DELLE TEMPESTE", "DUERGAR MAESTRO
// DELLA" + "MENTE"). Prendendo solo la riga immediatamente sopra il blocco si perdeva la prima
// metà del nome, e la scheda finiva nel Compendio come "DELLE TEMPESTE": un nome che non esiste,
// impossibile da abbinare alla controparte inglese e quindi senza testo ufficiale.
//
// Il titolo di una scheda è sempre tutto in maiuscolo, quindi è quello il segnale usato per capire
// se la riga sopra è la continuazione del nome. Serve almeno una coppia di lettere per non
// scambiare per titolo un numero di pagina isolato (sopra "GEGANT" c'era proprio un "4", che
// infatti NON va unito).
// Il solo "è tutto maiuscolo" NON basta a riconoscere una continuazione: in maiuscolo ci sono
// anche le testatine di pagina ("C A P I T O LO 2 I B E STI A R I O") e i nomi delle schede
// vicine, e unirli produce nomi peggiori di quelli tronchi ("CENTAURO CHIMERA", "BULLYWUG
// BULLYWUG"). Serve il segnale grammaticale del nome andato a capo: la spezzatura di un titolo
// italiano cade quasi sempre su una preposizione, che resta appesa a fine riga precedente
// ("DUERGAR MAESTRO DELLA" + "MENTE") o apre quella successiva ("QUINTESSENZA DI GIGANTE" +
// "DELLE TEMPESTE"). Dove nemmeno questo aiuta, il nome corretto va messo a mano in NOME_FIXES:
// meglio un elenco chiuso e verificato che un'euristica che sbaglia su decine di schede buone.
const PREPOSIZIONI = [
  "DI", "DEL", "DELLO", "DELLA", "DEI", "DEGLI", "DELLE",
  "DA", "DAL", "DALLO", "DALLA", "DAI", "DAGLI", "DALLE",
  "IN", "NEL", "NELLA", "NEI", "NEGLI", "NELLE", "CON", "SU", "SUL", "SULLA", "PER",
  // "E" volutamente ESCLUSA: e' troppo comune a fine riga per caso e uniformava schede buone
  // ("TARRASQ. E" + "TARRASQ,UE" diventava un nome solo).
];
const FINISCE_CON_PREPOSIZIONE = new RegExp(`(?:^|\\s)(?:${PREPOSIZIONI.join("|")})\\s*$`);
// Le forme elise aprono la riga attaccate alla parola ("DELL'OMBRA"), quindi vanno cercate senza
// lo spazio che segue invece quelle piene.
const INIZIA_CON_PREPOSIZIONE = new RegExp(
  `^\\s*(?:(?:${PREPOSIZIONI.join("|")})\\s|(?:DELL|DALL|NELL|SULL|ALL)['’])`,
);

function eRigaTitolo(riga) {
  const t = (riga ?? "").trim();
  if (t.length < 2 || t.length > 48) return false;
  const lettere = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (lettere.length < 2) return false;
  if (lettere !== lettere.toUpperCase()) return false;
  // testatine di capitolo/bestiario: in maiuscolo ma non fanno parte di alcun nome. Gli spazi
  // vengono tolti prima del confronto perché l'OCR le estrae spaziate ("C A P I T O LO 2").
  const compatto = t.replace(/\s+/g, "").toUpperCase();
  if (/^(CAPITOLO|APPENDICE|INTRODUZIONE|INDICE|BESTIARIO)/.test(compatto)) return false;
  if (/BESTIARIO/.test(compatto)) return false;
  return true;
}

// Le tre schede in cui il titolo va a capo SENZA che la spezzatura cada su una preposizione, e che
// quindi la regola grammaticale non può riconoscere. Verificate a mano sul testo estratto (per il
// guerriero lo conferma anche il corpo del testo: "gli spiriti dannati d'acciaio guerrieri
// infestano..."). Elenco chiuso e coppia completa "riga precedente || riga nome", perché la sola
// seconda metà è ambigua: di schede che finiscono con "CUCCIOLO" ce n'è una per ogni tipo di drago.
const COPPIE_DA_UNIRE = new Set([
  "D RAGO DELLA LUNOPIETRA||CUCCIOLO",
  "GIGANTE DEL GELO DELL'.ACQUA||MALVAGIA",
  "SPIRITO DANNATO D'ACCIAIO||GUERRIERO",
  "SPIRITO DANNATO D'ACCIAIO||COMANDANTE",
  "GIGANTE DELLE NUVOLE||SORRIDENTE",
  "GIGANTE DELLE NUVOLE||GIOCATORE DEL DESTINO",
  "GIGANTE DI PIETRA||CAMMINATORE DI SOGNI",
  "GIGANTE DEL FUOCO||INVOCATORE",
  "GIGANTE DEL GELO||MODELLAGHIACCIO",
  "GIGANTE DELLE COLLINE||VALANGHIVO",
  "GIGANTE DELLE PIETRE||LINGUARUPESTRE",
  "GIGANTE DELLE TEMPESTE||CHIAMABURRASCHE",
  "GIGANTE DELLA MORTE||AMMANTATO",
  "GIGANTE DELLA MORTE||MIETITORE",
  "GITHYANKI COMANDANTE||SUPREMO",
  "PROGENIE STELLARE MAGO||LARVICO",
  "DRAGONNEL DELLE LANDE||DESOLATE",
  "DRAGO DELLE PROFONDITÀ||CUCCIOLO",
  "DRAGO DELLE PROFONDITÀ||GIOVANE",
]);

const compatta = (s) => s.replace(/[^A-Za-zÀ-ÿ]/g, "").toUpperCase();

/** Lunghezza del prefisso in comune fra due stringhe già compattate. */
function prefissoComune(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** Vero se `nome` è la seconda metà di un titolo spezzato che comincia in `precedente`. */
function eContinuazioneDiNome(precedente, nome) {
  if (!eRigaTitolo(precedente) || !eRigaTitolo(nome)) return false;
  const prec = precedente.trim();
  const nom = nome.trim();
  if (COPPIE_DA_UNIRE.has(`${prec}||${nom}`)) return true;

  // Una sola parola sopra il titolo è quasi sempre l'intestazione della SEZIONE del bestiario
  // ("DRAGO", "DIAVOLO", "DINOSAURO" aprono un gruppo di schede nel Manuale dei Mostri): unirla
  // darebbe "DRAGO DRAGO BLU ADULTO". Una continuazione vera porta con sé almeno due parole.
  if (prec.split(/\s+/).filter(Boolean).length < 2) return false;

  // Molti libri ristampano il nome della scheda anche come testatina, spesso spaziato o storpiato
  // dall'OCR ("BUG BEAR" sopra "BUGBEAR CAPOTRIBÙ", "DOPP ELCANG ER" sopra "DOPPELGANGER"):
  // un prefisso in comune lungo tradisce che è la stessa parola, non la prima metà di un nome.
  if (prefissoComune(compatta(prec), compatta(nom)) >= 5) return false;

  // Segnale grammaticale: la spezzatura di un titolo italiano cade di norma su una preposizione.
  if (FINISCE_CON_PREPOSIZIONE.test(prec) || INIZIA_CON_PREPOSIZIONE.test(nom)) return true;

  // Oltre a questo NON si tira a indovinare. Provato a unire anche quando la riga sopra non è il
  // nome di un'altra scheda, ma in maiuscolo ci sono pure le didascalie delle illustrazioni e i
  // titoli dei riquadri, e venivano fuori nomi come "UN T1PIC.O 0RC.O ORCO" o "APPRN01CE A:
  // CREATURE VARIE CAPRA GIGANTE". Le spezzature rimaste vanno in COPPIE_DA_UNIRE, verificate una
  // per una sul testo estratto: un elenco chiuso è preferibile a un'euristica che rovina schede
  // già corrette.
  return false;
}

// Popolato con una prima passata sul libro (vedi parseBook): serve a distinguere "la riga sopra è
// un altro mostro" da "la riga sopra è la prima metà di questo nome".
let nomiDiSchedaNoti = new Set();

/** Cerca all'indietro da un'ancora "Sfida" la riga taglia/tipo/allineamento e il nome sopra di essa. */
// Quante righe si può risalire dalla casella "Sfida" per ritrovare la riga taglia/tipo. Quaranta
// non bastavano: il blocco delle caratteristiche esce dal PDF una cella per riga (dodici righe solo
// per FOR-CAR), e con tiri salvezza, abilità, resistenze, immunità, sensi e linguaggi che vanno a
// capo si superano tranquillamente. Erano 67 stat block del Manuale dei Mostri scartati con
// "header non trovato" — schede intere, non casi limite. Il tetto resta perché la ricerca si ferma
// comunque appena incontra la "Sfida" del mostro PRECEDENTE: oltre quella siamo in un'altra scheda.
const RIGHE_INDIETRO_MASSIME = 90;

/**
 * Nome di riserva per le schede il cui TITOLO l'estrazione ha perso o storpiato.
 *
 * In un centinaio di stat block del Manuale dei Mostri il blocco delle statistiche è intero ma la
 * riga del nome no ("DEMONP" per Demone d'Ombra, o proprio assente): senza nome la scheda veniva
 * buttata. Classe armatura, punti ferita e grado di sfida sono però numeri, e insieme fanno
 * un'impronta che riconosce una sola creatura — vedi recupera-mostri-per-impronta.mjs, che produce
 * questo file dopo che i nomi italiani sono stati verificati uno per uno sul manuale.
 */
function caricaNomiPerImpronta(bookKey) {
  try {
    return JSON.parse(readFileSync(path.join(SCRIPT_DIR, `nomi-per-impronta-${bookKey}.json`), "utf-8"));
  } catch {
    return {};
  }
}

/** Header sintetico per una scheda senza titolo: il nome viene dall'impronta, il resto dal blocco. */
function headerDaImpronta(lines, challengeLineIndex, nomiPerImpronta) {
  for (let i = challengeLineIndex - 1; i >= 0 && i > challengeLineIndex - RIGHE_INDIETRO_MASSIME; i--) {
    if (CHALLENGE_RE.test(lines[i])) return null;
    if (!lineStartsWithLabel(lines[i], "Classe Armatura")) continue;
    const ca = lines[i].match(/(\d+)/)?.[1];
    const pf = lines[i + 1]?.match(/^Punti\s+Ferita\s+(\d+)/i)?.[1];
    const sfida = lines[challengeLineIndex].match(/^Sfida\s+([\d/]+)/i)?.[1];
    if (!ca || !pf || !sfida) return null;
    const nome = nomiPerImpronta[`${ca}|${pf}|${sfida}`];
    return nome ? { sizeTypeLineIndex: i - 1, nameStartIndex: i - 1, nameLineIndex: i - 1, nomeForzato: nome } : null;
  }
  return null;
}

function findHeaderStart(lines, challengeLineIndex, { unisci = true } = {}) {
  for (let i = challengeLineIndex - 1; i >= 0 && i > challengeLineIndex - RIGHE_INDIETRO_MASSIME; i--) {
    // superata la casella "Sfida" precedente si è usciti dalla scheda: il nome che si troverebbe
    // da qui in su è quello di un altro mostro
    if (CHALLENGE_RE.test(lines[i])) return null;
    const standard = lines[i].match(SIZE_TYPE_RE);
    const alt = !standard ? lines[i].match(SIZE_TYPE_ALT_RE) : null;
    const m = standard ?? alt;
    if (!m) continue;
    // la variante standard richiede una parola di allineamento plausibile; la variante "di
    // taglia" (senza virgola) è già abbastanza specifica di per sé, l'allineamento è opzionale
    // Il confronto ignora tutto ciò che non è una lettera: l'OCR spezza le parole con barre e
    // spazi ("Mostruosità Grande, senza a/lineamento" per l'Ankheg), e con il testo grezzo il
    // controllo falliva facendo scartare la scheda intera.
    if (standard && !ALIGNMENT_HINT_RE.test(m[4].replace(/[^A-Za-zÀ-ÿ]/g, ""))) continue;

    // conferma che sia una vera scheda mostro e non una frase di testo narrativo che per
    // coincidenza combacia col pattern taglia/tipo/allineamento: dev'esserci "Classe Armatura"
    // (con tolleranza OCR) entro le prossime righe
    // dieci righe e non tre: fra la riga taglia/tipo e la Classe Armatura l'estrazione a volte
    // infila una testatina, il nome ripetuto o un pezzo della colonna accanto, e con la finestra
    // stretta la scheda veniva persa. La riga taglia/tipo è già di per sé molto specifica, quindi
    // allargare qui non apre la porta ai falsi positivi.
    const hasArmorClassNearby = lines
      .slice(i + 1, i + 11)
      .some((l) => lineStartsWithLabel(l, "Classe Armatura"));
    if (!hasArmorClassNearby) continue;

    // la riga nome è quella immediatamente sopra, ma il nome può essere andato a capo: in quel
    // caso anche la riga precedente è tutta in maiuscolo e va unita (vedi eRigaTitolo).
    const nameLineIndex = i - 1;
    if (nameLineIndex < 0) return null;
    let nameStartIndex = nameLineIndex;
    if (!unisci) return { nameLineIndex, nameStartIndex, sizeTypeLineIndex: i, tipo: m[1].trim(), taglia: m[2], allineamento: m[4].trim() };
    // Al massimo due righe di continuazione: oltre non si tratta più di un nome andato a capo ma
    // di testo che per caso è in maiuscolo, e unirlo peggiorerebbe il nome invece di completarlo.
    while (
      nameStartIndex > 0 &&
      nameLineIndex - nameStartIndex < 2 &&
      eContinuazioneDiNome(lines[nameStartIndex - 1], lines[nameStartIndex])
    ) {
      nameStartIndex--;
    }
    return {
      nameLineIndex,
      nameStartIndex,
      sizeTypeLineIndex: i,
      tipo: m[1].trim(),
      taglia: m[2],
      allineamento: m[4].trim(),
    };
  }
  return null;
}

function parseAbilities(lines, start) {
  // finestra generosa: il blocco (su una riga o spezzato) sta sempre entro le prime ~15 righe
  const windowEnd = Math.min(lines.length, start + 15);
  const windowLines = lines.slice(start, windowEnd);

  // mappa ogni offset di carattere nel blob alla riga sorgente, per sapere di quante righe
  // avanzare il cursore una volta trovato l'ultimo match (il blob unisce le righe con " ")
  const lineStartOffsets = [];
  let offset = 0;
  for (const l of windowLines) {
    lineStartOffsets.push(offset);
    offset += l.length + 1;
  }
  const blob = windowLines.join(" ");

  const abilities = {};
  let lastEndOffset = 0;
  for (const match of blob.matchAll(ABILITY_PAIR_RE)) {
    const key = match[1].toUpperCase();
    const score = Number(match[2].replace(/\s+/g, ""));
    abilities[key] = { score, mod: normalizeModifier(match[3]) };
    lastEndOffset = Math.max(lastEndOffset, match.index + match[0].length);
  }
  for (const key of ABILITY_KEYS) if (!(key in abilities)) abilities[key] = null;

  let linesConsumed = windowLines.length;
  for (let i = 0; i < lineStartOffsets.length; i++) {
    if (lineStartOffsets[i] >= lastEndOffset) {
      linesConsumed = i;
      break;
    }
  }
  return { abilities, next: start + Math.max(1, linesConsumed) };
}

/**
 * Nessuna scheda deve rubare il nome a un'altra.
 *
 * L'impronta identifica una creatura sola, ma il nome che le si assegna può essere già quello di
 * una scheda letta correttamente altrove — succedeva al Drago d'Argento Giovane. In quel caso a
 * cedere è chi ha ricevuto il nome per deduzione, non chi ce l'aveva stampato sopra.
 */
function risolviNomiDoppi(monsters) {
  const quanti = new Map();
  for (const m of monsters) quanti.set(m.nome, (quanti.get(m.nome) ?? 0) + 1);
  for (const m of monsters) {
    if (m.daImpronta && quanti.get(m.nome) > 1 && m.nomeLetto && m.nomeLetto !== m.nome) {
      quanti.set(m.nome, quanti.get(m.nome) - 1);
      m.nome = m.nomeLetto;
    }
  }
  // i due campi di servizio non devono finire nel file: servivano solo qui
  for (const m of monsters) {
    delete m.nomeLetto;
    delete m.daImpronta;
  }
  return monsters;
}

function parseBook(bookKey) {
  const { lines, nome } = loadLines(bookKey);
  const nomiPerImpronta = caricaNomiPerImpronta(bookKey);
  const anchors = findChallengeAnchors(lines);

  // Prima passata SENZA unione: raccoglie i nomi che stanno da soli sopra uno stat block, cioe' i
  // nomi di scheda veri del libro. Serve a eContinuazioneDiNome per non incollare fra loro due
  // mostri diversi che il PDF ha impaginato uno sotto l'altro ("CENTAURO" sopra "CHIMERA").
  nomiDiSchedaNoti = new Set();
  for (const a of anchors) {
    const h = findHeaderStart(lines, a.lineIndex, { unisci: false });
    if (h) nomiDiSchedaNoti.add(compatta(lines[h.nameLineIndex].trim()));
  }

  const monsters = [];
  const skipped = [];

  for (let idx = 0; idx < anchors.length; idx++) {
    const anchor = anchors[idx];
    const header =
      findHeaderStart(lines, anchor.lineIndex) ??
      headerDaImpronta(lines, anchor.lineIndex, nomiPerImpronta);
    if (!header) {
      skipped.push({ reason: "header non trovato", lineIndex: anchor.lineIndex });
      if (process.env.DBG_SKIP) {
        let diag = "nessuna riga taglia/tipo nella finestra";
        for (let k = anchor.lineIndex - 1; k > anchor.lineIndex - RIGHE_INDIETRO_MASSIME && k >= 0; k--) {
          if (CHALLENGE_RE.test(lines[k])) { diag = "fermato dalla Sfida precedente a -" + (anchor.lineIndex - k); break; }
          const mm2 = lines[k].match(SIZE_TYPE_RE) ?? lines[k].match(SIZE_TYPE_ALT_RE);
          if (!mm2) continue;
          const okAll = ALIGNMENT_HINT_RE.test(mm2[4].replace(/[^A-Za-zÀ-ÿ]/g, ""));
          const okCA = lines.slice(k + 1, k + 4).some((l) => lineStartsWithLabel(l, "Classe Armatura"));
          diag = `riga "${lines[k].slice(0, 46)}" a -${anchor.lineIndex - k}: allineamento=${okAll} CA=${okCA}`;
          break;
        }
        console.error("SKIP", anchor.lineIndex, diag);
      }
      continue;
    }

    // Le righe da nameStartIndex a nameLineIndex sono le porzioni del nome andato a capo: unite
    // in un nome solo (di norma è una riga sola, e allora questo equivale al comportamento di prima).
    const nomeMostro =
      header.nomeForzato ??
      lines
        .slice(header.nameStartIndex, header.nameLineIndex + 1)
        .map((l) => l.trim())
        .filter(Boolean)
        .join(" ");
    // scarta falsi positivi ovvi: la riga "nome" non deve essere a sua volta una riga di campo,
    // né un'intestazione di pagina/capitolo ripetuta ("CAPITOLO 2 I BESTIARIO", a volte con uno
    // spazio indebito prima di "APITOLO" per lo stesso artefatto small-caps visto altrove) che
    // per coincidenza precede un'ancora "Sfida" valida — bug reale trovato con un audit dei nomi
    // (3 mostri fantasma "Capitolo 2 I Bestiario" in fonte "multiverso").
    if (/^(Classe Armatura|Punti Ferita|Velocità|Sfida)/.test(nomeMostro) || /^C\s?APITOLO\s*\d/i.test(nomeMostro)) {
      skipped.push({ reason: "nome non plausibile", nomeMostro });
      continue;
    }

    let cursor = header.sizeTypeLineIndex + 1;
    const fields = {};
    for (const label of ["Classe Armatura", "Punti Ferita", "Velocità"]) {
      const line = lines[cursor] ?? "";
      if (lineStartsWithLabel(line, label)) {
        fields[label] = line.slice(label.length).trim();
        cursor++;
      } else {
        fields[label] = null;
      }
    }

    const ca = fields["Classe Armatura"]?.match(/(\d+)/)?.[1];
    const pf = fields["Punti Ferita"]?.match(/(\d+)/)?.[1];
    const gradoSfida = lines[anchor.lineIndex].match(/^Sfida\s+([\d/]+)/i)?.[1];
    const nomePerImpronta =
      ca && pf && gradoSfida ? nomiPerImpronta[`${ca}|${pf}|${gradoSfida}`] : undefined;

    const { abilities, next } = parseAbilities(lines, cursor);
    cursor = next;

    const optional = {};
    while (cursor < anchor.lineIndex) {
      const line = lines[cursor];
      const m = line.match(OPTIONAL_FIELD_RE);
      if (m) {
        const canonical =
          /^tiri salvezza/i.test(m[1]) ? "Tiri Salvezza"
          : /^ling/i.test(m[1]) ? "Linguaggi"
          : m[1];
        optional[canonical] = m[2];
        cursor++;
      } else {
        // riga di continuazione del campo precedente (liste lunghe su più righe)
        const lastLabel = Object.keys(optional).at(-1);
        if (lastLabel) optional[lastLabel] += " " + line;
        cursor++;
      }
    }

    // corpo: dall'ancora Sfida fino al prossimo mostro (o alla prossima ancora Sfida - il suo header)
    const nextAnchor = anchors[idx + 1];
    const bodyEnd = nextAnchor ? findHeaderStart(lines, nextAnchor.lineIndex)?.nameLineIndex ?? nextAnchor.lineIndex : lines.length;
    let bodyLines = lines.slice(anchor.lineIndex + 1, bodyEnd);
    const taglio = fineStatBlock(bodyLines);
    if (process.env.DBG_TAGLIO && taglio < bodyLines.length) console.error("TAGLIO", nomeMostro, "->", JSON.stringify(bodyLines[taglio]), "resta", taglio, "righe su", bodyLines.length);
    bodyLines = bodyLines.slice(0, taglio);

    // certe pagine hanno un layout a colonna laterale che fa finire una caratteristica (quasi
    // sempre CAR, l'ultima delle sei) fuori ordine, letta DOPO la riga "Sfida" invece che nel
    // blocco iniziale: la recuperiamo cercandola nel corpo e la togliamo da lì
    const displacedValueRe = new RegExp(`^(${SCORE_RE})\\s*[\\({]\\s*(${MOD_RE})\\s*[\\)}]`);
    for (const key of ABILITY_KEYS) {
      if (abilities[key]) continue;
      for (let i = 0; i < bodyLines.length - 1; i++) {
        if (bodyLines[i].toUpperCase() !== key) continue;
        const valueMatch = bodyLines[i + 1].match(displacedValueRe);
        if (!valueMatch) continue;
        abilities[key] = { score: Number(valueMatch[1].replace(/\s+/g, "")), mod: normalizeModifier(valueMatch[2]) };
        bodyLines = [...bodyLines.slice(0, i), ...bodyLines.slice(i + 2)];
        break;
      }
    }

    const sections = { tratti: [], azioni: [], azioniLeggendarie: [], reazioni: [] };
    let activeSectionKey = "tratti";
    for (const line of bodyLines) {
      const sectionMatch = line.match(SECTION_HEADING_RE);
      if (sectionMatch) {
        const heading = sectionMatch[1];
        activeSectionKey =
          heading === "AZIONI" ? "azioni"
          : heading === "AZIONI LEGGENDARIE" || heading === "AZIONI DA MITO" ? "azioniLeggendarie"
          : heading === "REAZIONI" ? "reazioni"
          : "tratti";
        continue;
      }
      sections[activeSectionKey].push(line);
    }

    const abilityValues = Object.values(abilities);
    const numericSuspect =
      !fields["Classe Armatura"] ||
      !fields["Punti Ferita"] ||
      abilityValues.some((a) => a === null);

    monsters.push({
      // Il nome per impronta vince su quello letto: il titolo esce spesso storpiato dal
      // maiuscoletto ("AzER", "GoBLIN", "0RSOGUFO", "R.AKSHASA") o è addirittura una riga di prosa
      // finita lì, mentre l'impronta è verificata sui numeri e il nome italiano corrispondente è
      // stato controllato a mano sull'indice del manuale e sul titolo stampato.
      nome: nomePerImpronta ?? NOME_FIXES[nomeMostro] ?? nomeMostro,
      // si tiene da parte anche il nome LETTO: se quello dedotto dall'impronta risultasse già
      // usato da un'altra scheda, si torna a questo (vedi risolviNomiDoppi)
      nomeLetto: NOME_FIXES[nomeMostro] ?? nomeMostro,
      daImpronta: Boolean(nomePerImpronta),
      tipo: header.tipo,
      taglia: header.taglia,
      allineamento: header.allineamento,
      classeArmatura: fields["Classe Armatura"],
      puntiFerita: fields["Punti Ferita"],
      velocita: fields["Velocità"],
      caratteristiche: abilities,
      tiriSalvezza: optional["Tiri Salvezza"] ?? null,
      abilita: optional["Abilità"] ?? null,
      vulnerabilitaDanni: optional["Vulnerabilità ai Danni"] ?? null,
      resistenzaDanni: optional["Resistenza ai Danni"] ?? null,
      immunitaDanni: optional["Immunità ai Danni"] ?? null,
      immunitaCondizioni: optional["Immunità alle Condizioni"] ?? null,
      sensi: optional["Sensi"] ?? null,
      linguaggi: optional["Linguaggi"] ?? null,
      sfida: anchor.cr,
      pe: anchor.pe,
      tratti: sections.tratti.join("\n"),
      azioni: sections.azioni.join("\n"),
      azioniLeggendarie: sections.azioniLeggendarie.join("\n"),
      reazioni: sections.reazioni.join("\n"),
      numericSuspect,
      fonte: bookKey,
    });
  }

  return { nome, monsters: risolviNomiDoppi(monsters), skipped };
}

function main() {
  const bookKey = process.argv[2];
  if (!bookKey) {
    console.error("Uso: node parse-mostri.mjs <chiave_libro>");
    process.exit(1);
  }

  const { nome, monsters, skipped } = parseBook(bookKey);
  mkdirSync(PARSED_DIR, { recursive: true });
  const outPath = path.join(PARSED_DIR, `${bookKey}-mostri.json`);
  writeFileSync(outPath, JSON.stringify(monsters, null, 2), "utf-8");

  const suspectCount = monsters.filter((m) => m.numericSuspect).length;
  console.log(`${nome}: ${monsters.length} mostri trovati -> ${outPath}`);
  console.log(`voci con dati numerici sospetti (da incrociare con l'inglese): ${suspectCount}`);
  console.log(`ancore "Sfida" scartate per header non trovato: ${skipped.length}`);
  // --scartate stampa il contesto di ogni ancora persa: senza, "ne mancano 40" resta un numero e
  // non c'è modo di capire quale scheda sia, né perché il suo nome non venga riconosciuto.
  if (process.argv.includes("--scartate")) {
    const { lines: righe } = loadLines(bookKey);
    for (const s of skipped) {
      if (s.lineIndex == null) {
        console.log(`  - ${s.reason}: ${s.nomeMostro}`);
        continue;
      }
      const contesto = righe.slice(Math.max(0, s.lineIndex - 12), s.lineIndex + 1).map((r) => `      ${r}`);
      console.log(`  - riga ${s.lineIndex} (${s.reason}):\n${contesto.join("\n")}`);
    }
  }
  const counts = {};
  for (const m of monsters) counts[m.nome] = (counts[m.nome] || 0) + 1;
  const dups = Object.entries(counts).filter(([, c]) => c > 1);
  console.log(`nomi duplicati: ${dups.length}`);
  if (dups.length > 0) console.log(dups.slice(0, 10));
}

main();
