import { RAW_BASE } from "@/lib/fivetools/books";
import type { FiveEntry } from "@/lib/fivetools/entries";

export type CompendiumKind =
  | "incantesimi"
  | "mostri"
  | "oggetti"
  | "razze"
  | "talenti"
  | "background"
  | "condizioni"
  | "classi";
export type EditionFilter = "2014" | "2024" | "entrambe";

// Tutti i libri con contenuto incantesimi (17 file, ~1.5 MB totali).
const SPELL_BOOKS = [
  "aag", "ai", "aitfr-avt", "bmt", "efa", "egw", "ftd", "frhof",
  "ggr", "idrotf", "llk", "phb", "sato", "scc", "tce", "xge", "xphb",
];

const CLASS_FILES = [
  "artificer", "barbarian", "bard", "cleric", "druid", "fighter", "monk",
  "mystic", "paladin", "ranger", "rogue", "sidekick", "sorcerer", "warlock", "wizard",
];

export interface RawSpell {
  name: string;
  source: string;
  level: number;
  school: string;
  time?: { number: number; unit: string }[];
  range?: { type: string; distance?: { type: string; amount?: number } };
  components?: { v?: boolean; s?: boolean; m?: boolean | string };
  duration?: {
    type: string;
    concentration?: boolean;
    duration?: { type: string; amount?: number };
  }[];
  entries: FiveEntry[];
  entriesHigherLevel?: FiveEntry[];
}

export interface RawCreature {
  name: string;
  source: string;
  size?: string[];
  type?: string | { type: string; tags?: string[] };
  alignment?: string[];
  ac?: ({ ac: number; from?: string[] } | number)[];
  hp?: { average?: number; formula?: string } | number;
  speed?: Record<string, number | boolean | { number: number }>;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  cr?: string | { cr: string };
  senses?: string[];
  passive?: number;
  languages?: string[];
  trait?: { name: string; entries: FiveEntry[] }[];
  action?: { name: string; entries: FiveEntry[] }[];
  bonus?: { name: string; entries: FiveEntry[] }[];
  reaction?: { name: string; entries: FiveEntry[] }[];
  legendary?: { name: string; entries: FiveEntry[] }[];
}

export interface RawItem {
  name: string;
  source: string;
  rarity?: string;
  type?: string;
  reqAttune?: boolean | string;
  entries?: FiveEntry[];
  wondrous?: boolean;
}

export interface RawRace {
  name: string;
  source: string;
  size?: string[];
  speed?: number | Record<string, number>;
  ability?: Record<string, number>[];
  darkvision?: number;
  entries: FiveEntry[];
}

export interface RawFeat {
  name: string;
  source: string;
  ability?: Record<string, number>[];
  prerequisite?: {
    ability?: Record<string, number>[];
    race?: { name: string }[];
    level?: number | { level: number };
  }[];
  entries: FiveEntry[];
}

export interface RawBackground {
  name: string;
  source: string;
  entries: FiveEntry[];
}

export interface RawCondition {
  name: string;
  source: string;
  entries: FiveEntry[];
}

export interface RawClass {
  name: string;
  source: string;
  hd?: { number: number; faces: number };
  proficiency?: string[];
  spellcastingAbility?: string;
  subclassTitle?: string;
  startingProficiencies?: {
    armor?: (string | { proficiency: string })[];
    weapons?: (string | { proficiency: string })[];
    skills?: unknown;
  };
}

export interface RawSubclass {
  name: string;
  shortName?: string;
  className: string;
  classSource: string;
  source: string;
}

export interface RawSubclassFeature {
  name: string;
  className: string;
  subclassShortName: string;
  level: number;
  entries: FiveEntry[];
}

