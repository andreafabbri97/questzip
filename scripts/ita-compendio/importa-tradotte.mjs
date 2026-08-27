// Scrive nel Compendio descrizioni italiane preparate a mano, senza passare da Gemini.
//
// La quota della chiave Gemini è per le FUNZIONALITÀ che usano le persone mentre giocano
// (assistente regole, import scheda da foto): spenderla per tradurre in blocco i dati significa
// lasciare l'assistente "non disponibile" a chi sta al tavolo. Dove il testo ufficiale italiano
// non è recuperabile dai manuali posseduti (vedi estrai-scelte-classe.mjs), la traduzione si
// scrive qui a mano, con la terminologia dei manuali.
//
// Uso: node --env-file=../../.env.local importa-tradotte.mjs <file.json> [--applica]
//   Il file è { "kind": "...", "voci": { "Nome Inglese|FONTE": "testo italiano", ... } }
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const file = process.argv[2];
const applica = process.argv.includes("--applica");
if (!file) {
  console.error("indicare il file JSON con le traduzioni");
  process.exit(1);
}

const dati = JSON.parse(readFileSync(path.resolve(file), "utf-8"));
// Come sopra: i testi dei manuali vivono sotto parsed/ (gitignored), i file di mappatura tracciati
// portano solo i nomi. Se manca il testo nella voce, lo si cerca lì per chiave.
const trascritti = (() => {
  try {
    const tutti = JSON.parse(
      readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "parsed", "testi-trascritti.json"), "utf-8"),
    );
    return Object.assign({}, ...Object.values(tutti));
  } catch {
    return {};
  }
})();
const { kind, voci } = dati;
if (!kind || !voci) {
  console.error('il file deve avere la forma { "kind": "...", "voci": { "Nome|FONTE": "testo" } }');
  process.exit(1);
}

let scritte = 0;
const nonTrovate = [];
for (const [chiave, valore] of Object.entries(voci)) {
  if (chiave.startsWith("_")) continue; // righe di nota nel file
  const [name, source] = chiave.split("|");
  // Il valore può essere il solo testo, oppure { nome, testo } quando anche il NOME va corretto:
  // leggendo i manuali si scopre che alcune traduzioni automatiche non erano quelle stampate
  // (Archery è "Tiro" nel Manuale del Giocatore, non "Tiro con l'Arco").
  const testo = typeof valore === "string" ? valore : (valore?.testo ?? trascritti[chiave] ?? trascritti[valore?.nome]);
  const nome = typeof valore === "string" ? null : valore?.nome;
  if (!name || !source || !testo?.trim()) continue;
  const esiste = await sql`
    SELECT 1 FROM compendio_traduzione_ia
    WHERE kind = ${kind} AND name = ${name} AND source = ${source}`;
  if (esiste.length === 0) {
    nonTrovate.push(chiave);
    continue;
  }
  scritte++;
  if (applica) {
    if (nome?.trim()) {
      await sql`
        UPDATE compendio_traduzione_ia
        SET descrizione_ita = ${testo.trim()}, nome_ita = ${nome.trim()}, updated_at = now()
        WHERE kind = ${kind} AND name = ${name} AND source = ${source}`;
    } else {
      await sql`
        UPDATE compendio_traduzione_ia SET descrizione_ita = ${testo.trim()}, updated_at = now()
        WHERE kind = ${kind} AND name = ${name} AND source = ${source}`;
    }
  }
}

console.log(`${applica ? "" : "[PROVA] "}${scritte} descrizioni scritte per "${kind}"`);
if (nonTrovate.length > 0) {
  console.log(`voci non presenti nel Compendio (${nonTrovate.length}): ${nonTrovate.join(", ")}`);
}
