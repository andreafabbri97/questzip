import { z } from "zod";

export const ABILITIES = [
  "forza",
  "destrezza",
  "costituzione",
  "intelligenza",
  "saggezza",
  "carisma",
] as const;

export type Ability = (typeof ABILITIES)[number];

export const ABILITY_LABELS: Record<Ability, string> = {
  forza: "Forza",
  destrezza: "Destrezza",
  costituzione: "Costituzione",
  intelligenza: "Intelligenza",
  saggezza: "Saggezza",
  carisma: "Carisma",
};

/** Mappa i codici a 3 lettere di 5etools (str/dex/con/int/wis/cha) alle nostre chiavi in italiano. */
export const ABILITY_CODE_TO_KEY: Record<string, Ability> = {
  str: "forza",
  dex: "destrezza",
  con: "costituzione",
  int: "intelligenza",
  wis: "saggezza",
  cha: "carisma",
};

export const SKILLS: { nome: string; abilita: Ability }[] = [
  { nome: "Acrobazia", abilita: "destrezza" },
  { nome: "Addestrare Animali", abilita: "saggezza" },
  { nome: "Arcano", abilita: "intelligenza" },
  { nome: "Atletica", abilita: "forza" },
  { nome: "Furtività", abilita: "destrezza" },
  { nome: "Indagare", abilita: "intelligenza" },
  { nome: "Inganno", abilita: "carisma" },
  { nome: "Intimidire", abilita: "carisma" },
  { nome: "Intrattenere", abilita: "carisma" },
  { nome: "Intuizione", abilita: "saggezza" },
  { nome: "Medicina", abilita: "saggezza" },
  { nome: "Natura", abilita: "intelligenza" },
  { nome: "Percezione", abilita: "saggezza" },
  { nome: "Persuasione", abilita: "carisma" },
  { nome: "Rapidità di Mano", abilita: "destrezza" },
  { nome: "Religione", abilita: "intelligenza" },
  { nome: "Sopravvivenza", abilita: "saggezza" },
  { nome: "Storia", abilita: "intelligenza" },
];

export const abilityScoresSchema = z.object({
  forza: z.number().int().min(1).max(30),
  destrezza: z.number().int().min(1).max(30),
  costituzione: z.number().int().min(1).max(30),
  intelligenza: z.number().int().min(1).max(30),
  saggezza: z.number().int().min(1).max(30),
  carisma: z.number().int().min(1).max(30),
});

export const classEntrySchema = z.object({
  nome: z.string(),
  livello: z.number().int().min(1).max(20),
  sottoclasse: z.string().optional(),
});

export type ClassEntry = z.infer<typeof classEntrySchema>;

