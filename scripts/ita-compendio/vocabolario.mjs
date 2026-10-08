// Il vocabolario con cui gli script decidono se una sequenza di lettere è una parola italiana.
//
// Serve a due cose che un elenco di refusi noti non chiude mai: ricucire le parole che il PDF ha
// spezzato in un punto qualunque («contu ndenti») e trovare i refusi residui dell'OCR («hestia»,
// «farza») senza rileggere ogni pagina. È fatto di due parti, entrambe tenute in parsed/ (fuori
// dal repository) e ricostruite da sole se mancano:
//
//   - parsed/dizionario-it.txt   le forme italiane (verbi coniugati compresi) di tre elenchi
//                                pubblici, scaricati una volta;
//   - parsed/vocabolario-dnd.txt le parole dei testi PULITI del Compendio, ciascuna con quante
//                                volte compare: dà le parole del gioco che un dizionario non ha
//                                («multiattacco», «scurovisione», «dragonide») e dice quali
//                                parole sono comuni e quali rare.
//
// Uso:  const vocabolario = await caricaVocabolario(sql);   vocabolario.nota("contundenti")
//       caricaVocabolario(sql, { rigenera: true }) ricostruisce il vocabolario del gioco.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { ricuciParoleSpezzate } from "../../lib/parole-spezzate.ts";

const PARSED = path.join(path.dirname(fileURLToPath(import.meta.url)), "parsed");
const FILE_DIZIONARIO = path.join(PARSED, "dizionario-it.txt");
const FILE_GIOCO = path.join(PARSED, "vocabolario-dnd.txt");
// Tre elenchi dello stesso archivio: nessuno da solo basta. Quello da 660.000 forme ha i verbi
// coniugati ma non «di», «porto», «casa»; quello con i nomi propri ha le parole comuni.
const ARCHIVIO = "https://raw.githubusercontent.com/napolux/paroleitaliane/master/paroleitaliane";
const ELENCHI = ["660000_parole_italiane.txt", "280000_parole_italiane.txt", "110000_parole_italiane_con_nomi_propri.txt"];

const parole = (testo) => testo.toLowerCase().match(/\p{L}+/gu) ?? [];

async function dizionario() {
  if (!existsSync(FILE_DIZIONARIO)) {
    const testi = [];
    for (const elenco of ELENCHI) {
      const risposta = await fetch(`${ARCHIVIO}/${elenco}`);
      if (!risposta.ok) throw new Error(`Dizionario non scaricabile (${risposta.status}): ${elenco}`);
      testi.push(await risposta.text());
    }
    mkdirSync(PARSED, { recursive: true });
    writeFileSync(FILE_DIZIONARIO, testi.join("\n"));
  }
  return readFileSync(FILE_DIZIONARIO, "utf-8").split(/\s+/);
}

/** parola -> quante volte compare nei testi puliti. */
async function vocabolarioDelGioco(sql, rigenera, delDizionario) {
  if (!rigenera && existsSync(FILE_GIOCO)) {
    return new Map(
      readFileSync(FILE_GIOCO, "utf-8")
        .split("\n")
        .filter(Boolean)
        .map((riga) => {
          const [parola, volte] = riga.split("\t");
          return [parola, Number(volte)];
        }),
    );
  }

  const testi = [];
  const impara = (testo) => {
    if (testo) testi.push(testo);
  };
  // Le traduzioni scritte da un modello non hanno refusi di lettura. Restano fuori le classi
  // (testo preso dai PDF) e tutto ciò che viene dal Calderone di Tasha (accenti persi); i nomi
  // delle voci contano come testo, così «ettercap» nella sua scheda non passa per un refuso.
  for (const r of await sql`
    SELECT descrizione_ita FROM compendio_traduzione_ia
    WHERE source <> 'TCE' AND kind <> 'classi' AND descrizione_ita IS NOT NULL`) {
    impara(r.descrizione_ita);
  }
  for (const r of await sql`SELECT testo FROM compendio_ita_regola WHERE fonte IN ('regole_base', 'phb_regole', 'dm_regole')`) impara(r.testo);
  for (const r of await sql`SELECT descrizione FROM compendio_ita_incantesimo WHERE fonte = 'phb'`) impara(r.descrizione);
  for (const r of await sql`SELECT descrizione FROM compendio_ita_oggetto WHERE fonte = 'dm_manuale'`) impara(r.descrizione);
  // I nomi: «ettercap» nel testo della sua scheda non è un refuso.
  for (const tabella of ["compendio_ita_mostro", "compendio_ita_incantesimo", "compendio_ita_oggetto", "compendio_ita_talento"]) {
    for (const r of await sql.query(`SELECT nome FROM ${tabella}`)) impara(r.nome);
  }
  for (const r of await sql`SELECT nome_ita FROM compendio_traduzione_ia WHERE nome_ita IS NOT NULL`) impara(r.nome_ita);

  // Un testo che ha già le parole spezzate non può insegnare quali sono le parole: metterebbe nel
  // vocabolario proprio i pezzi («creatu», «noltre», «tem») che si vogliono riconoscere. E fra i
  // testi "puliti" ce ne sono: un centinaio di voci della cache sono copie del testo dei PDF.
  // Quindi due passate. La prima conta tutto; la seconda scarta i testi in cui, prendendo per
  // buone solo le parole del dizionario e quelle davvero frequenti, c'è qualcosa da ricucire.
  const grezzi = new Map();
  for (const testo of testi) for (const p of parole(testo)) grezzi.set(p, (grezzi.get(p) ?? 0) + 1);
  const provvisoria = { nota: (p) => delDizionario.has(p) || (grezzi.get(p) ?? 0) >= 50 };
  const conteggi = new Map();
  let scartati = 0;
  for (const testo of testi) {
    if (ricuciParoleSpezzate(testo, provvisoria).ricuciture.length > 0) {
      scartati++;
      continue;
    }
    for (const p of parole(testo)) conteggi.set(p, (conteggi.get(p) ?? 0) + 1);
  }
  console.log(`vocabolario del gioco: ${testi.length - scartati} testi, ${scartati} scartati perché hanno parole spezzate`);

  // Anche le parole di una lettera: non servono a dire che cosa è una parola, ma quanto è comune
  // («o» e «e» sono fra le più frequenti, e il confronto fra due letture deve saperlo).
  const elenco = [...conteggi].sort((a, b) => a[0].localeCompare(b[0]));
  mkdirSync(PARSED, { recursive: true });
  writeFileSync(FILE_GIOCO, elenco.map(([p, n]) => `${p}\t${n}`).join("\n"));
  return new Map(elenco);
}

