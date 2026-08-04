// Applica al DB le traduzioni prodotte DIRETTAMENTE da Claude (non da Gemini) per il lotto
// scritto da self-translate-fetch.mjs. inFile = lo stesso file del fetch (per le chiavi
// name/source, nello stesso ordine), translationsFile = array JSON di stringhe tradotte,
// stesso ordine/lunghezza di items in inFile (stesso formato posizionale già usato dalla fase
// descrizioni di ai-translate-compendio.mjs, per evitare rischi di disallineamento sulle chiavi).
//
// Uso: node --env-file=../../.env.local self-translate-apply.mjs <inFile> <translationsFile>
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { compendioTraduzioniIa } from "../../lib/db/schema.ts";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const [inFile, translationsFile] = process.argv.slice(2);
if (!inFile || !translationsFile) {
  console.error("Uso: node self-translate-apply.mjs <inFile> <translationsFile>");
  process.exit(1);
}

const { kind, items } = JSON.parse(readFileSync(inFile, "utf-8"));
const translations = JSON.parse(readFileSync(translationsFile, "utf-8"));

if (!Array.isArray(translations) || translations.length !== items.length) {
  console.error(`Disallineamento: ${items.length} voci in ingresso ma ${Array.isArray(translations) ? translations.length : "non un array"} traduzioni.`);
  process.exit(1);
}

for (let i = 0; i < items.length; i++) {
  const { name, source } = items[i];
  const descrizioneIta = translations[i];
  if (!descrizioneIta || typeof descrizioneIta !== "string") {
    console.error(`Traduzione mancante/non valida per ${name} (${source}), saltata.`);
    continue;
  }
  await db
    .update(compendioTraduzioniIa)
    .set({ descrizioneIta, updatedAt: new Date() })
    .where(and(eq(compendioTraduzioniIa.kind, kind), eq(compendioTraduzioniIa.name, name), eq(compendioTraduzioniIa.source, source)));
}

console.log(`Applicate ${items.length} traduzioni (${kind}).`);
