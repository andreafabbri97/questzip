/**
 * Scioglie i rimandi `{#itemEntry Nome|FONTE}` degli oggetti di 5etools.
 *
 * Le famiglie di oggetti che differiscono per un dettaglio — i dieci Anelli di Resistenza, le
 * Pozioni di Resistenza, le Pietre Ioun, i Tatuaggi Assorbenti — non ripetono la descrizione in
 * ogni voce: la tengono una volta sola in un modello (`itemEntry`, in items-base.json) e nella
 * voce mettono il rimando, con accanto i valori che cambiano.
 *
 *     { name: "Ring of Acid Resistance", resist: ["acid"], detail1: "pearl",
 *       entries: ["{#itemEntry Ring of Resistance}"] }
 *     modello: "You have resistance to {{item.resist}} damage while wearing this ring.
 *               The ring is set with {{item.detail1}}."
 *
 * Senza questo passaggio il Compendio non aveva niente da mostrare: in inglese stampava il
 * rimando alla lettera, in italiano la sua "traduzione". Riguarda 122 oggetti, e per 101 il
 * rimando era l'intera descrizione.
 *
 * File senza dipendenze: lo usano anche gli script di scripts/ita-compendio, fuori da Next.
 */

/** Un nodo di "entries": stringa, oppure oggetto con altri nodi dentro. */
type Nodo = string | { [chiave: string]: unknown };

export interface ModelloOggetto {
  name: string;
  source?: string;
  entriesTemplate?: Nodo[];
}

/** Quando il rimando non dice la fonte, 5etools intende il Manuale del DM del 2014. */
const FONTE_PREDEFINITA = "DMG";

const RIMANDO = /^\{#itemEntry ([^|}]+)(?:\|([^|}]*))?\}$/;

const chiaveModello = (nome: string, fonte: string | undefined) =>
  `${nome.trim()}|${(fonte || FONTE_PREDEFINITA).trim()}`.toLowerCase();

/** Indice dei modelli per "nome|fonte", da costruire una volta sola. */
export function indiceModelli(modelli: ModelloOggetto[] | undefined): Map<string, Nodo[]> {
  const indice = new Map<string, Nodo[]>();
  for (const modello of modelli ?? []) {
    if (modello.entriesTemplate) indice.set(chiaveModello(modello.name, modello.source), modello.entriesTemplate);
  }
  return indice;
}

/**
 * `{{item.resist}}` e `{{getFullImmRes item.resist}}` prendono il valore dal campo della voce.
 * La seconda forma in 5etools compone l'elenco dei tipi di danno: qui i tipi sono sempre uno o
 * pochi, e un elenco con le virgole dice la stessa cosa.
 */
function riempi(testo: string, valori: Record<string, unknown>): string {
  return testo.replace(/\{\{(?:\w+ )?item\.(\w+)\}\}/g, (intero, campo: string) => {
    const valore = valori[campo];
    if (valore === undefined || valore === null || valore === "") return intero;
    return Array.isArray(valore) ? valore.map(String).join(", ") : String(valore);
  });
}

function riempiProfondo(nodo: unknown, valori: Record<string, unknown>): unknown {
  if (typeof nodo === "string") return riempi(nodo, valori);
  if (Array.isArray(nodo)) return nodo.map((n) => riempiProfondo(n, valori));
  if (nodo && typeof nodo === "object") {
    return Object.fromEntries(Object.entries(nodo).map(([k, v]) => [k, riempiProfondo(v, valori)]));
  }
  return nodo;
}

/**
 * Sostituisce ogni rimando con il testo del suo modello, riempito con i valori della voce.
 * Un rimando a un modello che non esiste resta com'è: chi mostra il testo lo riconosce e lo
 * nasconde (vedi eRimandoCrudo in lib/testo-strutturato.ts), invece di perdere il resto.
 */
export function sciogliRimandiOggetto<T>(
  entries: T[] | undefined,
  valori: Record<string, unknown>,
  modelli: Map<string, Nodo[]>,
): T[] | undefined {
  if (!entries || modelli.size === 0) return entries;
  const out: T[] = [];
  for (const entry of entries) {
    const rimando = typeof entry === "string" ? entry.trim().match(RIMANDO) : null;
    const modello = rimando ? modelli.get(chiaveModello(rimando[1], rimando[2])) : undefined;
    if (modello) out.push(...(riempiProfondo(modello, valori) as T[]));
    else out.push(entry);
  }
  return out;
}

/** Vero se fra le voci resta un rimando: serve a chi deve sapere se c'è ancora lavoro da fare. */
export function haRimandiOggetto(entries: unknown[] | undefined): boolean {
  return (entries ?? []).some((e) => typeof e === "string" && RIMANDO.test(e.trim()));
}
