// Corregge un errore di coerenza nel primo lotto auto-tradotto da Claude: alcune misure erano
// rimaste in piedi/miglia/libbre invece di essere convertite in metri/km/kg come fa sempre il
// testo ufficiale dei manuali italiani (es. "60 ft" -> "18 metri", confermato confrontando
// compendio_ita_incantesimo.descrizione). Sostituzioni letterali mirate, stesso approccio di
// fix-page-header-leaks.mjs.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq } from "drizzle-orm";
import { compendioTraduzioniIa } from "../../lib/db/schema.ts";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const fixes = [
  { name: "Horn of Silent Alarm", source: "XGE", from: "entro 600 piedi dal corno", to: "entro 180 metri dal corno" },
  { name: "Scroll of Tarrasque Summoning", source: "IDRotF", from: "entro 1 miglio da te", to: "entro 1,6 km da te" },
  { name: "Seeker Dart", source: "PotA", from: "entro 120 piedi da te", to: "entro 36 metri da te" },
  { name: "Seeker Dart", source: "PotA", from: "aperture larghe anche solo 1 pollice", to: "aperture larghe anche solo 2,5 centimetri" },
  { name: "Selesnya Keyrune", source: "GGR", from: "Finché si trova entro 1 miglio da te", to: "Finché si trova entro 1,6 km da te" },
  { name: "Selesnya Keyrune", source: "GGR", from: "in uno spazio libero entro 5 piedi da te", to: "in uno spazio libero entro 1,5 metri da te" },
  { name: "Scissors of Shadow Snipping", source: "WBtW", from: "entro 5 piedi da te", to: "entro 1,5 metri da te" },
  { name: "Scissors of Shadow Snipping", source: "WBtW", from: "fino a 30 piedi", to: "fino a 9 metri" },
  { name: "Scorpion Ship", source: "AAG", from: "velocità di cammino di 30 piedi", to: "velocità di cammino di 9 metri" },
  { name: "Sanctum Amulet", source: "BGG", from: "entro 60 piedi da te", to: "entro 18 metri da te" },
  { name: "Saint Markovia's Thighbone", source: "CoS", from: "raggio di 20 piedi", to: "raggio di 6 metri" },
  { name: "Saint Markovia's Thighbone", source: "CoS", from: "altri 20 piedi", to: "altri 6 metri" },
  { name: "Sack", source: "PHB", from: "1 piede cubo o 30 libbre", to: "1 piede cubo o 13,5 kg" },
  { name: "Sack", source: "XPHB", from: "30 libbre entro 1 piede cubo", to: "13,5 kg entro 1 piede cubo" },
];

// 9 Scroll of Protection (XDMG) + 5 Scroll of Protection from X (DMG): stesso identico
// frammento "raggio di 5 piedi e un'altezza di 10 piedi" in tutti e 14.
const scrollNames = [
  ["Scroll of Protection (Aberrations)", "XDMG"], ["Scroll of Protection (Celestials)", "XDMG"],
  ["Scroll of Protection (Dragons)", "XDMG"], ["Scroll of Protection (Elementals)", "XDMG"],
  ["Scroll of Protection (Fey)", "XDMG"], ["Scroll of Protection (Giants)", "XDMG"],
  ["Scroll of Protection (Monstrosities)", "XDMG"], ["Scroll of Protection (Oozes)", "XDMG"],
  ["Scroll of Protection (Plants)", "XDMG"],
  ["Scroll of Protection from Aberrations", "DMG"], ["Scroll of Protection from Celestials", "DMG"],
  ["Scroll of Protection from Elementals", "DMG"], ["Scroll of Protection from Fey", "DMG"],
  ["Scroll of Protection from Plants", "DMG"],
];
for (const [name, source] of scrollNames) {
  fixes.push({ name, source, from: "raggio di 5 piedi e un'altezza di 10 piedi", to: "raggio di 1,5 metri e un'altezza di 3 metri" });
}

// 5 Scroll of Titan Summoning (XDMG): "entro 1 miglio da te" (identico in tutti e 5)
const titanNames = ["Animal Lord", "Colossus", "Empyrean", "Kraken", "Tarrasque"].map((n) => [`Scroll of Titan Summoning (${n})`, "XDMG"]);
for (const [name, source] of titanNames) {
  fixes.push({ name, source, from: "entro 1 miglio da te", to: "entro 1,6 km da te" });
}

let applied = 0;
for (const fix of fixes) {
  const [row] = await db
    .select()
    .from(compendioTraduzioniIa)
    .where(and(eq(compendioTraduzioniIa.kind, "oggetti"), eq(compendioTraduzioniIa.name, fix.name), eq(compendioTraduzioniIa.source, fix.source)));
  if (!row?.descrizioneIta) { console.error(`NON TROVATO: ${fix.name} (${fix.source})`); continue; }
  if (!row.descrizioneIta.includes(fix.from)) { console.error(`FRAMMENTO NON TROVATO in ${fix.name}: ${JSON.stringify(fix.from)}`); continue; }
  const nuova = row.descrizioneIta.replaceAll(fix.from, fix.to);
  await db
    .update(compendioTraduzioniIa)
    .set({ descrizioneIta: nuova })
    .where(and(eq(compendioTraduzioniIa.kind, "oggetti"), eq(compendioTraduzioniIa.name, fix.name), eq(compendioTraduzioniIa.source, fix.source)));
  applied++;
}
console.log(`Corrette ${applied}/${fixes.length} misure.`);
