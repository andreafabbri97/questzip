"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/campaign-auth";
import { characters } from "@/lib/db/schema";
import { parseCharacterRemoto, type Character } from "@/lib/dnd";

// Backup personale su account — NON va confuso con app/actions/characters.ts (quello gestisce lo
// scatto condiviso con una campagna specifica). Qui c'è la scheda intera, di proprietà del solo
// utente, indipendente da qualunque campagna: esiste solo per non perderla se il dispositivo
// cambia o il localStorage viene svuotato. Richiamato da app/personaggi/page.tsx: subito ad ogni
// salvataggio esplicito (non più debounced — da quando il salvataggio è diventato un'azione
// esplicita, non c'è più un tasto premuto ogni volta da ammortizzare), e riconciliato con la
// copia locale all'apertura della pagina.

export async function getMyCharacters() {
  const userId = await requireUserId();
  const rows = await db.select().from(characters).where(eq(characters.userId, userId));
  return rows.map((row) => ({
    id: row.id,
    dataJson: parseCharacterRemoto(row.dataJson),
    aggiornatoAl: row.aggiornatoAl.getTime(),
  }));
}

export async function syncCharacterRemote(character: Character) {
  const userId = await requireUserId();

  // Verifica di proprietà prima di scrivere: l'id è generato dal client (crypto.randomUUID(),
  // collisioni praticamente impossibili) ma non ci si fida comunque — se per qualunque motivo
  // esistesse già una riga con questo id di un altro utente, non va sovrascritta in silenzio.
  const [existing] = await db
    .select({ userId: characters.userId })
    .from(characters)
    .where(eq(characters.id, character.id));
  if (existing && existing.userId !== userId) {
    throw new Error("Questo personaggio è già collegato a un altro account.");
  }

  const aggiornatoAl = new Date(character.aggiornatoAl);
  await db
    .insert(characters)
    .values({ id: character.id, userId, dataJson: character, aggiornatoAl })
    .onConflictDoUpdate({
      target: characters.id,
      set: { dataJson: character, aggiornatoAl },
    });
}

export async function deleteCharacterRemote(id: string) {
  const userId = await requireUserId();
  await db.delete(characters).where(and(eq(characters.id, id), eq(characters.userId, userId)));
}