export const inventoryItemSchema = z.object({
  id: z.string(),
  nome: z.string(),
  quantita: z.number().int().min(1).default(1),
  note: z.string().default(""),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const knownSpellSchema = z.object({
  id: z.string(),
  nome: z.string(),
  livello: z.number().int().min(0).max(9).default(0),
  preparato: z.boolean().default(false),
});
export type KnownSpell = z.infer<typeof knownSpellSchema>;

export const weaponSchema = z.object({
  id: z.string(),
  nome: z.string(),
  caratteristica: z.enum(["forza", "destrezza", "finezza"]).default("forza"),
  competente: z.boolean().default(true),
  bonusExtra: z.number().int().default(0),
  dadoDanno: z.string().default("1d6"),
  tipoDanno: z.string().default(""),
  aDistanza: z.boolean().default(false),
});
export type Weapon = z.infer<typeof weaponSchema>;

export const knownFeatSchema = z.object({
  id: z.string(),
  nome: z.string(),
});
export type KnownFeat = z.infer<typeof knownFeatSchema>;

/** Le 16 lingue standard del PHB (8 comuni + 8 esoteriche): elenco piccolo e fisso, usato solo
 * per suggerire scelte comuni — restano comunque testo libero per lingue homebrew/regionali. */
export const LANGUAGES = [
  "Comune",
  "Nanico",
  "Elfico",
  "Gigante",
  "Gnomesco",
  "Goblin",
  "Halfling",
  "Orchesco",
  "Abissale",
  "Celestiale",
  "Draconico",
  "Linguaggio Profondo",
  "Infernale",
  "Primordiale",
  "Silvano",
  "Sottocomune",
] as const;

/** I 13 tipi di danno standard 5e, per resistenze/immunità/vulnerabilità. */
export const DAMAGE_TYPES = [
  "Acido",
  "Contundente",
  "Freddo",
  "Fuoco",
  "Forza",
  "Fulmine",
  "Necrotico",
  "Perforante",
  "Veleno",
  "Psichico",
  "Radiante",
  "Tagliente",
  "Tuono",
] as const;

/** Le 14 condizioni standard 5e (stesso elenco usato per il tracker di combattimento in
 * Campagne, vedi app/campagne/page.tsx): qui serve per le condizioni attive sulla scheda
 * Personaggio anche fuori da un combattimento (es. una maledizione fra una sessione e l'altra). */
export const CONDIZIONI_5E = [
  "Affascinato",
  "Afferrato",
  "Accecato",
  "Assordato",
  "Avvelenato",
  "Incapacitato",
  "Indebolito",
  "Invisibile",
  "Paralizzato",
  "Pietrificato",
  "Prono",
  "Spaventato",
  "Stordito",
  "Trattenuto",
] as const;

export const characterSchema = z.object({
  id: z.string(),
  nome: z.string().min(1),
  classi: z.array(classEntrySchema).min(1),
  razza: z.string(),
  hpMax: z.number().int().min(1),
  hpAttuali: z.number().int(),
  hpTemporanei: z.number().int().min(0).default(0),
  classeArmatura: z.number().int().min(1),
  velocita: z.number().int().min(0),
  caratteristiche: abilityScoresSchema,
  trsCompetenti: z.array(z.enum(ABILITIES)).default([]),
  abilitaCompetenti: z.array(z.string()).default([]),
  abilitaEsperte: z.array(z.string()).default([]),
  slotUsati: z.array(z.number().int().min(0)).length(9).default([0, 0, 0, 0, 0, 0, 0, 0, 0]),
  slotPattoUsati: z.number().int().min(0).default(0),
  tiriMorteSuccessi: z.number().int().min(0).max(3).default(0),
  tiriMorteFallimenti: z.number().int().min(0).max(3).default(0),
  esperienza: z.number().int().min(0).default(0),
  allineamento: z.string().default(""),
  background: z.string().default(""),
  tratti: z.string().default(""),
  legami: z.string().default(""),
  ideali: z.string().default(""),
  difetti: z.string().default(""),
  linguaggi: z.array(z.string()).default([]),
  resistenze: z.array(z.string()).default([]),
  immunita: z.array(z.string()).default([]),
  vulnerabilita: z.array(z.string()).default([]),
  condizioniAttive: z.array(z.string()).default([]),
  inventario: z.array(inventoryItemSchema).default([]),
  monete: z
    .object({
      oro: z.number().int().min(0).default(0),
      argento: z.number().int().min(0).default(0),
      rame: z.number().int().min(0).default(0),
    })
    .default({ oro: 0, argento: 0, rame: 0 }),
  incantesimi: z.array(knownSpellSchema).default([]),
  armi: z.array(weaponSchema).default([]),
  talenti: z.array(knownFeatSchema).default([]),
  note: z.string().default(""),
});

export type Character = z.infer<typeof characterSchema>;

export function totalLevel(classi: ClassEntry[]): number {
  return classi.reduce((sum, entry) => sum + entry.livello, 0);
}

/** Punti esperienza richiesti per raggiungere ciascun livello (1-20), regole standard 5e. */
export const XP_PER_LEVEL = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000,
  165000, 195000, 225000, 265000, 305000, 355000,
];

/** Livello corrispondente a un totale di XP (1-20). */
export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < XP_PER_LEVEL.length; i++) {
    if (xp >= XP_PER_LEVEL[i]) level = i + 1;
  }
  return level;
}

