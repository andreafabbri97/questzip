/**
 * Ricostruisce l'ordine di lettura di una pagina dall'OCR che dà le parole con la loro posizione
 * (scripts/ita-compendio/ocr_windows_pdf.py).
 *
 * Un OCR che restituisce solo il testo lo dà già impastato: le due colonne una dentro l'altra, i
 * capoversi fusi, i titoli in mezzo alle frasi, le etichette delle cartine fra le righe. Con i
 * riquadri delle parole la struttura della pagina si legge invece dalla geometria, senza capire
 * una parola di quello che c'è scritto:
 * - una riga che attraversa il centro della pagina è a tutta larghezza, e divide la pagina in
 *   fasce; dentro ogni fascia si legge prima la colonna di sinistra, poi quella di destra;
 * - un capoverso comincia dove la riga è rientrata rispetto a quella sopra, o dove quella sopra
 *   si è fermata molto prima del margine e questa riparte con la maiuscola (le voci di un elenco);
 *   nelle voci «appese» è il contrario: la prima riga al margine, le altre rientrate;
 * - un titolo è una riga in maiuscolo, o scritta più grande del testo;
 * - a fine riga il trattino della sillabazione si toglie e la parola si ricuce;
 * - il colore della carta attorno alle parole dice dove si è: bianca nel testo, appena tinta nei
 *   riquadri di approfondimento, colorata sopra una cartina o un'illustrazione (e lì non c'è
 *   testo da leggere, solo nomi sparsi).
 *
 * I margini si misurano sempre sulle righe vicine, mai sulla pagina intera: una scansione è
 * storta, e fra la prima e l'ultima riga il margine si sposta più di un rientro.
 *
 * Non sa leggere le tabelle (le celle di una riga finiscono in colonne diverse): chi chiama deve
 * trattarle a parte. È fatto per pagine a due colonne: in un testo a tutta pagina l'ultima riga
 * corta di un capoverso esce come un blocco a sé, e a riattaccarla è cuciPagine.
 * File senza dipendenze, si prova da solo.
 */

export interface ParolaOcr {
  t: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Il colore della carta attorno alla parola: rosso, verde, blu. */
  f?: [number, number, number];
  /** 1 se alla sua sinistra c'è il pallino di un elenco puntato (conta solo per la prima della riga). */
  p?: 1;
}

export interface PaginaOcr {
  larghezza: number;
  altezza: number;
  righe: { parole: ParolaOcr[] }[];
}

/** Dove sta scritta una riga: sulla carta, in un riquadro tinto, sopra un'immagine. */
export type Sfondo = "carta" | "riquadro" | "immagine";

/** Una riga con il suo riquadro. `altezza` è quella dei caratteri, non dell'interlinea. */
export interface RigaDiPagina {
  testo: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  altezza: number;
  /** La linea su cui poggiano le lettere: da una riga all'altra misura l'interlinea. */
  base: number;
  sfondo: Sfondo;
  /** Quanto il fondo vira al giallo (rosso meno blu): costante in un riquadro, sfumata in una macchia. */
  tinta: number;
  /** Comincia con il pallino di un elenco puntato (che nel testo non c'è più). */
  puntata: boolean;
}

export interface Blocco {
  tipo: "titolo" | "capoverso";
  testo: string;
  /** Altezza dei caratteri rispetto al testo corrente della pagina (1 = come il testo). */
  grandezza: number;
  /** Dove comincia, in pixel dall'alto. */
  y: number;
  /** 0 = sinistra, 1 = destra, -1 = a tutta larghezza. */
  colonna: number;
  sfondo: Sfondo;
  /** È la voce di un elenco puntato. */
  puntato: boolean;
  /** La prima riga è rientrata: il blocco apre un capoverso, non ne continua uno. */
  rientrato: boolean;
  /**
   * Comincia dopo uno stacco: in cima a una colonna, sotto un'immagine, all'uscita da un
   * riquadro. È il solo caso in cui può essere il seguito di un capoverso rimasto a metà.
   */
  staccato: boolean;
}

export interface OpzioniOrdine {
  /** Vero per le righe da ignorare (testatine, numeri di pagina). */
  daScartare?: (riga: RigaDiPagina, pagina: PaginaOcr) => boolean;
  /** Vero per le righe che aprono comunque un capoverso («Linguaggi: …» nelle schede). */
  apreCapoverso?: (riga: RigaDiPagina) => boolean;
  /**
   * Quanto più alta del testo deve essere una riga non in maiuscolo per valere da titolo
   * (1.35 se non indicato). Con `Infinity` sono titoli solo le righe in maiuscolo: serve nei
   * libri che li scrivono tutti in maiuscoletto, dove una riga alta è solo una riga misurata male.
   */
  altoComeTitolo?: number;
}

