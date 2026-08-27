// Estrae le schede degli incantesimi dal testo grezzo di un manuale (vedi extract_pdf.py)
// e le trasforma in voci strutturate. Formato atteso (tipografia standard dei manuali ufficiali):
//
//   NOME INCANTESIMO
//   <Scuola> di <N>° livello [(rituale)]      oppure      Trucchetto di <Scuola>
//   Tempo di Lancio: ...
//   Gittata: ...
//   Componenti: ...
//   Durata: ...
//   <descrizione, eventualmente su più paragrafi, incluso "Ai Livelli Superiori.">
//
// Uso: node parse-spells.mjs <chiave_libro>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  correggiSottotitoloIncantesimo,
  TITOLO_ELISIONI,
  TITOLO_STOPWORDS,
} from "../../lib/compendio-ocr.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const FIELD_LABELS = ["Tempo di Lancio", "Gittata", "Componenti", "Durata"];
const FIELD_RE = new RegExp(`^(${FIELD_LABELS.join("|")}):\\s*(.*)$`);

// tra la cifra del livello e il simbolo "°" a volte il PDF inserisce uno spazio spurio (es.
// "1 °  livello" invece di "1° livello", stesso artefatto di estrazione già noto altrove) — senza
// \s* qui il sottotitolo non veniva riconosciuto e l'incantesimo intero andava perso (trovato con
// "Vita Falsata"/False Life, mancante dal PHB nonostante presente nel testo grezzo).
// il cerchietto del grado, in corsivo e a corpo piccolo, esce dall'OCR anche come punto mediano
// "·" ("Fuorviare"/Mislead) o come apostrofo, dritto o tipografico ("Abiurazione di 1 '  livello
// (rituale)", cioè "Allarme"/Alarm). Dopo una cifra e prima di "livello" nessuno di quei segni può
// essere testo vero, quindi valgono tutti come ordinale.
const SUBTITLE_LEVELED_RE = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-']*?)\s+di\s+(\d)\s*[°·'’]\s*livel[lJ1I]o(\s*\(rituale\))?$/;
const SUBTITLE_CANTRIP_RE = /^Trucchetto\s+di\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-']*)$/;

// le 8 scuole di magia ufficiali (terminologia PHB ITA): usate per scartare i falsi positivi,
// cioè frasi normali che per coincidenza terminano con "... di N° livello" (es. dentro il
// paragrafo "Ai Livelli Superiori") ma non sono davvero un sottotitolo di incantesimo.
const SCHOOLS = new Set([
  "abiurazione",
  "ammaliamento",
  "divinazione",
  "evocazione",
  "illusione",
  "invocazione",
  "necromanzia",
  "trasmutazione",
]);


// nei nomi non compaiono mai cifre vere (quelle sono solo nelle descrizioni, es. "1d6"): in
// un "token" (sequenza senza spazi) che contiene anche lettere, uno 0/1 è quasi sempre un
// errore di estrazione del font per O/I, non una cifra vera
function fixDigitLetterConfusion(raw) {
  return raw
    .split(/(\s+)/)
    .map((token) => {
      if (!/[a-zà-ÿ]/i.test(token)) return token;
      return token.replace(/0/g, "o").replace(/1/g, "i");
    })
    .join("");
}

