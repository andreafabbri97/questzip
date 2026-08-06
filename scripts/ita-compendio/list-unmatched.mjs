import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { compendioItaMostri, compendioItaOggetti } from "../../lib/db/schema.ts";
import { isNull } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const which = process.argv[2];

if (which === "mostri" || !which) {
  const rows = await db
    .select({ nome: compendioItaMostri.nome, tipo: compendioItaMostri.tipo, taglia: compendioItaMostri.taglia })
    .from(compendioItaMostri)
    .where(isNull(compendioItaMostri.nomeInglese));
  console.log(`\n=== MOSTRI non abbinati: ${rows.length} ===`);
  for (const r of rows.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`${r.nome} | ${r.tipo ?? "?"} | ${r.taglia ?? "?"}`);
  }
}

if (which === "oggetti" || !which) {
  const rows = await db
    .select({ nome: compendioItaOggetti.nome, categoria: compendioItaOggetti.categoria, rarita: compendioItaOggetti.rarita })
    .from(compendioItaOggetti)
    .where(isNull(compendioItaOggetti.nomeInglese));
  console.log(`\n=== OGGETTI non abbinati: ${rows.length} ===`);
  for (const r of rows.sort((a, b) => a.nome.localeCompare(b.nome))) {
    console.log(`${r.nome} | ${r.categoria || "?"} | ${r.rarita || "?"}`);
  }
}
