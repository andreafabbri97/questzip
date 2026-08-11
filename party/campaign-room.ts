import { Server, routePartykitRequest, type Connection, type ConnectionContext } from "partyserver";
import { jwtVerify } from "jose";

interface Env {
  PARTYKIT_AUTH_SECRET: string;
  Main: DurableObjectNamespace;
}

interface RoomTokenPayload {
  userId: string;
  // Assenti per una stanza personale ("user-<userId>": notifiche/DM) — presenti solo per le
  // stanze legate a una campagna ("campaign-<id>"/"dungeon-<id>"). Il DO non li legge/branch mai
  // (solo li mette in connection.setState()), quindi non serve una union discriminata qui.
  campaignId?: string;
  role?: "dm" | "player";
  room: string;
}

async function verifyRoomToken(
  token: string,
  secret: string,
  room: string,
): Promise<RoomTokenPayload | null> {
  if (!token || !secret) return null;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.room !== room) return null;
    return payload as unknown as RoomTokenPayload;
  } catch {
    return null;
  }
}

// Una stanza per combattimento (nome "campaign-<campaignId>") o per lavagna dungeon
// (nome "dungeon-<dungeonId>"). Postgres/Neon resta l'unica fonte di verità: questa
// Durable Object fa solo da relay in tempo reale tra i client già autenticati, non
// scrive mai nulla su database.
export class CampaignRoom extends Server<Env> {
  async onConnect(connection: Connection, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const token = url.searchParams.get("token") ?? "";
    const payload = await verifyRoomToken(token, this.env.PARTYKIT_AUTH_SECRET, this.name);
    if (!payload) {
      connection.close(4401, "unauthorized");
      return;
    }
    connection.setState({ userId: payload.userId, role: payload.role });
  }

  // Unici tipi che un CLIENT può generare direttamente via WebSocket (relay immediato, prima
  // ancora che il rilascio del token lo persista su Postgres) — il trascinamento dei segnalini
  // sulla lavagna dungeon. Qualunque altro tipo (messaggi di chat, notifiche, "è cambiato
  // qualcosa" per combattimento/dungeon/jukebox) deve arrivare SOLO dal path server-autenticato
  // onRequest (verificato con x-party-secret) — senza questo filtro, un membro della stanza
  // poteva forgiare a mano un messaggio WebSocket con type:"chat-message" e un authorId a piacere
  // e farlo passare per un messaggio reale di un altro membro (il broadcast qui sotto sovrascrive
  // solo lo userId in cima all'oggetto, mai letto dal client di chat, che si fida invece di
  // message.authorId annidato dentro il payload).
  //
  // voice-join/voice-leave/voice-signal: segnalazione WebRTC per la chat vocale P2P (offerte/
  // risposte/candidati ICE) — contenuto innocuo (solo metadati di connessione, mai testo/identità
  // da falsificare in modo dannoso), stesso livello di fiducia già accettato per move/remove: un
  // membro già autenticato della stanza può al più disturbare l'instaurazione di UNA chiamata
  // vocale, non impersonare un altro utente altrove nell'app.
  //
  // template: area d'effetto (cerchio/cono/linea) disegnata sulla mappa — effimera, mai scritta
  // su database, stesso principio di "contenuto a bassa fiducia" di move/remove.
  private static readonly CLIENT_RELAY_TYPES = new Set([
    "move",
    "remove",
    "voice-join",
    "voice-leave",
    "voice-signal",
    "template",
  ]);

  // Bug di robustezza segnalato dall'utente ("studia la chat vocale e migliorala"): senza questo,
  // quando qualcuno perde la connessione (chiude la scheda, il browser va in crash, la rete cade)
  // SENZA fare prima click su "Esci" — quindi senza che il client faccia in tempo a mandare un
  // "voice-leave" volontario — gli altri partecipanti non vengono MAI avvisati. Il loro
  // RTCPeerConnection se ne accorge da solo solo dopo il timeout ICE (spesso 20-30+ secondi,
  // variabile per browser), lasciando un partecipante "fantasma" visibile come ancora in chiamata
  // per tutto quel tempo. Un "voice-leave" sintetico ad ogni chiusura di connessione è innocuo se
  // quell'utente non era in chiamata (removePeer in useVoiceChat è già un no-op silenzioso per un
  // peerId sconosciuto) — quindi non serve tracciare qui se l'utente fosse davvero "in chiamata",
  // basta annunciarlo sempre: il client filtra da sé i falsi positivi.
  onClose(connection: Connection) {
    const state = connection.state as { userId?: string } | null;
    if (!state?.userId) return;
    this.broadcast(JSON.stringify({ type: "voice-leave", userId: state.userId }));
  }

  onMessage(connection: Connection, message: string) {
    // Relay per la lavagna condivisa: un giocatore muove il proprio token, tutti gli
    // altri client connessi ricevono l'evento. userId preso dalla connessione verificata
    // in onConnect (mai da quanto dichiarato nel messaggio) per evitare spoofing.
    const state = connection.state as { userId?: string } | null;
    if (!state?.userId) return;
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(message);
    } catch {
      return;
    }
    if (typeof parsed.type !== "string" || !CampaignRoom.CLIENT_RELAY_TYPES.has(parsed.type)) return;
    this.broadcast(JSON.stringify({ ...parsed, userId: state.userId }), [connection.id]);
  }

  async onRequest(request: Request): Promise<Response> {
    // Chiamato dalle server action Next.js (lib/party.ts) per notificare ai client
    // connessi che il combattimento è cambiato (fan-out, nessuna scrittura qui).
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    if (request.headers.get("x-party-secret") !== this.env.PARTYKIT_AUTH_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const body = await request.text();
    this.broadcast(body);
    return new Response("ok");
  }
}

export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routePartykitRequest(request, env)) ?? new Response("Not Found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
