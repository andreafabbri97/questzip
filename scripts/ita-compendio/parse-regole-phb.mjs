// Regole vere del Manuale del Giocatore (non incantesimi/razze/classi/oggetti, già estratti
// altrove): Capitolo 6 "Opzioni di Personalizzazione" (multiclasse), Capitolo 7 "Usare i
// Punteggi di Caratteristica", Capitolo 8 "All'Avventura", Capitolo 9 "Combattimento",
// Capitolo 10 "Magia" (regole generali, non la lista incantesimi del Cap. 11), Appendice A
// "Condizioni". A differenza di Regole Principali/Costa della Spada (OCR da scansioni, vedi
// parse-regole.mjs), qui il testo è digitale VERO — stessa qualità del resto del compendio,
// quindi niente badge "scansionato" e una sezione per CAPITOLO (non per pagina): il confine
// capitolo è affidabile (verificato manualmente contro l'indice).
//
// RIFLUSSO IN PARAGRAFI (non solo pulizia riga per riga): l'estrazione grezza di 5etools/PyMuPDF
// va a capo a ogni riga VISIVA del PDF (giustificato a due colonne), non a ogni vero paragrafo —
// mostrare quelle righe una sotto l'altra così com'erano (bug segnalato dall'utente con
// screenshot, "sembra copia incolla su un blocco note") non è leggibile. Qui le righe vengono
// invece RICOMPOSTE in paragrafi fluidi: si accumulano finché non si incontra un vero punto
// elenco ("•", glifo reale nel testo, non un'euristica indovinata) o il cambio di pagina, con un
// controllo di continuità tra pagine (se la pagina successiva inizia con una minuscola, è la
// prosecuzione dello stesso paragrafo interrotto dal salto pagina, non un paragrafo nuovo).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

// Confini 0-based verificati contro l'indice del libro (extracted/phb.json: l'indice di pagina
// del JSON combacia 1:1 col numero di pagina stampato per queste pagine).
const CHAPTERS = [
  { titolo: "Capitolo 6: Opzioni di Personalizzazione", start: 163, end: 173 },
  { titolo: "Capitolo 7: Usare i Punteggi di Caratteristica", start: 173, end: 181 },
  { titolo: "Capitolo 8: All'Avventura", start: 181, end: 189 },
  { titolo: "Capitolo 9: Combattimento", start: 189, end: 201 },
  { titolo: "Capitolo 10: Magia", start: 201, end: 207 },
  { titolo: "Appendice A: Condizioni", start: 290, end: 293 },
];

const data = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, "phb.json"), "utf-8"));

// Righe da scartare del tutto: intestazioni di pagina ripetute, numeri di pagina isolati, e un
// singolo glifo decorativo "•"/"r" lasciato dal capolettera del capitolo (non un vero elenco).
// Le intestazioni ripetute ("CAPITOLO N I Titolo") a volte hanno lo stesso artefatto di
// spaziatura small-caps visto altrove nella pipeline ("C A P I TOLO" invece di "CAPITOLO") — un
// confronto sulla riga letterale le lasciava passare, finendo nel mezzo del testo riflussato
// (numeri di pagina compresi, es. "...seguenti: CA PITOLO 6 I OPZION I DI PERSONALIZZAZI O N E 1
// 69"). Bug reale trovato con un audit del testo generato, non a occhio. Confronto sulla versione
// COMPATTA (spazi rimossi), stesso principio già in uso in parse-mostri.mjs/parse-talenti.mjs per
// lo stesso artefatto.
function isNoise(line) {
  const t = line.trim();
  if (!t) return true;
  const compact = t.replace(/\s+/g, "");
  if (/^CAPITOLO\d/i.test(compact)) return true;
  if (/^APPENDICE[A-Z]/i.test(compact) && compact.length < 40) return true;
  if (/^\d{1,3}$/.test(t)) return true;
  if (t === "•" || t === "r") return true;
  return false;
}