/** XP richiesti per il prossimo livello, o null se già al livello 20 (massimo). */
export function xpForNextLevel(level: number): number | null {
  return level >= 20 ? null : XP_PER_LEVEL[level];
}

export const ALIGNMENTS = [
  "Legale Buono",
  "Neutrale Buono",
  "Caotico Buono",
  "Legale Neutrale",
  "Neutrale",
  "Caotico Neutrale",
  "Legale Malvagio",
  "Neutrale Malvagio",
  "Caotico Malvagio",
] as const;

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function proficiencyBonus(level: number): number {
  return 2 + Math.floor((level - 1) / 4);
}

export function newCharacter(): Character {
  return {
    id: crypto.randomUUID(),
    nome: "",
    classi: [{ nome: "", livello: 1 }],
    razza: "",
    hpMax: 10,
    hpAttuali: 10,
    hpTemporanei: 0,
    classeArmatura: 10,
    velocita: 9,
    caratteristiche: {
      forza: 10,
      destrezza: 10,
      costituzione: 10,
      intelligenza: 10,
      saggezza: 10,
      carisma: 10,
    },
    trsCompetenti: [],
    abilitaCompetenti: [],
    abilitaEsperte: [],
    slotUsati: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    slotPattoUsati: 0,
    tiriMorteSuccessi: 0,
    tiriMorteFallimenti: 0,
    esperienza: 0,
    allineamento: "",
    background: "",
    tratti: "",
    legami: "",
    ideali: "",
    difetti: "",
    linguaggi: [],
    resistenze: [],
    immunita: [],
    vulnerabilita: [],
    condizioniAttive: [],
    inventario: [],
    monete: { oro: 0, argento: 0, rame: 0 },
    incantesimi: [],
    armi: [],
    talenti: [],
    note: "",
  };
}

/** Bonus di un tiro salvezza: mod. caratteristica + bonus competenza se competente. */
export function savingThrowModifier(score: number, proficient: boolean, level: number): number {
  return abilityModifier(score) + (proficient ? proficiencyBonus(level) : 0);
}

/** Bonus di un'abilità: mod. caratteristica, +bonus competenza se competente, doppio se esperto. */
export function skillModifier(
  score: number,
  proficient: boolean,
  expert: boolean,
  level: number,
): number {
  const bonus = proficiencyBonus(level);
  return abilityModifier(score) + (expert ? bonus * 2 : proficient ? bonus : 0);
}

/** Percezione Passiva: 10 + il bonus della prova di Percezione (competenza/esperto inclusi). */
export function passivePerception(
  wisdomScore: number,
  proficient: boolean,
  expert: boolean,
  level: number,
): number {
  return 10 + skillModifier(wisdomScore, proficient, expert, level);
}

/** Nomi italiani ufficiali delle classi base (PHB + Artefice di Tasha's), per riconoscere un nome
 * scritto a mano (es. "Mago") e ricondurlo al nome inglese usato dai dati del Compendio (es.
 * "Wizard"). Elenco piccolo e fisso: non serve un servizio di traduzione per 13 nomi noti. */
const CLASS_NAME_IT_TO_EN: Record<string, string> = {
  barbaro: "Barbarian",
  bardo: "Bard",
  chierico: "Cleric",
  druido: "Druid",
  guerriero: "Fighter",
  ladro: "Rogue",
  mago: "Wizard",
  monaco: "Monk",
  paladino: "Paladin",
  ranger: "Ranger",
  stregone: "Sorcerer",
  warlock: "Warlock",
  artefice: "Artificer",
};

/** Riconduce un nome di classe scritto in italiano (es. "Mago") al nome inglese canonico usato dal
 * Compendio (es. "Wizard"); se il nome è già inglese o non riconosciuto, lo restituisce solo
 * ripulito (trim), senza alterarlo altrimenti. */
