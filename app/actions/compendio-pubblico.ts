"use server";

import { and, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import { TAG_COMPENDIO } from "@/lib/cache-tags";
import { compendioTraduzioniIa } from "@/lib/db/schema";
import type { CompendiumKind } from "@/lib/fivetools/data";

/**
 * Lettura SENZA autenticazione di una singola voce tradotta, per la pagina condivisa
 * (app/compendio/condivisa): un link mandato su WhatsApp deve aprirsi anche a chi non ha un
 * account, mentre tutto il resto dell'app resta dietro il login.
 *
 * Aperto al pubblico con tre limiti precisi, perché qui non c'è una sessione a fare da freno:
 * - una riga per chiamata, indirizzata per chiave esatta: non esiste modo di farsi dare un elenco,
 *   che è esattamente ciò che nell'agosto 2026 ha bruciato la quota di trasferimento di Neon;
 * - solo nome e descrizione tradotti, cioè testo di manuali, mai un dato di una persona;
 * - stessa cache a validità indeterminata del resto del Compendio, quindi anche una richiesta
 *   ripetuta all'infinito non arriva al database più di una volta.
 */
export async function getVoceCondivisa(kind: CompendiumKind, name: string, source: string) {
  const righe = await unstable_cache(
    () =>
      db
        .select({
          nomeIta: compendioTraduzioniIa.nomeIta,
          descrizioneIta: compendioTraduzioniIa.descrizioneIta,
        })
        .from(compendioTraduzioniIa)
        .where(
          and(
            eq(compendioTraduzioniIa.kind, kind),
            eq(compendioTraduzioniIa.name, name),
            eq(compendioTraduzioniIa.source, source),
          ),
        )
        .limit(1),
    [`voce-condivisa:${kind}:${source}:${name}`],
    { revalidate: false, tags: [TAG_COMPENDIO] },
  )();
  return righe[0] ?? null;
}