// Sottotitoli veri dentro il testo (es. "MULTICLASSE", "COMPETENZE DEI MULTICLASSE") — il libro li
// stampa in small-caps, quindi restano SEMPRE su una riga propria del PDF senza alcuna lettera
// minuscola. Riconosciuti così: nessuna minuscola nella riga e almeno 3 lettere maiuscole (esclude
// righe di soli numeri/simboli, es. i valori della tabella slot incantesimo a pagina 165, che
// hanno zero lettere maiuscole). Bug reale trovato con uno screenshot ("perché il Manuale del
// Master è impaginato bene e il Giocatore no?"): finora queste righe finivano incollate in mezzo
// al paragrafo corrente invece di diventare un sottotitolo a sé — un intero capitolo diventava
// pochi blocchi enormi (12000+ caratteri) invece di tante sezioni leggibili.
function isHeadingCandidate(line) {
  const t = line.trim();
  if (!t || /[a-zàèéìòù]/.test(t)) return false;
  return (t.match(/[A-ZÀ-Ý]/g) ?? []).length >= 3;
}

// Stesso artefatto di spaziatura small-caps già noto altrove nella pipeline (es. nomi di talenti/
// mostri corrotti), qui applicato ai sottotitoli — il pattern è troppo irregolare per un fix
// automatico sicuro (a volte spezza dopo una singola lettera, a volte a metà parola), quindi
// dizionario verificato a mano invece di un'euristica generica, stesso principio già stabilito nel
// progetto. Chiavi = testo grezzo esatto della riga (dopo trim), verificate contro
// compendio_ita_talento per i nomi dei talenti già corretti in un giro precedente.
const HEADING_FIXES = {
  "MULTICLAS SE": "MULTICLASSE",
  "ESE M PIO DI M U LTICLASSE": "ESEMPIO DI MULTICLASSE",
  "PREREQUI SITI": "PREREQUISITI",
  "PR E R EQ U I S IT I  D I  M U LTI CLASSE": "PREREQUISITI DI MULTICLASSE",
  "PUNTI E SPERIENZA": "PUNTI ESPERIENZA",
  "BONUS DI C OMPETENZA": "BONUS DI COMPETENZA",
  "C OM PETENZE": "COMPETENZE",
  "CO M PETE N Z E  D E I  M U LT I C LASS E": "COMPETENZE DEI MULTICLASSE",
  "PRIVILEGI DI C LASSE": "PRIVILEGI DI CLASSE",
  "I N CA N TATO R E  M U LTICLASSE:": "INCANTATORE MULTICLASSE:",
  "SLOT I N CANTES I M O  PER LIVELLO D I  I N CANTES I M O": "SLOT INCANTESIMO PER LIVELLO DI INCANTESIMO",
  "AGGRE S SORE SELVAGGIO": "AGGRESSORE SELVAGGIO",
  "APPO STATO": "APPOSTATO",
  "C E C CHINO MAGICO": "CECCHINO MAGICO",
  "C OMBATTENTE A DUE ARMI": "COMBATTENTE A DUE ARMI",
  "C OMBATTENTE IN SELLA": "COMBATTENTE IN SELLA",
  "C ONDOTTIERO I SPIRATORE": "CONDOTTIERO ISPIRATORE",
  "C ORAZZE LEGGERE": "CORAZZE LEGGERE",
  "C ORAZZE MEDIE": "CORAZZE MEDIE",
  "C ORAZZE PESANTI": "CORAZZE PESANTI",
  "DUELLANTE D I FENSIVO": "DUELLANTE DIFENSIVO",
  "E SPERTO DI BALESTRE": "ESPERTO DI BALESTRE",
  "LINGUI STA": "LINGUISTA",
  "MAE STRO D 'ARMI": "MAESTRO D'ARMI",
  "MAE STRO D 'ARMI POS SENTI": "MAESTRO D'ARMI POSSENTI",
  "MAE STRO DEGLI SCUDI": "MAESTRO DEGLI SCUDI",
  "MAE STRO DELLE ARMATURE MEDIE": "MAESTRO DELLE ARMATURE MEDIE",
  "MAE STRO DELLE ARMI SU ASTA": "MAESTRO DELLE ARMI SU ASTA",
  "O S SERVATORE": "OSSERVATORE",
  "PU NTEG G I  D I  CARATT E R I ST I CA E M O D I F I CATO R I": "PUNTEGGI DI CARATTERISTICA E MODIFICATORI",
  "PASSO D I  VIAG G I O": "PASSO DI VIAGGIO",
  "DIVI DERE I L  GRU PPO": "DIVIDERE IL GRUPPO",
  "I NTERPRETAZIONE DEL RUOLO": "INTERPRETAZIONE DEL RUOLO",
  "SPE SE DELLO STILE DI VITA": "SPESE DELLO STILE DI VITA",
  "L0RDINE DI COMBATTIMENTO": "L'ORDINE DI COMBATTIMENTO",
  "I PASSI DEL COM BATTI M E NTO": "I PASSI DEL COMBATTIMENTO",
  "I L  TURNO DI UN PERSONAGGIO": "IL TURNO DI UN PERSONAGGIO",
  "C REATURE PRONE": "CREATURE PRONE",
  "I NTERAG I R E  CON CLI 0CC ETTI CIRCOSTANTI": "INTERAGIRE CON GLI OGGETTI CIRCOSTANTI",
  "CATEG O R I E  D I  TAG L I A": "CATEGORIE DI TAGLIA",
  "D I SI MPEGNO": "DISIMPEGNO",
  "LANCIARE UN INCANTE SIMO": "LANCIARE UN INCANTESIMO",
  "NASC ONDERSI": "NASCONDERSI",
  "I M PROVVISARE U N 'AZIONE": "IMPROVVISARE UN'AZIONE",
  "EFFETTUARE UN ATTAC C O": "EFFETTUARE UN ATTACCO",
  "TIRI PER C OLPIRE": "TIRI PER COLPIRE",
  "MODIFICATORI AL TÌRO": "MODIFICATORI AL TIRO",
  "ATTAC CHI A DI STANZA": "ATTACCHI A DISTANZA",
  "ATTAC CHI I N  MISCHIA": "ATTACCHI IN MISCHIA",
  "CONTESE I N  COM BATTI M E NTO": "CONTESE IN COMBATTIMENTO",
  "C OPERTURA": "COPERTURA",
  "SCENDERE A 0 PUNTI FERITA": "SCENDERE A 0 PUNTI FERITA",
  "DESCRIVERE CLI EFFETTI DEI DAN N I": "DESCRIVERE GLI EFFETTI DEI DANNI",
  "TRAMORTIRE UNA C REATURA": "TRAMORTIRE UNA CREATURA",
  "C OMBATTERE IN SELLA": "COMBATTERE IN SELLA",
  "C ONTROLLARE UNA CAVALCATURA": "CONTROLLARE UNA CAVALCATURA",
  "C OMBATTERE SOTT'AC QUA": "COMBATTERE SOTT'ACQUA",
  "LIVELLO DELL' I NCANTE SIMO": "LIVELLO DELL'INCANTESIMO",
  "SLOT I NCANTE SIMO": "SLOT INCANTESIMO",
  "TRUC CHETTI": "TRUCCHETTI",
  "LANCIARE I N CANTES I M I  I N  ARMATU RA": "LANCIARE INCANTESIMI IN ARMATURA",
  "C OMPONENTI": "COMPONENTI",
  "LE SCUOLE DI MAG IA": "LE SCUOLE DI MAGIA",
  "C OMBINARE EFFETTI MAGICI": "COMBINARE EFFETTI MAGICI",
  "LA TRAMA DELLA MAC IA": "LA TRAMA DELLA MAGIA",
  "P I E T R I F I C ATO": "PIETRIFICATO",
  "I N V I S I B I L E": "INVISIBILE",
  "I N DEBOLI M E NTO": "INDEBOLIMENTO",
  "P R I V O  D I  S E N S I": "PRIVO DI SENSI",
  "TR ATT E N U T O": "TRATTENUTO",
  "TROVARE UN 0CC ETTO NASCOSTO": "TROVARE UN OGGETTO NASCOSTO",
  "C O STITUZIONE": "COSTITUZIONE",
  "I NTELLIGENZA": "INTELLIGENZA",
  "D E STREZZA": "DESTREZZA",
  "C ONTE SE": "CONTESE",
  "PROVE PAS SIVE": "PROVE PASSIVE",
  "C OLLABORARE": "COLLABORARE",
  "NASCO NDERSI": "NASCONDERSI",
  "VARIANTE: GIOCARE SU U NA GRIGLIA": "VARIANTE: GIOCARE SU UNA GRIGLIA",
};

