// Applica nomeIta per righe di compendio_traduzione_ia — usato per le sottoclassi, che (a
// differenza delle classi base) non erano mai state toccate dal vecchio script Gemini e quindi
// non hanno già un nome tradotto. Formato esplicito {name, source, nomeIta} invece che
// posizionale come le descrizioni: qui il rischio di disallineamento non vale la pena evitarlo,
// dato che sono poche voci per volta e il nome va comunque scritto a mano insieme alla fonte.
//
// Uso: node --env-file=../../.env.local self-translate-apply-names.mjs <file.json>
// dove file.json è un array di { "name": "...", "source": "...", "nomeIta": "..." }
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { compendioTraduzioniIa } from "../../lib/db/schema.ts";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const [inFile] = process.argv.slice(2);
if (!inFile) {
  console.error("Uso: node self-translate-apply-names.mjs <file.json>");
  process.exit(1);
}

const rows = JSON.parse(readFileSync(inFile, "utf-8"));
for (const { name, source, nomeIta } of rows) {
  if (!name || !source || !nomeIta) {
    console.error(`Voce non valida, saltata: ${JSON.stringify({ name, source, nomeIta })}`);
    continue;
  }
  await db
    .update(compendioTraduzioniIa)
    .set({ nomeIta, updatedAt: new Date() })
    .where(and(eq(compendioTraduzioniIa.kind, "classi"), eq(compendioTraduzioniIa.name, name), eq(compendioTraduzioniIa.source, source)));
}
console.log(`Applicati ${rows.length} nomi.`);
