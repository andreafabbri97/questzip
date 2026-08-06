import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

// Login di scorta SOLO per i test E2E: crea (o riusa) un utente fittizio e una sessione vera nel
// DB con lo stesso meccanismo di NextAuth (adapter Drizzle, cookie "authjs.session-token"),
// bypassando del tutto Google — che rifiuta il login quando rileva un browser pilotato da
// automazione (Playwright), vedi scripts/e2e-login.mjs. Doppio blocco in produzione: NODE_ENV
// (impostato automaticamente da Next su Vercel, non aggirabile da una env var dimenticata) e un
// secret dedicato che su Vercel non viene mai configurato — se manca anche solo uno dei due la
// route si comporta come se non esistesse.
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const secret = process.env.E2E_TEST_LOGIN_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (request.headers.get("x-e2e-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = "e2e-test@questzip.local";
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  const user =
    existing ??
    (await db.insert(users).values({ email, name: "E2E Test User" }).returning())[0];

  const sessionToken = randomUUID();
  // Stesso orizzonte di 30 giorni usato di default da NextAuth per le sessioni "database".
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
  await db.insert(sessions).values({ sessionToken, userId: user.id, expires });

  const response = NextResponse.json({ ok: true });
  response.cookies.set("authjs.session-token", sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: false,
    expires,
  });
  return response;
}