export function canonicalClassName(nome: string): string {
  const trimmed = nome.trim();
  return CLASS_NAME_IT_TO_EN[trimmed.toLowerCase()] ?? trimmed;
}

/** Caratteristica da incantatore per classe (chiave inglese minuscola, stessa convenzione di
 * FULL_CASTERS/HALF_CASTERS). Usata per calcolare CD e bonus d'attacco degli incantesimi. */
const CASTING_ABILITY: Record<string, Ability> = {
  bard: "carisma",
  cleric: "saggezza",
  druid: "saggezza",
  sorcerer: "carisma",
  warlock: "carisma",
  wizard: "intelligenza",
  paladin: "carisma",
  ranger: "saggezza",
  artificer: "intelligenza",
};

/** Trova la classe incantatrice "primaria" (di livello più alto) fra quelle del personaggio, per
 * calcolare CD/bonus d'attacco degli incantesimi. Semplificazione: in un vero multiclasse ogni
 * incantesimo usa la caratteristica della classe da cui proviene, ma per un riepilogo unico sulla
 * scheda si prende la classe incantatrice con più livelli. */
export function primaryCastingAbility(
  classi: { nome: string; livello: number }[],
): Ability | null {
  let best: { livello: number; ability: Ability } | null = null;
  for (const { nome, livello } of classi) {
    const ability = CASTING_ABILITY[canonicalClassName(nome).toLowerCase()];
    if (!ability) continue;
    if (!best || livello > best.livello) best = { livello, ability };
  }
  return best?.ability ?? null;
}

export function spellSaveDC(level: number, abilityScore: number): number {
  return 8 + proficiencyBonus(level) + abilityModifier(abilityScore);
}

export function spellAttackBonus(level: number, abilityScore: number): number {
  return proficiencyBonus(level) + abilityModifier(abilityScore);
}

/** Bonus al tiro per colpire di un'arma: modificatore di caratteristica (Finezza usa il
 * migliore tra Forza e Destrezza) + bonus di competenza se competente + eventuale bonus fisso
 * (arma magica, ecc.). Lo stesso modificatore di caratteristica si aggiunge anche ai danni. */
export function weaponAbilityModifier(
  caratteristica: "forza" | "destrezza" | "finezza",
  forzaScore: number,
  destrezzaScore: number,
): number {
  const str = abilityModifier(forzaScore);
  const dex = abilityModifier(destrezzaScore);
  if (caratteristica === "forza") return str;
  if (caratteristica === "destrezza") return dex;
  return Math.max(str, dex);
}

