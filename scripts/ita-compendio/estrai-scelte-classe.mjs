// Estrae dai manuali italiani il TESTO UFFICIALE delle scelte di classe (suppliche occulte, stili
// di combattimento, metamagia, manovre, infusioni…).
//
// Nel PDF quelle voci sono un elenco di blocchi «NOME IN MAIUSCOLO» seguiti dalla descrizione, uno
// dopo l'altro fino al blocco successivo. I nomi italiani li abbiamo già (verificati sul manuale da
// link-scelte-classe.mjs): basta cercarli come intestazione e prendere quello che segue.
//
// Perché non tradurre e basta: il testo del manuale è quello vero, con la terminologia esatta —
// una traduzione, per quanto buona, resta un'approssimazione. E non consuma la quota IA dell'app,
// che serve a chi gioca.
//
// Uso: node --env-file=../../.env.local estrai-scelte-classe.mjs [--applica]
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { togliTestatinePagina } from "../../lib/testatine-pagina.ts";
import { pulisciTestoOcr } from "../../lib/ocr-cleanup.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTRACTED = path.join(SCRIPT_DIR, "extracted");
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");

/** Confronto insensibile a spaziatura, accenti e maiuscole: l'OCR le sbaglia tutte e tre. */
const chiaveNome = (s) =>
  (s ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

/** Una riga è un'intestazione di voce se è tutta in maiuscolo e corta. */
function eIntestazione(riga) {
  const t = riga.trim();
  if (t.length < 3 || t.length > 52) return false;
  const lettere = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (lettere.length < 3) return false;
  return lettere === lettere.toUpperCase();
}

// Tutti i manuali estratti: una supplica può stare nel Manuale del Giocatore, uno stile di
// combattimento in Tasha's, una manovra in Xanathar's. Si cerca ovunque.
const LIBRI = readdirSync(EXTRACTED)
  .filter((f) => f.endsWith(".json") && !f.includes("mappa"))
  .map((f) => f.replace(/\.json$/, ""));

const blocchiPerNome = new Map();
for (const libro of LIBRI) {
  let dati;
  try {
    dati = JSON.parse(readFileSync(path.join(EXTRACTED, `${libro}.json`), "utf-8"));
  } catch {
    continue;
  }
  const righe = (dati.pages ?? [])
    .flatMap((p) => String(p.text ?? "").split("\n"))
    .map((r) => r.trim())
    .filter(Boolean);

  for (let i = 0; i < righe.length; i++) {
    if (!eIntestazione(righe[i])) continue;
    const corpo = [];
    for (let j = i + 1; j < righe.length && corpo.length < 30; j++) {
      if (eIntestazione(righe[j])) break;
      corpo.push(righe[j]);
    }
    if (corpo.length === 0) continue;
    const chiave = chiaveNome(righe[i]);
    // Si tiene il blocco PIÙ LUNGO: lo stesso nome compare anche nell'indice analitico e nelle
    // tabelle riassuntive, dove sotto non c'è la descrizione ma una riga sola.
    const testo = corpo.join(" ");
    const esistente = blocchiPerNome.get(chiave);
    if (!esistente || testo.length > esistente.testo.length) {
      blocchiPerNome.set(chiave, { testo, libro });
    }
  }
}
console.log(`intestazioni raccolte dai manuali: ${blocchiPerNome.size}`);

const righe = await sql`
  SELECT name, source, nome_ita FROM compendio_traduzione_ia
  WHERE kind = 'scelteClasse' AND nome_ita IS NOT NULL AND descrizione_ita IS NULL
  ORDER BY name`;

let trovate = 0;
const mancanti = [];
for (const r of righe) {
  const blocco = blocchiPerNome.get(chiaveNome(r.nome_ita));
  // Un blocco troppo corto non è la descrizione ma una riga di tabella o di indice.
  if (!blocco || blocco.testo.length < 60) {
    mancanti.push(`${r.nome_ita} (${r.name})`);
    continue;
  }
  const testo = pulisciTestoOcr(togliTestatinePagina(blocco.testo));
  trovate++;
  if (trovate <= 5) console.log(`  ✓ ${r.nome_ita} [${blocco.libro}]: ${testo.slice(0, 80)}…`);
  if (applica) {
    await sql`
      UPDATE compendio_traduzione_ia SET descrizione_ita = ${testo}, updated_at = now()
      WHERE kind = 'scelteClasse' AND name = ${r.name} AND source = ${r.source}`;
  }
}

console.log(`\n${applica ? "" : "[PROVA] "}testo ufficiale trovato per ${trovate}/${righe.length} voci`);
if (mancanti.length > 0) {
  console.log(`senza testo nei manuali posseduti (${mancanti.length}):`);
  for (const m of mancanti) console.log("  -", m);
}
