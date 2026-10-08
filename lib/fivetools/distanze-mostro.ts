// Le distanze di una scheda confrontate con quelle dell'originale. I manuali italiani convertono i
// piedi in metri a 1,5 metri ogni 5 piedi, quindi una distanza — come un dado — si può controllare
// senza leggere la pagina: se l'originale dice "within 60 feet" e la scheda non ha un "18 metri",
// la frase manca oppure il numero è stato letto male ("1 8 metri", "l,5 m").
//
// Senza import con alias: lo usano anche gli script di scripts/ita-compendio.

/** Una distanza trovata in un testo: quanto vale in metri e la frase che la contiene. */
export interface Distanza {
  /** Il valore in metri, con la virgola ("1,5", "18", "0,3"); i chilometri finiscono in "km". */
  valore: string;
  /** Altri modi in cui il manuale italiano può aver scritto la stessa distanza. */
  alternative: string[];
  contesto: string;
}

export interface ConfrontoDistanze {
  /** Distanze dell'originale che la scheda italiana non ha. */
  mancanti: Distanza[];
  /** Distanze della scheda italiana che l'originale non ha. */
  inPiu: Distanza[];
}

const scrivi = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

// "30/120 ft.", "5 ft.", "60-foot", "20 feet", "1,000 feet" (la virgola delle migliaia).
// Non dopo una «d»: «moves 1d6 feet» è un tiro di dado, non «6 piedi».
const RE_PIEDI = /(?<!\dd)(?<!\d)(\d{1,3}(?:,\d{3})+|\d+(?:\/\d+)*)[ -](?:ft\.?|feet|foot)\b/g;
const RE_POLLICI = /(\d+)[ -]inch(?:es)?\b/g;
const RE_MIGLIA = /(?<!\d)(\d{1,3}(?:,\d{3})+|\d+)[ -]miles?\b/g;
// Tra il numero e l'unità può esserci l'a capo della colonna ("entro 36\nmetri").
// Le migliaia col punto: «1.500 chilometri».
const RE_METRI = /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?(?:\/\d+(?:,\d+)?)*)\s?(?:m|metri|metro)\b(?![\p{L}'’])/gu;
const RE_CENTIMETRI = /(\d+(?:,\d+)?)\s?(?:cm|centimetri|centimetro)\b/g;
const RE_CHILOMETRI = /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s?(?:km|chilometri|chilometro)\b/g;
// "per ogni metro e mezzo che percorre": i 5 piedi scritti in lettere.
const RE_METRO_E_MEZZO = /\bmetro\s+e\s+mezzo\b/g;
// "each foot of its walking speed", "1 extra foot": il piede senza numero o col numero staccato.
const RE_UN_PIEDE = /\b(?:each|every|per) foot\b/gi;
// "reach 5 ft. or range 30/120, one target": la gittata a cui l'originale ha dimenticato l'unità.
const RE_GITTATA_NUDA = /\brange (\d+\/\d+)(?=,)/g;
const RE_PIEDI_EXTRA = /(\d+) extra (?:feet|foot)\b/g;
// "a 2½-foot-diameter tunnel".
const RE_PIEDI_E_MEZZO = /(\d+)½[ -](?:ft\.?|feet|foot)\b/g;

const contestoDi = (testo: string, inizio: number, lunghezza: number) =>
  testo.slice(Math.max(0, inizio - 45), inizio + lunghezza + 15).replace(/\s+/g, " ").trim();

function trovate(
  testo: string,
  re: RegExp,
  converti: (numero: string) => { valore: string; alternative?: string[] },
): Distanza[] {
  const out: Distanza[] = [];
  for (const m of testo.matchAll(re)) {
    const contesto = contestoDi(testo, m.index, m[0].length);
    for (const numero of m[1].includes("/") ? m[1].split("/") : [m[1]]) {
      const { valore, alternative = [] } = converti(numero);
      out.push({ valore, alternative, contesto });
    }
  }
  return out;
}

/** Le distanze scritte senza numero: ogni occorrenza vale sempre lo stesso. */
const fisse = (testo: string, re: RegExp, valore: string): Distanza[] =>
  [...testo.matchAll(re)].map((m) => ({ valore, alternative: [], contesto: contestoDi(testo, m.index, m[0].length) }));

// Dove il manuale italiano non ha arrotondato a 1,5 metri ogni 5 piedi ha fatto il conto esatto:
// 600 piedi sono "183 metri", 250 "76 metri", 320 "97,5 metri". Sono stampati così, non refusi.
function daPiedi(numero: string) {
  const piedi = Number(numero.replace(/,/g, ""));
  const esatti = piedi * 0.3048;
  return {
    valore: scrivi(piedi * 0.3),
    // Solo per le distanze lunghe: sotto i 100 piedi il conto esatto arrotondato coincide con le
    // letture sbagliate che questo controllo deve trovare («5 m» per 15 piedi, cioè 4,5).
    alternative: piedi >= 100 ? [scrivi(Math.round(esatti)), scrivi(Math.round(esatti * 2) / 2)] : [],
  };
}

const daItaliano = (numero: string) => Number(numero.replace(/\./g, "").replace(",", "."));

/** Toglie i tag di 5etools lasciando il testo: "{@dice 3d6 × 10} feet" diventa "3d6 × 10 feet". */
const senzaTag = (testo: string) => testo.replace(/\{@\w+ ([^|}]*)(?:\|[^}]*)?\}/g, "$1");

