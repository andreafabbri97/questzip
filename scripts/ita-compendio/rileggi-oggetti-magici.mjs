// Rilegge le descrizioni degli oggetti magici del catalogo «Oggetti magici A–Z» dal Manuale del
// Dungeon Master, con l'OCR di Windows (ocr_windows_pdf.py dm_manuale 148 214).
//
// Le voci con fonte "oggetti_magici" vengono da un altro PDF, uno screenshot dello stesso
// catalogo letto con easyocr: un capoverso solo per voce, con i titoletti annegati nel testo, i
// dadi storpiati («1d61» per «1d6 − 1») e, nelle voci lunghe, la fine tagliata. Il PDF digitale
// del manuale ha il font offuscato, ma reso in immagine si legge quasi senza errori, e con la
// posizione delle parole si ricostruiscono colonne e capoversi (lib/ordine-di-lettura.ts).
//
// Una voce comincia dove un titolo è seguito dalla riga del tipo («Anello, raro (richiede
// sintonia)») e finisce al titolo della voce successiva. Le tabelle, che dalla geometria non si
// ricostruiscono, e i refusi che nessuna regola prende stanno in parsed/oggetti_magici-ritocchi.json
// (vedi lettura-windows.mjs).
//
// Non tocca le voci già trascritte a mano (parsed/trascritti-oggetti-magici-1…5.json) e non
// scrive nel database: produce parsed/trascritti-oggetti-magici-6.json, che si carica con
// importa-trascrizioni.mjs — è lì che i dadi di ogni voce vengono confrontati con l'originale.
//
// Uso: node rileggi-oggetti-magici.mjs --copia <cartella> [--mostra "<nome>"] [--nomi] [--refusi]
//   --copia  la cartella con compendio_ita_oggetto.json (copia-locale.mjs): dà i nomi delle voci
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cuciPagine, ordineDiLettura } from "../../lib/ordine-di-lettura.ts";
import { pulisciLetturaWindows } from "../../lib/lettura-windows.ts";
import { titoloLeggibile } from "../../lib/titolo-leggibile.ts";
import { SEGNAPOSTO, apriLettura, apriPulizie } from "./lettura-windows.mjs";

const QUI = new URL("./", import.meta.url);
const argomento = (nome) => (process.argv.includes(nome) ? (process.argv[process.argv.indexOf(nome) + 1] ?? "") : null);
const copia = argomento("--copia");
if (!copia) {
  console.error('Uso: node rileggi-oggetti-magici.mjs --copia <cartella> [--mostra "<nome>"] [--nomi] [--refusi]');
  process.exit(1);
}

// Il catalogo va da «Ali del Volo» a «Zaino Pratico di Heward»: pagine del PDF, contate da zero.
const PRIMA_PAGINA = 149;
const ULTIMA_PAGINA = 213;
const FONTE = "oggetti_magici";
const GIA_TRASCRITTI = [1, 2, 3, 4, 5];

const lettura = apriLettura("dm_manuale", FONTE);
const pulizie = await apriPulizie();
const avvisi = [];

const chiave = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Le voci del database, per nome; e quelle che non si rifanno perché già trascritte a mano.
const nelDatabase = new Map(
  JSON.parse(readFileSync(path.join(copia, "compendio_ita_oggetto.json"), "utf-8"))
    .filter((r) => r.fonte === FONTE)
    .map((r) => [chiave(r.nome), r]),
);
const aMano = new Set();
for (const n of GIA_TRASCRITTI) {
  const file = new URL(`parsed/trascritti-oggetti-magici-${n}.json`, QUI);
  if (existsSync(file)) for (const v of JSON.parse(readFileSync(file, "utf-8")).voci) aMano.add(chiave(v.nome));
}

/** Il piè di pagina: «CAPITOLO 7 | TESORI» e il numero. Il testo arriva fino a poco sopra. */
const daScartare = (riga, pagina) => riga.y0 > pagina.altezza * 0.96 || !/[\p{L}\p{N}]/u.test(riga.testo);

// La riga che segue il nome di ogni voce: tipo, rarità, sintonia («Anello, raro (richiede
// sintonia)»). È in corsivo, e l'OCR la legge male in dieci modi («Oééetto meravié/ioso», «Anna»
// per Arma, «nomcomune»): si riconosce da com'è fatta, una riga breve con la rarità dopo la virgola.
const RARITA = /,\s*(no[nm] ?comune|comune|molto rar[oa]|rar[oa]|leggendari[oa]|rarità variabile|artefatto)(?!\p{L})/iu;
const eTipo = (testo) => testo.length < 150 && RARITA.test(testo);

const pagine = [];
for (let indice = PRIMA_PAGINA; indice <= ULTIMA_PAGINA; indice++) {
  if (!lettura.dati.pagine[indice]) continue;
  const blocchi = ordineDiLettura(lettura.pagina(indice), { daScartare, altoComeTitolo: Infinity });
  // Le didascalie delle illustrazioni sono in maiuscoletto, più piccolo dei titoli delle voci:
  // via. Ma la misura balla, e un titolo vero si riconosce comunque dalla riga del tipo che ha sotto.
  const eDidascalia = (b, i) => b.tipo === "titolo" && !SEGNAPOSTO.test(b.testo) && b.grandezza < 1.08 && !(blocchi[i + 1]?.tipo === "capoverso" && eTipo(blocchi[i + 1].testo));
  // Tolta la didascalia, ciò che le stava sotto è in cima alla colonna: può essere il seguito del
  // capoverso rimasto a metà nella colonna prima.
  const senza = blocchi.map((b, i) => (i > 0 && eDidascalia(blocchi[i - 1], i - 1) ? { ...b, staccato: true } : b)).filter((b, i) => !eDidascalia(blocchi[i], i));
  pagine.push({ pagina: indice, blocchi: senza });
}
const pezzi = cuciPagine(pagine);

