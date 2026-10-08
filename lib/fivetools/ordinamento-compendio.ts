/**
 * L'ordinamento dell'elenco del Compendio: per nome, grado di sfida, rarità, livello o manuale,
 * in entrambi i versi.
 *
 * Stava dentro la pagina, in mezzo al filtro. È uscito da lì per due difetti che lì dentro non si
 * potevano provare:
 *
 * - ordinando i mostri per GS, le creature che un grado di sfida NON ce l'hanno (oltre cento:
 *   evocazioni, gregari descritti da un livello, png senza statistiche) valevano "-1" e finivano
 *   tutte in testa, mescolate per nome. Le prime quattro pagine erano «Livello 3», «—»,
 *   «competenza come la tua», e sembrava che l'ordinamento non funzionasse (segnalato
 *   dall'utente). Chi non ha il valore va in FONDO, e ci resta anche invertendo il verso: quando
 *   si chiede "dal più forte al più debole" non si vuole cominciare da chi non ha un numero;
 * - non esisteva il verso contrario (Z→A, dal GS 30 in giù).
 *
 * A parità di valore l'ordine è sempre alfabetico dalla A alla Z, qualunque sia il verso: dentro
 * "GS 5" cercare un nome dalla Z sarebbe solo una sorpresa.
 */

export type SortMode = "nome" | "cr" | "rarita" | "livello" | "manuale";
export type SortDirection = "asc" | "desc";

/** Quello che serve sapere di una voce per metterla in fila; ogni categoria ne usa un pezzo. */
export interface VoceOrdinabile {
  name: string;
  source: string;
  cr?: string | { cr: string };
  level?: unknown;
  pbNote?: string;
  rarity?: string;
}

const RARITY_ORDER = ["none", "common", "uncommon", "rare", "very rare", "legendary", "artifact"];

// Virgolette e simboli iniziali non devono decidere la posizione: '"Il Demogorgon"' si cerca alla
// I come ogni altro nome, non in un angolo dell'elenco.
const INIZIALE_NON_ALFABETICA = /^[^\p{L}\p{N}]+/u;

// Locale italiana: accenti e maiuscole seguono le regole giuste ("È" accanto a "E").
const collatore = new Intl.Collator("it", { sensitivity: "base" });

/** Il grado di sfida come numero ("1/4" -> 0.25), o -1 quando non c'è o non è un numero. */
export function crToNumber(cr: VoceOrdinabile["cr"]): number {
  const s = typeof cr === "string" ? cr : (cr?.cr ?? "");
  if (s === "") return -1;
  if (s.includes("/")) {
    const [n, d] = s.split("/").map(Number);
    return d ? n / d : -1;
  }
  const n = Number(s);
  return Number.isNaN(n) ? -1 : n;
}

/** Un modo che per quella categoria non ha senso (il GS degli incantesimi) ricade sul nome. */
export function modoEffettivo(modo: SortMode, kind: string): SortMode {
  if (modo === "cr" && kind !== "mostri") return "nome";
  if (modo === "rarita" && kind !== "oggetti") return "nome";
  if (modo === "livello" && kind !== "incantesimi") return "nome";
  return modo;
}

// "gruppo" separa chi ha il valore da chi non ce l'ha: si confronta per primo e non si inverte mai.
type Chiave = { gruppo: number; numero: number; testo: string };

function chiaveDi(voce: VoceOrdinabile, modo: SortMode, nomeManuale: string): Chiave {
  switch (modo) {
    case "cr": {
      const sfida = crToNumber(voce.cr);
      if (sfida >= 0) return { gruppo: 0, numero: sfida, testo: "" };
      // Senza grado di sfida, nello stesso ordine in cui la riga li descrive: prima chi ha un
      // livello (e fra loro per livello), poi le evocazioni, infine chi non ha niente.
      if (typeof voce.level === "number") return { gruppo: 1, numero: voce.level, testo: "" };
      if (voce.pbNote?.trim()) return { gruppo: 2, numero: 0, testo: "" };
      return { gruppo: 3, numero: 0, testo: "" };
    }
    case "rarita": {
      const indice = RARITY_ORDER.indexOf(voce.rarity ?? "none");
      // "varies", "unknown": una rarità che non sta sulla scala non è la più bassa, è fuori scala.
      return indice >= 0 ? { gruppo: 0, numero: indice, testo: "" } : { gruppo: 1, numero: 0, testo: "" };
    }
    case "livello":
      return typeof voce.level === "number"
        ? { gruppo: 0, numero: voce.level, testo: "" }
        : { gruppo: 1, numero: 0, testo: "" };
    case "manuale":
      return { gruppo: 0, numero: 0, testo: nomeManuale };
    default:
      return { gruppo: 0, numero: 0, testo: "" };
  }
}

export function ordinaVoci<E extends VoceOrdinabile>(
  voci: E[],
  opzioni: {
    modo: SortMode;
    direzione: SortDirection;
    kind: string;
    /** Il nome che si LEGGE nella riga: con l'interfaccia in italiano è quello italiano. */
    nomeMostrato: (voce: E) => string;
    nomeManuale: (voce: E) => string;
  },
): E[] {
  const modo = modoEffettivo(opzioni.modo, opzioni.kind);
  const segno = opzioni.direzione === "desc" ? -1 : 1;

  // Le chiavi si calcolano una volta per voce e non a ogni confronto: il nome mostrato passa da
  // più tabelle di traduzione, e il bestiario ha migliaia di righe.
  const decorate = voci.map((voce) => ({
    voce,
    nome: opzioni.nomeMostrato(voce).replace(INIZIALE_NON_ALFABETICA, ""),
    ...chiaveDi(voce, modo, modo === "manuale" ? opzioni.nomeManuale(voce) : ""),
  }));

  decorate.sort((a, b) => {
    if (a.gruppo !== b.gruppo) return a.gruppo - b.gruppo;
    if (modo === "nome") return collatore.compare(a.nome, b.nome) * segno;
    const primario = modo === "manuale" ? collatore.compare(a.testo, b.testo) : a.numero - b.numero;
    if (primario !== 0) return primario * segno;
    return collatore.compare(a.nome, b.nome);
  });

  return decorate.map((d) => d.voce);
}

/** L'indicazione del verso da scrivere sul pulsante attivo: "A→Z", "30→0"... */
export function etichettaVerso(modo: SortMode, direzione: SortDirection): string {
  const crescente = direzione === "asc";
  switch (modo) {
    case "cr":
      return crescente ? "0→30" : "30→0";
    case "livello":
      return crescente ? "0→9" : "9→0";
    case "rarita":
      return crescente ? "comune→raro" : "raro→comune";
    default:
      return crescente ? "A→Z" : "Z→A";
  }
}
