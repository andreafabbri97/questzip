// Fan-out verso il Durable Object realtime (vedi party/campaign-room.ts), deployato
// separatamente su Cloudflare. Le server action restano l'unica fonte di verità (scrivono
// prima su Postgres), questo è solo un "hey, è cambiato qualcosa" best-effort verso i client
// connessi: se PARTYKIT_HOST non è configurato o la richiesta fallisce, l'app continua a
// funzionare esattamente come prima (nessun realtime, ma nessun errore per l'utente).

async function publish(room: string, body: unknown) {
  const host = process.env.PARTYKIT_HOST;
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