// Dal nome letto a quello del database, dove l'OCR ha storpiato il titolo: «_nomi» nei ritocchi.
const nomeGiusto = (letto) => lettura.ritocchi._nomi?.[letto] ?? letto;

// Dopo l'ultima voce il capitolo prosegue con altro: il catalogo finisce al primo titolo di sezione.
const fineCatalogo = pezzi.findIndex((p) => p.tipo === "titolo" && /^OGGETTI MAGICI SENZIENTI/i.test(p.testo));
const voci = [];
for (let i = 1; i < (fineCatalogo < 0 ? pezzi.length : fineCatalogo) - 1; i++) {
  const [titolo, tipo] = [pezzi[i], pezzi[i + 1]];
  if (titolo.tipo !== "titolo" || SEGNAPOSTO.test(titolo.testo) || tipo.tipo !== "capoverso" || !eTipo(tipo.testo)) continue;
  voci.push({ nome: nomeGiusto(titoloLeggibile(titolo.testo)), pagina: titolo.pagina, tipo: tipo.testo, da: i + 2 });
}

const CHIUDE_FRASE = /[.!?:;…]["»”'’)\]]*$/;
const fuori = [];
const riassunto = [];
voci.forEach((voce, n) => {
  const a = n + 1 < voci.length ? voci[n + 1].da - 2 : fineCatalogo < 0 ? pezzi.length : fineCatalogo;
  const blocchi = pezzi.slice(voce.da, a).map((p) => {
    const ritocco = p.testo.match(SEGNAPOSTO);
    if (ritocco) return lettura.zona(p.pagina, Number(ritocco[1]));
    return p.tipo === "titolo" ? titoloLeggibile(p.testo) : pulisciLetturaWindows(p.testo);
  });
  const descrizione = pulizie.pulisci(lettura.conRefusi(voce.nome, pulizie.pulisci(blocchi.join("\n\n")), avvisi));
  const riga = nelDatabase.get(chiave(voce.nome));
  const stato = !riga ? "non nel database" : aMano.has(chiave(voce.nome)) ? "già a mano" : "rifatta";
  riassunto.push({ ...voce, stato, descrizione, prima: riga?.descrizione ?? "" });
  if (stato !== "rifatta") return;
  // Dove i numeri della voce sono diversi dall'originale perché così è stampato sul manuale
  // italiano: la nota, scritta dopo aver guardato la pagina, fa passare il controllo dei dadi.
  const verificate = lettura.ritocchi._verificate?.[riga.nome];
  fuori.push({ nome: riga.nome, descrizione, ...(verificate ? { _differenze_verificate: verificate } : {}) });

  // Segni che la voce va guardata: una tabella smontata, un capoverso lasciato a metà.
  const capoversi = descrizione.split("\n\n");
  const brevi = capoversi.filter((c) => c.length < 40 && !/^(Tabella|- )/.test(c)).length;
  if (brevi >= 4) avvisi.push(`«${riga.nome}» (p. ${voce.pagina}): ${brevi} righe brevi, forse una tabella`);
  for (const c of capoversi) {
    if (!/^(Tabella|- )/.test(c) && /[.!?] \p{Lu}/u.test(c) && !CHIUDE_FRASE.test(c)) avvisi.push(`«${riga.nome}» (p. ${voce.pagina}): capoverso sospeso …${c.slice(-50)}`);
  }
});
avvisi.push(...lettura.ritocchiInutili());

const lette = new Set(riassunto.map((v) => chiave(v.nome)));
const mancanti = [...nelDatabase.values()].filter((r) => !lette.has(chiave(r.nome)) && !aMano.has(chiave(r.nome)));

const daMostrare = argomento("--mostra");
if (daMostrare !== null) {
  for (const v of riassunto.filter((x) => chiave(x.nome).includes(chiave(daMostrare)))) {
    console.log(`===== ${v.nome} (p. ${v.pagina}, ${v.stato}) — ${v.tipo}\n${v.descrizione}\n\n----- nel database (${v.prima.length} caratteri)\n${v.prima}\n`);
  }
} else if (process.argv.includes("--nomi")) {
  for (const v of riassunto) console.log(`${v.pagina}  ${v.stato.padEnd(16)}  ${v.nome}  (${v.descrizione.length} / ${v.prima.length})`);
} else if (process.argv.includes("--refusi")) {
  for (const [r, volte] of [...pulizie.riparazioni].sort((x, y) => y[1] - x[1])) console.log(`${String(volte).padStart(4)} ${r}`);
} else {
  writeFileSync(new URL("parsed/trascritti-oggetti-magici-6.json", QUI), JSON.stringify({ tabella: "compendio_ita_oggetto", fonte: FONTE, voci: fuori }, null, 1), "utf-8");
  const quante = (stato) => riassunto.filter((v) => v.stato === stato).length;
  console.log(`voci lette: ${riassunto.length} — rifatte ${quante("rifatta")}, già trascritte a mano ${quante("già a mano")}, non nel database ${quante("non nel database")}`);
  console.log(`nel database ma non lette: ${mancanti.length}${mancanti.length ? ` (${mancanti.map((r) => r.nome).join(" · ")})` : ""}`);
  console.log(`-> parsed/trascritti-oggetti-magici-6.json (${fuori.length} voci), ${avvisi.length} avvisi`);
  for (const a of avvisi) console.log(`! ${a}`);
}