const mediana = (valori: number[]) => {
  if (valori.length === 0) return 0;
  const ordinati = [...valori].sort((a, b) => a - b);
  return ordinati[Math.floor(ordinati.length / 2)];
};

/** Quota di lettere maiuscole fra le lettere di una riga. */
export function quotaMaiuscole(testo: string): number {
  const lettere = testo.match(/\p{L}/gu) ?? [];
  if (lettere.length === 0) return 0;
  return lettere.filter((l) => l === l.toUpperCase() && l !== l.toLowerCase()).length / lettere.length;
}

/**
 * Vero se la riga è scritta in maiuscolo o in maiuscoletto. Nel maiuscoletto l'OCR restituisce
 * minuscole le lettere che hanno la stessa forma da grandi e da piccole («Gloco Dl GAMBE»): la
 * riga vale lo stesso se, contandole per maiuscole, è quasi tutta maiuscola e ha almeno tre
 * maiuscole in mezzo alle parole, dove una riga di testo non ne ha mai.
 */
export function eMaiuscoletto(testo: string): boolean {
  const lettere = testo.match(/\p{L}/gu) ?? [];
  const quota = quotaMaiuscole(testo);
  // Una riga cortissima vale solo se è tutta maiuscola: «TYR» è un titolo, «i PNG» è la coda
  // di una frase.
  if (quota >= 0.7 && (lettere.length >= 6 || quota === 1)) return true;
  const simili = lettere.filter((l) => l !== l.toLowerCase() || /[cosvwxzl]/.test(l)).length;
  const interne = (testo.match(/(?<=\p{L})\p{Lu}/gu) ?? []).length;
  return lettere.length > 0 && simili / lettere.length >= 0.9 && interne >= 3;
}

/**
 * Che fondo c'è sotto un gruppo di parole, dal loro colore mediano. La carta è bianca o grigia
 * (una scansione ha zone più scure, ma senza colore); un riquadro è chiaro e vira al giallo: il
 * rosso resta alto, il blu scende; tutto ciò che è scuro o colorato in altro modo è un'immagine.
 * Senza colori (un OCR letto prima che si salvassero) è carta.
 */
export function sfondoDi(colori: [number, number, number][]): Sfondo {
  if (colori.length === 0) return "carta";
  const [r, g, b] = [0, 1, 2].map((i) => mediana(colori.map((c) => c[i])));
  if (r < 225) return "immagine";
  const tinta = Math.max(r, g, b) - Math.min(r, g, b);
  if (tinta < 9) return "carta";
  const giallina = r >= 238 && r >= g && g >= b && r - g <= 8 && r - b <= 30;
  // Una tinta così leggera ce l'hanno anche le macchie in fondo alle pagine: che sia davvero un
  // riquadro lo decide ordineDiLettura, guardando se le righe tinte cominciano con un titolo.
  return giallina ? "riquadro" : "immagine";
}

// Le lettere e i segni che scendono sotto la linea di base.
const SCENDE = /[gjpqyçQ,;()[\]{}]/;

/**
 * La linea su cui poggiano le lettere di una riga. Il fondo di una parola è quella linea solo se
 * la parola non ha una «g» o una «p» che scende sotto: a quelle si toglie la coda (un quinto
 * dell'altezza), poi si prende il fondo delle parole che arrivano meno in basso (un quarto dalla
 * cima dell'elenco, non la prima: un trattino o una virgoletta letti come parole stanno più in
 * alto di tutte).
 */
function lineaDiBase(parole: ParolaOcr[]): number {
  const conLettere = parole.filter((p) => /[\p{L}\p{N}]/u.test(p.t));
  const fondi = (conLettere.length > 0 ? conLettere : parole)
    .map((p) => p.y + p.h - (SCENDE.test(p.t) ? p.h * 0.2 : 0))
    .sort((a, b) => a - b);
  return fondi[Math.floor((fondi.length - 1) * 0.25)];
}

/** Il pallino di un elenco puntato, quando l'OCR lo ha letto come una parola. */
const PALLINO = /^[•·●▪■◦∙]+$/;

