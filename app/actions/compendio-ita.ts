"use server";

import { unstable_cache } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
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

/**
 * Chi non ha una sessione non riceve questi elenchi.
 *
 * Restituiscono una lista vuota invece di sollevare un errore: la pagina di una voce condivisa
 * (app/compendio/condivisa) è aperta a chiunque, e chiamate destinate a fallire riempirebbero i
 * log del server di eccezioni a ogni visita. Il risultato per chi guarda è identico — i testi
 * tratti dai manuali semplicemente non compaiono — e chi non ha diritto ai dati continua a non
 * riceverne nessuno.
 */
async function autenticato() {
  const session = await auth();
  return Boolean(session?.user);
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
  if (!(await autenticato())) return [];
  return conCache("incantesimi", () => db.select().from(compendioItaIncantesimi));
}

export async function getMostriIta() {
  if (!(await autenticato())) return [];
  return conCache("mostri", () => db.select().from(compendioItaMostri));
}

export async function getRazzeIta() {
  if (!(await autenticato())) return [];
  return conCache("razze", () => db.select().from(compendioItaRazze));
}

export async function getClassiIta() {
  if (!(await autenticato())) return [];
  return conCache("classi", () => db.select().from(compendioItaClassi));
}

export async function getRegoleIta() {
  if (!(await autenticato())) return [];
  // "oggetti_magici" era OCR di 8 pagine di flavor text inglese di qualità troppo bassa per
  // essere utile (screenshot di un lettore, non una scansione vera) — il catalogo oggetti magici
  // vero vive già pulito nel tab Oggetti magici, questa fonte era solo rumore.
  return conCache("regole", () =>
    db.select().from(compendioItaRegole).where(ne(compendioItaRegole.fonte, "oggetti_magici")),
  );
}

export async function getOggettiIta() {
  if (!(await autenticato())) return [];
  return conCache("oggetti", () => db.select().from(compendioItaOggetti));
}

export async function getTalentiIta() {
  if (!(await autenticato())) return [];
  return conCache("talenti", () => db.select().from(compendioItaTalenti));
}

// Cache IA (compendio_traduzione_ia): nomi/descrizioni tradotti dall'IA per le voci che non hanno
// testo ufficiale — priorità di lettura sempre ufficiale -> IA -> traduzione live, mai il contrario.
/**
 * Solo i NOMI, per l'elenco e per la ricerca in italiano.
 *
 * La cache delle traduzioni ha anche la descrizione intera di ogni voce, e i mostri sono 4.757:
 * caricarla tutta per costruire un indice di nomi voleva dire tirare giù qualche megabyte per
 * mostrare un elenco. Qui si prendono le tre colonne che servono davvero — chi apre una scheda
 * chiede poi la sua riga con getTraduzioneIa.
 */
export async function getNomiIa(kind: CompendiumKind) {
  if (!(await autenticato())) return [];
  return conCache(`nomi-ia:${kind}`, () =>
    db
      .select({
        name: compendioTraduzioniIa.name,
        source: compendioTraduzioniIa.source,
        nomeIta: compendioTraduzioniIa.nomeIta,
      })
      .from(compendioTraduzioniIa)
      .where(eq(compendioTraduzioniIa.kind, kind)),
  );
}

/** La riga di UNA voce, descrizione compresa: serve solo alla scheda che si sta guardando. */
/**
 * Unica lettura del Compendio SENZA sessione, perché serve alla pagina di una voce condivisa
 * (app/compendio/condivisa), che si apre anche a chi non ha un account.
 *
 * È aperta con tre limiti che la rendono innocua: restituisce UNA riga indirizzata per chiave
 * esatta — non esiste modo di farsi dare un elenco, che è ciò che nell'agosto 2026 ha bruciato la
 * quota di Neon —, contiene testo di manuali e mai il dato di una persona, e passa dalla stessa
 * cache a validità indeterminata di tutto il resto, quindi anche richiesta all'infinito non
 * arriva al database più di una volta. Le letture di elenco qui sopra restano protette.
 */
export async function getTraduzioneIa(kind: CompendiumKind, name: string, source: string) {
  const righe = await conCache(`traduzione-ia:${kind}:${source}:${name}`, () =>
    db
      .select()
      .from(compendioTraduzioniIa)
      .where(
        and(
          eq(compendioTraduzioniIa.kind, kind),
          eq(compendioTraduzioniIa.name, name),
          eq(compendioTraduzioniIa.source, source),
        ),
      )
      .limit(1),
  );
  return righe[0] ?? null;
}
