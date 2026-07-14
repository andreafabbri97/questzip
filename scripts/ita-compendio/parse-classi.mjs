// Estrae i privilegi di classe dal Manuale del Giocatore. NON include la tabella di
// progressione livelli: nel testo estratto linearmente le celle della tabella escono in un
// ordine sparso e irrecuperabile senza un'estrazione basata sulle coordinate geometriche dei
// caratteri nella pagina (un lavoro a sé, non tentato qui). Estrae invece: dado vita, punti
// ferita, competenze, equipaggiamento e l'elenco "privilegi", con il livello dedotto dal testo
// stesso ("Al 3° livello...", "A partire dal 5° livello..."). L'elenco privilegi include SIA i
// privilegi di classe base SIA quelli delle sottoclassi, appiattiti in un'unica lista (separarli
// richiederebbe rilevare quale privilegio base introduce la scelta della sottoclasse — non
// tentato: il nome del privilegio non segue uno schema fisso da libro a libro).
//
// Uso: node parse-classi.mjs <chiave_libro>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED_DIR = path.join(SCRIPT_DIR, "extracted");
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const CLASS_NAMES = [
  "Barbaro", "Bardo", "Chierico", "Druido", "Guerriero", "Ladro",
  "Mago", "Monaco", "Paladino", "Ranger", "Stregone", "Warlock",
];

const SECTION_LABELS = ["Dadi Vita", "Punti Ferita al 1° Livello", "Punti Ferita ai Livelli Successivi", "Armature", "Armi", "Strumenti", "Tiri Salvezza", "Abilità"];
const SECTION_FIELD_RE = new RegExp(`^(${SECTION_LABELS.join("|")}):\\s*(.*)$`);
const SUBSECTION_HEADINGS = new Set(["PUNTI FERITA", "COMPETENZE", "EQUIPAGGIAMENTO"]);

function compact(line) {
  return line.replace(/\s+/g, "").toUpperCase();
}

function isPageHeaderNoise(line) {
  const c = compact(line);
  return c.includes("CAPITOLO") && c.includes("CLASSI");
}

// intestazione di privilegio: ogni parola inizia con maiuscola, niente due punti, corta —
// stesso principio delle intestazioni di sottorazza (tollera il rendering small-caps che a
// volte estrae le lettere successive alla prima come minuscole)
function isFeatureHeading(line) {
  if (line.length > 45 || line.length < 3) return false;
  if (line.includes(":") || line.includes(".")) return false;
  if (isPageHeaderNoise(line)) return false;
  if (SUBSECTION_HEADINGS.has(line)) return false;
  const words = line.replace(/[()]/g, "").split(/\s+/);
  return words.length <= 6 && words.every((w) => /^[A-ZÀ-Þ]/.test(w) || /^\d/.test(w));
}

function extractLevel(text) {
  const m = text.match(/(\d+)°\s*livello/);
  return m ? Number(m[1]) : 1;
}