export function weaponAttackBonus(
  caratteristica: "forza" | "destrezza" | "finezza",
  forzaScore: number,
  destrezzaScore: number,
  competente: boolean,
  level: number,
  bonusExtra: number,
): number {
  return (
    weaponAbilityModifier(caratteristica, forzaScore, destrezzaScore) +
    (competente ? proficiencyBonus(level) : 0) +
    bonusExtra
  );
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export function pointBuyCost(scores: Record<Ability, number>): number {
  return ABILITIES.reduce((total, ability) => total + (POINT_BUY_COST[scores[ability]] ?? 0), 0);
}

function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/** Tira 4d6 e scarta il dado più basso, il metodo classico per generare una caratteristica. */
export function roll4d6DropLowest(): number {
  const rolls = [rollD6(), rollD6(), rollD6(), rollD6()].sort((a, b) => a - b);
  return rolls[1] + rolls[2] + rolls[3];
}

/** PF totali per livello: dado vita massimo al 1° livello, poi media (arrotondata per eccesso) + mod. COS a ogni livello. */
export function calculateHitPoints(hitDieFaces: number, level: number, conModifier: number): number {
  const firstLevel = hitDieFaces + conModifier;
  const average = Math.floor(hitDieFaces / 2) + 1;
  const restLevels = Math.max(0, level - 1) * (average + conModifier);
  return Math.max(1, firstLevel + restLevels);
}

/**
 * PF multiclasse: solo il livello 1 della PRIMA classe scelta (la classe di origine, il primo
 * elemento dell'array) è massimizzato; ogni altro livello — sia della classe di origine sia
 * delle classi aggiunte dopo — usa la media del dado vita.
 */
export function calculateMulticlassHitPoints(
  classes: { hitDieFaces: number; livello: number }[],
  conModifier: number,
): number {
  let total = 0;
  classes.forEach(({ hitDieFaces, livello }, index) => {
    const average = Math.floor(hitDieFaces / 2) + 1;
    if (index === 0) {
      total += hitDieFaces + conModifier;
      total += Math.max(0, livello - 1) * (average + conModifier);
    } else {
      total += livello * (average + conModifier);
    }
  });
  return Math.max(1, total);
}

// --- Costruzione incontri (regole standard 2014 DMG) ---

export type EncounterDifficulty = "facile" | "medio" | "difficile" | "mortale";

export const DIFFICULTY_LABELS: Record<EncounterDifficulty, string> = {
  facile: "Facile",
  medio: "Medio",
  difficile: "Difficile",
  mortale: "Mortale",
};

/** Soglie XP per personaggio, per livello (1-20) e difficoltà. */
const XP_THRESHOLDS: Record<EncounterDifficulty, number[]> = {
  facile: [25, 50, 75, 125, 250, 300, 350, 450, 550, 600, 800, 1000, 1100, 1250, 1400, 1600, 2000, 2100, 2400, 2800],
  medio: [50, 100, 150, 250, 500, 600, 750, 900, 1100, 1200, 1600, 2000, 2200, 2500, 2800, 3200, 3900, 4200, 4900, 5700],
  difficile: [75, 150, 225, 375, 750, 900, 1100, 1400, 1600, 1900, 2400, 3000, 3400, 3800, 4300, 4800, 5900, 6300, 7300, 8500],
  mortale: [100, 200, 400, 500, 1100, 1400, 1700, 2100, 2400, 2800, 3600, 4500, 5100, 5700, 6400, 7200, 8800, 9500, 10900, 12700],
};

/** XP per grado sfida (CR), regole standard. */
export const XP_BY_CR: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
  "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
  "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
  "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000,
  "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
};

/** Moltiplicatore incontro in base al numero di mostri (regole standard). */
export function encounterMultiplier(monsterCount: number): number {
  if (monsterCount <= 1) return 1;
  if (monsterCount === 2) return 1.5;
  if (monsterCount <= 6) return 2;
  if (monsterCount <= 10) return 2.5;
  if (monsterCount <= 14) return 3;
  return 4;
}

/** Budget XP totale del party per una data difficoltà (somma delle soglie individuali). */
export function xpBudget(partyLevels: number[], difficulty: EncounterDifficulty): number {
  return partyLevels.reduce((sum, level) => {
    const index = Math.min(20, Math.max(1, level)) - 1;
    return sum + XP_THRESHOLDS[difficulty][index];
  }, 0);
}

/** XP "aggiustato" (con moltiplicatore) di un gruppo di mostri dello stesso CR. */
export function adjustedEncounterXp(crXp: number, monsterCount: number): number {
  return crXp * monsterCount * encounterMultiplier(monsterCount);
}

// --- Slot incantesimi (regole standard PHB) ---

/** Slot per livello incantesimo (1°-9°), indicizzata per livello personaggio 1-20. Tabella standard
 * dei "full caster" (Bardo/Chierico/Druido/Stregone/Mago), usata anche per il livello incantatore
 * effettivo in multiclasse. */
