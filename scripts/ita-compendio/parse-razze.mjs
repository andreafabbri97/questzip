// Estrae le razze dal Manuale del Giocatore. Formato: "TRATTI DEGLI <RAZZA>" (maiuscolo) seguito
// da un paragrafo introduttivo, poi una lista di tratti "Etichetta. Descrizione." sulla stessa
// riga (es. "Età. Gli elfi raggiungono la maturità..."), poi eventuali sottorazze con lo stesso
// schema, introdotte da un titolo TUTTO MAIUSCOLO (es. "ELFO ALTO"). Solo 9 razze nel PHB: a
// differenza di incantesimi/mostri qui l'elenco delle intestazioni è hardcoded (nessun bisogno
// di un'euristica generica per un set così piccolo e noto).
//
// Uso: node parse-razze.mjs <chiave_libro>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ricomponiParoleSpezzate, titoloItaliano } from "../../lib/compendio-ocr.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

// Negli altri manuali le razze sono decine e i loro nomi non si sanno in anticipo: l'intestazione
// stessa li dichiara ("TRATTI DELL'AARAKOCRA", "TRATTI DEL GENASI DELL'ACQUA"). L'apostrofo esce
// spesso come "1" ("TRATTI DELL1AASIMAR"), e il maiuscoletto stacca l'ultima lettera del nome
// ("TRATTI DELL'ORC O", "TRATTI DEL MORFIC O") — entrambi già visti altrove nella pipeline.
// "TRATTI" stesso esce storpiato dove il maiuscoletto stringe la doppia T: nel Tesoro dei Draghi
// di Fizban si legge "TRA'ITI DEL DRAGONIDE GEMMA" e "TRAITI DEL DRAGONIDE METALLICO".
const ANCORA_GENERICA = /^TRA[TI'’1]{2,4}\s+(?:DEGLI|DELLE|DELLA|DELLO|DELL['’1I]?|DEL|DEI)\s*(.+)$/i;
// il nome può finire su due righe: "TRATTI DELLO GNOMO DELLE" + "PROFONDITÀ"
const PREPOSIZIONE_FINALE = /\s(?:DEGLI|DELLE|DELLA|DELLO|DELL['’1I]?|DEL|DEI|DI)$/i;

const RACE_HEADINGS = [
  { anchor: "TRATTIDEGLIELFI", nome: "Elfo" },
  { anchor: "TRATTIDEGLIHALFLING", nome: "Halfling" },
  { anchor: "TRATTIDEINANI", nome: "Nano" },
  { anchor: "TRATTIDEGLIUMANI", nome: "Umano" },
  { anchor: "TRATTIDEIDRAGONIDI", nome: "Draconide" },
  { anchor: "TRATTIDEGLIGNOMI", nome: "Gnomo" },
  { anchor: "TRATTIDEIMEZZELFI", nome: "Mezzelfo" },
  { anchor: "TRATTIDEIMEZZORCHI", nome: "Mezzorco" },
  { anchor: "TRATTIDEITIEFLING", nome: "Tiefling" },
];

// stessa corruzione "g" letta come altro carattere già vista in incantesimi/mostri, qui
// concentrata in alcune sezioni (Halfling, Mezzorco, Elfo Oscuro, Draconide): correzioni
// mirate trovate ispezionando l'output, non un fix generico (rischierebbe di correggere "g"
// legittime altrove)
const TEXT_FIXES = [
  [/Puntessi/g, "Punteggi"],
  [/Taslia\b/g, "Taglia"],
  [/Corassioso/g, "Coraggioso"],
  [/Asilità Ha\/flins/g, "Agilità Halfling"],
  [/Linsuassi/g, "Linguaggi"],
  [/Ma6ia/g, "Magia"],
  [/Soliìo/g, "Soffio"],
  [/LinguaUi/g, "Linguaggi"],
  // la doppia f del maiuscoletto esce in tre modi diversi nel Tesoro dei Draghi di Fizban
  [/\bSo(?:ffl|Dì|Hì|ffì)o\b/g, "Soffio"],
];
function fixText(text) {
  return TEXT_FIXES.reduce((acc, [pattern, replacement]) => acc.replace(pattern, replacement), text);
}

const HEADING_STOPWORDS = new Set(["di", "dei", "del", "della", "degli", "delle", "e"]);
function titleCaseHeading(raw) {
  let isFirstWord = true;
  return raw
    .toLowerCase()
    .split(/(\s+|[()])/)
    .map((part) => {
      if (!/^[a-zà-ÿ]/.test(part)) return part;
      const keepLower = !isFirstWord && HEADING_STOPWORDS.has(part);
      isFirstWord = false;
      return keepLower ? part : part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

/** "ORC O" -> "ORCO": il maiuscoletto stacca l'ultima lettera del nome. */
function ricomponiUltimaLettera(nome) {
  return nome.replace(/\s+([A-ZÀ-Ù])$/, "$1");
}

function compact(line) {
  return line.replace(/\s+/g, "").toUpperCase();
}

// una riga "Etichetta. Descrizione" ha, prima del primo punto, solo parole con iniziale
// maiuscola o piccoli connettivi (di/dei/del/...), fino a un massimo di 6 parole/50 caratteri:
// distingue un tratto vero (es. "Incremento dei Punteggi di Caratteristica.") da una normale
// frase che termina per caso con un punto a metà riga
const CONNECTORS = new Set(["di", "dei", "del", "della", "degli", "delle", "dell'", "nel", "nell'", "e", "a", "con", "alle", "ai", "al"]);
function matchTraitLabel(line, iniziaPeriodo) {
  const dotIndex = line.indexOf(". ");
  if (dotIndex === -1 || dotIndex > 55) return null;
  const label = line.slice(0, dotIndex);
  const rest = line.slice(dotIndex + 2);
  if (!rest.trim()) return null;
  // i riquadri laterali "cosa pensano le altre razze" hanno la stessa forma "Nome. Testo" di
  // un tratto vero, ma il testo è sempre una citazione tra virgolette: le escludiamo così
  if (rest.trim().startsWith('"')) return null;
  const words = label.split(/\s+/);
  if (words.length > 6) return null;
  // la prima parola dev'essere un vero contenuto (mai un connettivo: scarta frasi come
  // "di Greyhawk e Forgotten Realms." che per coincidenza passerebbero il resto del controllo)
  if (CONNECTORS.has(words[0]) || !/^[A-ZÀ-Þ]/.test(words[0])) return null;
  // Un tratto apre sempre un periodo nuovo: la riga prima si chiude con un punto. Senza questo
  // vincolo bastava che una parola con l'iniziale maiuscola capitasse a inizio riga seguita da un
  // punto per inventare un tratto — "…dall'influenza della Selva / Fatata. Tuttavia, nella Selva
  // Fatata scoprirono…" dava all'elfo del mare un tratto "Fatata" con dentro 1.200 caratteri di
  // storia degli elfi.
  if (!iniziaPeriodo) return null;
  if (words.every((w) => CONNECTORS.has(w) || /^[A-ZÀ-Þ]/.test(w))) return { label, rest };
  // Fuori dal Manuale del Giocatore i nomi dei tratti non sono in stile titolo ma con la sola
  // iniziale maiuscola ("Tipo di creatura.", "Costituzione robusta.", "Comunicazione con flora e
  // fauna."), e con il solo controllo qui sopra il Firbolg risultava avere due tratti invece di
  // sei. Lì il segnale che non è una frase qualsiasi finita per caso con un punto è la POSIZIONE:
  // un tratto apre sempre un periodo nuovo, cioè la riga prima si chiude con un punto.
  return { label, rest };
}

// La testatina che si ripete a ogni pagina ha la forma "CAPITOLO 1 I CREAZIONE DEL PERSONAGGIO",
// con una I al posto della barra verticale; il TITOLO vero del capitolo successivo — che invece
// chiude la scheda — è scritto con i due punti ("CAPITOLO 3 : CLASSI"). Senza questa distinzione
// la testatina veniva scambiata per il capitolo dopo e il dragonide cromatico del Tesoro dei
// Draghi di Fizban perdeva gli ultimi due tratti, stampati sotto di essa.
function isPageHeaderNoise(line) {
  const compactLine = compact(line);
  if (!compactLine.includes("CAPITOLO")) return false;
  return compactLine.includes("RAZZE") || (/\sI\s/.test(line) && !line.includes(":"));
}

// titolo di sottorazza: ogni parola inizia con maiuscola (2-4 parole) SENZA punto — a differenza
// di un tratto ("Etichetta. Testo") è solo un'intestazione autonoma. Non richiediamo che TUTTA
// la parola sia maiuscola (solo l'iniziale) perché il rendering small-caps del PDF a volte
// estrae le lettere successive alla prima come minuscole (es. "ELFO OSCURO (DRow)")
function isSubraceHeading(line) {
  if (line.length > 40 || line.length < 3) return false;
  if (line.includes(".")) return false;
  if (isPageHeaderNoise(line)) return false;
  const words = line.replace(/[()]/g, "").split(/\s+/);
  return words.length <= 5 && words.every((w) => /^[A-ZÀ-Þ]/.test(w) || /^\d/.test(w));
}

// Non basta "riga tutta maiuscola": dentro i tratti ci sono i titoli delle tabelle ("DISCENDENZA
// DRACONICA") e le intestazioni di sottorazza, e tagliando lì si perdevano metà scheda e tutte le
// sottorazze. La sezione dei tratti finisce solo dove ricomincia la parte descrittiva, cioè al
// titolone della RAZZA successiva o all'apertura del capitolo dopo — un elenco chiuso e noto.
const TITOLI_DI_SEZIONE = new Set([
  "NANO", "ELFO", "HALFLING", "UMANO", "DRAGONIDE", "GNOMO", "MEZZELFO", "MEZZORCO", "TIEFLING",
]);

function isTitoloDiSezione(line, titoli) {
  if (line.includes(".")) return false;
  const lettere = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (lettere.length < 4 || lettere !== lettere.toUpperCase()) return false;
  // oltre ai nomi delle razze, i titoli che aprono una sezione nuova del libro: sono un elenco
  // chiuso e verificabile, non un'euristica sul maiuscolo — che taglierebbe anche i riquadri
  // laterali ("SEMPRE ENTUSIASTI" in mezzo ai tratti dello gnomo)
  return titoli.has(compact(line)) || /^(CAPITOLO|OPZIONI|APPENDICE|INDICE|GLOSSARIO)/.test(compact(line));
}

// i numeri di pagina isolati restano appiccicati in coda all'ultimo tratto ("...a scelta. 31 32")
function isNumeroDiPagina(line) {
  return /^\d{1,3}$/.test(line.trim());
}

// L'impaginazione lascia qua e là un glifo su una riga tutta sua (il punto elenco decorativo, una
// virgola staccata): non è testo, ma spezzava il periodo e con esso il riconoscimento del tratto
// successivo — il githzerai perdeva così la Velocità, e senza velocità la scheda non si può
// nemmeno verificare contro l'inglese.
function isSegnoIsolato(line) {
  return !/[A-Za-zÀ-ÿ0-9]/.test(line);
}

function loadLines(bookKey) {
  const raw = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, `${bookKey}.json`), "utf-8"));
  const lines = [];
  // pagina di ogni riga: fuori dal Manuale del Giocatore serve a non far debordare una scheda
  // oltre le proprie pagine (vedi parseBook)
  const pagine = [];
  for (const page of raw.pages) {
    for (const line of page.text.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      lines.push(t);
      pagine.push(page.page);
    }
  }
  return { lines, pagine };
}

function parseTraitsBlock(lines, start, end, titoli) {
  const traits = [];
  const introLines = [];
  const subraces = [];
  let activeSubrace = null;
  // il testo di un tratto continua sulle righe seguenti finché non inizia il prossimo tratto/
  // sottorazza: la lista "traits"/sottorazza tiene un riferimento all'ultimo tratto aperto
  let openTrait = null;
  // "la riga prima si chiude con un punto" va calcolato sull'ultima riga di TESTO: una testatina di
  // pagina o un numero di pagina in mezzo non rompono il periodo — è così che l'elfo del Manuale
  // del Giocatore perdeva "Sensi Acuti", che nel PDF viene subito dopo "C A P ITOLO 2 I RAZZE".
  let iniziaPeriodo = true;

  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (isPageHeaderNoise(line) || isNumeroDiPagina(line) || isSegnoIsolato(line)) continue;
    // I tratti finiscono ben prima della RAZZA successiva: il confine "TRATTI DEI ..." lascia in
    // mezzo tutta la parte descrittiva di quella dopo, e finiva incollata all'ultimo tratto (i
    // Linguaggi del tiefling contenevano l'apertura del capitolo sulle classi, il Talento
    // dell'umano il racconto d'apertura dei draconidi). Il titolo che riapre la prosa è stampato
    // tutto in maiuscolo, mentre i titoli di sottorazza hanno solo l'iniziale maiuscola.
    if (isTitoloDiSezione(line, titoli)) break;

    const traitMatch = matchTraitLabel(line, iniziaPeriodo);
    iniziaPeriodo = /[.!?:]$/.test(line);
    if (traitMatch) {
      const target = activeSubrace ? activeSubrace.tratti : traits;
      openTrait = { nome: traitMatch.label, testo: traitMatch.rest };
      target.push(openTrait);
      continue;
    }
    // una sottorazza può comparire solo DOPO che il tratto "Sottorazze" è stato dichiarato nella
    // razza principale: un sottotitolo narrativo prima di quel punto (es. "SEMPRE ENTUSIASTI")
    // non è mai una vera sottorazza, anche se ha la stessa forma tipografica
    const sottorazzeDichiarate = traits.some((t) => t.nome === "Sottorazze");
    if (sottorazzeDichiarate && isSubraceHeading(line)) {
      // il testo narrativo della razza SUCCESSIVA inizia molto prima della sua sezione
      // "TRATTI ...", quindi ricade nel blocco di questa razza: due intitolazioni di
      // sottorazza di fila senza nessun tratto vero in mezzo è il segno che siamo finiti
      // fuori dalle sottorazze reali e dentro quel testo — ci fermiamo qui
      if (activeSubrace && activeSubrace.tratti.length === 0) break;
      activeSubrace = { nome: line, tratti: [] };
      subraces.push(activeSubrace);
      openTrait = null;
      continue;
    }
    // Un titolo tutto maiuscolo che non è la razza successiva è un RIQUADRO laterale ("ELFI DI
    // VARI REAMI" in mezzo ai tratti dell'elfo del mare, per via delle colonne che l'estrazione
    // mescola): non chiude la scheda, ma chiude il tratto aperto, altrimenti quel tratto si
    // mangia le due colonne del riquadro — 1.200 caratteri di storia degli elfi dentro "Fatata".
    const lettere = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (!line.includes(".") && lettere.length >= 8 && lettere === lettere.toUpperCase()) {
      openTrait = null;
      iniziaPeriodo = true;
      continue;
    }
    if (openTrait) {
      openTrait.testo += " " + line;
      continue;
    }
    if (traits.length === 0 && !activeSubrace) introLines.push(line);
  }

  // l'ultima sottorazza aperta senza tratti è quasi certamente un falso positivo di cui sopra
  if (subraces.length > 0 && subraces.at(-1).tratti.length === 0) subraces.pop();

  return { introduzione: introLines.join(" "), tratti: traits, sottorazze: subraces };
}

/**
 * Prosa fra il titolone della razza e l'intestazione dei suoi tratti — la descrizione vera. Si
 * risale dall'intestazione fino al titolo, saltando testatine, numeri di pagina e glifi isolati.
 */
function prosaPrimaDeiTratti(lines, anchor, titoli) {
  const raccolte = [];
  for (let i = anchor.lineIndex - 1; i >= 0 && i > anchor.lineIndex - 60; i--) {
    const line = lines[i];
    if (isTitoloDiSezione(line, titoli)) return raccolte.reverse().join(" ").replace(/\s+/g, " ").trim();
    if (isPageHeaderNoise(line) || isNumeroDiPagina(line) || isSegnoIsolato(line)) continue;
    // un'altra intestazione di tratti vuol dire che siamo scivolati nella razza precedente
    if (ANCORA_GENERICA.test(line.replace(/\s+/g, " "))) return "";
    raccolte.push(line);
  }
  return "";
}

function parseBook(bookKey) {
  const { lines, pagine } = loadLines(bookKey);
  const anchors = [];
  for (let i = 0; i < lines.length; i++) {
    const c = compact(lines[i]);
    const heading = RACE_HEADINGS.find((h) => c === h.anchor);
    if (heading) {
      anchors.push({ lineIndex: i, nome: heading.nome });
      continue;
    }
    // fuori dal Manuale del Giocatore il nome della razza si legge dall'intestazione stessa
    if (bookKey === "phb") continue;
    // l'estrazione lascia ogni tanto un segno tipografico davanti all'intestazione
    // ("'TRATTI DELL1ELADRIN"): senza toglierlo, l'Eladrin non veniva riconosciuto affatto e i
    // suoi tratti finivano dentro la scheda del Duergar, che ne risultava con diciassette
    const riga = lines[i].replace(/\s+/g, " ").replace(/^['’"·•]+/, "").trim();
    const m = riga.match(ANCORA_GENERICA);
    // l'indice del libro ha la stessa forma ("Tratti del genasi dell'acqua ....... 16"): un titolo
    // vero è in maiuscolo e non porta puntini di guida
    if (!m || riga.includes("..") || riga !== riga.toUpperCase()) continue;
    let nome = m[1].trim();
    if (PREPOSIZIONE_FINALE.test(nome)) nome = `${nome} ${lines[i + 1]?.trim() ?? ""}`.trim();
    // il maiuscoletto stacca lettere anche in mezzo al nome ("DRAGONIDE C ROMATICO")
    anchors.push({ lineIndex: i, nome: ricomponiParoleSpezzate(titoloItaliano(ricomponiUltimaLettera(nome))) });
  }

  // Il confine di fine scheda è il titolone della razza SUCCESSIVA, stampato tutto in maiuscolo:
  // senza, l'ultimo tratto si porta dietro tutta la prosa che apre la razza dopo. Nel Manuale del
  // Giocatore quei titoli sono un elenco noto; altrove sono i nomi che le ancore hanno appena
  // dichiarato, quindi non c'è nulla da scrivere a mano.
  // anche la prima parola dei nomi composti: le quattro schede "Genasi dell'..." sono precedute da
  // un unico titolone "GENASI", e senza di esso l'ultimo tratto del Firbolg si portava dietro
  // l'apertura di quel capitoletto
  const titoli = new Set([
    ...TITOLI_DI_SEZIONE,
    ...anchors.flatMap((a) => [compact(a.nome), compact(a.nome.split(" ")[0])]),
  ]);

  const fixTrait = (t) => ({ nome: fixText(t.nome), testo: fixText(t.testo) });

  const races = anchors.map((anchor, idx) => {
    // Nel Manuale del Giocatore una razza occupa più pagine e il confine è il titolone della
    // successiva; negli altri manuali sta invece in una pagina, al massimo due, e l'ultima scheda
    // del capitolo non ha nessun titolo noto dopo di sé — senza un tetto, il dragonide metallico
    // del Tesoro dei Draghi si portava dietro cinque privilegi della sottoclasse del monaco.
    const finePagine =
      bookKey === "phb"
        ? lines.length
        : pagine.findIndex((p, i) => i > anchor.lineIndex && p > pagine[anchor.lineIndex] + 1);
    const limite = finePagine === -1 ? lines.length : finePagine;
    const end = Math.min(
      idx + 1 < anchors.length ? anchors[idx + 1].lineIndex : anchor.lineIndex + 400,
      limite,
      lines.length,
    );
    const { introduzione, tratti, sottorazze } = parseTraitsBlock(lines, anchor.lineIndex + 1, end, titoli);
    return {
      nome: anchor.nome,
      // Fuori dal Manuale del Giocatore la descrizione della razza è stampata PRIMA
      // dell'intestazione dei tratti, sotto il titolone: senza andarla a prendere, l'introduzione
      // della scheda sarebbe la sola riga di servizio ("Un personaggio aarakocra possiede i
      // seguenti tratti razziali").
      introduzione: fixText(prosaPrimaDeiTratti(lines, anchor, titoli) || introduzione),
      tratti: tratti.map(fixTrait),
      sottorazze: sottorazze.map((s) => ({
        nome: titleCaseHeading(fixText(s.nome)),
        tratti: s.tratti.map(fixTrait),
      })),
      fonte: bookKey,
    };
  });

  return races;
}

function main() {
  const bookKey = process.argv[2];
  if (!bookKey) {
    console.error("Uso: node parse-razze.mjs <chiave_libro>");
    process.exit(1);
  }

  const races = parseBook(bookKey);
  mkdirSync(PARSED_DIR, { recursive: true });
  const outPath = path.join(PARSED_DIR, `${bookKey}-razze.json`);
  writeFileSync(outPath, JSON.stringify(races, null, 2), "utf-8");

  console.log(`${races.length} razze trovate -> ${outPath}`);
  for (const r of races) {
    console.log(`  ${r.nome}: ${r.tratti.length} tratti, ${r.sottorazze.length} sottorazze`);
  }
}

main();