// Unisce due frammenti di testo separati da un a-capo del PDF originale: se il frammento
// precedente finisce con "-" è una parola spezzata a fine riga (es. "legge-" + "ra" -> "leggera",
// non "legge-ra") — il trattino va tolto, non solo lo spazio. Bug reale trovato con una code
// review: il vecchio codice evitava già di aggiungere uno spazio in questo caso, ma dimenticava
// di togliere il trattino stesso, lasciandolo visibile in mezzo alla parola.
function joinAcrossLineBreak(prevText, content) {
  return prevText.endsWith("-") ? prevText.slice(0, -1) + content : prevText + " " + content;
}

// Ogni pagina diventa una lista di "blocchi" (paragrafo o punto elenco), riflludendo le righe
// visive del PDF in prosa continua tramite spazi invece che a-capo. Il TIPO del primissimo
// blocco di una pagina (se non inizia con un bullet "•") non è determinabile qui: potrebbe essere
// la prosecuzione di un punto elenco interrotto dalla pagina precedente — resta "p" solo come
// valore di default, `assembleChapter` lo corregge quando ricuce le pagine tra loro.
function pageBlocks(raw) {
  const lines = (raw ?? "").split("\n").filter((l) => !isNoise(l));
  const blocks = []; // { type: "p" | "li" | "h", text }
  for (const rawLine of lines) {
    const line = rawLine.trim();
    const isBullet = line.startsWith("•");
    const content = (isBullet ? line.slice(1) : line).trim();
    if (isBullet) {
      blocks.push({ type: "li", text: content });
    } else if (isHeadingCandidate(line)) {
      // Un sottotitolo non si fonde MAI con quello che viene prima (altrimenti sparirebbe in
      // mezzo al paragrafo precedente) — sempre un blocco NUOVO a sé, mai un'appendice.
      blocks.push({ type: "h", text: HEADING_FIXES[content] ?? content });
    } else if (blocks.length > 0 && blocks[blocks.length - 1].type !== "h") {
      const last = blocks[blocks.length - 1];
      last.text = joinAcrossLineBreak(last.text, content);
    } else {
      blocks.push({ type: "p", text: content });
    }
  }

  // Falso positivo dell'euristica sottotitolo: la primissima riga di ogni capitolo è il capolettera
  // decorativo (small-caps, es. "ENTRE LA COMBINAZIONE DI PUNTEGGI DI") che continua a metà frase
  // sulla riga successiva ("caratteristica, classe e background...") — non un vero sottotitolo, la
  // prosecuzione con lettera minuscola lo tradisce. Ricongiunta al blocco successivo invece di
  // restare un "sottotitolo" isolato di una riga sola.
  for (let i = 0; i < blocks.length - 1; i++) {
    if (blocks[i].type === "h" && /^[a-zàèéìòù]/.test(blocks[i + 1].text)) {
      blocks[i + 1].text = joinAcrossLineBreak(blocks[i].text, blocks[i + 1].text);
      blocks.splice(i, 1);
      i--;
    }
  }
  return blocks;
}