function titleCase(raw) {
  const stop = new Set(["di", "dei", "del", "della", "degli", "delle", "e", "a"]);
  let first = true;
  return raw
    .toLowerCase()
    .split(/(\s+)/)
    .map((w) => {
      if (!/^[a-zà-ÿ]/.test(w)) return w;
      const keep = !first && stop.has(w);
      first = false;
      return keep ? w : w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join("");
}

function loadLines(bookKey) {
  const raw = JSON.parse(readFileSync(path.join(EXTRACTED_DIR, `${bookKey}.json`), "utf-8"));
  const lines = [];
  for (const page of raw.pages) {
    for (const line of page.text.split("\n")) {
      const t = line.trim();
      if (t) lines.push(t);
    }
  }
  return lines;
}

// "PRIVILEGI DI CLASSE" con tolleranza per l'artefatto O/0, l/1 e lo spazio spurio "CLAS SE"
function isPrivilegiAnchor(line) {
  const c = compact(line).replace(/0/g, "O").replace(/1/g, "I");
  return c === "PRIVILEGIDICLASSE" || c === "PRIVILEGIDICLASSE".replace("SS", "S S");
}

function findClassAnchors(lines) {
  const privilegiAnchors = [];
  for (let i = 0; i < lines.length; i++) {
    if (isPrivilegiAnchor(lines[i])) privilegiAnchors.push(i);
  }
  // le 12 classi del PHB compaiono sempre in ordine alfabetico, una dopo l'altra: usare la
  // POSIZIONE per abbinare nome→ancora, invece di cercare il nome a ritroso nel testo, evita
  // il problema per cui il nome di una classe (una parola comune, es. "guerriero") ricompare
  // isolato su una riga anche nel testo di un'ALTRA classe, causando falsi abbinamenti. Il
  // titolo nudo di una classe a volte non si estrae affatto come riga isolata (es. "LADRO"),
  // quindi non lo usiamo come confine: il vero confine è la frase "CREARE UN <classe>", che
  // segna sempre l'inizio del capitolo successivo (vedi stop-signal in parseFeatures)
  return privilegiAnchors.slice(0, CLASS_NAMES.length).map((idx, pos) => ({
    nome: CLASS_NAMES[pos],
    privilegiLineIndex: idx,
  }));
}

function parseSections(lines, start, end) {
  const fields = {};
  // tra l'ancora "PRIVILEGI DI CLASSE" e la prima sottosezione vera c'è sempre una riga
  // introduttiva ("Un barbaro ottiene i seguenti privilegi di classe."): la saltiamo
  let cursor = start;
  while (cursor < end && !SUBSECTION_HEADINGS.has(lines[cursor]) && cursor < start + 5) cursor++;
  let activeSubsection = null;

  while (cursor < end && SUBSECTION_HEADINGS.has(lines[cursor])) {
    activeSubsection = lines[cursor];
    cursor++;
    let freeTextLines = 0;
    while (cursor < end) {
      const line = lines[cursor];
      if (SUBSECTION_HEADINGS.has(line)) break;
      // l'elenco equipaggiamento/dadi vita è sempre breve (poche righe): senza questo limite,
      // se il testo libero non incontra mai un'altra intestazione di sottosezione (perché dopo
      // viene subito l'elenco dei privilegi, non un'altra sottosezione) continuerebbe ad
      // "accumulare" fino alla fine del blocco, inghiottendo l'intera lista dei privilegi
      if ((activeSubsection === "EQUIPAGGIAMENTO" || activeSubsection === "PUNTI FERITA") && isFeatureHeading(line)) {
        break;
      }
      const m = line.match(SECTION_FIELD_RE);
      if (m) {
        fields[m[1]] = m[2];
        cursor++;
        continue;
      }
      if (activeSubsection === "EQUIPAGGIAMENTO" || activeSubsection === "PUNTI FERITA") {
        if (freeTextLines >= 10) break;
        // testo libero (intro equipaggiamento, elenco scelte (a)/(b)): lo accumuliamo a parte
        fields[`_${activeSubsection}_extra`] = ((fields[`_${activeSubsection}_extra`] ?? "") + " " + line).trim();
        cursor++;
        freeTextLines++;
        continue;
      }
      // riga di continuazione dell'ultimo campo (es. lista abilità su più righe)
      const lastLabel = Object.keys(fields).at(-1);
      if (lastLabel && !lastLabel.startsWith("_")) {
        fields[lastLabel] += " " + line;
        cursor++;
        continue;
      }
      break;
    }
  }
  return { fields, next: cursor };
}

// "CREARE UN <classe>" segna sempre l'inizio del capitolo di una classe (dopo il nome e un
// po' di testo narrativo): se lo incrociamo mentre raccogliamo i privilegi della classe
// PRECEDENTE, vuol dire che siamo scivolati nel capitolo successivo — ci fermiamo qui
function isNextChapterMarker(line) {
  return /^CREAREUNA?/.test(compact(line));
}

// NOTA: un tentativo di euristica "un privilegio è breve, oltre N righe è prosa narrativa"
// è stato provato e scartato — la lunghezza reale dei privilegi varia troppo da caso a caso
// (alcuni sono genuinamente lunghi) per fare da segnale affidabile. Il confine fra l'ultimo
// vero privilegio di una classe e la prosa narrativa introduttiva della classe SUCCESSIVA
// (con i propri sottotitoli in stile "MUSICA E MAGIA" che assomigliano a intestazioni di
// privilegio) resta un problema di disambiguazione non risolto: la lista privilegi può quindi
// contenere qualche voce spuria di testo narrativo verso la fine di ciascuna classe.
function parseFeatures(lines, start, end) {
  const features = [];
  let openFeature = null;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (isPageHeaderNoise(line)) continue;
    if (isNextChapterMarker(line)) break;
    if (isFeatureHeading(line)) {
      openFeature = { nome: titleCase(line), testo: "" };
      features.push(openFeature);
      continue;
    }
    if (openFeature) openFeature.testo += (openFeature.testo ? " " : "") + line;
  }
  return features.map((f) => ({ ...f, livello: extractLevel(f.testo) }));
}

function parseBook(bookKey) {
  const lines = loadLines(bookKey);
  const anchors = findClassAnchors(lines);

  const classes = anchors.map((anchor, idx) => {
    const nextAnchor = anchors[idx + 1];
    // limite di sicurezza: la prossima ancora "PRIVILEGI DI CLASSE" (mai oltre), il vero
    // confine lo trova comunque parseFeatures incontrando "CREARE UN <classe successiva>".
    // Per l'ultima classe (nessuna ancora successiva) non c'è questo limite naturale: un tetto
    // fisso, dato che un capitolo classe completo (base + sottoclassi) non supera mai ~1000 righe
    const sectionsEnd = nextAnchor
      ? nextAnchor.privilegiLineIndex
      : Math.min(lines.length, anchor.privilegiLineIndex + 1000);
    const { fields, next } = parseSections(lines, anchor.privilegiLineIndex + 1, sectionsEnd);
    const features = parseFeatures(lines, next, sectionsEnd);

    return {
      nome: anchor.nome,
      dadoVita: fields["Dadi Vita"] ?? null,
      puntiFerita1Livello: fields["Punti Ferita al 1° Livello"] ?? null,
      puntiFeritaSuccessivi: fields["Punti Ferita ai Livelli Successivi"] ?? null,
      armature: fields["Armature"] ?? null,
      armi: fields["Armi"] ?? null,
      strumenti: fields["Strumenti"] ?? null,
      tiriSalvezza: fields["Tiri Salvezza"] ?? null,
      abilita: fields["Abilità"] ?? null,
      equipaggiamento: fields["_EQUIPAGGIAMENTO_extra"] ?? null,
      privilegi: features,
      fonte: bookKey,
    };
  });

  return classes;
}

function main() {
  const bookKey = process.argv[2];
  if (!bookKey) {
    console.error("Uso: node parse-classi.mjs <chiave_libro>");
    process.exit(1);
  }

  const classes = parseBook(bookKey);
  mkdirSync(PARSED_DIR, { recursive: true });
  const outPath = path.join(PARSED_DIR, `${bookKey}-classi.json`);
  writeFileSync(outPath, JSON.stringify(classes, null, 2), "utf-8");

  console.log(`${classes.length} classi trovate su ${CLASS_NAMES.length} attese -> ${outPath}`);
  for (const c of classes) {
    console.log(`  ${c.nome}: ${c.privilegi.length} privilegi, dado vita=${c.dadoVita ? "ok" : "MANCANTE"}`);
  }
  const missing = CLASS_NAMES.filter((n) => !classes.some((c) => c.nome === n));
  if (missing.length > 0) console.log("Classi non trovate:", missing.join(", "));
}

main();
