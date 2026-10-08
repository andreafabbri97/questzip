// Porta al nome del manuale le voci «Trinket» della cache delle traduzioni: la traduzione
// automatica li chiamava «ninnoli», il Manuale del Giocatore italiano «oggetti insoliti» (p. 160).
// Cambia il nome della voce e il termine dentro le descrizioni, articoli compresi
// (lib/fivetools/oggetto-insolito.ts).
//
// Con --file riscrive allo stesso modo un file di traduzioni a mano di parsed/, perché rilanciare
// applica-traduzioni-a-mano.mjs non rimetta il termine vecchio.
//
// Uso: node --env-file=../../.env.local allinea-oggetti-insoliti.mjs [--applica] [--file <traduzioni.json>]
import { readFileSync, writeFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { conOggettoInsolito } from "../../lib/fivetools/oggetto-insolito.ts";

const applica = process.argv.includes("--applica");
const file = process.argv.includes("--file") ? process.argv[process.argv.indexOf("--file") + 1] : null;

// Nomi che la sola sostituzione del termine lascerebbe sbagliati: il resto del nome era a sua
// volta una traduzione automatica riuscita male.
const NOMI = {
  "Silverquill Trinket|SCC": "Oggetto Insolito di Silverquill",
  "Prismari Trinket|SCC": "Oggetto Insolito di Prismari",
  "Quandrix Trinket|SCC": "Oggetto Insolito di Quandrix",
  "Feywild Trinket|WBtW": "Oggetto Insolito della Selva Fatata",
  "Goose Egg Trinket|BGG": "Oggetto Insolito: Uovo d'Oca",
};
const nomeNuovo = (name, source, nomeIta) => NOMI[`${name}|${source}`] ?? (nomeIta ? conOggettoInsolito(nomeIta) : nomeIta);

if (file) {
  const voci = JSON.parse(readFileSync(file, "utf-8"));
  let cambiate = 0;
  const nuove = voci.map((v) => {
    if (!/trinket/i.test(v.name)) return v;
    const righe = v.righe.map(conOggettoInsolito);
    const nome = v.nome_ita ? nomeNuovo(v.name, v.source, v.nome_ita) : v.nome_ita;
    if (righe.join("\n") === v.righe.join("\n") && nome === v.nome_ita) return v;
    cambiate++;
    return { ...v, righe, ...(nome ? { nome_ita: nome } : {}) };
  });
  if (applica) writeFileSync(file, JSON.stringify(nuove, null, 1));
  console.log(`${applica ? "" : "[PROVA] "}${file}: ${cambiate} voci riscritte`);
} else {
  const sql = neon(process.env.DATABASE_URL);
  const righe = await sql`SELECT kind, name, source, nome_ita, descrizione_ita FROM compendio_traduzione_ia WHERE kind = 'oggetti' AND name ILIKE '%trinket%'`;
  let cambiate = 0;
  for (const r of righe) {
    const nome = nomeNuovo(r.name, r.source, r.nome_ita);
    const descrizione = r.descrizione_ita ? conOggettoInsolito(r.descrizione_ita) : r.descrizione_ita;
    if (nome === r.nome_ita && descrizione === r.descrizione_ita) continue;
    cambiate++;
    console.log(`${r.name}|${r.source}: «${r.nome_ita}» -> «${nome}»${descrizione !== r.descrizione_ita ? " (+ descrizione)" : ""}`);
    if (applica) {
      await sql`UPDATE compendio_traduzione_ia SET nome_ita = ${nome}, descrizione_ita = ${descrizione}, updated_at = now()
                WHERE kind = ${r.kind} AND name = ${r.name} AND source = ${r.source}`;
    }
  }
  console.log(`\n${applica ? "" : "[PROVA] "}voci allineate: ${cambiate} su ${righe.length}`);
}
