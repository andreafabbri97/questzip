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

export const characterSchema = z.object({
  id: z.string(),
  nome: z.string().min(1),
  classe: z.string(),
  razza: z.string(),
  livello: z.number().int().min(1).max(20),
  hpMax: z.number().int().min(1),
  hpAttuali: z.number().int(),
  classeArmatura: z.number().int().min(1),
  velocita: z.number().int().min(0),
  caratteristiche: abilityScoresSchema,
  note: z.string(),
});

export type Character = z.infer<typeof characterSchema>;

export const sessionNoteSchema = z.object({
  id: z.string(),
  data: z.string(),
  titolo: z.string(),
  testo: z.string(),
});

export type SessionNote = z.infer<typeof sessionNoteSchema>;

export const campaignSchema = z.object({
  id: z.string(),
  nome: z.string().min(1),
  descrizione: z.string(),
  master: z.string(),
  giocatori: z.array(z.string()),
  sessioni: z.array(sessionNoteSchema),
});

export type Campaign = z.infer<typeof campaignSchema>;

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
    classe: "",
    razza: "",
    livello: 1,
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

export function newCampaign(): Campaign {
  return {
    id: crypto.randomUUID(),
    nome: "",
    descrizione: "",
    master: "",
    giocatori: [],
    sessioni: [],
  };
}