function assembleChapter(start, end) {
  const allBlocks = [];
  for (let i = start; i < end; i++) {
    const pageBlk = pageBlocks(data.pages[i].text);
    if (pageBlk.length === 0) continue;
    const prev = allBlocks[allBlocks.length - 1];
    const first = pageBlk[0];
    // Continuità tra pagine: un blocco che comincia con una minuscola e NON è un bullet vero
    // (type "p", il default assegnato da pageBlocks a un primo blocco senza "•") è quasi certamente
    // la prosecuzione del blocco — di QUALSIASI tipo, incluso un punto elenco "li" — con cui la
    // pagina precedente si era interrotta. Bug reale trovato con una code review: la versione
    // precedente richiedeva `prev.type === first.type`, quindi (a) un elenco puntato interrotto a
    // metà voce da un salto pagina perdeva il collegamento (la prosecuzione, priva di bullet,
    // veniva etichettata "p" e il confronto falliva) apparendo come un paragrafo estraneo, e (b)
    // una pagina che iniziava con un bullet VERO ma minuscolo veniva erroneamente fusa nel bullet
    // precedente invece di restare un punto elenco a sé (perché type "li" combaciava con "li" e la
    // minuscola faceva scattare la fusione). Il controllo su `first.type === "p"` risolve entrambi:
    // un bullet vero ha sempre type "li" e non entra mai in questo ramo.
    if (prev && first.type === "p" && /^[a-zàèéìòù]/.test(first.text)) {
      prev.text = joinAcrossLineBreak(prev.text, first.text);
      allBlocks.push(...pageBlk.slice(1));
    } else {
      allBlocks.push(...pageBlk);
    }
  }

  // Righe "- voce" consecutive raggruppate in un unico blocco elenco (separate da "\n" semplice,
  // così TestoStrutturato le riconosce come lista); i paragrafi restano separati da riga vuota.
  const parts = [];
  let liBuffer = [];
  const flushLi = () => {
    if (liBuffer.length) {
      parts.push(liBuffer.map((t) => `- ${t}`).join("\n"));
      liBuffer = [];
    }
  };
  for (const b of allBlocks) {
    if (b.type === "li") {
      liBuffer.push(b.text);
    } else {
      flushLi();
      parts.push(b.text);
    }
  }
  flushLi();
  return parts.join("\n\n").replace(/[ \t]+/g, " ").trim();
}

