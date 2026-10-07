"use server";

import { eq } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/campaign-auth";
import { users } from "@/lib/db/schema";
import { isTema, TEMA_PREDEFINITO, type Tema } from "@/lib/tema";

const tag = (userId: string) => `tema:${userId}`;

/**
 * Il tema viene letto dal layout a OGNI pagina servita: senza cache sarebbe una query in più per
 * ogni singola navigazione di ogni utente, su un database la cui quota di trasferimento è già
 * andata esaurita in passato. Con la cache la riga si legge una volta sola e poi si rilegge
 * solo quando l'utente cambia davvero tema (revalidateTag qui sotto). Stesso meccanismo già
 * usato per il Compendio in app/actions/compendio-ita.ts.
 */
const temaInCache = (userId: string) =>
  unstable_cache(
    async () => {
      const [riga] = await db.select({ tema: users.tema }).from(users).where(eq(users.id, userId));
      return isTema(riga?.tema) ? riga.tema : TEMA_PREDEFINITO;
    },
    [tag(userId)],
    { revalidate: false, tags: [tag(userId)] },
  )();

/**
 * Tema dell'utente collegato, per il render lato server.
 *
 * Non usa requireUserId: il layout chiama questa funzione per OGNI pagina, comprese quelle
 * pubbliche e la schermata di accesso, dove nessuno è autenticato — lì un'eccezione farebbe
 * saltare l'intera pagina invece di mostrarla col tema predefinito.
 */
export async function getTemaUtente(): Promise<Tema> {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return TEMA_PREDEFINITO;
  return temaInCache(userId).catch(() => TEMA_PREDEFINITO);
}

/** Salva la scelta sull'account, così vale su ogni dispositivo. */
export async function impostaTema(tema: Tema): Promise<Tema> {
  if (!isTema(tema)) throw new Error("Tema non valido.");
  const userId = await requireUserId();
  await db.update(users).set({ tema }).where(eq(users.id, userId));
  // Senza questo, la pagina continuerebbe ad arrivare dal server col tema vecchio a ogni
  // ricaricamento, pur essendo il database già aggiornato.
  revalidateTag(tag(userId), "max");
  return tema;
}