// I verbi col pronome attaccato («romperla», «usandolo», «spalmarsela») non stanno nei dizionari.
const CLITICI = ["gliela", "glielo", "gliele", "glieli", "sela", "selo", "sele", "seli", "sene", "gli", "lo", "la", "li", "le", "ne", "si", "ci", "vi", "mi", "ti"];

// Le parole fino a tre lettere che può valere la pena ricucire. Elenco CHIUSO: fra le sigle e i
// pezzi di parola così corti gli elenchi automatici non distinguono niente («ild» è il nome di
// una runa, «aq» una sigla, «dir» un troncamento) e bastavano a rovinare la frase accanto.
const PAROLE_CORTE = new Set(
  (
    "un una uno di da in il lo la le li gli al ai del dei dal dai nel nei sul sui col con per tra fra su se si sé ma mi ti ci vi " +
    "ne né no non che chi cui ed od ad ha ho hai è era più già giù qui qua lì là poi mai ora due tre sei suo sua sue tuo tua " +
    "lui lei noi voi può"
  ).split(" "),
);

export async function caricaVocabolario(sql, { rigenera = false } = {}) {
  const delDizionario = new Set((await dizionario()).map((p) => p.toLowerCase()));
  const delGioco = await vocabolarioDelGioco(sql, rigenera, delDizionario);
  // Nel vocabolario del gioco una parola vale se è vista almeno due volte: una sola può essere un
  // refuso anche nei testi puliti.
  const inElenco = (p) => delDizionario.has(p) || (delGioco.get(p) ?? 0) >= 2;
  /** Il verbo a cui il pronome è attaccato, se la parola è fatta così: «romperla» -> «romper». */
  const baseDelClitico = (p) => {
    for (const c of CLITICI) {
      if (!p.endsWith(c) || p.length <= c.length + 3) continue;
      const base = p.slice(0, -c.length);
      if (["", "e", "re"].some((f) => inElenco(base + f))) return base;
    }
    return null;
  };

  /** Vero se la parola (in minuscolo) è italiana o del gioco: per decidere se sta bene da sola. */
  const nota = (p) => inElenco(p) || baseDelClitico(p) !== null;

  /**
   * Vero se i pezzi, uniti, fanno una parola: per decidere se ricucirli. Più severa di `nota`,
   * perché unire per sbaglio è peggio che lasciare uno spazio in più:
   *  - una parola corta deve stare nell'elenco chiuso qui sopra, una di quattro lettere deve
   *    essere davvero in uso nei testi del Compendio;
   *  - un verbo col pronome («colpi rla» -> «colpirla») vale solo se il taglio NON cade proprio
   *    prima del pronome: «subisce l a» è «subisce la», non «subiscela».
   */
  const unibile = (pezzi) => {
    const p = pezzi.join("").toLowerCase();
    if (p.length <= 3) return PAROLE_CORTE.has(p);
    if (p.length === 4) return (delGioco.get(p) ?? 0) >= 5;
    if (inElenco(p)) return true;
    const base = baseDelClitico(p);
    if (base === null) return false;
    let posizione = 0;
    for (const pezzo of pezzi.slice(0, -1)) {
      posizione += pezzo.length;
      if (posizione === base.length) return false;
    }
    return true;
  };

  /** Quanto è comune la parola: le volte che compare nei testi puliti, poco se sta solo nel dizionario. */
  const peso = (p) => delGioco.get(p) ?? 0.3;
  /** Quante parole contano i testi puliti: trasforma i pesi in frequenze. */
  let totale = 0;
  for (const volte of delGioco.values()) totale += volte;

  return { nota, unibile, peso, totale, dimensione: delDizionario.size + delGioco.size };
}
