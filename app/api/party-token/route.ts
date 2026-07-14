import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { requireMember, requireUserId } from "@/lib/campaign-auth";
import { campaignDungeons } from "@/lib/db/schema";

// Autentica l'utente (sessione Auth.js, cookie) e la sua membership sulla campagna,
// poi rilascia un token firmato di breve durata che il client passa a PartyKit/Cloudflare
// per aprire la connessione WebSocket. La Durable Object non può leggere la sessione
// Auth.js (è un servizio esterno, database-backed), quindi questo è il ponte di fiducia.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
  }
  const { kind, campaignId, dungeonId } = body as Record<string, unknown>;

  const secret = process.env.PARTYKIT_AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Realtime non configurato." }, { status: 503 });
  }

  try {
    const userId = await requireUserId();
    let room: string;
    let resolvedCampaignId: string;

    if (kind === "combat" && typeof campaignId === "string") {
      resolvedCampaignId = campaignId;
      room = `campaign-${campaignId}`;
    } else if (kind === "dungeon" && typeof dungeonId === "string") {
      const [dungeon] = await db
        .select({ campaignId: campaignDungeons.campaignId })
        .from(campaignDungeons)
        .where(eq(campaignDungeons.id, dungeonId));
      if (!dungeon) {
        return NextResponse.json({ error: "Dungeon non trovato." }, { status: 404 });
      }
      resolvedCampaignId = dungeon.campaignId;
      room = `dungeon-${dungeonId}`;
    } else {
      return NextResponse.json({ error: "Richiesta non valida." }, { status: 400 });
    }

    const member = await requireMember(resolvedCampaignId, userId);
    const token = await new SignJWT({ userId, campaignId: resolvedCampaignId, role: member.role, room })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("2h")
      .sign(new TextEncoder().encode(secret));

    return NextResponse.json({ token, room });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore imprevisto.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
