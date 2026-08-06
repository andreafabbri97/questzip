// Ripulisce le righe di compendio_traduzione_ia dove descrizioneIta è stata scritta male in
// origine (uguale a nomeIta, cioè solo il nome ripetuto invece della vera descrizione tradotta)
// — bug preesistente scoperto mentre si indagava la segnalazione dell'utente su "Acid Splash".
// Azzera descrizioneIta (resta nomeIta, che è corretto) così la catena di priorità dell'app
// ricade sulla traduzione live invece di mostrare la descrizione rotta.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { compendioTraduzioniIa } from "../../lib/db/schema.ts";
import { eq, and } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const all = await db.select().from(compendioTraduzioniIa);
const broken = all.filter(
  (r) => r.descrizioneIta && r.nomeIta && r.descrizioneIta.trim() === r.nomeIta.trim(),
);
console.log(`Righe da ripulire: ${broken.length}`);

for (const r of broken) {
  await db
    .update(compendioTraduzioniIa)
    .set({ descrizioneIta: null })
    .where(and(eq(compendioTraduzioniIa.kind, r.kind), eq(compendioTraduzioniIa.name, r.name), eq(compendioTraduzioniIa.source, r.source)));
}
console.log("Fatto.");
