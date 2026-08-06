// Come link-spell-names.mjs ma per gli oggetti magici (compendio_ita_oggetto). Coppie composte
// a mano da Claude usando la conoscenza diretta del catalogo oggetti magici D&D 5e, verificate
// contro i dati reali di 5etools prima di scrivere.
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

const file = await fetchJson(`${RAW_BASE}/items.json`);
const fileBase = await fetchJson(`${RAW_BASE}/items-base.json`);
const fileVariants = await fetchJson(`${RAW_BASE}/magicvariants.json`);
// Le "varianti generiche" (GV, es. Flame Tongue, Dragon Slayer, Vicious Weapon...) tengono la
// fonte dentro inherits.source invece che al livello principale come gli oggetti normali.
const variantItems = (fileVariants?.magicvariant ?? []).map((v) => ({
  name: v.name,
  source: v.inherits?.source ?? v.source,
}));
const englishItems = [...(file?.item ?? []), ...(fileBase?.baseitem ?? []), ...variantItems].filter(
  (i) => i.source,
);

function normalizeName(name) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

const byNormName = new Map();
for (const s of englishItems) {
  const key = normalizeName(s.name);
  if (!byNormName.has(key)) byNormName.set(key, []);
  byNormName.get(key).push(s);
}

const SOURCE_PREFERENCE = ["DMG", "XDMG", "PHB", "XPHB"];