function rigaDa(tutte: ParolaOcr[]): RigaDiPagina {
  // Il pallino non è testo: si toglie, e resta scritto che la riga ne aveva uno.
  const parole = tutte.length > 1 && PALLINO.test(tutte[0].t) ? tutte.slice(1) : tutte;
  const colori = parole.flatMap((p) => (p.f ? [p.f] : []));
  return {
    testo: parole.map((p) => p.t).join(" "),
    x0: Math.min(...parole.map((p) => p.x)),
    y0: Math.min(...parole.map((p) => p.y)),
    x1: Math.max(...parole.map((p) => p.x + p.w)),
    y1: Math.max(...parole.map((p) => p.y + p.h)),
    // La mediana: una virgola o un trattino sono bassi, una maiuscola iniziale è alta.
    altezza: mediana(parole.map((p) => p.h)),
    base: lineaDiBase(parole),
    sfondo: sfondoDi(colori),
    tinta: colori.length > 0 ? mediana(colori.map((c) => c[0])) - mediana(colori.map((c) => c[2])) : 0,
    puntata: parole !== tutte || parole[0].p === 1,
  };
}

/**
 * Le righe della pagina con il loro riquadro. Una riga dell'OCR che scavalca lo spazio fra le due
 * colonne (due righe alla stessa altezza lette come una) viene divisa dove le parole si staccano.
 */
export function righeDiPagina(pagina: PaginaOcr): RigaDiPagina[] {
  const centro = pagina.larghezza / 2;
  const gruppi: ParolaOcr[][] = [];
  for (const { parole } of pagina.righe) {
    // Un pallino letto da solo, su una riga sua: la voce che gli sta accanto è già segnata.
    if (parole.every((p) => PALLINO.test(p.t))) continue;
    const inOrdine = [...parole].sort((a, b) => a.x - b.x);
    // Lo stacco più largo fra due parole che cade attorno al centro della pagina.
    let taglio = -1;
    let largo = 0;
    for (let i = 1; i < inOrdine.length; i++) {
      const fine = inOrdine[i - 1].x + inOrdine[i - 1].w;
      const stacco = inOrdine[i].x - fine;
      const attornoAlCentro = fine < centro + pagina.larghezza * 0.04 && inOrdine[i].x > centro - pagina.larghezza * 0.04;
      if (attornoAlCentro && stacco > largo) {
        largo = stacco;
        taglio = i;
      }
    }
    const altezza = mediana(inOrdine.map((p) => p.h));
    // Fra due parole della stessa riga lo spazio è meno di un carattere; fra due colonne, molti.
    if (taglio > 0 && largo > altezza * 2.5) {
      gruppi.push(inOrdine.slice(0, taglio), inOrdine.slice(taglio));
    } else {
      gruppi.push(inOrdine);
    }
  }
  const lette = ricuciFrammenti(gruppi.map(senzaParoleFuoriRiga));
  const righe = lette.map(rigaDa);
  // Un pallino visto solo nell'immagine (non letto come parola) può essere una macchiolina della
  // carta accanto a una riga qualunque: vale se lì vicino ce n'è almeno un altro incolonnato
  // con lui, perché un elenco ha più di una voce.
  const viste = righe.filter((r, i) => r.puntata && !PALLINO.test(lette[i][0].t));
  return righe.map((r, i) => {
    if (!r.puntata || PALLINO.test(lette[i][0].t)) return r;
    const incolonnate = viste.filter((altra) => altra !== r && Math.abs(altra.x0 - r.x0) <= r.altezza * 0.6 && Math.abs(altra.y0 - r.y0) <= r.altezza * 14);
    return incolonnate.length > 0 ? r : { ...r, puntata: false };
  });
}

/**
 * Toglie da una riga le parole che non stanno alla sua altezza: accanto a un'illustrazione l'OCR
 * infila nella riga un segno letto più su o più giù, che ne sposterebbe il bordo (e con quello il
 * suo posto nella colonna).
 */
function senzaParoleFuoriRiga(parole: ParolaOcr[]): ParolaOcr[] {
  if (parole.length < 3) return parole;
  const centro = mediana(parole.map((p) => p.y + p.h / 2));
  const altezza = mediana(parole.map((p) => p.h));
  const inRiga = parole.filter((p) => Math.abs(p.y + p.h / 2 - centro) <= altezza);
  return inRiga.length > 0 ? inRiga : parole;
}

