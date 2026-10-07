/**
 * Scioglie i rimandi "_copy" del bestiario di 5etools.
 *
 * Un quarto delle creature (1.143 su 4.559) non ha statistiche proprie: dichiara di essere una
 * copia di un'altra, con qualche modifica. Il "Basilisco a Minaccia Ridotta" è letteralmente
 * `{ name, _copy: { name: "Basilisk", source: "MM", _templates: [...] } }` e nient'altro.
 * Senza questo passaggio il Compendio leggeva campi inesistenti e mostrava "—" ovunque e "(NaN)"
 * su tutte e sei le caratteristiche (segnalato dall'utente sul basilisco).
 *
 * Non è una reimplementazione completa del motore di 5etools: copre le operazioni che compaiono
 * davvero nei dati (le cinque più frequenti valgono il 97% dei casi) e ignora in silenzio quelle
 * che non conosce. Ignorarne una lascia comunque la creatura con le statistiche della base, che
 * è il grosso dell'informazione: molto meglio di una scheda di soli trattini.
 */

type Qualunque = Record<string, unknown>;

interface Operazione extends Qualunque {
  mode?: string;
}

export interface RiferimentoCopia {
  name: string;
  source: string;
  _mod?: Record<string, Operazione | Operazione[]>;
  _templates?: { name: string; source: string }[];
}

export interface ConCopia {
  name: string;
  source: string;
  _copy?: RiferimentoCopia;
}

export interface TemplateCreatura {
  name: string;
  source: string;
  apply?: { _mod?: Record<string, Operazione | Operazione[]> };
}

const chiave = (nome: string, fonte: string) => nome.toLowerCase() + "|" + fonte.toLowerCase();

/** Applica una funzione a ogni stringa dentro una struttura annidata. */
function mappaStringhe(valore: unknown, f: (s: string) => string): unknown {
  if (typeof valore === "string") return f(valore);
  if (Array.isArray(valore)) return valore.map((v) => mappaStringhe(v, f));
  if (valore && typeof valore === "object") {
    const out: Qualunque = {};
    for (const [k, v] of Object.entries(valore)) out[k] = mappaStringhe(v, f);
    return out;
  }
  return valore;
}

/** Il nome di una voce di elenco, usato da replaceArr/removeArr per sapere cosa sostituire. */
function nomeVoce(voce: unknown): string | null {
  if (typeof voce === "string") return voce;
  if (voce && typeof voce === "object" && typeof (voce as Qualunque).name === "string") {
    return (voce as { name: string }).name;
  }
  return null;
}

function comeElenco(valore: unknown): unknown[] {
  return Array.isArray(valore) ? [...valore] : [];
}

function vociDi(op: Operazione): unknown[] {
  if (Array.isArray(op.items)) return op.items;
  return op.items === undefined ? [] : [op.items];
}

