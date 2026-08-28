// Scrive nel Compendio i nomi (e i testi) italiani delle opzioni di classe, prendendoli dalle
// pagine dei manuali invece che da una traduzione.
//
// Il pannello "Scelte della classe" mostrava 112 voci ancora in inglese — tutte le manovre del
// Maestro di Battaglia, tutte le discipline elementali del Monaco, i colpi arcani, le rune, quasi
// tutte le suppliche occulte — perché la cache delle traduzioni era stata riempita solo per un
// sottoinsieme e nessuno ci era più tornato. I nomi però sono stampati sui manuali che abbiamo.
//
// scelte-classe-sezioni.json dice DOVE guardare (libro e pagine) e COME si chiama ogni opzione in
// italiano e in inglese; il testo viene preso dall'estrazione, non ricopiato a mano: l'abbinamento
// avviene sull'intestazione così com'esce dal PDF, refusi OCR compresi, così non serve ripulire
// l'estrazione per usarla.
//
// Uso: node --env-file=../../.env.local importa-scelte-classe-sezioni.mjs [--applica]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

import { unisciRigheDiScheda } from "../../lib/compendio-ocr.ts";
import { pulisciTestoOcr } from "../../lib/ocr-cleanup.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");

// Le opzioni ristampate nell'edizione 2024 hanno lo stesso nome inglese: si scrive anche quella
// riga, altrimenti aprendo una classe del 2024 il nome tornerebbe in inglese.
const EDIZIONE_2024 = "XPHB";

// Il titoletto può portarsi dietro un requisito fra parentesi prima del punto ("Cavalcare il Vento
// (11° livello richiesto). Il monaco può…"): senza ammetterle, undici discipline elementali su
// diciassette restavano senza testo.
const TITOLETTO_RE = /^([A-ZÀ-Ù][A-Za-zà-ÿ'’\s,\-.]{2,44}?)(\s*\([^)]*\))?\.\s+(?=[A-ZÀ-Ù"«])/;

function paragrafiDi(libro, da, a) {
  const raw = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "extracted", `${libro}.json`), "utf-8"));
  const righe = [];
  for (const pagina of raw.pages) {
    if (pagina.page < da || pagina.page > a) continue;
    for (const linea of (pagina.text ?? "").split("\n")) {
      const t = linea.trim();
      if (t) righe.push(t);
    }
  }

  const voci = new Map();
  let titolo = null;
  let buffer = [];
  const chiudi = () => {
    if (titolo && buffer.length > 0) {
      // il prerequisito resta un paragrafo a sé: unito alla prosa diventava
      // "Prerequisito: 5° livello Il warlock può lanciare…", due frasi appiccicate
      const testo = unisciRigheDiScheda(buffer);
      if (testo.length >= 40 && !voci.has(titolo)) voci.set(titolo, testo);
    }
    titolo = null;
    buffer = [];
  };

  for (const riga of righe) {
    const inLinea = riga.match(TITOLETTO_RE);
    if (inLinea) {
      chiudi();
      titolo = inLinea[1].replace(/\s+/g, " ").trim();
      buffer = [riga.slice(inLinea[0].length)];
      continue;
    }
    // Il maiuscoletto non esce sempre tutto maiuscolo: "PUNIZIONE OccuLTA" (Eldritch Smite) restava
    // fuori con il confronto esatto, e il suo testo finiva in coda alla supplica precedente. Basta
    // che il titolo sia in stragrande maggioranza maiuscolo — la prosa, che è il contrario, resta
    // comunque esclusa. Stessa soglia già in uso in parse-talenti.mjs.
    const compatto = riga.replace(/[^A-Za-zÀ-ÿ']/g, "");
    const maiuscolo =
      compatto.length >= 4 &&
      compatto.length <= 44 &&
      compatto.replace(/[^A-ZÀ-Ý]/g, "").length / compatto.length >= 0.8;
    if (maiuscolo && !/CAPITOLO|\d/.test(riga) && !/[.,;:]$/.test(riga)) {
      chiudi();
      titolo = riga.replace(/\s+/g, " ").trim();
      buffer = [];
      continue;
    }
    if (/^[A-ZÀ-Ù0-9\s|I:]{6,}$/.test(riga)) {
      chiudi();
      continue;
    }
    if (titolo) buffer.push(riga);
  }
  chiudi();
  return voci;
}

// il titoletto può portarsi dietro il prerequisito ("Prerequisito: 9° livello") prima del testo
// vero: resta, perché è informazione della scheda, ma il confronto ignora spazi e maiuscole
const chiave = (s) => s.toLowerCase().replace(/[^a-zà-ÿ]/g, "");

const config = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "scelte-classe-sezioni.json"), "utf-8"));

let scritte = 0;
let senzaTesto = 0;
const nonTrovate = [];

for (const sezione of config.sezioni) {
  const paragrafi = paragrafiDi(sezione.libro, sezione.da, sezione.a);
  const perChiave = new Map([...paragrafi].map(([k, v]) => [chiave(k), v]));
  let ok = 0;

  for (const voce of sezione.voci) {
    const testo = perChiave.get(chiave(voce.estratto)) ?? null;
    if (!testo) {
      senzaTesto++;
      nonTrovate.push(`${voce.it} (${sezione.titolo})`);
    }
    const descrizione = testo ? pulisciTestoOcr(testo) : null;

    for (const fonte of [sezione.fonte, EDIZIONE_2024]) {
      if (applica) {
        await sql`
          INSERT INTO compendio_traduzione_ia (kind, name, source, nome_ita, descrizione_ita, updated_at)
          VALUES ('scelteClasse', ${voce.en}, ${fonte}, ${voce.it}, ${descrizione}, now())
          ON CONFLICT (kind, name, source) DO UPDATE
            SET nome_ita = excluded.nome_ita,
                descrizione_ita = coalesce(excluded.descrizione_ita, compendio_traduzione_ia.descrizione_ita),
                updated_at = now()`;
      }
      scritte++;
    }
    ok++;
  }
  console.log(`${sezione.titolo}: ${ok} voci (${paragrafi.size} paragrafi letti dalle pagine ${sezione.da}-${sezione.a})`);
}

console.log(`\n${applica ? "" : "[PROVA] "}${scritte} righe (nome + edizione 2024 compresa)`);
if (senzaTesto > 0) {
  console.log(`\nsenza testo nell'estrazione (il nome si scrive comunque): ${senzaTesto}`);
  for (const n of nonTrovate) console.log(`  - ${n}`);
}
if (!applica) console.log("\naggiungere --applica per scrivere");
