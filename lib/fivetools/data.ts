import { RAW_BASE } from "@/lib/fivetools/books";
import type { FiveEntry } from "@/lib/fivetools/entries";

export type CompendiumKind = "incantesimi" | "mostri" | "oggetti";
export type EditionFilter = "2014" | "2024" | "entrambe";

// Libri con contenuto incantesimi/mostri: un sottoinsieme curato (per i mostri, altrimenti
// il download supererebbe i 10 MB) che copre le regole base di entrambe le edizioni più i
// manuali principali che il gruppo usa al tavolo.
const SPELL_BOOKS = [
  "aag", "ai", "aitfr-avt", "bmt", "efa", "egw", "ftd", "frhof",
  "ggr", "idrotf", "llk", "phb", "sato", "scc", "tce", "xge", "xphb",
];
const BESTIARY_BOOKS = ["mm", "xmm", "mpmm"];

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

interface SpellFile {
  spell: RawSpell[];
}
interface BestiaryFile {
  monster: RawCreature[];
}
interface ItemsFile {
  item: RawItem[];
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
      SPELL_BOOKS.map((book) =>
        fetchJson<SpellFile>(`${RAW_BASE}/spells/spells-${book}.json`),
      ),
    ).then((files) => files.flatMap((file) => file?.spell ?? []));
  }
  return spellsPromise;
}

let creaturesPromise: Promise<RawCreature[]> | null = null;
export function loadCreatures(): Promise<RawCreature[]> {
  if (!creaturesPromise) {
    creaturesPromise = Promise.all(
      BESTIARY_BOOKS.map((book) =>
        fetchJson<BestiaryFile>(`${RAW_BASE}/bestiary/bestiary-${book}.json`),
      ),
    ).then((files) => files.flatMap((file) => file?.monster ?? []));
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