interface SpellFile {
  spell: RawSpell[];
}
interface BestiaryFile {
  monster: RawCreature[];
}
interface ItemsFile {
  item: RawItem[];
}
interface RacesFile {
  race: RawRace[];
}
interface FeatsFile {
  feat: RawFeat[];
}
interface BackgroundsFile {
  background: RawBackground[];
}
interface ConditionsFile {
  condition: RawCondition[];
  disease: RawCondition[];
}
interface ClassFile {
  class: RawClass[];
  subclass?: RawSubclass[];
  subclassFeature?: RawSubclassFeature[];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

let spellsPromise: Promise<RawSpell[]> | null = null;
export function loadSpells(): Promise<RawSpell[]> {
  if (!spellsPromise) {
    spellsPromise = Promise.all(
      SPELL_BOOKS.map((book) => fetchJson<SpellFile>(`${RAW_BASE}/spells/spells-${book}.json`)),
    ).then((files) => files.flatMap((file) => file?.spell ?? []));
  }
  return spellsPromise;
}

let creaturesPromise: Promise<RawCreature[]> | null = null;
export function loadCreatures(): Promise<RawCreature[]> {
  if (!creaturesPromise) {
    creaturesPromise = fetchJson<Record<string, string>>(`${RAW_BASE}/bestiary/index.json`)
      .then((index) => {
        const files = index ? Array.from(new Set(Object.values(index))) : [];
        return Promise.all(
          files.map((file) => fetchJson<BestiaryFile>(`${RAW_BASE}/bestiary/${file}`)),
        );
      })
      .then((files) => files.flatMap((file) => file?.monster ?? []));
  }
  return creaturesPromise;
}

let itemsPromise: Promise<RawItem[]> | null = null;
export function loadItems(): Promise<RawItem[]> {
  if (!itemsPromise) {
    itemsPromise = fetchJson<ItemsFile>(`${RAW_BASE}/items.json`).then((file) =>
      (file?.item ?? []).filter((item) => item.rarity && item.rarity !== "none"),
    );
  }
  return itemsPromise;
}

let racesPromise: Promise<RawRace[]> | null = null;
export function loadRaces(): Promise<RawRace[]> {
  if (!racesPromise) {
    racesPromise = fetchJson<RacesFile>(`${RAW_BASE}/races.json`).then((file) => file?.race ?? []);
  }
  return racesPromise;
}

let featsPromise: Promise<RawFeat[]> | null = null;
export function loadFeats(): Promise<RawFeat[]> {
  if (!featsPromise) {
    featsPromise = fetchJson<FeatsFile>(`${RAW_BASE}/feats.json`).then((file) => file?.feat ?? []);
  }
  return featsPromise;
}

let backgroundsPromise: Promise<RawBackground[]> | null = null;
export function loadBackgrounds(): Promise<RawBackground[]> {
  if (!backgroundsPromise) {
    backgroundsPromise = fetchJson<BackgroundsFile>(`${RAW_BASE}/backgrounds.json`).then(
      (file) => file?.background ?? [],
    );
  }
  return backgroundsPromise;
}

let conditionsPromise: Promise<RawCondition[]> | null = null;
export function loadConditions(): Promise<RawCondition[]> {
  if (!conditionsPromise) {
    conditionsPromise = fetchJson<ConditionsFile>(`${RAW_BASE}/conditionsdiseases.json`).then(
      (file) => [...(file?.condition ?? []), ...(file?.disease ?? [])],
    );
  }
  return conditionsPromise;
}

interface ClassData {
  classes: RawClass[];
  subclasses: RawSubclass[];
  subclassFeatures: RawSubclassFeature[];
}

let classDataPromise: Promise<ClassData> | null = null;
export function loadClassData(): Promise<ClassData> {
  if (!classDataPromise) {
    classDataPromise = Promise.all(
      CLASS_FILES.map((book) => fetchJson<ClassFile>(`${RAW_BASE}/class/class-${book}.json`)),
    ).then((files) => ({
      classes: files.flatMap((file) => file?.class ?? []),
      subclasses: files.flatMap((file) => file?.subclass ?? []),
      subclassFeatures: files.flatMap((file) => file?.subclassFeature ?? []),
    }));
  }
  return classDataPromise;
}

/** Risolve le feature (testo "come funziona") di una sottoclasse, ordinate per livello. */
export function resolveSubclassFeatures(
  data: ClassData,
  subclass: RawSubclass,
): RawSubclassFeature[] {
  const shortName = subclass.shortName ?? subclass.name;
  return data.subclassFeatures
    .filter(
      (feature) =>
        feature.className === subclass.className && feature.subclassShortName === shortName,
    )
    .sort((a, b) => a.level - b.level);
}
