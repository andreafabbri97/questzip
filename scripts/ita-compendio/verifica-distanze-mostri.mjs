// Confronta le distanze delle schede dei mostri con quelle dell'originale (vedi
// lib/fivetools/distanze-mostro.ts). Non corregge niente: elenca.
//
// È la prova dei dadi applicata ai metri. I manuali italiani convertono i piedi a 1,5 metri ogni 5,
// quindi "within 60 feet" deve avere il suo "18 metri": se non c'è, o la frase manca o il numero è
// stato letto male. La prima volta ha trovato 253 schede su 665: quasi tutte cifre spezzate dalla
// colonna stretta ("portata 1, 5 m", "gittata 6/1 8 m", "portata l,S m"), che ora pulisce
// pulisciCorpoScheda, e poi le frasi perse per davvero, da rileggere sulla pagina.
//
// Una differenza controllata sulla pagina e risultata del manuale (un numero stampato diverso
// dall'originale, una frase che l'edizione italiana non ha) si scrive in
// parsed/distanze-verificate.json, e da lì in poi tace finché non cambia:
//   { "voci": [{ "nome": "…", "fonte": "…", "nota": "…", "mancanti": ["72"], "inPiu": ["75"] }] }
//
// Uso: node --env-file=../../.env.local verifica-distanze-mostri.mjs [--copia <file.json>] [--solo "NOME"]
//   --copia  legge le schede da una copia locale della tabella invece che dal database (la quota
//            di trasferimento di Neon è condivisa con la produzione: per le prove ripetute)
import { existsSync, readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { risolviCopie } from "../../lib/fivetools/risolvi-copia.ts";
import { confrontaDistanze } from "../../lib/fivetools/distanze-mostro.ts";

const argomento = (nome) => (process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : null);
const copia = argomento("--copia");
const solo = argomento("--solo");
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

const index = await (await fetch(`${B}/bestiary/index.json`)).json();
const files = await Promise.all(
  [...new Set(Object.values(index))].map((f) => fetch(`${B}/bestiary/${f}`).then((r) => r.json()).catch(() => ({}))),
);
const template = await fetch(`${B}/bestiary/template.json`).then((r) => r.json()).catch(() => ({}));
const creature = new Map(
  risolviCopie(files.flatMap((f) => f.monster ?? []), template.monsterTemplate ?? []).map((m) => [`${m.name}|${m.source}`, m]),
);

const COLONNE = ["tratti", "azioni", "azioni_bonus", "reazioni", "azioni_leggendarie"];
const SEZIONI = ["trait", "action", "bonus", "reaction", "legendary", "mythic", "spellcasting"];
const righe = copia
  ? JSON.parse(readFileSync(copia, "utf8"))
  : await neon(process.env.DATABASE_URL)`
      SELECT nome, fonte, nome_inglese, fonte_inglese, tratti, azioni, azioni_bonus, reazioni, azioni_leggendarie
      FROM compendio_ita_mostro WHERE nome_inglese IS NOT NULL`;

const FILE_VERIFICATE = new URL("./parsed/distanze-verificate.json", import.meta.url);
const verificate = new Map(
  (existsSync(FILE_VERIFICATE) ? JSON.parse(readFileSync(FILE_VERIFICATE, "utf8")).voci : []).map((v) => [
    `${v.nome}|${v.fonte}`,
    v,
  ]),
);
const uguali = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...(b ?? [])].sort());

let diverse = 0;
let gia = 0;
for (const r of righe) {
  if (!r.nome_inglese || (solo && r.nome !== solo)) continue;
  const originale = creature.get(`${r.nome_inglese}|${r.fonte_inglese}`);
  if (!originale) continue;
  const inglese = JSON.stringify(SEZIONI.map((s) => originale[s] ?? null));
  const italiano = COLONNE.map((c) => r[c] ?? "").join("\n");
  const { mancanti, inPiu } = confrontaDistanze(italiano, inglese, JSON.stringify(originale.variant ?? null));
  if (mancanti.length === 0 && inPiu.length === 0) continue;
  const nota = verificate.get(`${r.nome}|${r.fonte}`);
  if (nota && uguali(mancanti.map((d) => d.valore), nota.mancanti) && uguali(inPiu.map((d) => d.valore), nota.inPiu)) {
    gia++;
    continue;
  }
  diverse++;
  console.log(`${r.nome} [${r.fonte}] ~ ${r.nome_inglese}|${r.fonte_inglese}`);
  for (const d of mancanti) console.log(`  manca  ${d.valore.padEnd(6)} «${d.contesto}»`);
  for (const d of inPiu) console.log(`  in più ${d.valore.padEnd(6)} «${d.contesto}»`);
}
console.log(`\nschede con distanze diverse dall'originale: ${diverse} (già controllate sulla pagina: ${gia})`);