const FULL_CASTER_SLOTS: number[][] = [
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const FULL_CASTERS = new Set(["bard", "cleric", "druid", "sorcerer", "wizard"]);
const HALF_CASTERS = new Set(["paladin", "ranger"]);

/** Livello incantatore effettivo in multiclasse: full=intero, mezzo=metà arrotondato per
 * difetto, artefice=metà arrotondato per eccesso. Lo Stregone (Warlock) NON entra qui: usa
 * il Patto Magico, un pool di slot separato. */
export function multiclassCasterLevel(classi: { nome: string; livello: number }[]): number {
  let total = 0;
  for (const { nome, livello } of classi) {
    const key = canonicalClassName(nome).toLowerCase();
    if (FULL_CASTERS.has(key)) total += livello;
    else if (HALF_CASTERS.has(key)) total += Math.floor(livello / 2);
    else if (key === "artificer") total += Math.ceil(livello / 2);
  }
  return total;
}

export function spellSlotsForCasterLevel(casterLevel: number): number[] {
  if (casterLevel <= 0) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  return FULL_CASTER_SLOTS[Math.min(20, casterLevel) - 1];
}

/** Patto Magico del Warlock (livello slot, numero slot), per livello di classe Warlock 1-20. */
const PACT_MAGIC: { slotLevel: number; slots: number }[] = [
  { slotLevel: 1, slots: 1 }, { slotLevel: 1, slots: 2 },
  { slotLevel: 2, slots: 2 }, { slotLevel: 2, slots: 2 },
  { slotLevel: 3, slots: 2 }, { slotLevel: 3, slots: 2 },
  { slotLevel: 4, slots: 2 }, { slotLevel: 4, slots: 2 },
  { slotLevel: 5, slots: 2 }, { slotLevel: 5, slots: 2 },
  { slotLevel: 5, slots: 3 }, { slotLevel: 5, slots: 3 },
  { slotLevel: 5, slots: 3 }, { slotLevel: 5, slots: 3 },
  { slotLevel: 5, slots: 3 }, { slotLevel: 5, slots: 3 },
  { slotLevel: 5, slots: 4 }, { slotLevel: 5, slots: 4 },
  { slotLevel: 5, slots: 4 }, { slotLevel: 5, slots: 4 },
];

export function warlockLevel(classi: { nome: string; livello: number }[]): number {
  return classi
    .filter((c) => canonicalClassName(c.nome).toLowerCase() === "warlock")
    .reduce((sum, c) => sum + c.livello, 0);
}

export function pactMagicForLevel(level: number): { slotLevel: number; slots: number } {
  if (level <= 0) return { slotLevel: 0, slots: 0 };
  return PACT_MAGIC[Math.min(20, level) - 1];
}

// --- Generatore di ricompense (tabelle standard 2014 DMG) ---

export type TreasureTier = "0-4" | "5-10" | "11-16" | "17+";

export function treasureTierForCr(cr: number): TreasureTier {
  if (cr <= 4) return "0-4";
  if (cr <= 10) return "5-10";
  if (cr <= 16) return "11-16";
  return "17+";
}

function rollDice(count: number, faces: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += Math.floor(Math.random() * faces) + 1;
  return total;
}

export interface CoinResult {
  mr: number; // monete di rame
  ma: number; // monete d'argento
  me: number; // monete elettro
  mo: number; // monete d'oro
  mp: number; // monete di platino
}

/** Monete per un singolo mostro/individuo, tabella "Treasure: Challenge X" del DMG. */
export function rollIndividualCoins(tier: TreasureTier): CoinResult {
  const roll = Math.floor(Math.random() * 100) + 1;
  const empty: CoinResult = { mr: 0, ma: 0, me: 0, mo: 0, mp: 0 };
  if (tier === "0-4") {
    if (roll <= 30) return { ...empty, mr: rollDice(5, 6) };
    if (roll <= 60) return { ...empty, ma: rollDice(4, 6) };
    if (roll <= 70) return { ...empty, me: rollDice(3, 6) };
    if (roll <= 95) return { ...empty, mo: rollDice(3, 6) };
    return { ...empty, mp: rollDice(1, 6) };
  }
  if (tier === "5-10") {
    if (roll <= 30) return { ...empty, mr: rollDice(4, 6) * 10, ma: rollDice(1, 6) * 10 };
    if (roll <= 60) return { ...empty, ma: rollDice(1, 6) * 10, mo: rollDice(1, 6) * 10 };
    if (roll <= 70) return { ...empty, me: rollDice(1, 6) * 10, mo: rollDice(1, 6) * 10 };
    if (roll <= 95) return { ...empty, mo: rollDice(2, 6) * 10 };
    return { ...empty, mo: rollDice(2, 6) * 10, mp: rollDice(1, 6) * 10 };
  }
  if (tier === "11-16") {
    if (roll <= 20) return { ...empty, ma: rollDice(2, 6) * 100, mo: rollDice(1, 6) * 100 };
    if (roll <= 35) return { ...empty, me: rollDice(1, 6) * 100, mo: rollDice(1, 6) * 100 };
    if (roll <= 75) return { ...empty, mo: rollDice(2, 6) * 100 };
    return { ...empty, mo: rollDice(2, 6) * 100, mp: rollDice(1, 6) * 100 };
  }
  if (roll <= 15) return { ...empty, me: rollDice(2, 6) * 1000, mo: rollDice(8, 6) * 100 };
  if (roll <= 55) return { ...empty, mo: rollDice(1, 6) * 1000, mp: rollDice(1, 6) * 100 };
  return { ...empty, mo: rollDice(1, 6) * 1000, mp: rollDice(2, 6) * 100 };
}

/** Monete per un tesoro d'incontro (party intero), tabella "Treasure Hoard: Challenge X". */
export function rollHoardCoins(tier: TreasureTier): CoinResult {
  const roll = Math.floor(Math.random() * 100) + 1;
  const empty: CoinResult = { mr: 0, ma: 0, me: 0, mo: 0, mp: 0 };
  if (tier === "0-4") {
    if (roll <= 6) return { ...empty, mr: rollDice(6, 6) * 100 };
    if (roll <= 16) return { ...empty, mr: rollDice(3, 6) * 100, ma: rollDice(2, 6) * 100 };
    if (roll <= 29) return { ...empty, ma: rollDice(2, 6) * 100, mo: rollDice(2, 6) * 10 };
    if (roll <= 52) return { ...empty, ma: rollDice(3, 6) * 100, mo: rollDice(2, 6) * 100 };
    if (roll <= 74) return { ...empty, mo: rollDice(2, 6) * 100 };
    if (roll <= 95) return { ...empty, mo: rollDice(2, 6) * 100, mp: rollDice(1, 6) * 10 };
    return { ...empty, mo: rollDice(2, 6) * 100, mp: rollDice(2, 6) * 10 };
  }
  if (tier === "5-10") {
    if (roll <= 6) return { ...empty, mr: rollDice(2, 6) * 100, mo: rollDice(2, 6) * 100 };
    if (roll <= 16) return { ...empty, ma: rollDice(2, 6) * 100, mo: rollDice(2, 6) * 100 };
    if (roll <= 29) return { ...empty, ma: rollDice(5, 6) * 100, mo: rollDice(3, 6) * 100 };
    if (roll <= 52) return { ...empty, mo: rollDice(4, 6) * 100, mp: rollDice(1, 6) * 10 };
    if (roll <= 74) return { ...empty, mo: rollDice(4, 6) * 100, mp: rollDice(2, 6) * 10 };
    if (roll <= 95) return { ...empty, mo: rollDice(4, 6) * 100, mp: rollDice(3, 6) * 10 };
    return { ...empty, mo: rollDice(4, 6) * 100, mp: rollDice(4, 6) * 10 };
  }
  if (tier === "11-16") {
    if (roll <= 5) return { ...empty, ma: rollDice(4, 6) * 1000 };
    if (roll <= 14) return { ...empty, ma: rollDice(1, 6) * 1000, mo: rollDice(1, 6) * 1000 };
    if (roll <= 27) return { ...empty, mo: rollDice(2, 6) * 1000 };
    if (roll <= 53) return { ...empty, mo: rollDice(2, 6) * 1000, mp: rollDice(1, 6) * 100 };
    if (roll <= 78) return { ...empty, mo: rollDice(4, 6) * 1000, mp: rollDice(1, 6) * 100 };
    return { ...empty, mo: rollDice(4, 6) * 1000, mp: rollDice(2, 6) * 100 };
  }
  if (roll <= 7) return { ...empty, mo: rollDice(2, 6) * 1000, mp: rollDice(1, 6) * 1000 };
  if (roll <= 29) return { ...empty, mo: rollDice(8, 6) * 1000, mp: rollDice(1, 6) * 1000 };
  if (roll <= 68) return { ...empty, mo: rollDice(6, 6) * 1000, mp: rollDice(2, 6) * 1000 };
  return { ...empty, mo: rollDice(6, 6) * 1000, mp: rollDice(3, 6) * 1000 };
}

/** Valori tipici (in mo) di gemme/oggetti d'arte per fascia di GS, tabella DMG semplificata:
 * niente nomi di fantasia inventati, solo il valore — restano da descrivere a voce dal master. */
const GEM_ART_VALUES: Record<TreasureTier, number[]> = {
  "0-4": [10, 25, 50],
  "5-10": [50, 100, 250],
  "11-16": [250, 750, 2500],
  "17+": [2500, 7500, 25000],
};

export interface GemArtResult {
  count: number;
  value: number;
}

/** Numero e valore di gemme/oggetti d'arte in un tesoro d'incontro (semplificato dalla tabella
 * DMG: stessa fascia di valore usata dal libro per il GS, senza i nomi di fantasia specifici). */
export function rollGemsAndArt(tier: TreasureTier): GemArtResult | null {
  if (Math.random() > 0.5) return null;
  const values = GEM_ART_VALUES[tier];
  const value = values[Math.floor(Math.random() * values.length)];
  const count = rollDice(2, 4);
  return { count, value };
}

/** Rarità plausibili per gli oggetti magici di un tesoro, per fascia di GS (stessa proporzione
 * approssimativa delle tabelle DMG A-I: ai GS bassi prevalgono oggetti comuni/non comuni, ai GS
 * alti oggetti rari/molto rari/leggendari). Usata per pescare un oggetto vero dal Compendio
 * invece di inventare nomi — niente tabelle A-I riprodotte parola per parola. */
const MAGIC_ITEM_RARITY_WEIGHTS: Record<TreasureTier, [string, number][]> = {
  "0-4": [["common", 5], ["uncommon", 3], ["rare", 1]],
  "5-10": [["uncommon", 4], ["rare", 3], ["very rare", 1]],
  "11-16": [["rare", 4], ["very rare", 3], ["legendary", 1]],
  "17+": [["very rare", 3], ["legendary", 4], ["artifact", 1]],
};

export function pickTreasureRarity(tier: TreasureTier): string {
  const weights = MAGIC_ITEM_RARITY_WEIGHTS[tier];
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [rarity, w] of weights) {
    if (roll < w) return rarity;
    roll -= w;
  }
  return weights[0][0];
}

/** Probabilità (0-1) che un tesoro d'incontro contenga oggetti magici, e quanti, per fascia di
 * GS — approssima la frequenza delle tabelle DMG senza riprodurle nel dettaglio. */
const MAGIC_ITEM_CHANCE: Record<TreasureTier, { chance: number; count: [number, number] }> = {
  "0-4": { chance: 0.3, count: [1, 1] },
  "5-10": { chance: 0.5, count: [1, 2] },
  "11-16": { chance: 0.7, count: [1, 3] },
  "17+": { chance: 0.9, count: [2, 4] },
};

export function rollMagicItemCount(tier: TreasureTier): number {
  const { chance, count } = MAGIC_ITEM_CHANCE[tier];
  if (Math.random() > chance) return 0;
  const [min, max] = count;
  return min + Math.floor(Math.random() * (max - min + 1));
}

