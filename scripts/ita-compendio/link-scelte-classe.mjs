// Nomi italiani UFFICIALI per le "scelte di classe": suppliche occulte, Voto del Patto, stili di
// combattimento, metamagia, infusioni dell'Artefice.
//
// Perché mancavano: non sono una delle 8 categorie del Compendio (vivono in optionalfeatures.json
// di 5etools), quindi nessuna pipeline di traduzione le toccava — la scheda mostrava "Devil's
// Sight" in inglese secco, senza nemmeno il suggerimento italiano che i Talenti hanno.
//
// Il modello propone il nome, ma NON è lui ad avere l'ultima parola: ogni proposta viene cercata
// nel testo reale dei manuali italiani (PHB, Xanathar, Tasha) e salvata SOLO se compare davvero.
// Così quello che finisce in tabella è terminologia dei manuali, non un'invenzione plausibile.
//
// Uso: node --env-file=../../.env.local link-scelte-classe.mjs [--dry-run]
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { askGemini } from "../../lib/gemini.ts";

const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
const sql = neon(process.env.DATABASE_URL);
const dryRun = process.argv.includes("--dry-run");
const KIND = "scelteClasse";
const TIPI = ["EI", "PB", "FS:F", "FS:P", "FS:R", "FS:B", "MM", "AI"];

const norm = (s) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");

const manuali = ["phb", "xanathar", "tasha"].map((f) => {
  const d = JSON.parse(readFileSync(new URL(`./extracted/${f}.json`, import.meta.url), "utf-8"));
  return { nome: f, testo: norm(d.pages.map((p) => p.text).join(" ")) };
});
const cercaNeiManuali = (nome) => manuali.find((m) => m.testo.includes(norm(nome)))?.nome ?? null;

const file = await (await fetch(`${RAW_BASE}/optionalfeatures.json`)).json();
const voci = (file.optionalfeature ?? []).filter((o) =>
  (o.featureType ?? []).some((t) => TIPI.includes(t)),
);
const uniche = [...new Map(voci.map((o) => [`${o.name}|${o.source}`, o])).values()];
console.log(`${uniche.length} scelte di classe da tradurre`);

const gia = await sql`SELECT name, source FROM compendio_traduzione_ia WHERE kind = ${KIND} AND nome_ita IS NOT NULL`;
const fatte = new Set(gia.map((r) => `${r.name}|${r.source}`));
const daFare = uniche.filter((o) => !fatte.has(`${o.name}|${o.source}`));
console.log(`${daFare.length} da fare (${fatte.size} già presenti)`);
if (daFare.length === 0) process.exit(0);

const LOTTO = 45;
let salvati = 0;
const nonVerificati = [];

for (let i = 0; i < daFare.length; i += LOTTO) {
  const lotto = daFare.slice(i, i + LOTTO);
  const prompt = `Sei un esperto di Dungeons & Dragons 5e e conosci i nomi UFFICIALI usati nei manuali tradotti in ITALIANO (Manuale del Giocatore, Guida Omnicomprensiva di Xanathar, Calderone Omnicomprensivo di Tasha).

Per ognuna di queste capacità opzionali (suppliche occulte, voti del patto, stili di combattimento, metamagia, infusioni), dammi il nome UFFICIALE ITALIANO esattamente come stampato sul manuale. Non inventare: se non conosci il nome ufficiale, usa null.

${lotto.map((o, n) => `${n + 1}. ${o.name}`).join("\n")}

Rispondi SOLO con un array JSON: [{"en": "<nome inglese>", "it": "<nome italiano o null>"}]`;

  const raw = await askGemini({ prompt });
  if (!raw) { console.log("nessuna risposta (quota?) — mi fermo"); break; }
  let coppie;
  try { coppie = JSON.parse(raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim()); }
  catch { console.log("risposta non JSON, salto il lotto"); continue; }

  for (const c of coppie) {
    const voce = lotto.find((o) => o.name === c.en);
    if (!voce || !c.it) continue;
    const libro = cercaNeiManuali(c.it);
    if (!libro) { nonVerificati.push(`${c.en} -> "${c.it}"`); continue; }
    if (!dryRun) {
      await sql`
        INSERT INTO compendio_traduzione_ia (kind, name, source, nome_ita)
        VALUES (${KIND}, ${voce.name}, ${voce.source}, ${c.it})
        ON CONFLICT (kind, name, source) DO UPDATE SET nome_ita = EXCLUDED.nome_ita`;
    }
    salvati++;
    if (salvati <= 12) console.log(`  ✓ ${voce.name} -> "${c.it}"  [confermato in ${libro}]`);
  }
  console.log(`lotto ${Math.floor(i / LOTTO) + 1}/${Math.ceil(daFare.length / LOTTO)}: ${salvati} verificati finora`);
}

console.log(`\n${dryRun ? "[PROVA] " : ""}salvati (presenti nei manuali): ${salvati}`);
console.log(`scartati perché non trovati nei manuali: ${nonVerificati.length}`);
for (const x of nonVerificati.slice(0, 12)) console.log("  -", x);