/**
 * L'OCR a volte stacca un pezzo di riga e lo dà come una riga a sé: di solito la maiuscola
 * iniziale, più alta delle altre lettere («C» + «ome nel Player's Handbook»). Due gruppi di
 * parole alla stessa altezza e attaccati in orizzontale sono la stessa riga; se fra i due non
 * c'è nemmeno lo spazio di una lettera, sono la stessa parola.
 */
function ricuciFrammenti(gruppi: ParolaOcr[][]): ParolaOcr[][] {
  const riquadro = (g: ParolaOcr[]) => ({
    x0: g[0].x,
    x1: Math.max(...g.map((p) => p.x + p.w)),
    y0: Math.min(...g.map((p) => p.y)),
    y1: Math.max(...g.map((p) => p.y + p.h)),
    h: mediana(g.map((p) => p.h)),
  });
  const out: ParolaOcr[][] = [];
  const perInizio = [...gruppi].sort((a, b) => a[0].x - b[0].x);
  const usati = new Set<ParolaOcr[]>();
  for (const gruppo of perInizio) {
    if (usati.has(gruppo)) continue;
    // Anche il gruppo da cui si parte è preso: un frammento più a destra non deve riattaccarselo.
    usati.add(gruppo);
    let riga = gruppo;
    for (let cerca = true; cerca; ) {
      cerca = false;
      const a = riquadro(riga);
      for (const altro of perInizio) {
        if (usati.has(altro)) continue;
        const b = riquadro(altro);
        const sovrapposti = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) >= Math.min(a.y1 - a.y0, b.y1 - b.y0) * 0.5;
        const stacco = b.x0 - a.x1;
        const h = Math.max(a.h, b.h);
        // Alte uguali, o quasi: un segno grande il doppio accanto alla riga è un pezzo di figura.
        const stessaScrittura = Math.min(a.h, b.h) >= h * 0.6;
        if (!sovrapposti || !stessaScrittura || stacco < -h * 0.3 || stacco > h * 1.2) continue;
        usati.add(altro);
        if (stacco < h * 0.15) {
          // Stessa parola. Una lettera sola, più alta di ciò che segue, era la maiuscola.
          const coda = riga[riga.length - 1];
          const maiuscola = riga.length === 1 && coda.t.length === 1 && coda.h > altro[0].h * 1.08;
          const fusa: ParolaOcr = {
            ...coda,
            t: (maiuscola ? coda.t.toUpperCase() : coda.t) + altro[0].t,
            w: altro[0].x + altro[0].w - coda.x,
            y: Math.min(coda.y, altro[0].y),
            h: Math.max(coda.y + coda.h, altro[0].y + altro[0].h) - Math.min(coda.y, altro[0].y),
          };
          riga = [...riga.slice(0, -1), fusa, ...altro.slice(1)];
        } else {
          riga = [...riga, ...altro];
        }
        cerca = true;
        break;
      }
    }
    out.push(riga);
  }
  return out;
}

/** Unisce due righe dello stesso capoverso, ricucendo la parola spezzata dalla sillabazione. */
export function unisciRighe(prima: string, dopo: string): string {
  // «conti-» + «nua» è una parola sola.
  if (/\p{Ll}-$/u.test(prima) && /^\p{Ll}/u.test(dopo)) return prima.slice(0, -1) + dopo;
  // «Mantol-» + «Derith», «6-» + «8 metri»: il trattino è della parola e resta, senza spazio.
  if (/[\p{L}\p{N}]-$/u.test(prima)) return prima + dopo;
  return `${prima} ${dopo}`;
}

