// Come link-spell-names.mjs/link-item-names.mjs ma per i mostri (compendio_ita_mostro). I nomi
// italiani qui sono estratti via OCR da un PDF di qualità bassa (vedi commento sullo schema) e
// molti sono danneggiati (es. "Cucc10LO" invece di "Cucciolo", frammenti di riga come "DI FUOCO"
// da soli) — le coppie sotto includono solo i nomi che si riescono a interpretare con ragionevole
// sicurezza; il resto resta volutamente senza abbinamento piuttosto che rischiare un match
// sbagliato. Verificate contro i dati reali di 5etools prima di scrivere.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { compendioItaMostri } from "../../lib/db/schema.ts";
import { eq, isNull } from "drizzle-orm";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);
const RAW_BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

async function fetchJson(url) {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

const index = await fetchJson(`${RAW_BASE}/bestiary/index.json`);
const files = index ? Array.from(new Set(Object.values(index))) : [];
const bestiaries = await Promise.all(files.map((f) => fetchJson(`${RAW_BASE}/bestiary/${f}`)));
const englishCreatures = bestiaries.flatMap((f) => f?.monster ?? []);

function normalizeName(name) {
  return name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
}

const byNormName = new Map();
for (const s of englishCreatures) {
  const key = normalizeName(s.name);
  if (!byNormName.has(key)) byNormName.set(key, []);
  byNormName.get(key).push(s);
}

const SOURCE_PREFERENCE = ["MM", "MPMM", "VGM", "XMM", "MTF", "VRGR", "FTD", "BGG", "SKT"];

const MAP = {
  "ADEPTO DI ARTI MARZIALI": "Martial Arts Adept",
  "ALCE GIGANTE": "Giant Elk",
  "ALLOSAURO": "Allosaurus",
  "AMEBA PAGLIERINA": "Ochre Jelly",
  "AQ,UILA GIGANTE": "Giant Eagle",
  "ARBUSTO MALIGNO": "Twig Blight",
  "ASSASSINO": "Assassin",
  "BANDITO": "Bandit",
  "BECCOAGUZZO": "Axe Beak",
  "BELVA DISTORCENTE": "Displacer Beast",
  "BERRETTO ROSSO": "Redcap",
  "BUGBEAR CAPOTRIBÙ": "Bugbear Chief",
  "CACCIATORE INVISIBILE": "Invisible Stalker",
  "CANE INTERMITTENTE": "Blink Dog",
  "CAPO DEI BANDITI": "Bandit Captain",
  "CAVALLO DA GALOPPO": "Riding Horse",
  "CAVALLO DA TIRO": "Draft Horse",
  "CAVALLO DEGLI INCUBI": "Nightmare",
  "COBOLDO STREGONE A SCAGLIE": "Kobold Scale Sorcerer",
  "CocconRILLo": "Crocodile",
  "Cucc10LO DI NEOGI": "Neogi Hatchling",
  "DRAGO BIANCO Cucc10Lo": "White Dragon Wyrmling",
  "DRAGO BLu Cucc10Lo": "Blue Dragon Wyrmling",
  "DRAGO D'ORO CUCCIOLO": "Gold Dragon Wyrmling",
  "DRAGO D'OTTONE ANTICO": "Ancient Brass Dragon",
  "DRAGO D%GENTO GIOVANE": "Young Silver Dragon",
  "DRAGO DGENTO ADULTO": "Adult Silver Dragon",
  "DRAGO DI AMETISTA CUCCIOLO": "Amethyst Dragon Wyrmling",
  "DRAGO FATATO": "Faerie Dragon",
  "DRAGO n'OTTONE Cucc10Lo": "Brass Dragon Wyrmling",
  "DRAGO n1 BRONZO Cucc10Lo": "Bronze Dragon Wyrmling",
  "DRAGO NERO Cucc10Lo": "Black Dragon Wyrmling",
  "DRAGO Rosso CUCCIOLO": "Red Dragon Wyrmling",
  "DRAGO VERDE Cucc10Lo": "Green Dragon Wyrmling",
  "DROW COMBATTENTE SCELTO": "Drow Elite Warrior",
  "DROW CONSORTE PREDILETTO": "Drow Favored Consort",
  "ELEMENTALE DELLA ThRRA": "Earth Elemental",
  "ESPLORATORE": "Scout",
  "ETTIN": "Ettin",
  "GITHYANKI COMBATTENTE": "Githyanki Warrior",
  "GITHZERAI ZERTH": "Githzerai Zerth",
  "GRICKALFA": "Grick Alpha",
  "GUASCONE": "Swashbuckler",
  "IPPOARACNE FEMMINA": "Ettercap",
  "KRUTHIK CAPOALVEARE": "Kruthik Hive Lord",
  "Kuo-ToA GRAN SACERDOTE": "Kuo-toa Archpriest",
  "MAGO": "Mage",
  "MAGO ILLUSIONISTA": "Illusionist",
  "MAGO TRASMUTATORE": "Transmuter",
  "MALVIVENTE": "Thug",
  "MARINIDE": "Merfolk",
  "MEDUSA": "Medusa",
  "MEGERA MARINA": "Sea Hag",
  "MEGERA NOTTURNA": "Night Hag",
  "MEGERA VERDE": "Green Hag",
  "MOLO OH": "Molydeus",
  "NAGAD'OssA": "Bone Naga",
  "NEOTELIDE": "Neothelid",
  "ORCO CAPOTRIBÙ GUERRIERO": "Orc War Chief",
  "ORRORE CORAZZATO": "Animated Armor",
  "PEGASO": "Pegasus",
  "PESCATORE DELLE CAVERNE": "Cave Fisher",
  "PLESIOSAURO": "Plesiosaurus",
  "PROGENIE STELLARE GRUE": "Star Spawn Grue",
  "PROGENIE VAMPIRICA": "Vampire Spawn",
  "RAMPICANTE MALIGNO": "Vine Blight",
  "RE/REGINA LUCERTOLA": "Lizard King/Queen",
  "SCHELETRO CAVALLO DA GUERRA": "Warhorse Skeleton",
  "SCIACALLO MANNARO": "Jackalwere",
  "SERPENTE STRITOLATORE": "Giant Constrictor Snake",
  "SERRAMORTE STRATEGA": "Deathlock Mastermind",
  "SIGNORE DELLE MUMMIE": "Mummy Lord",
  "SIGNORE NEOGI": "Neogi Master",
  "SLAADVERDE": "Green Slaad",
  "SPIRITELLO": "Sprite",
  "SQUALO TROPICALE": "Reef Shark",
  "TOPO MANNARO": "Wererat",
  "TORTUGA": "Tortle",
  "TORTUGA DRUIDO": "Tortle Druid",
  "TREANT": "Treant",
  "UCCELLO STIGEO": "Stirge",
  "URO": "Aurochs",
  "ÙRSONERO": "Black Bear",
  "VESPA GIGANTE": "Giant Wasp",
  "VIANDANTE FIRBOLG": "Firbolg",
  "YUAN-TI GUARDIA DELLA STIRPE": "Yuan-ti Bloodguard",
  "YUAN-TI NEFASTO": "Yuan-ti Malison",
};

const rows = await db.select().from(compendioItaMostri).where(isNull(compendioItaMostri.nomeInglese));
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
    .update(compendioItaMostri)
    .set({ nomeInglese: chosen.name, fonteInglese: chosen.source })
    .where(eq(compendioItaMostri.id, row.id));
  updated++;
}

console.log(`Aggiornati: ${updated}/${rows.length}`);
console.log(`Non presenti nella mappa (${notInMap.length}):`, notInMap);
console.log(`Nella mappa ma non trovati nei dati 5etools (${notFoundInData.length}):`, notFoundInData);
