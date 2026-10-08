// Elenca le parole di un testo passato dall'OCR che il vocabolario non conosce, dalla più
// frequente: è da qui che si parte per trovare i refusi senza rileggere le pagine.
//
// Non corregge niente e non decide niente: una parola sconosciuta può essere un refuso («hestia»
// per bestia), un nome proprio o una parola vera che il dizionario non ha. Si legge l'elenco, e
// - ciò che si ripete in una forma riconoscibile diventa una regola (lib/ocr-cleanup.ts,
//   lib/refusi-da-vocabolario.ts);
// - il resto si corregge a mano, guardando la frase, in un file per correggi-refusi.mjs.
// Le parole con la maiuscola a metà frase sono quasi sempre nomi e si lasciano fuori.
//
// Lavora su una copia locale delle tabelle (copia-locale.mjs), non sul database.
//
// Uso: node --env-file=../../.env.local parole-sospette.mjs <cartella copia> <bersaglio> [minimo] [--contesto]
//   bersagli: mostri | oggetti | costa | tasha
//   minimo:   quante volte almeno deve comparire la parola (1)
import { readFileSync } from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { caricaVocabolario } from "./vocabolario.mjs";

const [cartella, bersaglio, minimo = "1"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const conContesto = process.argv.includes("--contesto");
const leggi = (tabella) => JSON.parse(readFileSync(path.join(cartella, `${tabella}.json`), "utf-8"));

const CAMPI_MOSTRO = ["tratti", "azioni", "azioni_bonus", "reazioni", "azioni_leggendarie"];
const BERSAGLI = {
  mostri: () => leggi("compendio_ita_mostro").map((r) => ({ nome: `${r.nome} [${r.fonte}]`, testo: CAMPI_MOSTRO.map((c) => r[c] ?? "").join("\n") })),
  oggetti: () => leggi("compendio_ita_oggetto").filter((r) => r.fonte === "oggetti_magici").map((r) => ({ nome: r.nome, testo: r.descrizione ?? "" })),
  costa: () => leggi("compendio_ita_regola").filter((r) => r.fonte === "costa_spada").map((r) => ({ nome: r.titolo, testo: r.testo ?? "" })),
  tasha: () => leggi("compendio_traduzione_ia").filter((r) => r.source === "TCE" && r.descrizione_ita).map((r) => ({ nome: `${r.name} (${r.kind})`, testo: r.descrizione_ita })),
};
if (!cartella || !BERSAGLI[bersaglio]) {
  console.error(`Uso: node parole-sospette.mjs <cartella copia> <${Object.keys(BERSAGLI).join("|")}> [minimo] [--contesto]`);
  process.exit(1);
}

const { nota } = await caricaVocabolario(neon(process.env.DATABASE_URL));
const voci = BERSAGLI[bersaglio]();
const sospette = new Map();
let totale = 0;
for (const v of voci) {
  for (const m of v.testo.matchAll(/\p{L}+/gu)) {
    const parola = m[0].toLowerCase();
    totale++;
    if (parola.length < 3 || nota(parola)) continue;
    const s = sospette.get(parola) ?? { volte: 0, maiuscole: 0, dove: new Set(), contesto: "" };
    s.volte++;
    if (/^\p{Lu}/u.test(m[0])) s.maiuscole++;
    s.dove.add(v.nome);
    if (!s.contesto) s.contesto = v.testo.slice(Math.max(0, m.index - 35), m.index + m[0].length + 25).replace(/\s+/g, " ");
    sospette.set(parola, s);
  }
}
// Sempre con la maiuscola: un nome proprio, non un refuso.
const elenco = [...sospette].filter(([, s]) => s.volte >= Number(minimo) && s.maiuscole < s.volte).sort((a, b) => b[1].volte - a[1].volte);
const occorrenze = elenco.reduce((n, [, s]) => n + s.volte, 0);
console.log(`${bersaglio}: ${voci.length} testi, ${totale} parole; sconosciute ${elenco.length} diverse, ${occorrenze} occorrenze`);
for (const [parola, s] of elenco) {
  const dove = conContesto ? `   «${s.contesto}»  [${[...s.dove].slice(0, 2).join("; ")}]` : "";
  console.log(`${String(s.volte).padStart(4)} ${parola}${dove}`);
}
