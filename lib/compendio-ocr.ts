// Regole di lettura condivise dai parser dei manuali italiani (scripts/ita-compendio/parse-*.mjs).
//
// Stanno qui, e non dentro i singoli script, per due motivi: sono le stesse in tutti i parser
// (incantesimi, talenti, mostri leggono la stessa tipografia), e sono la parte che sbaglia più
// facilmente — ogni regola nasce da una scheda che era sparita dal Compendio, quindi va coperta
// dai test invece di essere verificata a mano sul PDF ogni volta.

/**
 * Nei titoli dei manuali italiani articoli e preposizioni restano minuscoli: negli elenchi per
 * classe del Manuale del Giocatore si legge "Banchetto degli Eroi", "Camminare nel Vento",
 * "Interdizione alle Lame". Il nome delle schede è però stampato tutto in maiuscolo, quindi la
 * grafia va ricostruita — e con un elenco incompleto uscivano nomi come "Tempio Degli Dèi".
 */
export const TITOLO_STOPWORDS = new Set([
  "di", "del", "dello", "della", "dei", "degli", "delle",
  "a", "al", "allo", "alla", "ai", "agli", "alle",
  "da", "dal", "dallo", "dalla", "dai", "dagli", "dalle",
  "in", "nel", "nello", "nella", "nei", "negli", "nelle",
  "su", "sul", "sullo", "sulla", "sui", "sugli", "sulle",
  "con", "col", "per", "tra", "fra",
  "e", "ed", "o", "od",
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
]);

/**
 * Le stesse parole, elise davanti a vocale ("sull'Acqua", "dall'Energia", "d'Ombra"): la parte
 * prima dell'apostrofo resta minuscola, quella dopo va maiuscola.
 */
export const TITOLO_ELISIONI = new Set([
  "d", "l", "un", "dell", "all", "nell", "sull", "dall", "coll", "sott",
]);

/** Rimette in stile titolo un nome stampato tutto in maiuscolo. */
export function titoloItaliano(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((parola, i) => {
      if (i > 0 && TITOLO_STOPWORDS.has(parola)) return parola;
      const elisione = i > 0 ? parola.match(/^([a-zà-ÿ]+)'(.+)$/) : null;
      if (elisione && TITOLO_ELISIONI.has(elisione[1])) {
        return `${elisione[1]}'${elisione[2].replace(/^[a-zà-ÿ]/, (c) => c.toUpperCase())}`;
      }
      return parola.replace(/(^|[-'/])([a-zà-ÿ])/g, (_m, sep, lettera) => sep + lettera.toUpperCase());
    })
    .join(" ");
}

/**
 * Il sottotitolo di un incantesimo ("Illusione di 5° livello") è la riga più fragile della scheda:
 * è in corsivo, e nel corsivo l'OCR confonde lettere e cifre di forma simile. Le schede che ne
 * uscivano storpiate venivano scartate in silenzio, e con esse l'incantesimo intero. Tre confusioni
 * ricorrenti, tutte viste nel Manuale del Giocatore e nella Guida di Xanathar:
 *   - la "I" iniziale della scuola letta come "1", "l" o "J" ("1llusione", "Jllusione");
 *   - la cifra del livello letta come lettera ("Illusione di s° livello" per il 5);
 *   - la seconda "l" di "livello" letta come J o cifra ("livelJo").
 * La correzione va sempre verificata a valle contro le otto scuole di magia vere: da sola non
 * decide nulla, e così una riga di prosa qualsiasi non può passare per un sottotitolo.
 */
const CIFRE_DA_LETTERA: Record<string, string> = {
  s: "5", S: "5", Z: "2", B: "8", G: "6", O: "0", o: "0",
};

export function correggiSottotitoloIncantesimo(sottotitolo: string): string {
  return sottotitolo
    .replace(/^[1lJ](?=[a-zà-ù])/, "I")
    .replace(/\bdi\s+([sSZBGOo])(?=\s*[°·'’]\s*livel[lJ1I]o)/, (_m, c: string) => `di ${CIFRE_DA_LETTERA[c]}`);
}

/** I gradi di sfida che esistono davvero in D&D 5e. */
export const GRADI_DI_SFIDA = new Set<string>([
  "0", "1/8", "1/4", "1/2",
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
]);

/**
 * Le cifre del grado di sfida possono uscire separate da uno spazio spurio, come già visto per la
 * Classe Armatura ("Classe Armatura 1 9"): "Sfida 1 7 (18.000 PE)" veniva letto come grado 1, e il
 * mostro finiva in Compendio con la sfida sbagliata o veniva scartato per incoerenza (il Nagpa è
 * 17, non 1). Gli spazi si tolgono solo se il risultato è un grado che esiste davvero.
 */
export function normalizzaGradoSfida(grezzo: string): string {
  const compatto = grezzo.replace(/\s+/g, "");
  if (GRADI_DI_SFIDA.has(compatto)) return compatto;
  return grezzo.trim().split(/\s+/)[0] ?? "";
}