const MAP = {
  "Ammazzadraghi": "Dragon Slayer",
  "Ammazzagiganti": "Giant Slayer",
  "Amuleto Anti-Individuazione e Localizzazione": "Amulet of Proof against Detection and Location",
  "Anello Accumula Incantesimi": "Ring of Spell Storing",
  "Anello del Calore": "Ring of Warmth",
  "Anello del Camminare Sullacqua": "Ring of Water Walking",
  "Anello del Comando Degli Elementali": "Ring of Elemental Command",
  "Anello del Nuotare": "Ring of Swimming",
  "Anello Dell'Ariete": "Ring of the Ram",
  "Anello della Caduta Morbida": "Ring of Feather Falling",
  "Anello della Libertà di Azione": "Ring of Free Action",
  "Anello di Resistenza": "Ring of Resistance",
  "Anello di Scudo Mentale": "Ring of Mind Shielding",
  "Arma Dell'Avvertimento": "Weapon of Warning",
  "Arma Spietata": "Vicious Weapon",
  "Armatura +, +20 +3": "Armor, +1, +2, or +3",
  "Armatura Adamantina": "Adamantine Armor",
  "Armatura Completa Nanica": "Dwarven Plate",
  "Armatura del Marinaio": "Mariner's Armor",
  "Armatura della Resistenza": "Armor of Resistance",
  "Armatura della Vulnerabilità": "Armor of Vulnerability",
  "Armatura Demoniaca": "Demon Armor",
  "Armatura di Cuoio Borchiato Incantata": "Glamoured Studded Leather",
  "Armatura in Mithral": "Mithral Armor",
  "Ascia del Berserker": "Berserker Axe",
  "Bacchetta dei Dardi Incantati": "Wand of Magic Missiles",
  "Bacchetta del Legame": "Wand of Binding",
  "Bacchetta del Mago da Guerra +l, +2 0 +3": "Wand of the War Mage",
  "Bacchetta della Metamorfosi": "Wand of Polymorph",
  "Bacchetta di Individuazione del Magico": "Wand of Magic Detection",
  "Bastone dei Boschi": "Staff of the Woodlands",
  "Bastone del Colpo Possente": "Staff of Striking",
  "Bastone del Deperimento": "Staff of Withering",
  "Bastone della Vipera": "Staff of the Adder",
  "Bastone Dello Charme": "Staff of Charming",
  "Bastone Dello Sciame di Insetti": "Staff of Swarming Insects",
  "Biglia di Forza": "Bead of Force",
  "Boccia del Comando Degli Elementali Dell'Acqua": "Bowl of Commanding Water Elementals",
  "Borsa dei Trucchi": "Bag of Tricks",
  "Braciere del Comando Degli Elementali del Fuoco": "Brazier of Commanding Fire Elementals",
  "Campana Dell'Apertura": "Bell of Opening",
  "Caraffa Dell'Acqua Eterna": "Decanter of Endless Water",
  "Cintura della Forza dei Giganti": "Belt of Giant Strength",
  "Colla Meravigliosa": "Sovereign Glue",
  "Corazza di Scaglie di Drago": "Dragon Scale Mail",
  "Corda Intralciante": "Rope of Entanglement",
  "Corda per Sgalare": "Rope of Climbing",
  "Corno del Valhalla": "Horn of Valhalla",
  "Corno della Distruzione": "Horn of Blasting",
  "Diadema Incandescente": "Circlet of Blasting",
  "Difensiva": "Defender",
  "Elmo della Comprensione dei Linguaggi": "Helm of Comprehending Languages",
  "Fascia Dell'Intelletto": "Headband of Intellect",
  "Ferri Dello Zefiro": "Horseshoes of a Zephyr",
  "Filtro D'Amore": "Philter of Love",
  "Gemma della Luminosità": "Gem of Brightness",
  "Gemma della Visione": "Gem of Seeing",
  "Giaco di Maclia Elfico": "Elven Chain",
  "Giara Alchemica": "Alchemy Jug",
  "Guanti Catturaproiettili": "Gloves of Missile Snaring",
  "Guanti del Potere Orchesco": "Gauntlets of Ogre Power",
  "Guanti Ladreschi": "Gloves of Thievery",
  "Lama della Fortuna": "Luck Blade",
  "Lanterna della Rivelazione": "Lantern of Revealing",
  "Lenti Dello Charme": "Eyes of Charming",
  "Lingua di Fiamme": "Flame Tongue",
  "Manette Dimensionali": "Dimensional Shackles",
  "Mantello Dell'Aracnide": "Cloak of Arachnida",
  "Mantello Distorcente": "Cloak of Displacement",
  "Mantello Elfico": "Cloak of Elvenkind",
  "Manto della Resistenza Agli Incantesimi": "Mantle of Spell Resistance",
  "Martello dei Fulmini": "Hammer of Thunderbolts",
  "Martello Nanico da Lancio": "Dwarven Thrower",
  "Mazza del Terrore": "Mace of Terror",
  "Mazza della Distruzione": "Mace of Disruption",
  "Mazza della Punizione": "Mace of Smiting",
  "Munizione +l, +2 0 +3": "Ammunition, +1, +2, or +3",
  "Occhiali della Notte": "Goggles of Night",
  "Olio Dell'Affilatura": "Oil of Sharpness",
  "Olio della Forma Eterea": "Oil of Etherealness",
  "Pergamena di Protezione": "Scroll of Protection",
  "Pergamena Magica": "Spell Scroll",
  "Pietre Parlanti": "Sending Stones",
  "Piuma di Quaal": "Quaal's Feather Token",
  "Polvere Prosciugante": "Dust of Dryness",
  "Pozione della Forza dei Giganti": "Potion of Giant Strength",
  "Pozione di Resistenza": "Potion of Resistance",
  "Pugnale Avvelenato": "Dagger of Venom",
  "Scarabeo di Protezione": "Scarab of Protection",
  "Scudo +l, +2 0 +3": "Shield, +1, +2, or +3",
  "Scudo Attiraproiettili": "Shield of Missile Attraction",
  "Scupo Anti-Incantesimi": "Spellguard Shield",
  "Spada Danzante": "Dancing Sword",
  "Spada del Ferimento": "Sword of Wounding",
  "Spada del Furto Vitale": "Sword of Life Stealing",
  "Spada della Vendetta": "Sword of Vengeance",
  "Spada delle Risposte": "Sword of Answering",
  "Spada Ruba Nove Vite": "Nine Lives Stealer",
  "Spadone del Gelo": "Frost Brand",
  "Stivali Elfici": "Boots of Elvenkind",
  "Stivali Molleggiati": "Boots of Striding and Springing",
  "Strumento dei Bardi": "Instrument of the Bards",
  "Talismano Anti-Veleno": "Periapt of Proof against Poison",
  "Talismano del Male Estremo": "Talisman of Ultimate Evil",
  "Talismano della Rimarginazione": "Periapt of Wound Closure",
  "Talismano della Salute": "Periapt of Health",
  "Tomo del Comando e Dell'Influenza": "Tome of Leadership and Influence",
  "Tridente del Comando dei Pesci": "Trident of Fish Command",
  "Tunica Degli Occhi": "Robe of Eyes",
  "Tunica delle Stelle": "Robe of Stars",
  "Verga del Patto Rispettato": "Rod of the Pact Keeper",
  "Verga Dell'Allerta": "Rod of Alertness",
  "Verga della Sovranità": "Rod of Rulership",
  "Zainetto Pratico di Heward": "Heward's Handy Haversack",
};

const rows = await db.select().from(compendioItaOggetti).where(isNull(compendioItaOggetti.nomeInglese));
let updated = 0;
const notInMap = [];
const notFoundInData = [];

for (const row of rows) {
  const guess = MAP[row.nome];
  if (!guess) {
    notInMap.push(row.nome);
    continue;
  }
  const candidates = byNormName.get(normalizeName(guess));
  if (!candidates || candidates.length === 0) {
    notFoundInData.push(`${row.nome} -> "${guess}" (non trovato nei dati 5etools)`);
    continue;
  }
  let chosen = null;
  for (const src of SOURCE_PREFERENCE) {
    chosen = candidates.find((c) => c.source === src);
    if (chosen) break;
  }
  if (!chosen) chosen = candidates[0];

  await db
    .update(compendioItaOggetti)
    .set({ nomeInglese: chosen.name, fonteInglese: chosen.source })
    .where(eq(compendioItaOggetti.id, row.id));
  updated++;
}

console.log(`Aggiornati: ${updated}/${rows.length}`);
console.log(`Non presenti nella mappa (${notInMap.length}):`, notInMap);
console.log(`Nella mappa ma non trovati nei dati 5etools (${notFoundInData.length}):`, notFoundInData);
