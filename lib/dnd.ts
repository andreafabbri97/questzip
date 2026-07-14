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

export const characterSchema = z.object({
  id: z.string(),
  nome: z.string().min(1),
  classi: z.array(classEntrySchema).min(1),
  razza: z.string(),
  hpMax: z.number().int().min(1),
  hpAttuali: z.number().int(),
  classeArmatura: z.number().int().min(1),
  velocita: z.number().int().min(0),
  caratteristiche: abilityScoresSchema,
  note: z.string(),
});

export type Character = z.infer<typeof characterSchema>;

export function totalLevel(classi: ClassEntry[]): number {
  return classi.reduce((sum, entry) => sum + entry.livello, 0);
}

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
    note: "",
  };
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

