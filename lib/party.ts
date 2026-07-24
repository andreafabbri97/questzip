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

// Stessa stanza "campaign-<id>" del combattimento: e' gia' sempre connessa per chi guarda la
// pagina campagna, niente bisogno di una seconda connessione WebSocket solo per il jukebox.
export function broadcastJukeboxChanged(campaignId: string) {
  return publish(`campaign-${campaignId}`, { type: "jukebox-changed" });
}

export function broadcastDungeonChanged(dungeonId: string) {
  return publish(`dungeon-${dungeonId}`, { type: "dungeon-changed" });
}

export function broadcastDungeonDeleted(dungeonId: string) {
  return publish(`dungeon-${dungeonId}`, { type: "dungeon-deleted" });
}

// A differenza di tutti i broadcast sopra (solo un ping "è cambiato qualcosa", il client
// rifà la query) questi portano il messaggio intero nel payload: un refetch ad ogni singolo
// messaggio di chat sarebbe troppo lento per un feed live.

// Stessa stanza "campaign-<id>" già usata da combattimento/jukebox — chi ha la pagina
// campagna aperta è già connesso, niente bisogno di una stanza dedicata alla chat.
export function broadcastCampaignChatMessage(campaignId: string, message: unknown) {
  return publish(`campaign-${campaignId}`, { type: "chat-message", message });
}

export function broadcastCampaignChatMessageDeleted(campaignId: string, messageId: string) {
  return publish(`campaign-${campaignId}`, { type: "chat-message-deleted", messageId });
}

// Stanza personale (vedi app/api/party-token/route.ts, kind "user"): un utente vi resta
// connesso per tutta la sessione (components/realtime-provider.tsx), qui arrivano sia le
// notifiche sia i messaggi diretti. Una DM va pubblicata su ENTRAMBE le stanze personali dei
// due partecipanti, non serve una stanza a sé per ogni coppia di amici.
export function broadcastDirectMessage(fromUserId: string, toUserId: string, message: unknown) {
  return Promise.all([
    publish(`user-${fromUserId}`, { type: "dm-message", message }),
    publish(`user-${toUserId}`, { type: "dm-message", message }),
  ]);
}

export function broadcastDirectMessageDeleted(fromUserId: string, toUserId: string, messageId: string) {
  return Promise.all([
    publish(`user-${fromUserId}`, { type: "dm-message-deleted", messageId }),
    publish(`user-${toUserId}`, { type: "dm-message-deleted", messageId }),
  ]);
}

export function broadcastNotification(userId: string, notification: unknown) {
  return publish(`user-${userId}`, { type: "notification", notification });
}
