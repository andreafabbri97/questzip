// Fan-out verso il Durable Object realtime (vedi party/campaign-room.ts), deployato
// separatamente su Cloudflare. Le server action restano l'unica fonte di verità (scrivono
// prima su Postgres), questo è solo un "hey, è cambiato qualcosa" best-effort verso i client
// connessi: se NEXT_PUBLIC_PARTYKIT_HOST non è configurato o la richiesta fallisce, l'app
// continua a funzionare esattamente come prima (nessun realtime, ma nessun errore per
// l'utente). Stessa variabile usata dal client (lib/use-party-room.ts): il prefisso
// NEXT_PUBLIC_ la rende disponibile anche lato server, non serve una seconda variabile.

async function publish(room: string, body: unknown) {
  const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
  if (!host) return;
  try {
    await fetch(`https://${host}/parties/main/${room}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-party-secret": process.env.PARTYKIT_AUTH_SECRET ?? "",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // best-effort: i client si riallineano comunque al prossimo refresh manuale
  }
}

export function broadcastEncounterChanged(campaignId: string) {
  return publish(`campaign-${campaignId}`, { type: "encounter-changed" });
}

export function broadcastDungeonChanged(dungeonId: string) {
  return publish(`dungeon-${dungeonId}`, { type: "dungeon-changed" });
}

export function broadcastDungeonDeleted(dungeonId: string) {
  return publish(`dungeon-${dungeonId}`, { type: "dungeon-deleted" });
}