/** Le distanze di un testo dell'originale, già convertite in metri. */
export function distanzeInglesi(testo: string): Distanza[] {
  const pulito = senzaTag(testo);
  return [
    ...trovate(pulito, RE_PIEDI, daPiedi),
    ...trovate(pulito, RE_PIEDI_EXTRA, daPiedi),
    ...trovate(pulito, RE_GITTATA_NUDA, daPiedi),
    ...trovate(pulito, RE_PIEDI_E_MEZZO, (n) => ({ valore: scrivi((Number(n) + 0.5) * 0.3) })),
    ...fisse(pulito, RE_UN_PIEDE, "0,3"),
    ...trovate(pulito, RE_POLLICI, (n) => ({ valore: scrivi(Number(n) * 0.025) })),
    ...trovate(pulito, RE_MIGLIA, (n) => ({ valore: `${scrivi(Number(n.replace(/,/g, "")) * 1.5)}km` })),
  ];
}

/** Le distanze di una scheda italiana, in metri. */
export function distanzeItaliane(testo: string): Distanza[] {
  return [
    ...trovate(testo, RE_METRI, (n) => ({ valore: scrivi(daItaliano(n)) })),
    ...trovate(testo, RE_CENTIMETRI, (n) => ({ valore: scrivi(daItaliano(n) / 100) })),
    ...trovate(testo, RE_CHILOMETRI, (n) => ({ valore: `${scrivi(daItaliano(n))}km` })),
    ...fisse(testo, RE_METRO_E_MEZZO, "1,5"),
  ];
}

/**
 * Confronta le distanze di una scheda con quelle dell'originale. `facoltativo` è il testo che la
 * scheda italiana può avere o non avere (i riquadri delle varianti): le sue distanze giustificano
 * una distanza in più, ma non sono richieste.
 */
export function confrontaDistanze(italiano: string, inglese: string, facoltativo = ""): ConfrontoDistanze {
  let resto = distanzeItaliane(italiano);
  const togli = (accetta: (d: Distanza) => boolean) => {
    const i = resto.findIndex(accetta);
    if (i < 0) return false;
    resto = resto.filter((_, k) => k !== i);
    return true;
  };
  // Prima le uguaglianze strette, poi le conversioni esatte: altrimenti un "183" potrebbe
  // prendersi il posto di un "180" che ha un compagno identico più avanti.
  const sospese = distanzeInglesi(inglese).filter((d) => !togli((x) => x.valore === d.valore));
  const mancanti = sospese.filter((d) => !togli((x) => d.alternative.includes(x.valore)));
  for (const d of distanzeInglesi(facoltativo)) {
    if (!togli((x) => x.valore === d.valore)) togli((x) => d.alternative.includes(x.valore));
  }
  return { mancanti, inPiu: resto };
}
