// Aggiunge righe in coda (compendio_traduzione_ia, kind "classi") per le sottoclassi — stesso kind
// delle classi base, chiave name|source della sottoclasse stessa (mai in collisione con le classi
// base, verificato a mano). Filtro opzionale per fonte, per tradurre un manuale alla volta.
//
// Uso: node --env-file=../../.env.local seed-subclasses.mjs [PHB|XPHB|altro]
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { compendioTraduzioniIa } from "../../lib/db/schema.ts";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
async function fetchJson(url) {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

const books = ["artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk", "mystic", "paladin", "ranger", "rogue", "sidekick", "sorcerer", "warlock", "wizard"];
const files = await Promise.all(books.map((b) => fetchJson(`${RAW_BASE}/class/class-${b}.json`)));
const subclasses = files.flatMap((f) => f?.subclass ?? []);

const filterArg = process.argv[2];
const filtered = filterArg === "altro"
  ? subclasses.filter((s) => s.source !== "PHB" && s.source !== "XPHB")
  : filterArg
    ? subclasses.filter((s) => s.source === filterArg)
    : subclasses;

const seen = new Set();
const values = [];
for (const s of filtered) {
  const key = `${s.name}|${s.source}`;
  if (seen.has(key)) continue;
  seen.add(key);
  values.push({ kind: "classi", name: s.name, source: s.source });
}

const chunkSize = 500;
for (let i = 0; i < values.length; i += chunkSize) {
  await db.insert(compendioTraduzioniIa).values(values.slice(i, i + chunkSize)).onConflictDoNothing();
}
console.log(`Aggiunte (o già presenti) ${values.length} sottoclassi in coda${filterArg ? ` (fonte: ${filterArg})` : ""}.`);