// artefatto distinto da fixDigitLetterConfusion sopra (quello copre 0/1 scambiati per O/I
// DENTRO una parola con altre lettere, per i NOMI): nel corpo del testo la cifra "1" della
// notazione dei dadi ("1d4", "1d6"...) viene spesso estratta come lettera "l" minuscola isolata
// ("ld4"), a volte insieme anche alla cifra "0" letta come "O" maiuscola ("ldlO" invece di
// "1d10", trovato dall'utente su "Eldritch Blast"/Deflagrazione Occulta) — a volte con uno spazio
// spurio in mezzo ("l 0d6", "4dl 0"). Quattro passate, in ordine: (1) ricongiunge lo spazio
// spurio dentro un numero spezzato, prima/dopo la "d"; (2) conteggio corrotto ma isolato ("l"
// singola, mai incollata a un'altra cifra reale — quella è una riga di TABELLA non una frase,
// es. "2ld6" nella progressione del Ladro, lasciata volutamente intatta perché lì "2" e "1d6"
// sono colonne diverse senza spazio tra loro, e provare a separarle rischierebbe di produrre
// "21d6"), taglia già pulita; (3) taglia corrotta (10/12/20) con un conteggio NON ambiguo (cifre
// vere o "l"/"I" isolata); (4) conteggio "10" corrotto (l0/lO) isolato, con la taglia ancora
// corrotta. Ogni normalizzazione valida il risultato contro le taglie di dado reali di D&D
// (1,2,3,4,6,8,10,12,20,100) prima di sostituire, per non toccare mai testo che non è davvero
// notazione dadi.
const VALID_DICE_SIZES = new Set([1, 2, 3, 4, 6, 8, 10, 12, 20, 100]);
function toDigits(s) {
  return s.replace(/[oO]/g, "0").replace(/[lI]/g, "1");
}
function fixDiceNotation(text) {
  let out = text;
  // 'd' non deve essere preceduta da una lettera vera (blocca "quando", "guardando"...) — solo da
  // una cifra reale, l'inizio testo o un separatore: altrimenti questa passata mangiava lo spazio
  // reale dopo parole come "Quando" (matchava la "d" di "Quando" invece che quella di un dado).
  out = out.replace(/(?<![a-zA-Zà-ÿ])d([0-9oOlI])\s+([0-9oOlI])\b/g, "d$1$2");
  out = out.replace(/\b([0-9oOlI])\s+([0-9oOlI])d/g, "$1$2d");
  out = out.replace(/\bld(\d+)\b/g, "1d$1");
  out = out.replace(/\b(\d{1,2}|[lI])d([lI0-9][oO0-9]?)\b/g, (m, count, size) => {
    const c = Number(toDigits(count));
    const s = Number(toDigits(size));
    if (!VALID_DICE_SIZES.has(s) || c < 1 || c > 99) return m;
    return `${c}d${s}`;
  });
  out = out.replace(/\b([lI])([oO0])d([lI0-9][oO0-9]?)\b/g, (m, _l, _z, size) => {
    const s = Number(toDigits(size));
    return VALID_DICE_SIZES.has(s) ? `10d${s}` : m;
  });
  // stesso spazio spurio, stavolta dentro un ORDINALE a due cifre spezzato in due ("1 1°" invece
  // di "11°") — trovato confrontando "Fiotto Acido" con dungeonsanddragons.fandom.com/it (stesso
  // testo ufficiale, ma senza questo artefatto). Sicuro: una cifra seguita da spazio, un'altra
  // cifra e "°" è sempre un ordinale spezzato, mai due numeri distinti.
  out = out.replace(/\b(\d) (\d°)/g, "$1$2");
  return out;
}

// spazi spuri e parole tronche note, trovate ispezionando l'elenco completo delle voci estratte
// (stesso artefatto: il font inserisce uno spazio indebito, es. "C Omunione" invece di "Comunione")
const NAME_FIXES = new Map([
  ["braccia di radar", "Braccia di Hadar"],
  ["cerchio di thletrasporto", "Cerchio di Teletrasporto"],
  ["disco fluttuante di thnser", "Disco Fluttuante di Tenser"],
  ["c omunione con la natura", "Comunione con la Natura"],
  ["scrigno segreto d i leomund", "Scrigno Segreto di Leomund"],
  ["respirare sott'acq.ua", "Respirare sott'Acqua"],
  ["evocaa immondo", "Evoca Immondo"],
  ["evoca non mortto", "Evoca Non Morto"],
  ["parola del p otere d olore", "Parola del Potere Dolore"],
  ["purificare crno e bevande", "Purificare Cibo e Bevande"],
  ["colpo del vento d'acmaio", "Colpo del Vento d'Acciaio"],
  ["p rigione mentale", "Prigione Mentale"],
  ["trasformazione di thnser", "Trasformazione di Tenser"],
  ["orrido avvizzimento di abi-dalzim", "Orrido Avvizzimento di Abi-Dalzim"],
]);

