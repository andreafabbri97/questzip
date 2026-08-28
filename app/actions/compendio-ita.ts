"use server";

import { unstable_cache } from "next/cache";
import { eq, ne } from "drizzle-orm";
import { auth } from "@/auth";
import { TAG_COMPENDIO } from "@/lib/cache-tags";
import { db } from "@/lib/db";
import {
  compendioItaClassi,
  compendioItaIncantesimi,
  compendioItaMostri,
  compendioItaOggetti,
  compendioItaRazze,
  compendioItaRegole,
  compendioItaTalenti,
  compendioTraduzioniIa,
} from "@/lib/db/schema";
import type { CompendiumKind } from "@/lib/fivetools/data";

async function requireAuth() {
  const session = await auth();
  if (!session?.user) throw new Error("Devi accedere per continuare.");
}

/**
 * Cache lato server delle tabelle del Compendio.
 *
 * Queste tabelle cambiano solo quando le riempiamo noi con gli script di `scripts/ita-compendio`,
 * cioè una volta ogni tanto — mentre venivano rilette dal database a OGNI apertura di pagina, di
 * ogni persona: le sole traduzioni dei mostri sono 4.757 righe con la descrizione intera. È così
 * che il 2026-08-28 il progetto Neon ha superato la quota mensile di trasferimento dati (5,6 GB su
 * 5) e l'app ha smesso di rispondere per tutti.
 *
 * La validità è INFINITA di proposito: questo contenuto non scade da sé, cambia solo quando
 * rilanciamo gli script — quindi una rilettura a tempo sarebbe traffico speso per niente. A
 * riempimento finito si invalida a mano il tag, con `scripts/ita-compendio/invalida-cache.mjs`
 * (che chiama /api/compendio/invalida). È il rovescio della medaglia da ricordare: se si aggiorna
 * una tabella e ci si dimentica di invalidare, l'app continua a mostrare la versione precedente
 * senza che nulla lo segnali — per questo l'invalidazione va agganciata agli script, non alla
 * memoria di chi li lancia.
 *
 * La verifica della sessione resta FUORI dalla cache: si mette in cache il contenuto del
 * Compendio, che è uguale per tutti, mai il controllo di chi lo sta chiedendo.
 */
const conCache = <T,>(chiave: string, query: () => Promise<T>) =>
  unstable_cache(query, [chiave], { revalidate: false, tags: [TAG_COMPENDIO] })();

export async function getIncantesimiIta() {
  await requireAuth();
  return conCache("incantesimi", () => db.select().from(compendioItaIncantesimi));
}

export async function getMostriIta() {
  await requireAuth();
  return conCache("mostri", () => db.select().from(compendioItaMostri));
}

export async function getRazzeIta() {
  await requireAuth();
  return conCache("razze", () => db.select().from(compendioItaRazze));
}

export async function getClassiIta() {
  await requireAuth();
  return conCache("classi", () => db.select().from(compendioItaClassi));
}

export async function getRegoleIta() {
  await requireAuth();
  // "oggetti_magici" era OCR di 8 pagine di flavor text inglese di qualità troppo bassa per
  // essere utile (screenshot di un lettore, non una scansione vera) — il catalogo oggetti magici
  // vero vive già pulito nel tab Oggetti magici, questa fonte era solo rumore.
  return conCache("regole", () =>
    db.select().from(compendioItaRegole).where(ne(compendioItaRegole.fonte, "oggetti_magici")),
  );
}

export async function getOggettiIta() {
  await requireAuth();
  return conCache("oggetti", () => db.select().from(compendioItaOggetti));
}

export async function getTalentiIta() {
  await requireAuth();
  return conCache("talenti", () => db.select().from(compendioItaTalenti));
}

// Cache IA (compendio_traduzione_ia): nomi/descrizioni tradotti dall'IA per le voci che non hanno
// testo ufficiale — priorità di lettura sempre ufficiale -> IA -> traduzione live, mai il contrario.
export async function getTraduzioniIa(kind: CompendiumKind) {
  await requireAuth();
  return conCache(`traduzioni-ia:${kind}`, () =>
    db.select().from(compendioTraduzioniIa).where(eq(compendioTraduzioniIa.kind, kind)),
  );
}
