import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { TAG_COMPENDIO } from "@/lib/cache-tags";

// Svuota la cache delle tabelle italiane del Compendio (vedi app/actions/compendio-ita.ts, dove la
// validità è infinita apposta). Da chiamare dopo aver riempito le tabelle con gli script di
// scripts/ita-compendio, altrimenti l'app continuerebbe a mostrare la versione precedente.
//
// Protetta da un segreto dedicato, come il login di test: senza COMPENDIO_REVALIDATE_SECRET
// configurato la route si comporta come se non esistesse, così una richiesta a caso non può
// costringere il database a rileggere tutto.
export async function POST(request: Request) {
  const secret = process.env.COMPENDIO_REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (request.headers.get("x-compendio-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Next 16 vuole anche il "profilo" di scadenza, cioè entro quanto la purga deve valere: "max"
  // è quello della cache a tempo indeterminato che stiamo svuotando.
  revalidateTag(TAG_COMPENDIO, "max");
  return NextResponse.json({ ok: true, tag: TAG_COMPENDIO });
}