function titleCaseItalian(raw) {
  const words = fixDigitLetterConfusion(raw).trim().toLowerCase().split(/\s+/);
  const cased = words
    .map((w, i) => {
      if (i > 0 && TITOLO_STOPWORDS.has(w)) return w;
      const elisione = i > 0 && w.match(/^([a-zà-ÿ]+)'(.+)$/);
      if (elisione && TITOLO_ELISIONI.has(elisione[1])) {
        return `${elisione[1]}'${elisione[2].replace(/^[a-zà-ÿ]/, (c) => c.toUpperCase())}`;
      }
      return w.replace(/(^|[-'/])([a-zà-ÿ])/g, (m, sep, letter) => sep + letter.toUpperCase());
    })
    .join(" ");
  return NAME_FIXES.get(cased.toLowerCase()) ?? cased;
}

// Il nome ricostruito a regola resta un'ipotesi. Quando lo stesso nome compare anche negli ELENCHI
// per classe del manuale, lì è stampato in tondo con la sua grafia vera: quella è la fonte, e vince
// sulla regola. Si adotta soltanto se le lettere coincidono (a meno di maiuscole e spazi), quindi
// una riga con un refuso d'estrazione non può sostituire un nome buono.
// Gli spazi NON si ignorano nel confronto: gli elenchi sono impaginati stretti e l'estrazione ci
// infila spazi spuri ("Armatu ra di Agathys", "M u ro di Fuoco"). Ignorandoli, quelle righe
// combaciavano col nome buono e lo sostituivano con la versione rotta. Qui la riga del manuale può
// vincere solo se ha le stesse identiche parole, e cambia soltanto le maiuscole.
function chiaveNome(s) {
  return s.toLowerCase().replace(/[^a-zà-ÿ'\s]/g, "").replace(/\s+/g, " ").trim();
}

function indiceGrafieDelManuale(lines) {
  const indice = new Map();
  for (const line of lines) {
    if (line.length > 45) continue;
    if (!/^[A-ZÀ-Ù][A-Za-zÀ-ÿ\s'\-]+$/.test(line)) continue;
    // una voce d'elenco è in tondo: se contiene una parola tutta maiuscola è un titolo di scheda
    // o un'intestazione finita nel mezzo, non la grafia che cerchiamo
    if (line.split(/\s+/).some((w) => w.length > 1 && w === w.toUpperCase())) continue;
    const k = chiaveNome(line);
    if (k.length >= 5 && !indice.has(k)) indice.set(k, line.replace(/\s+/g, " ").trim());
  }
  return indice;
}

// Non tutti gli elenchi seguono la stessa convenzione: il Manuale del Giocatore scrive le voci in
// stile titolo ("Banchetto degli Eroi"), la Guida di Xanathar in stile frase ("Prigione mentale",
// "Sciame di palle di neve di Snilloc"). Del manuale interessa solo l'informazione che la regola
// non può avere — QUALI paroline restano minuscole — non la convenzione dell'elenco: la grafia
// stampata si adotta soltanto se le uniche parole che perdono la maiuscola sono articoli e
// preposizioni. Altrimenti nel Compendio finirebbero nomi in due stili diversi a seconda del libro.
function grafiaAccettabile(regola, manuale) {
  const a = regola.split(" ");
  const b = manuale.split(" ");
  if (a.length !== b.length) return false;
  return a.every((parola, i) => {
    if (parola === b[i]) return true;
    const minuscola = b[i].toLowerCase() === b[i];
    const elisione = b[i].match(/^([a-zà-ÿ]+)'/);
    return minuscola ? TITOLO_STOPWORDS.has(b[i]) : Boolean(elisione && TITOLO_ELISIONI.has(elisione[1]));
  });
}

function isHeaderNoise(line) {
  const compact = line.replace(/\s+/g, "").toUpperCase();
  if (compact.includes("INCANTESIMI") && compact.includes("CAPITOLO")) return true;
  if (compact.includes("INCANTESIMI") && compact.length < 25) return true;
  return false;
}

function isPageNumberNoise(line) {
  const compact = line.replace(/\s+/g, "");
  return /^[0-9IlOo]{1,5}$/.test(compact) && compact.length <= 5;
}

// L'ULTIMA scheda del capitolo non ha una scheda successiva che le faccia da confine, e senza
// questo controllo si prendeva tutto ciò che nel PDF viene dopo: "Zona di Verità" arrivava a
// 142.000 caratteri, cioè l'intero contenuto del manuale dalle appendici all'indice analitico.
// L'inizio di una nuova sezione di primo livello chiude il capitolo degli incantesimi. Le
// testatine di pagina ("CAPITOLO 11 | INCANTESIMI") sono già state tolte da isHeaderNoise, quindi
// qui resta solo l'apertura vera di un capitolo o di un'appendice.
// In alcuni manuali il capitolo non si chiude con un'intestazione riconoscibile da sola: nel
// Calderone di Tasha dopo l'ultima scheda parte il riquadro "INCANTESIMI PERSONALIZZATI", e la
// prima delle sue due righe viene già scartata come testatina. Per quei casi il confine si dichiara
// in books.json (campo "fineIncantesimi"): esplicito e verificabile, invece di una regola generica
// su "riga tutta maiuscola" che accorcerebbe le schede con uno stat block dentro (vedi "Servitore
// Minuscolo" nella Guida di Xanathar, che contiene le righe FOR/DES/COS e AZIONI).
function isFineCapitolo(line, marcatoreLibro) {
  const compact = line.replace(/\s+/g, "").toUpperCase();
  if (marcatoreLibro && compact === marcatoreLibro.replace(/\s+/g, "").toUpperCase()) return true;
  // NON si usa "CAPITOLO": la testatina di pagina comincia proprio con quella parola, e quando
  // l'OCR ne storpia il titolo ("CAPITOLO 11 f N CANTESI M I") isHeaderNoise non la riconosce
  // più — la scheda in corso veniva troncata a metà (Prestidigitazione perdeva metà elenco).
  return /^(APPENDICE|INDICEANALITICO|GLOSSARIO)/.test(compact);
}

function loadLines(bookKey) {
  const raw = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, `${bookKey}.json`), "utf-8"));
  const lines = [];
  for (const page of raw.pages) {
    for (const line of page.text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (isHeaderNoise(trimmed) || isPageNumberNoise(trimmed)) continue;
      lines.push(trimmed);
    }
  }
  return { lines, nome: raw.nome };
}

// Il sottotitolo ("Illusione di 5° livello") è la riga più fragile della scheda: è in corsivo, e
// nel corsivo del manuale l'OCR confonde sistematicamente lettere e cifre di forma simile. Le
// schede che ne uscivano storpiate venivano scartate in silenzio, e con esse l'incantesimo intero.
// Due confusioni ricorrenti, entrambe viste nel Manuale del Giocatore:
//   - la "I" iniziale della scuola letta come "1", "l" o "J" ("1llusione", "Jllusione");
//   - la cifra del livello letta come lettera ("Illusione di s° livello" per il 5).
// Si tenta la lettura corretta e la si accetta solo se il risultato è una scuola di magia vera
// (il chiamante controlla SCHOOLS), così una riga di prosa qualsiasi non può passare di qui.

// La riga va provata prima com'è e poi corretta, non "corretta solo se non matcha": "Jllusione di
// 5° livello" la forma del sottotitolo ce l'ha già (la J è una lettera come un'altra), quindi
// passava il pattern e veniva scartata più avanti perché "jllusione" non è una scuola vera — la
// correzione non veniva mai tentata. È il nome della SCUOLA a dire se la lettura è buona.
function leggiSottotitolo(grezzo) {
  for (const candidato of [grezzo, correggiSottotitoloIncantesimo(grezzo)]) {
    const leveled = candidato.match(SUBTITLE_LEVELED_RE);
    const cantrip = candidato.match(SUBTITLE_CANTRIP_RE);
    if (!leveled && !cantrip) continue;
    const scuola = (leveled?.[1] ?? cantrip?.[1] ?? "").trim().toLowerCase();
    if (SCHOOLS.has(scuola)) return { leveled, cantrip };
  }
  return null;
}

function findHeadings(lines) {
  const headings = [];
  for (let i = 0; i < lines.length - 1; i++) {
    // il sottotitolo a volte si spezza a fine colonna, con l'ordinale respinto alla riga dopo
    // ("Invocazione di 2" + "° livello", frequente nella Guida di Xanathar): senza ricomporlo la
    // scheda non veniva vista e finiva inglobata nella descrizione dell'incantesimo precedente.
    // La seconda riga deve essere corta, altrimenti si rischia di incollare una frase di prosa.
    let letto = leggiSottotitolo(lines[i + 1]);
    let righeSottotitolo = 1;
    if (!letto && i + 2 < lines.length && lines[i + 2].length <= 20) {
      letto = leggiSottotitolo(`${lines[i + 1]} ${lines[i + 2]}`);
      righeSottotitolo = 2;
    }
    if (!letto) continue;
    const { leveled, cantrip } = letto;

    const nameLine = lines[i];
    // scarta falsi positivi: la riga nome non deve essere a sua volta un'etichetta di campo
    // o un'altra sottotitolo (evita di agganciarsi a righe spurie)
    if (FIELD_RE.test(nameLine)) continue;
    if (nameLine.match(SUBTITLE_LEVELED_RE) || nameLine.match(SUBTITLE_CANTRIP_RE)) continue;

    headings.push({
      lineIndex: i,
      righeSottotitolo,
      nome: titleCaseItalian(nameLine),
      livello: leveled ? Number(leveled[2]) : 0,
      scuola: titleCaseItalian(leveled ? leveled[1] : cantrip[1]),
      rituale: Boolean(leveled && leveled[3]),
    });
  }
  return headings;
}

function extractFields(lines, start, end) {
  const fields = { "Tempo di Lancio": "", Gittata: "", Componenti: "", Durata: "" };
  let active = null;
  let bodyStart = start;

  for (let i = start; i < end; i++) {
    const line = lines[i].replace(/^[•\-]\s*/, "");
    const match = line.match(FIELD_RE);
    if (match) {
      active = match[1];
      fields[active] = match[2];
      bodyStart = i + 1;
      continue;
    }
    if (active && fields[active] !== undefined) {
      // una riga di continuazione (es. componenti materiali lunghe) appartiene al campo attivo
      // finché non iniziano tutti e 4 i campi e comincia la descrizione vera e propria
      const allFieldsSeen = FIELD_LABELS.every((l) => fields[l] !== "");
      if (!allFieldsSeen) {
        fields[active] += " " + line;
        bodyStart = i + 1;
        continue;
      }
    }
    break;
  }

  // le righe nel PDF sono spezzate per impaginazione, non per paragrafo: le uniamo con uno
  // spazio, tranne quando inizia un vero paragrafo nuovo (es. "Ai Livelli Superiori.")
  const bodyLines = lines.slice(bodyStart, end);
  const paragraphs = [];
  for (const line of bodyLines) {
    const startsNewParagraph = /^(Ai Livelli Superiori\.|•)/.test(line) || paragraphs.length === 0;
    if (startsNewParagraph) paragraphs.push(line);
    else paragraphs[paragraphs.length - 1] += " " + line;
  }
  const descrizione = fixDiceNotation(paragraphs.join("\n\n"));
  for (const label of FIELD_LABELS) fields[label] = fixDiceNotation(fields[label]);
  return { fields, descrizione, bodyStart };
}

function nomeStampato(nome, grafie) {
  const manuale = grafie.get(chiaveNome(nome));
  return manuale && grafiaAccettabile(nome, manuale) ? manuale : nome;
}

function parseBook(bookKey) {
  const { lines, nome } = loadLines(bookKey);
  const headings = findHeadings(lines);
  const books = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "books.json"), "utf-8"));
  const fineCapitolo = books[bookKey]?.fineIncantesimi;
  const grafie = indiceGrafieDelManuale(lines);

  const spells = headings.map((h, idx) => {
    const fieldsStart = h.lineIndex + 1 + h.righeSottotitolo;
    const prossimaScheda = idx + 1 < headings.length ? headings[idx + 1].lineIndex : lines.length;
    let fieldsEnd = prossimaScheda;
    for (let j = fieldsStart; j < prossimaScheda; j++) {
      if (isFineCapitolo(lines[j], fineCapitolo)) { fieldsEnd = j; break; }
    }
    const { fields, descrizione } = extractFields(lines, fieldsStart, fieldsEnd);
    return {
      nome: nomeStampato(h.nome, grafie),
      livello: h.livello,
      scuola: h.scuola,
      rituale: h.rituale,
      tempoDiLancio: fields["Tempo di Lancio"],
      gittata: fields.Gittata,
      componenti: fields.Componenti,
      durata: fields.Durata,
      descrizione,
      fonte: bookKey,
    };
  });

  return { nome, spells };
}

function main() {
  const bookKey = process.argv[2];
  if (!bookKey) {
    console.error("Uso: node parse-spells.mjs <chiave_libro>");
    process.exit(1);
  }

  const { nome, spells } = parseBook(bookKey);
  mkdirSync(PARSED_DIR, { recursive: true });
  const outPath = path.join(PARSED_DIR, `${bookKey}-incantesimi.json`);
  writeFileSync(outPath, JSON.stringify(spells, null, 2), "utf-8");

  console.log(`${nome}: ${spells.length} incantesimi trovati -> ${outPath}`);
  const suspicious = spells.filter(
    (s) => !s.tempoDiLancio || !s.gittata || !s.componenti || !s.durata || s.descrizione.length < 20,
  );
  console.log(`voci sospette (campo mancante o descrizione troppo corta): ${suspicious.length}`);
  if (suspicious.length > 0) {
    console.log(suspicious.slice(0, 10).map((s) => s.nome).join(", "));
  }
}

main();