/** La riga chiude una frase: dopo può cominciare un capoverso nuovo. */
const CHIUDE_FRASE = /[.!?:;…]["»”'’)\]]*$/;
/** La riga finisce con una virgola o con una parola che ne aspetta un'altra: la frase continua. */
const RESTA_IN_SOSPESO =
  /(,|(?<!\p{L})(a|ad|al|allo|alla|ai|agli|alle|che|con|da|dal|dalla|dai|dagli|dalle|del|dello|della|dei|degli|delle|di|e|ed|gli|i|il|in|la|le|lo|ma|nel|nella|nei|negli|nelle|non|o|per|se|si|su|sul|sulla|sui|tra|fra|un|una|uno|è))$/iu;
/** La firma di una citazione: una lineetta attaccata a un nome. */
const FIRMA = /^[—–]\p{Lu}/u;
/** La riga comincia come una frase: maiuscola o cifra, anche dietro una virgoletta. */
const INIZIA_FRASE = /^["“«(\[•–—-]?\s?[\p{Lu}\d]/u;

interface Posta {
  riga: RigaDiPagina;
  colonna: number;
  fascia: number;
}

export function ordineDiLettura(pagina: PaginaOcr, opzioni: OpzioniOrdine = {}): Blocco[] {
  // Sopra un'immagine non c'è testo: i nomi di una cartina, letti, sono solo rumore, e una loro
  // riga larga spezzerebbe la pagina in fasce che non esistono.
  const tutte = righeDiPagina(pagina).filter((r) => r.sfondo !== "immagine" && !opzioni.daScartare?.(r, pagina));
  if (tutte.length === 0) return [];
  const corpo = mediana(tutte.map((r) => r.altezza)) || 1;
  const centro = pagina.larghezza / 2;
  const margine = pagina.larghezza * 0.06;

  const eLarga = (r: RigaDiPagina) => r.x0 < centro - margine && r.x1 > centro + margine;
  const eTitolo = (r: RigaDiPagina) => {
    const lettere = (r.testo.match(/\p{L}/gu) ?? []).length;
    if (lettere < 3) return false;
    return eMaiuscoletto(r.testo) || r.altezza >= corpo * (opzioni.altoComeTitolo ?? 1.35);
  };

  // Le righe a tutta larghezza dividono la pagina in fasce; in ogni fascia prima la colonna di
  // sinistra e poi quella di destra, dall'alto in basso.
  const larghe = tutte.filter(eLarga).sort((a, b) => a.base - b.base);
  const strette = tutte.filter((r) => !eLarga(r));
  const inOrdine: Posta[] = [];
  const confini = [-Infinity, ...larghe.map((r) => r.base), Infinity];
  // Più righe larghe di seguito, senza niente in colonna in mezzo, sono un testo a tutta pagina
  // (o una pagina a una colonna sola): stanno nella stessa fascia, e i capoversi si riconoscono
  // come dentro una colonna.
  let fasciaAperta = -1;
  for (let f = 0; f < confini.length - 1; f++) {
    if (f > 0) {
      const fascia = fasciaAperta >= 0 ? fasciaAperta : f * 2 - 1;
      inOrdine.push({ riga: larghe[f - 1], colonna: -1, fascia });
      fasciaAperta = fascia;
    }
    const inFascia = strette.filter((r) => r.base >= confini[f] && r.base < confini[f + 1]);
    if (inFascia.length > 0) fasciaAperta = -1;
    for (const colonna of [0, 1]) {
      const diColonna = inFascia.filter((r) => ((r.x0 + r.x1) / 2 < centro ? 0 : 1) === colonna);
      inOrdine.push(...diColonna.sort((a, b) => a.base - b.base).map((riga) => ({ riga, colonna, fascia: f * 2 })));
    }
  }

  // Un riquadro è fatto di molte righe e comincia col suo titolo. Le righe tinte che non hanno
  // questa forma sono una macchia della carta (in fondo alle pagine di una scansione ce ne
  // sono), e una riga bianca in mezzo a un riquadro è una riga misurata male.
  const stessoPosto = (a: Posta, b: Posta) => a.colonna === b.colonna && a.fascia === b.fascia;
  const sfondi = inOrdine.map((p) => p.riga.sfondo);
  for (let i = 1; i < inOrdine.length - 1; i++) {
    const inMezzo = stessoPosto(inOrdine[i - 1], inOrdine[i]) && stessoPosto(inOrdine[i + 1], inOrdine[i]);
    if (inMezzo && sfondi[i] === "carta" && sfondi[i - 1] === "riquadro" && sfondi[i + 1] === "riquadro") sfondi[i] = "riquadro";
  }
  const tratti: { da: number; a: number }[] = [];
  for (let i = 0; i < inOrdine.length; ) {
    let fine = i + 1;
    while (fine < inOrdine.length && stessoPosto(inOrdine[fine], inOrdine[i]) && sfondi[fine] === sfondi[i]) fine++;
    if (sfondi[i] === "riquadro") tratti.push({ da: i, a: fine });
    i = fine;
  }
  const tintaMediana = (da: number, a: number) => mediana(inOrdine.slice(da, a).map((p) => p.riga.tinta));
  const eRiquadro = tratti.map(({ da, a }) => {
    if (a - da < 3) return false;
    if (eTitolo(inOrdine[da].riga)) return true;
    // Il titolo di un riquadro largo quanto la pagina sta su una riga sua, sopra le due colonne.
    const sopra = da > 0 ? inOrdine[da - 1] : null;
    if (sopra && sopra.colonna === -1 && sfondi[da - 1] === "riquadro" && eTitolo(sopra.riga)) return true;
    // La seconda colonna di quel riquadro non ha né titolo né riga sopra: si riconosce perché è
    // lunga e tinta tutta uguale, dove una macchia sfuma verso il bordo della pagina.
    return a - da >= 8 && Math.abs(tintaMediana(da, da + 3) - tintaMediana(a - 3, a)) <= 4;
  });
  tratti.forEach(({ da, a }, n) => {
    // Quel titolo largo vale se sotto ha davvero il suo riquadro.
    const soloTitolo = a - da <= 3 && inOrdine.slice(da, a).every((p) => p.colonna === -1 && eTitolo(p.riga));
    const titoloLargo = soloTitolo && tratti[n + 1]?.da === a && eRiquadro[n + 1];
    if (!eRiquadro[n] && !titoloLargo) sfondi.fill("carta", da, a);
  });
  const sequenza = inOrdine.map((p, i) => ({ ...p, riga: { ...p.riga, sfondo: sfondi[i] } }));

  // I margini attorno a ogni riga, presi dalle righe vicine dello stesso flusso.
  const stessoFlusso = (a: Posta, b: Posta) => stessoPosto(a, b) && a.riga.sfondo === b.riga.sfondo;
  const vicine = (i: number, raggio: number) =>
    sequenza.filter((p) => stessoFlusso(p, sequenza[i]) && Math.abs(p.riga.y0 - sequenza[i].riga.y0) <= corpo * raggio);
  const destra = sequenza.map((_, i) => Math.max(...vicine(i, 12).map((p) => p.riga.x1)));
  const sinistra = sequenza.map((p, i) => {
    const diTesto = vicine(i, 8).filter((v) => !eTitolo(v.riga));
    return diTesto.length > 0 ? Math.min(...diTesto.map((v) => v.riga.x0)) : p.riga.x0;
  });

  // L'interlinea del testo: la distanza più comune fra due righe di seguito.
  const salti: number[] = [];
  for (let i = 1; i < sequenza.length; i++) {
    const salto = sequenza[i].riga.base - sequenza[i - 1].riga.base;
    if (stessoFlusso(sequenza[i - 1], sequenza[i]) && salto > 0 && salto < corpo * 3) salti.push(salto);
  }
  const passo = mediana(salti) || corpo * 1.5;
  /** Il salto dalla riga prima, se è dello stesso flusso. */
  const saltoA = (i: number) =>
    i > 0 && i < sequenza.length && stessoFlusso(sequenza[i - 1], sequenza[i]) ? sequenza[i].riga.base - sequenza[i - 1].riga.base : null;
  const comeIl = (salto: number, altro: number | null) => altro !== null && Math.abs(salto - altro) <= passo * 0.15;

  const rientro = corpo * 0.8;
  // Uno spostamento più grande di così non è un rientro: è il testo che gira attorno a una figura.
  const eRientro = (d: number) => d > rientro && d < corpo * 4;
  // La riga `i` si è fermata molto prima del margine. «Molto» perché il testo può essere a
  // bandiera: lì ogni riga finisce dove capita, e solo l'ultima di un capoverso resta così corta.
  const finitaPresto = (i: number) => destra[i] - sequenza[i].riga.x1 > (destra[i] - sinistra[i]) * 0.22;
  const rientrataSullaSuccessiva = (i: number) => {
    const salto = saltoA(i + 1);
    return salto !== null && salto > 0 && salto < passo * 1.3 && eRientro(sequenza[i].riga.x0 - sequenza[i + 1].riga.x0);
  };

  const blocchi: Blocco[] = [];
  let righeNelBlocco = 0;
  for (let i = 0; i < sequenza.length; i++) {
    const { riga, colonna } = sequenza[i];
    const prima = i > 0 ? sequenza[i - 1] : null;
    const titolo = eTitolo(riga);
    const ultimo = blocchi.at(-1);
    const salto = prima ? riga.base - prima.riga.base : 0;

    let continua = false;
    if (ultimo && prima && stessoFlusso(prima, sequenza[i]) && salto > 0) {
      if (titolo) {
        // Un titolo su due righe resta un titolo, se sono scritte grandi uguale.
        const rapporto = riga.altezza / (prima.riga.altezza || 1);
        const vicino = salto < Math.max(riga.altezza, prima.riga.altezza) * 2.4;
        // La misura dell'altezza balla (dipende dalle lettere che la riga contiene): due righe
        // di titolo attaccate sono lo stesso titolo anche se una risulta un terzo più bassa.
        continua = ultimo.tipo === "titolo" && vicino && rapporto > 0.65 && rapporto < 1.55;
      } else if (
        ultimo.tipo === "capoverso" &&
        // Di seguito: all'interlinea del testo, oppure a un'interlinea più larga ma costante
        // (una citazione composta più ariosa resta un capoverso solo).
        (salto < passo * 1.3 ||
          (salto < passo * 2 && (comeIl(salto, saltoA(i + 1)) || (righeNelBlocco >= 2 && comeIl(salto, saltoA(i - 1))))))
      ) {
        const d = riga.x0 - prima.riga.x0;
        const nuovaFrase = INIZIA_FRASE.test(riga.testo);
        // Il pallino di un elenco e la lineetta che firma una citazione («—Elminster») aprono
        // sempre una riga loro.
        if (riga.puntata || FIRMA.test(riga.testo) || opzioni.apreCapoverso?.(riga)) continua = false;
        // Corta e seguita da una maiuscola: finiva lì (la voce di un elenco). Non se resta in
        // sospeso su una virgola o su un «di»: è una riga stretta, accanto a una figura.
        else if (finitaPresto(i - 1) && nuovaFrase && !RESTA_IN_SOSPESO.test(prima.riga.testo)) continua = false;
        // Rientrata rispetto alla riga che la SEGUE, dopo una frase finita: apre un capoverso
        // anche se rispetto a quella sopra non lo sembra (un capoverso di una riga sola, o
        // l'ultima riga di un testo che girava attorno a una figura).
        else if (nuovaFrase && CHIUDE_FRASE.test(prima.riga.testo) && rientrataSullaSuccessiva(i)) continua = false;
        // Più rientrata di quella sopra: apre un capoverso, se comincia come una frase (in
        // minuscolo è una riga a cui l'OCR ha perso la prima parola). Ma dopo UNA sola riga al
        // margine è il seguito di una voce «appesa» (prima riga al margine, le altre rientrate),
        // a meno che quella riga non fosse la coda di un capoverso cominciato nella colonna prima.
        else if (eRientro(d)) continua = !nuovaFrase || (righeNelBlocco < 2 && !CHIUDE_FRASE.test(prima.riga.testo));
        // Torna al margine: dopo la prima riga è il capoverso che prosegue; più avanti è la
        // voce appesa successiva, che come ogni voce comincia con la maiuscola.
        else if (eRientro(-d)) continua = righeNelBlocco < 2 || !nuovaFrase;
        else continua = true;
      }
    }

    if (continua && ultimo) {
      ultimo.testo = unisciRighe(ultimo.testo, riga.testo);
      righeNelBlocco++;
    } else {
      blocchi.push({
        tipo: titolo ? "titolo" : "capoverso",
        testo: riga.testo,
        grandezza: Math.round((riga.altezza / corpo) * 100) / 100,
        y: riga.y0,
        colonna,
        sfondo: riga.sfondo,
        puntato: riga.puntata && !titolo,
        rientrato: eRientro(riga.x0 - sinistra[i]),
        staccato: prima === null || !stessoFlusso(prima, sequenza[i]) || salto <= 0 || salto >= passo * 3,
      });
      righeNelBlocco = 1;
    }
  }
  return blocchi;
}

/** Un pezzo del testo di un libro, dopo che le pagine sono state cucite insieme. */
export interface Pezzo {
  /** `elenco`: le voci di un elenco puntato, una per riga, ciascuna preceduta da «- ». */
  tipo: "titolo" | "capoverso" | "elenco";
  testo: string;
  grandezza: number;
  /** La pagina in cui comincia. */
  pagina: number;
  /** Fa parte di un riquadro di approfondimento. */
  riquadro: boolean;
}

/**
 * Mette in fila i blocchi di più pagine come li leggerebbe una persona:
 * - un capoverso rimasto a metà in fondo a una colonna o a una pagina prosegue in cima alla
 *   successiva (si riconosce perché non chiude la frase, e ciò che segue non è rientrato);
 * - un riquadro che cade in mezzo a quel capoverso aspetta che sia finito, invece di spezzarlo;
 * - un riquadro largo quanto la pagina, che si legge una colonna per volta con il testo in
 *   mezzo, torna intero: la seconda colonna si riattacca alla prima;
 * - le voci di un elenco puntato tornano un elenco solo.
 */
export function cuciPagine(pagine: { pagina: number; blocchi: Blocco[] }[]): Pezzo[] {
  const flusso: Pezzo[] = [];
  // I blocchi di riquadro incontrati e non ancora messi nel flusso, ciascuno con la sua pagina.
  type Letto = { blocco: Blocco; pagina: number };
  let inAttesa: Letto[] = [];
  // Dove finisce, nel flusso, l'ultimo riquadro messo giù in questa pagina.
  let fineRiquadro: number | null = null;

  /** Il capoverso `prima` è rimasto a metà e `blocco` può esserne il seguito. */
  const prosegue = (prima: Pezzo | undefined, blocco: Blocco) =>
    prima?.tipo === "capoverso" &&
    blocco.tipo === "capoverso" &&
    !blocco.puntato &&
    blocco.staccato &&
    // Rientrato ma in minuscolo: non apre un capoverso, è il seguito di una voce «appesa».
    (!blocco.rientrato || /^\p{Ll}/u.test(blocco.testo)) &&
    !CHIUDE_FRASE.test(prima.testo);

  /** L'ultima voce di un elenco è rimasta a metà in fondo alla colonna, e `blocco` la finisce. */
  const finisceLaVoce = (prima: Pezzo | undefined, blocco: Blocco) =>
    prima?.tipo === "elenco" && blocco.tipo === "capoverso" && !blocco.puntato && blocco.staccato && /^\p{Ll}/u.test(blocco.testo) && !CHIUDE_FRASE.test(prima.testo);

  const pezziDa = (letti: Letto[]): Pezzo[] => {
    const out: Pezzo[] = [];
    for (const { blocco, pagina } of letti) {
      const riquadro = blocco.sfondo === "riquadro";
      const ultimo = out.at(-1);
      if (blocco.puntato && ultimo?.tipo === "elenco") ultimo.testo += `\n- ${blocco.testo}`;
      else if (blocco.puntato) out.push({ tipo: "elenco", testo: `- ${blocco.testo}`, grandezza: blocco.grandezza, pagina, riquadro });
      else out.push({ tipo: blocco.tipo, testo: blocco.testo, grandezza: blocco.grandezza, pagina, riquadro });
    }
    return out;
  };

  const posa = () => {
    if (inAttesa.length === 0) return;
    const [primo, ...altri] = inAttesa;
    inAttesa = [];
    // Senza titolo in testa, e con un riquadro già posato in questa pagina: è il suo seguito.
    if (primo.blocco.tipo !== "titolo" && fineRiquadro !== null) {
      const coda = flusso[fineRiquadro - 1];
      const attaccato = prosegue(coda, primo.blocco);
      if (attaccato) coda.testo = unisciRighe(coda.testo, primo.blocco.testo);
      const daMettere = pezziDa(attaccato ? altri : [primo, ...altri]);
      flusso.splice(fineRiquadro, 0, ...daMettere);
      fineRiquadro += daMettere.length;
      return;
    }
    flusso.push(...pezziDa([primo, ...altri]));
    fineRiquadro = flusso.length;
  };

  for (const { pagina, blocchi } of pagine) {
    fineRiquadro = null;
    for (const blocco of blocchi) {
      if (blocco.sfondo === "riquadro") {
        inAttesa.push({ blocco, pagina });
        continue;
      }
      const ultimo = flusso.at(-1);
      if (ultimo && !ultimo.riquadro && (prosegue(ultimo, blocco) || finisceLaVoce(ultimo, blocco))) {
        ultimo.testo = unisciRighe(ultimo.testo, blocco.testo);
        continue;
      }
      posa();
      const [pezzo] = pezziDa([{ blocco, pagina }]);
      // La voce di un elenco puntato continua l'elenco che ha davanti.
      if (pezzo.tipo === "elenco" && ultimo?.tipo === "elenco" && !ultimo.riquadro && flusso.at(-1) === ultimo) ultimo.testo += `\n${pezzo.testo}`;
      else flusso.push(pezzo);
    }
  }
  posa();
  return flusso;
}