function applicaOperazione(creatura: Qualunque, campo: string, op: Operazione): void {
  const suOgniCampo = campo === "*" || campo === "_";

  switch (op.mode) {
    // Di gran lunga la più diffusa (802 usi): rinomina la creatura dentro il proprio testo, es.
    // "the dragon" -> "Burney the Barber". Con campo "*" tocca ogni stringa della scheda.
    case "replaceTxt": {
      const cerca = String(op.replace ?? "");
      if (!cerca) return;
      const con = String(op.with ?? "");
      const regex = new RegExp(cerca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const sostituisci = (s: string) => s.replace(regex, con);
      if (suOgniCampo) {
        for (const k of Object.keys(creatura)) {
          if (k === "name" || k === "source" || k === "_copy") continue;
          creatura[k] = mappaStringhe(creatura[k], sostituisci);
        }
      } else {
        creatura[campo] = mappaStringhe(creatura[campo], sostituisci);
      }
      return;
    }

    case "appendArr":
      creatura[campo] = [...comeElenco(creatura[campo]), ...vociDi(op)];
      return;

    case "prependArr":
      creatura[campo] = [...vociDi(op), ...comeElenco(creatura[campo])];
      return;

    case "insertArr": {
      const elenco = comeElenco(creatura[campo]);
      const i = typeof op.index === "number" ? op.index : elenco.length;
      elenco.splice(i, 0, ...vociDi(op));
      creatura[campo] = elenco;
      return;
    }

    case "appendIfNotExistsArr": {
      const elenco = comeElenco(creatura[campo]);
      const presenti = new Set(elenco.map(nomeVoce).filter(Boolean));
      creatura[campo] = [...elenco, ...vociDi(op).filter((v) => !presenti.has(nomeVoce(v)))];
      return;
    }

    case "replaceArr": {
      const elenco = comeElenco(creatura[campo]);
      const bersaglio = typeof op.replace === "string" ? op.replace : nomeVoce(op.replace);
      const i = elenco.findIndex((v) => nomeVoce(v) === bersaglio);
      if (i === -1) return;
      elenco.splice(i, 1, ...vociDi(op));
      creatura[campo] = elenco;
      return;
    }

    case "removeArr": {
      const grezzi = Array.isArray(op.names)
        ? op.names
        : op.names === undefined
          ? vociDi(op)
          : [op.names];
      const daTogliere = new Set(grezzi.map((v) => (typeof v === "string" ? v : nomeVoce(v))));
      creatura[campo] = comeElenco(creatura[campo]).filter((v) => !daTogliere.has(nomeVoce(v)));
      return;
    }

    case "setProp": {
      if (typeof op.prop !== "string") return;
      const dove = suOgniCampo ? creatura : (creatura[campo] as Qualunque);
      if (dove && typeof dove === "object") dove[op.prop] = op.value;
      return;
    }

    // Le prossime arrivano dai template, es. "Reduced Threat": metà punti ferita e −2 ai tiri per
    // colpire e alle CD.
    case "scalarAddHit":
    case "scalarAddDc": {
      const n = Number(op.scalar ?? 0);
      const etichetta = op.mode === "scalarAddHit" ? "hit" : "dc";
      const regex = new RegExp("\\{@" + etichetta + " (-?\\d+)\\}", "g");
      const tocca = (s: string) =>
        s.replace(regex, (_intero, v: string) => "{@" + etichetta + " " + (Number(v) + n) + "}");
      if (suOgniCampo) {
        for (const k of Object.keys(creatura)) creatura[k] = mappaStringhe(creatura[k], tocca);
      } else {
        creatura[campo] = mappaStringhe(creatura[campo], tocca);
      }
      return;
    }

    case "scalarMultProp":
    case "scalarAddProp": {
      const contenitore = creatura[campo];
      if (!contenitore || typeof contenitore !== "object") return;
      const n = Number(op.scalar ?? (op.mode === "scalarMultProp" ? 1 : 0));
      const props = op.prop === "*" ? Object.keys(contenitore) : [String(op.prop ?? "")];
      for (const prop of props) {
        const attuale = (contenitore as Qualunque)[prop];
        const numero = typeof attuale === "number" ? attuale : Number(attuale);
        if (!Number.isFinite(numero)) continue;
        const calcolato = op.mode === "scalarMultProp" ? numero * n : numero + n;
        const finale = op.floor ? Math.floor(calcolato) : calcolato;
        // Tiri salvezza e abilità sono stringhe tipo "+5": vanno riscritte col segno, altrimenti
        // la scheda stamperebbe "3" invece di "+3".
        (contenitore as Qualunque)[prop] =
          typeof attuale === "string" ? (finale >= 0 ? "+" + finale : String(finale)) : finale;
      }
      return;
    }

    case "prefixSuffixStringProp": {
      const contenitore = creatura[campo];
      if (!contenitore || typeof contenitore !== "object") return;
      const prop = String(op.prop ?? "");
      const attuale = (contenitore as Qualunque)[prop];
      if (typeof attuale !== "string") return;
      (contenitore as Qualunque)[prop] = String(op.prefix ?? "") + attuale + String(op.suffix ?? "");
      return;
    }

    default:
      // Operazione che non conosciamo (addSpells, replaceSpells, maxSize...): si lascia la
      // creatura com'è invece di rovinarla. Perde un dettaglio, non l'intera scheda.
      return;
  }
}

function applicaModifiche(
  creatura: Qualunque,
  mod: Record<string, Operazione | Operazione[]> | undefined,
): void {
  if (!mod) return;
  for (const [campo, operazioni] of Object.entries(mod)) {
    for (const op of Array.isArray(operazioni) ? operazioni : [operazioni]) {
      try {
        applicaOperazione(creatura, campo, op);
      } catch {
        // Una singola operazione malformata non deve far perdere tutta la creatura.
      }
    }
  }
}

/**
 * Restituisce l'elenco con ogni "_copy" già sciolto.
 *
 * Le copie possono essere a catena (A copia B che copia C): si risolve ricorsivamente, tenendo
 * memoria di quelle in lavorazione per non restare incastrati se due si copiassero a vicenda.
 */
export function risolviCopie<T extends ConCopia>(
  creature: T[],
  templates: TemplateCreatura[] = [],
): T[] {
  const perChiave = new Map<string, T>();
  for (const c of creature) perChiave.set(chiave(c.name, c.source), c);

  const templatePerChiave = new Map<string, TemplateCreatura>();
  for (const t of templates) templatePerChiave.set(chiave(t.name, t.source), t);

  const risolte = new Map<string, T>();
  const inCorso = new Set<string>();

  function risolvi(creatura: T): T {
    const k = chiave(creatura.name, creatura.source);
    const gia = risolte.get(k);
    if (gia) return gia;
    if (!creatura._copy || inCorso.has(k)) return creatura;

    inCorso.add(k);
    try {
      const base = perChiave.get(chiave(creatura._copy.name, creatura._copy.source));
      if (!base) return creatura;

      const unita = structuredClone(risolvi(base)) as unknown as Qualunque;
      // I campi propri vincono su quelli ereditati; "_copy" sparisce perché ormai sciolto.
      for (const [campo, valore] of Object.entries(creatura)) {
        if (campo === "_copy") continue;
        unita[campo] = structuredClone(valore);
      }
      delete unita._copy;

      applicaModifiche(unita, creatura._copy._mod);
      for (const rif of creatura._copy._templates ?? []) {
        const template = templatePerChiave.get(chiave(rif.name, rif.source));
        applicaModifiche(unita, template?.apply?._mod);
      }

      const finale = unita as unknown as T;
      risolte.set(k, finale);
      return finale;
    } catch {
      return creatura;
    } finally {
      inCorso.delete(k);
    }
  }

  return creature.map((c) => (c._copy ? risolvi(c) : c));
}
