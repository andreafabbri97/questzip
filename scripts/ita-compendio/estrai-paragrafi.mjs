// Tira fuori i paragrafi "Nome. Testo" da un intervallo di pagine di un manuale estratto.
//
// È il formato con cui i manuali presentano gli elenchi di opzioni: manovre del Maestro di
// Battaglia, discipline elementali del Monaco, suppliche occulte del Warlock, infusioni
// dell'Artefice, colpi arcani, rune. Nel Compendio quelle voci comparivano ancora col nome inglese
// perché non erano mai entrate nella cache delle traduzioni — e il nome italiano è stampato lì.
//
// Non prova ad abbinare da sé i nomi inglesi: quello è un giudizio che va fatto a mano (l'ordine
// alfabetico italiano non corrisponde a quello inglese), e un abbinamento sbagliato è peggio di
// nessun abbinamento. Qui si estrae solo, poi si scrive la mappa.
//
// I manuali usano due impaginazioni per gli stessi elenchi: "Nome. Testo" in linea (le manovre del
// Manuale del Giocatore) e intestazione tutta maiuscola su riga propria (le stesse manovre nel
// Calderone di Tasha). Si riconoscono entrambe, altrimenti mezze sezioni risultano vuote.
//
// Uso: node estrai-paragrafi.mjs <chiave_libro> <pagina_inizio> <pagina_fine> [--json]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const [libro, da, a] = process.argv.slice(2);
const comeJson = process.argv.includes("--json");

if (!libro || !da || !a) {
  console.error("Uso: estrai-paragrafi.mjs <chiave_libro> <pagina_inizio> <pagina_fine> [--json]");
  process.exit(1);
}

// "Nome della Voce. Testo che comincia qui." — titoletto breve, in stile titolo, seguito da un
// punto e da una frase che inizia con la maiuscola. Il vincolo sulla lunghezza tiene fuori le
// frasi normali che per caso contengono un punto a metà riga.
const TITOLETTO_RE = /^([A-ZÀ-Ù][A-Za-zà-ÿ'’\s,\-]{2,44})\.\s+(?=[A-ZÀ-Ù"«])/;

const raw = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "extracted", `${libro}.json`), "utf-8"));
const righe = [];
for (const pagina of raw.pages) {
  if (pagina.page < Number(da) || pagina.page > Number(a)) continue;
  for (const linea of (pagina.text ?? "").split("\n")) {
    const t = linea.trim();
    if (t) righe.push(t);
  }
}

const voci = [];
let titolo = null;
let buffer = [];
const chiudi = () => {
  if (titolo && buffer.length > 0) {
    const testo = buffer.join(" ").replace(/\s+/g, " ").trim();
    if (testo.length >= 40) voci.push({ nome: titolo, testo });
  }
  titolo = null;
  buffer = [];
};

for (const riga of righe) {
  const apertura = riga.match(TITOLETTO_RE);
  if (apertura) {
    chiudi();
    titolo = apertura[1].replace(/\s+/g, " ").trim();
    buffer = [riga.slice(apertura[0].length)];
    continue;
  }
  // intestazione tutta maiuscola su riga propria: è il titolo di una voce, non rumore. Si escludono
  // le testatine (contengono cifre o la parola CAPITOLO) e i titoli spezzati su due righe restano
  // separati — meglio due voci da unire a mano che una voce persa.
  const maiuscola = riga.match(/^([A-ZÀ-Ù][A-ZÀ-Ù'’\s]{3,40})$/);
  if (maiuscola && !/CAPITOLO|\d/.test(riga)) {
    chiudi();
    titolo = maiuscola[1].replace(/\s+/g, " ").trim();
    buffer = [];
    continue;
  }
  if (/^[A-ZÀ-Ù0-9\s|I:]{6,}$/.test(riga)) {
    chiudi();
    continue;
  }
  if (titolo) buffer.push(riga);
}
chiudi();

if (comeJson) {
  console.log(JSON.stringify(voci, null, 2));
} else {
  console.log(`${voci.length} paragrafi fra le pagine ${da}-${a} di ${libro}:`);
  for (const v of voci) console.log(`  ${v.nome}  —  ${v.testo.slice(0, 90)}…`);
}
