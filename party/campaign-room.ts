import { Server, routePartykitRequest, type Connection, type ConnectionContext } from "partyserver";
import { jwtVerify } from "jose";

interface Env {
  PARTYKIT_AUTH_SECRET: string;
  Main: DurableObjectNamespace;
}

interface RoomTokenPayload {
  userId: string;
  campaignId: string;
  role: "dm" | "player";
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
