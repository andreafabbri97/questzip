// Tabelle di riferimento D&D 5e pure (nessuna logica) — separate da lib/dnd.ts solo per
// dimensione del file (lib/dnd.ts era sopra il limite di 800 righe che il progetto si è dato).
// Nessun import da "./dnd" qui: i tipi condivisi (es. Ability, EncounterDifficulty) sono
// riscritti come union di stringhe letterali invece di importati, per evitare un import
// circolare fra questo file e lib/dnd.ts (che importa queste tabelle).

/** Le 18 abilità/competenze standard 5e, con la caratteristica associata. */
export const SKILLS: {
  nome: string;
  abilita: "forza" | "destrezza" | "costituzione" | "intelligenza" | "saggezza" | "carisma";
}[] = [
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
 * Campagne, vedi components/campagne/combat-tracker.tsx): qui serve per le condizioni attive
 * sulla scheda Personaggio anche fuori da un combattimento (es. una maledizione fra una sessione
 * e l'altra). */
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

// Testo dell'effetto per ciascun livello di follia — tabella fornita direttamente dall'utente
// (regola homebrew della sua campagna, non presente nei manuali ufficiali).
export const LIVELLO_FOLLIA_EFFETTI: Record<number, string> = {
  1: "Svantaggio sulle prove di abilità mentale e sugli incantesimi.",
  2: "Paura di creature, luoghi e oggetti casuali decisi dal DM.",
  3: "Svantaggio su tiri per colpire, prove di abilità e tiri salvezza.",
  4: "Ogni ora: TS Saggezza CD 12 o pazzia a breve termine per 1d10 minuti.",
  5: "Paralizzato mentalmente. Se resti al livello 5 dopo 1d4 giorni, sali al 6.",
  6: "Pazzia permanente — il personaggio passa sotto il controllo del DM.",
};

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

/** Soglie XP per personaggio, per livello (1-20) e difficoltà. */
export const XP_THRESHOLDS: Record<"facile" | "medio" | "difficile" | "mortale", number[]> = {
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

/** Slot per livello incantesimo (1°-9°), indicizzata per livello personaggio 1-20. Tabella standard
 * dei "full caster" (Bardo/Chierico/Druido/Stregone/Mago), usata anche per il livello incantatore
 * effettivo in multiclasse. */
export const FULL_CASTER_SLOTS: number[][] = [
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

/** Patto Magico del Warlock (livello slot, numero slot), per livello di classe Warlock 1-20. */
export const PACT_MAGIC: { slotLevel: number; slots: number }[] = [
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
