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

