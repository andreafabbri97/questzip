// Collega manualmente (nome ufficiale IT -> nome inglese 5etools) le 208 righe di
// compendio_ita_incantesimo che match-english-names.mjs non è riuscito ad abbinare
// automaticamente (traduzione IT->EN inaffidabile per nomi tecnici D&D). Le coppie sono
// composte a mano da Claude usando la conoscenza diretta della lista incantesimi 5e, poi
// verificate contro i dati reali di 5etools prima di scrivere: se il nome inglese indicato non
// esiste per davvero, la riga viene saltata invece di scrivere un fonteInglese inventato.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { compendioItaIncantesimi } from "../../lib/db/schema.ts";
import { eq, isNull } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

async function fetchJson(url) {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

const books = [
  "aag", "ai", "aitfr-avt", "bmt", "efa", "egw", "ftd", "frhof",
  "ggr", "idrotf", "llk", "phb", "sato", "scc", "tce", "xge", "xphb",
];
const files = await Promise.all(books.map((b) => fetchJson(`${RAW_BASE}/spells/spells-${b}.json`)));
const englishSpells = files.flatMap((f) => f?.spell ?? []);

function normalizeName(name) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

const byNormName = new Map();
for (const s of englishSpells) {
  const key = normalizeName(s.name);
  if (!byNormName.has(key)) byNormName.set(key, []);
  byNormName.get(key).push(s);
}

// fonte locale ("phb"|"xanathar"|"tasha") -> fonte 5etools preferita, in ordine di priorità
const SOURCE_PREFERENCE = {
  phb: ["PHB", "XPHB"],
  xanathar: ["XGE"],
  tasha: ["TCE"],
};

// nome ufficiale italiano -> nome inglese (la mia migliore stima, da verificare contro i dati reali)
const MAP = {
  "Abito Ultraterreno di Tasha": "Tasha's Otherworldly Guise",
  "Aculeo Mentale": "Mind Spike",
  "Aiuto": "Aid",
  "Alba": "Dawn",
  "Allucinazione di Forza": "Phantasmal Force",
  "Allucinazione Mortale": "Phantasmal Killer",
  "Alterare Se Stesso": "Alter Self",
  "Amicizia": "Friends",
  "Anatema Elementale": "Elemental Bane",
  "Anti-Individuazione": "Nondetection",
  "Antipatia/Simpatia": "Antipathy/Sympathy",
  "Arma Magica": "Magic Weapon",
  "Armatura Magica": "Mage Armor",
  "Artificio Druidico": "Druidcraft",
  "Aura Magica di Nystul": "Nystul's Magic Aura",
  "Aura Sacra": "Holy Aura",
  "Bagliore Lunare": "Moonbeam",
  "Bagliore Solare": "Sunbeam",
  "Banchetto Degli Eroi": "Heroes' Feast",
  "Beffa Crudele": "Vicious Mockery",
  "Benedizione": "Bless",
  "Blocca Mostri": "Hold Monster",
  "Blocca Persone": "Hold Person",
  "Camminare Nel Vento": "Wind Walk",
  "Camminare Sull'Acqua": "Water Walk",
  "Campo Anti-Magia": "Antimagic Field",
  "Camuffare Se Stesso": "Disguise Self",
  "Caratteristica Potenziata": "Enhance Ability",
  "Carne in Pietra": "Flesh to Stone",
  "Celare": "Sequester",
  "Charme su Persone": "Charm Person",
  "Colpo Accurato": "True Strike",
  "Colpo Infuocato": "Flame Strike",
  "Colpo Intrappolante": "Ensnaring Strike",
  "Comprensione dei Linguaggi": "Comprehend Languages",
  "Comunione": "Commune",
  "Comunione con la Natura": "Commune with Nature",
  "Conoscenza delle Leggende": "Legend Lore",
  "Contagio": "Contagion",
  "Contattare Altri Piani": "Contact Other Plane",
  "Controllare Acqua": "Control Water",
  "Controllare Fiamme": "Control Flames",
  "Controllare Tempo Atmosferico": "Control Weather",
  "Controllare Venti": "Control Winds",
  "Costrizione": "Geas",
  "Creare Cibo e Acqua": "Create Food and Water",
  "Creare Falò": "Create Bonfire",
  "Creare Non Morti": "Create Undead",
  "Creare Omuncolo": "Create Homunculus",
  "Crescita di Spine": "Spike Growth",
  "Cura Ferite": "Cure Wounds",
  "Cura Ferite di Massa": "Mass Cure Wounds",
  "Deflagrazione Occulta": "Eldritch Blast",
  "Diavoletto di Polvere": "Dust Devil",
  "Disintegrazione": "Disintegrate",
  "Dissolvi il Bene e il Male": "Dispel Evil and Good",
  "Dominare Persone": "Dominate Person",
  "Esilio": "Banishment",
  "Esplosione Solare": "Sunburst",
  "Estasiare": "Enthrall",
  "Evoca Animali": "Conjure Animals",
  "Evoca Creature Boschive": "Conjure Woodland Beings",
  "Evoca Pioggia di Armi": "Conjure Volley",
  "Evoca Raffica": "Conjure Barrage",
  "Faretra Rapida": "Swift Quiver",
  "Faro di Speranza": "Beacon of Hope",
  "Fatale": "Weird",
  "Ferire": "Harm",
  "Fermare il Tempo": "Time Stop",
  "Ferocia Primordiale": "Primal Savagery",
  "Fiamma Perenne": "Continual Flame",
  "Fiotto Acido": "Acid Splash",
  "Fondersi Nella Pietra": "Meld into Stone",
  "Forma Eterea": "Etherealness",
  "Fortezza della Mente": "Intellect Fortress",
  "Fulmine": "Lightning Bolt",
  "Globo di Invulnerabilità": "Globe of Invulnerability",
  "Guardiani Spirituali": "Spirit Guardians",
  "Guarigione": "Heal",
  "Guida": "Guidance",
  "Imprigionare": "Imprisonment",
  "Inaridire": "Blight",
  "Individuazione dei Pensieri": "Detect Thoughts",
  "Individuazione del Bene e del Male": "Detect Evil and Good",
  "Individuazione del Magico": "Detect Magic",
  "Individuazione delle Malattie e dei Veleni": "Detect Poison and Disease",
  "Interdizione Alla Morte": "Death Ward",
  "Interdizione Alle Lame": "Blade Ward",
  "Intermittenza": "Blink",
  "Intimorire Infernale": "Hellish Rebuke",
  "Intralciare": "Entangle",
  "Inversione della Gravità": "Reverse Gravity",
  "Inviare": "Sending",
  "Invocare il Fulmine": "Call Lightning",
  "Labirinto": "Maze",
  "Lama Infuocata": "Flame Blade",
  "Lama Verdefiamma": "Green-Flame Blade",
  "Legame Planare": "Planar Binding",
  "Lentezza": "Slow",
  "Lenza Elettrizzante": "Lightning Lure",
  "Levitazione": "Levitate",
  "Linguaggi": "Tongues",
  "Loquacità": "Glibness",
  "Mano Magica": "Mage Hand",
  "Manto del Crociato": "Crusader's Mantle",
  "Metamorfosi": "Polymorph",
  "Metamorfosi Pura": "True Polymorph",
  "Minuscole Meteore di Melf": "Melf's Minute Meteors",
  "Miscela Caustica di Tasha": "Tasha's Caustic Brew",
  "Modellare Acqua": "Shape Water",
  "Modellare Terra": "Mold Earth",
  "Modificare Memoria": "Modify Memory",
  "Morte Apparente": "Feign Death",
  "Movimenti del Ragno": "Spider Climb",
  "Muovere il Terreno": "Move Earth",
  "Muro di Forza": "Wall of Force",
  "Nube Maleodorante": "Stinking Cloud",
  "Nube Mortale": "Cloudkill",
  "Oscurità della Follia": "Maddening Darkness",
  "Parlare con gli Animali": "Speak with Animals",
  "Parlare con i Morti": "Speak with Dead",
  "Parlare con i Vegetali": "Speak with Plants",
  "Parola del Ritiro": "Word of Recall",
  "Parola Radiosa": "Word of Radiance",
  "Passapareti": "Passwall",
  "Passo del Tuono": "Thunder Step",
  "Passo Remoto": "Far Step",
  "Passo Velato": "Misty Step",
  "Passo Veloce": "Longstrider",
  "Pelle Coriacea": "Barkskin",
  "Percezione delle Bestie": "Beast Sense",
  "Porta Dimensionale": "Dimension Door",
  "Portale": "Gate",
  "Portale Arcano": "Arcane Gate",
  "Presagio": "Augury",
  "Previsione": "Foresight",
  "Proibizione": "Forbiddance",
  "Punizione Accecante": "Blinding Smite",
  "Punizione Collerica": "Wrathful Smite",
  "Punizione Demoralizzante": "Staggering Smite",
  "Punizione Esiliante": "Banishing Smite",
  "Punizione Incandescente": "Searing Smite",
  "Punizione Marchiante": "Branding Smite",
  "Punizione Tonante": "Thunderous Smite",
  "Raggio di Affaticamento": "Ray of Enfeeblement",
  "Raggio Rovente": "Scorching Ray",
  "Ragnatela": "Web",
  "Rampicante Afferrante": "Grasping Vine",
  "Randello Incantato": "Shillelagh",
  "Reggia Meravigliosa di Mordenkainen": "Mordenkainen's Magnificent Mansion",
  "Regressione Mentale": "Feeblemind",
  "Reincarnazione": "Reincarnate",
  "Resistenza": "Resistance",
  "Resurrezione Pura": "True Resurrection",
  "Rianimare Morti": "Raise Dead",
  "Rigenerazione": "Regenerate",
  "Rinascita": "Revivify",
  "Rintocco dei Morti": "Toll the Dead",
  "Riparare": "Mending",
  "Riposo Inviolato": "Gentle Repose",
  "Risata Incontenibile di Tasha": "Tasha's Hideous Laughter",
  "Riscaldare il Metallo": "Heat Metal",
  "Ristorare Inferiore": "Lesser Restoration",
  "Ristorare Superiore": "Greater Restoration",
  "Risveglio": "Awaken",
  "Salvare i Morenti": "Spare the Dying",
  "Santificare": "Hallow",
  "Santuario Privato di Mordenkainen": "Mordenkainen's Private Sanctum",
  "Scagliare Maledizione": "Bestow Curse",
  "Scassinare": "Knock",
  "Scheggia della Mente": "Mind Sliver",
  "Scolpire Pietra": "Stone Shape",
  "Scopri il Percorso": "Find the Path",
  "Scopri Trappole": "Find Traps",
  "Scritto Illusorio": "Illusory Script",
  "Scrutare": "Scrying",
  "Semipiano": "Demiplane",
  "Sfera Congelante di Otiluke": "Otiluke's Freezing Sphere",
  "Sfera Elastica di Otiluke": "Otiluke's Resilient Sphere",
  "Sfera Infuocata": "Flaming Sphere",
  "Sguardo Penetrante": "Eyebite",
  "Sogno del Velo Celeste": "Dream of the Blue Veil",
  "Spostamento Planare": "Plane Shift",
  "Spruzzo Colorato": "Color Spray",
  "Spruzzo Velenoso": "Poison Spray",
  "Stretta Folgorante": "Shocking Grasp",
  "Sudario Spirituale": "Spirit Shroud",
  "Teletrasporto": "Teleport",
  "Terreno Illusorio": "Hallucinatory Terrain",
  "Tocco del Vampiro": "Vampiric Touch",
  "Tocco Gelido": "Chill Touch",
  "Trama Ipnotica": "Hypnotic Pattern",
  "Trasformazione": "Shapechange",
  "Traslazione Arborea": "Tree Stride",
  "Trasporto Vegetale": "Transport via Plants",
  "Trova Cavalcatura": "Find Steed",
  "Turbine": "Whirlwind",
  "Turbine di Spade": "Sword Burst",
  "Unto": "Grease",
  "Velocità": "Haste",
  "Vigilanza e Interdizione": "Guards and Wards",
  "Vincolo di Interdizione": "Warding Bond",
  "Visione del Vero": "True Seeing",
  "Vuoto Mentale": "Mind Blank",
};

const rows = await db.select().from(compendioItaIncantesimi).where(isNull(compendioItaIncantesimi.nomeInglese));
let updated = 0;
let notInMap = [];
let notFoundInData = [];

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
  const prefOrder = SOURCE_PREFERENCE[row.fonte] ?? [];
  let chosen = null;
  for (const src of prefOrder) {
    chosen = candidates.find((c) => c.source === src);
    if (chosen) break;
  }
  if (!chosen) chosen = candidates[0];

  await db
    .update(compendioItaIncantesimi)
    .set({ nomeInglese: chosen.name, fonteInglese: chosen.source })
    .where(eq(compendioItaIncantesimi.id, row.id));
  updated++;
}

console.log(`Aggiornati: ${updated}/${rows.length}`);
console.log(`Non presenti nella mappa (${notInMap.length}):`, notInMap);
console.log(`Nome nella mappa ma non trovato nei dati 5etools (${notFoundInData.length}):`, notFoundInData);
