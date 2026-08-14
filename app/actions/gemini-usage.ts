"use server";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { geminiUsageDaily } from "@/lib/db/schema";
import { geminiEnabled } from "@/lib/gemini";

export interface GeminiUsageToday {
  /** Somma di tutte le richieste riuscite oggi, su qualunque modello della catena di fallback. */
  total: number;
  /** Dettaglio per modello — utile perché ogni modello ha una quota RPD separata (vedi lib/gemini.ts). */
  byModel: { model: string; count: number }[];
}

/** Quante richieste IA ha fatto QuestZip OGGI (Postgres CURRENT_DATE, non calcolato in JS) — un
 * conteggio PROPRIO, non la quota residua vera secondo Google (nessun endpoint pubblico la
 * espone), mostrato in Guida e vicino alle funzioni IA come stima onesta di "quanto abbiamo già
 * usato oggi". Ritorna zero se l'IA non è configurata, mai un'eccezione. */
export async function getGeminiUsageToday(): Promise<GeminiUsageToday> {
  if (!geminiEnabled()) return { total: 0, byModel: [] };
  try {
    const rows = await db
      .select({ model: geminiUsageDaily.model, count: geminiUsageDaily.count })
      .from(geminiUsageDaily)
      .where(sql`${geminiUsageDaily.date} = CURRENT_DATE`);
    const byModel = rows.map((r) => ({ model: r.model, count: r.count }));
    return { total: byModel.reduce((sum, r) => sum + r.count, 0), byModel };
  } catch {
    return { total: 0, byModel: [] };
  }
}