// Ogni capitolo apre con un capolettera decorativo (prima lettera enorme, resto della prima
// parola/riga in small-caps) — l'estrazione perde SEMPRE quella prima lettera perché il
// capolettera è un elemento grafico separato dal flusso di testo normale del PDF. Pattern
// verificato a mano su tutti e 6 i capitoli (non un'euristica generica applicata alla cieca):
// sostituzione del PREFISSO del primo paragrafo (non più dell'intera prima riga, dato che ora le
// righe sono riaccorpate in blocchi di prosa).
const FIRST_WORD_FIXES = {
  "Capitolo 6: Opzioni di Personalizzazione": ["ENTRE", "MENTRE"],
  "Capitolo 7: Usare i Punteggi di Caratteristica": ["E S E I", "LE SEI"],
  "Capitolo 8: All'Avventura": ["VVENTURARSI", "AVVENTURARSI"],
  "Capitolo 9: Combattimento": ["L CLANGORE", "IL CLANGORE"],
  "Capitolo 10: Magia": ["A MAGIA", "LA MAGIA"],
  "Appendice A: Condizioni": ["E CONDIZIONI", "LE CONDIZIONI"],
};

const sections = CHAPTERS.map(({ titolo, start, end }) => {
  let testo = assembleChapter(start, end);
  const fix = FIRST_WORD_FIXES[titolo];
  if (fix && testo.startsWith(fix[0])) testo = fix[1] + testo.slice(fix[0].length);
  // Artefatto residuo del capolettera del Cap. 8, dentro la stessa prima parola.
  testo = testo.replace("TOM BA DEGLI ORRORI", "TOMBA DEGLI ORRORI");
  return { titolo, testo, pagina: start + 1, fonte: "phb_regole" };
});

const outPath = path.join(PARSED_DIR, "phb-regole.json");
writeFileSync(outPath, JSON.stringify(sections, null, 2), "utf-8");
for (const s of sections) console.log(`${s.titolo}: ${s.testo.length} caratteri`);
console.log(`-> ${outPath}`);
