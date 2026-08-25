import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  compendioItaIncantesimi,
  compendioItaMostri,
  compendioItaOggetti,
  compendioItaRazze,
  compendioItaTalenti,
} from "@/lib/db/schema";

/**
 * Recupera il testo UFFICIALE italiano di una singola voce del Compendio, cioè quello estratto dai
 * manuali veri, a partire dal nome inglese con cui la voce è catalogata (5etools).
 *
 * Serve all'assistente IA: prima si ancorava ai soli dati inglesi di 5etools, quindi rispondeva
 * con una traduzione improvvisata di termini che nell'app compaiono già con la resa ufficiale del
 * manuale ("Fiotto Acido", non "Spruzzo Acido"). Passando al modello il testo del manuale la
 * risposta usa le stesse parole e gli stessi numeri che l'utente vede nella scheda.
 */

// PHB/XPHB, MM/XMM, DMG/XDMG sono la stessa opera in due edizioni: il testo ufficiale italiano
// esiste solo per quella del 2014, quindi una voce del 2024 va cercata anche sotto la sorella.
// Stesso ragionamento (e stessa tabella) di findUfficiale in lib/fivetools/compendio-detail.tsx.
const EDIZIONI_SORELLE: Record<string, string> = {
  XPHB: "PHB",
  PHB: "XPHB",
  XMM: "MM",
  MM: "XMM",
  XDMG: "DMG",
  DMG: "XDMG",
};

export type KindUfficiale = "incantesimi" | "mostri" | "oggetti" | "razze" | "talenti";

const KIND_CON_TESTO_UFFICIALE: KindUfficiale[] = [
  "incantesimi",
  "mostri",
  "oggetti",
  "razze",
  "talenti",
];

export function haTestoUfficiale(kind: string): kind is KindUfficiale {
  return (KIND_CON_TESTO_UFFICIALE as string[]).includes(kind);
}

/** Riga ufficiale italiana corrispondente alla voce inglese, o null se quel manuale non è stato
 * estratto (il Compendio copre i manuali principali, non tutte le fonti). */
export async function cercaVoceUfficiale(
  kind: KindUfficiale,
  nomeInglese: string,
  fonteInglese: string,
): Promise<Record<string, unknown> | null> {
  const fonti = [fonteInglese, EDIZIONI_SORELLE[fonteInglese]].filter(Boolean) as string[];
  // Uno switch con cinque rami espliciti invece di un accesso dinamico alla tabella: Drizzle
  // tipizza le colonne per singola tabella, e indicizzarle in modo generico costringe a un cast
  // che spegne proprio i controlli di tipo che rendono utile Drizzle qui.
  const righe = await (async () => {
    switch (kind) {
      case "incantesimi": {
        const t = compendioItaIncantesimi;
        return db.select().from(t)
          .where(and(eq(t.nomeInglese, nomeInglese), inArray(t.fonteInglese, fonti))).limit(2);
      }
      case "mostri": {
        const t = compendioItaMostri;
        return db.select().from(t)
          .where(and(eq(t.nomeInglese, nomeInglese), inArray(t.fonteInglese, fonti))).limit(2);
      }
      case "oggetti": {
        const t = compendioItaOggetti;
        return db.select().from(t)
          .where(and(eq(t.nomeInglese, nomeInglese), inArray(t.fonteInglese, fonti))).limit(2);
      }
      case "razze": {
        const t = compendioItaRazze;
        return db.select().from(t)
          .where(and(eq(t.nomeInglese, nomeInglese), inArray(t.fonteInglese, fonti))).limit(2);
      }
      case "talenti": {
        const t = compendioItaTalenti;
        return db.select().from(t)
          .where(and(eq(t.nomeInglese, nomeInglese), inArray(t.fonteInglese, fonti))).limit(2);
      }
    }
  })();

  if (!righe || righe.length === 0) return null;
  // A parità di nome si preferisce l'edizione chiesta; la sorella è solo un ripiego.
  const esatta = righe.find((r) => r.fonteInglese === fonteInglese);
  return (esatta ?? righe[0]) as Record<string, unknown>;
}
