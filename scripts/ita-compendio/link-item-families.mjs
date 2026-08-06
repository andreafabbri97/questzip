// Completa link-item-names.mjs per gli oggetti "famiglia": nel manuale italiano sono UNA voce
// sola (es. "Anello di Resistenza" descrive tutti gli 8 tipi di danno in un unico paragrafo),
// ma in 5etools sono divisi in tante entry separate per sottotipo (Ring of Fire Resistance, Ring
// of Cold Resistance, ...), senza una entry "generica" verso cui puntare. Colleghiamo quindi
// esplicitamente a UNA variante rappresentativa (verificata contro i dati reali) — è comunque un
// miglioramento netto rispetto a nessun collegamento, e il testo ufficiale italiano descrive
// correttamente anche quella variante specifica (fa parte della stessa voce del manuale).
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { compendioItaOggetti } from "../../lib/db/schema.ts";
import { eq, isNull } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

async function fetchJson(url) {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

const items = await fetchJson(`${RAW_BASE}/items.json`);
const variants = await fetchJson(`${RAW_BASE}/magicvariants.json`);
const pool = [
  ...(items?.item ?? []).map((i) => ({ name: i.name, source: i.source })),
  ...(variants?.magicvariant ?? []).map((v) => ({ name: v.name, source: v.inherits?.source ?? v.source })),
];

function normalizeName(name) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}
function find(name, source) {
  return pool.find((p) => normalizeName(p.name) === normalizeName(name) && p.source === source) ?? null;
}

const OVERRIDES = {
  "Pergamena di Protezione": ["Scroll of Protection (Aberrations)", "XDMG"],
  "Pergamena Magica": ["Spell Scroll (1st Level)", "DMG"],
  "Piuma di Quaal": ["Quaal's Feather Token, Anchor", "DMG"],
  "Pozione della Forza dei Giganti": ["Potion of Hill Giant Strength", "DMG"],
  "Anello del Comando Degli Elementali": ["Ring of Fire Elemental Command", "DMG"],
  "Anello di Resistenza": ["Ring of Fire Resistance", "DMG"],
  "Pozione di Resistenza": ["Potion of Fire Resistance", "DMG"],
  "Armatura +, +20 +3": ["+1 Armor", "DMG"],
  "Armatura della Resistenza": ["Armor of Fire Resistance", "DMG"],
  "Armatura della Vulnerabilità": ["Armor of Vulnerability (Bludgeoning)", "XDMG"],
  "Bacchetta del Mago da Guerra +l, +2 0 +3": ["+1 Wand of the War Mage", "DMG"],
  "Borsa dei Trucchi": ["Bag of Tricks, Gray", "DMG"],
  "Campana Dell'Apertura": ["Chime of Opening", "DMG"],
  "Cintura della Forza dei Giganti": ["Belt of Hill Giant Strength", "DMG"],
  "Corazza di Scaglie di Drago": ["Black Dragon Scale Mail", "DMG"],
  "Corno del Valhalla": ["Horn of Valhalla, Brass", "DMG"],
  "Munizione +l, +2 0 +3": ["+1 Ammunition", "DMG"],
  "Strumento dei Bardi": ["Instrument of the Bards, Anstruth Harp", "DMG"],
  "Verga del Patto Rispettato": ["+1 Rod of the Pact Keeper", "DMG"],
};

const rows = await db.select().from(compendioItaOggetti).where(isNull(compendioItaOggetti.nomeInglese));
let updated = 0;
for (const row of rows) {
  const override = OVERRIDES[row.nome];
  if (!override) continue;
  const [name, source] = override;
  const found = find(name, source);
  if (!found) {
    console.log(`SALTATO (non trovato): ${row.nome} -> "${name}" (${source})`);
    continue;
  }
  await db.update(compendioItaOggetti).set({ nomeInglese: found.name, fonteInglese: found.source }).where(eq(compendioItaOggetti.id, row.id));
  updated++;
  console.log(`OK: ${row.nome} -> "${found.name}" (${found.source})`);
}
console.log(`\nAggiornati: ${updated}/${Object.keys(OVERRIDES).length}`);
