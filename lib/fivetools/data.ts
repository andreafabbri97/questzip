import { RAW_BASE } from "@/lib/fivetools/books";
import type { FiveEntry } from "@/lib/fivetools/entries";

// Array (non solo il tipo) apposta: serve anche a runtime per validare un CompendiumKind che
// arriva da fuori TypeScript — es. un token menzione #{Nome|kind|fonte} scritto a mano dentro un
// messaggio di chat, dove un cast "as CompendiumKind" da solo non basta a fermare un valore
// inventato (vedi lib/fivetools/mention-token.ts).
export const COMPENDIUM_KINDS = [
  "incantesimi",
  "mostri",
  "oggetti",
  "razze",
  "talenti",
  "background",
  "condizioni",
  "classi",
  // Suppliche occulte, Voto del Patto, stili di combattimento, metamagia, infusioni dell'Artefice:
  // vivono in optionalfeatures.json, non in una delle categorie "classiche" di 5etools. Prima non
  // erano cercabili da nessuna parte — un giocatore che voleva rileggere "Vista del Diavolo" non
  // la trovava nel Compendio, pur avendola scritta in scheda (segnalato dall'utente).
  "scelteClasse",
] as const;
export type CompendiumKind = (typeof COMPENDIUM_KINDS)[number];
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
  // Statistiche meccaniche presenti per armi/armature comuni ("baseitem" in 5etools) — quasi mai
  // hanno un "entries" descrittivo (vedi commento su ItemDetail in compendio-detail.tsx), quindi
  // senza questi campi il dettaglio di un'arma comune non avrebbe alcun dato utile da mostrare.
  weight?: number; // libbre
  value?: number; // rame (1 mo = 100 rame)
  dmg1?: string; // es. "1d8"
  dmg2?: string; // danno con impugnatura a due mani, per le armi "versatili"
  dmgType?: string; // codice singola lettera: S/P/B
  ac?: number; // solo armature
  strength?: string; // requisito di Forza, es. "13"
  stealth?: boolean; // true = svantaggio a Furtività
  range?: string; // es. "20/60" (piedi), solo armi a distanza/da lancio
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

export interface RawOptionalFeature {
  name: string;
  source: string;
  featureType?: string[];
  prerequisite?: {
    level?: { level: number; class?: { name: string } };
    item?: string[];
  }[];
  entries: FiveEntry[];
}

export type TableCell = string | number | { type: string; value?: number };

export interface ClassTableGroup {
  title?: string;
  colLabels: string[];
  // Le tabelle "Spell Slots per Spell Level" usano rowsSpellProgression invece di rows —
  // stessa forma (array di celle per livello 1-20), chiave diversa.
  rows?: TableCell[][];
  rowsSpellProgression?: TableCell[][];
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
  classTableGroups?: ClassTableGroup[];
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
  subclassSource: string;
  level: number;
  entries: FiveEntry[];
}

export interface RawClassFeature {
  name: string;
  className: string;
  classSource: string;
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
interface OptionalFeaturesFile {
  optionalfeature: RawOptionalFeature[];
}
interface ClassFile {
  class: RawClass[];
  subclass?: RawSubclass[];
  subclassFeature?: RawSubclassFeature[];
  classFeature?: RawClassFeature[];
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
/** Solo oggetti MAGICI (rarità reale) — usato dal tab "Oggetti magici" del Compendio. */
export function loadItems(): Promise<RawItem[]> {
  if (!itemsPromise) {
    itemsPromise = fetchJson<ItemsFile>(`${RAW_BASE}/items.json`).then((file) =>
      (file?.item ?? []).filter((item) => item.rarity && item.rarity !== "none"),
    );
  }
  return itemsPromise;
}

interface BaseItemsFile {
  baseitem: RawItem[];
}

let inventoryItemsPromise: Promise<RawItem[]> | null = null;
/**
 * Oggetti magici + oggetti/armi/armature comuni ("mundane"), per l'Inventario nella scheda
 * Personaggio (non il Compendio, che resta filtrato ai soli magici via loadItems). Le armi/armature
 * base (Spada lunga, Torcia, Corda...) vivono in items-base.json, un file SEPARATO da items.json:
 * senza unirlo, l'Inventario non trovava nemmeno gli oggetti più comuni citati nel suo stesso
 * placeholder ("torcia…").
 */
export function loadInventoryItems(): Promise<RawItem[]> {
  if (!inventoryItemsPromise) {
    inventoryItemsPromise = Promise.all([
      fetchJson<ItemsFile>(`${RAW_BASE}/items.json`).then((file) => file?.item ?? []),
      fetchJson<BaseItemsFile>(`${RAW_BASE}/items-base.json`).then((file) => file?.baseitem ?? []),
    ]).then(([items, baseItems]) => [...items, ...baseItems]);
  }
  return inventoryItemsPromise;
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

export interface ClassData {
  classes: RawClass[];
  subclasses: RawSubclass[];
  subclassFeatures: RawSubclassFeature[];
  classFeatures: RawClassFeature[];
}

let optionalFeaturesPromise: Promise<RawOptionalFeature[]> | null = null;
function loadAllOptionalFeatures(): Promise<RawOptionalFeature[]> {
  if (!optionalFeaturesPromise) {
    optionalFeaturesPromise = fetchJson<OptionalFeaturesFile>(`${RAW_BASE}/optionalfeatures.json`).then(
      (file) => file?.optionalfeature ?? [],
    );
  }
  return optionalFeaturesPromise;
}

let infusionsPromise: Promise<RawOptionalFeature[]> | null = null;
/**
 * Infusioni dell'Artefice — 5etools non le modella come una categoria a sé ma come "optional
 * feature" di tipo AI ("Artificer Infusion"), nello stesso file condiviso con stili di
 * combattimento, invocazioni occulte, manovre del Guerriero ecc., qui filtrati via.
 */
export function loadInfusions(): Promise<RawOptionalFeature[]> {
  if (!infusionsPromise) {
    infusionsPromise = loadAllOptionalFeatures().then((all) => all.filter((f) => f.featureType?.includes("AI")));
  }
  return infusionsPromise;
}

// Scelte opzionali per classe (Compendio, vedi ClassChoicesSection in components/personaggi/
// weapons-spells.tsx): stesso file optionalfeatures.json di loadInfusions sopra, filtrato per
// classe invece che sempre sullo stesso tipo fisso. Solo i tipi disponibili alla classe BASE
// (non legati a una sottoclasse specifica, es. Manovre del Guerriero Combattente in Prima Linea o
// Discipline Elementali del Monaco Via dei Quattro Elementi — questa scheda non traccia la
// sottoclasse come campo strutturato, mostrarle a TUTTI i Guerrieri/Monaci sarebbe fuorviante per
// chi non ha quella sottoclasse) — coerente col principio "meglio onesto e parziale che sbagliato".
export const CLASS_OPTIONAL_FEATURE_TYPES: Record<string, { label: string; types: string[] }> = {
  warlock: { label: "Suppliche occulte e Voto del Patto", types: ["EI", "PB"] },
  fighter: { label: "Stile di combattimento", types: ["FS:F"] },
  paladin: { label: "Stile di combattimento", types: ["FS:P"] },
  ranger: { label: "Stile di combattimento", types: ["FS:R"] },
  bard: { label: "Stile di combattimento", types: ["FS:B"] },
  sorcerer: { label: "Metamagia", types: ["MM"] },
};

let optionalFeatureLoadersByKey: Map<string, Promise<RawOptionalFeature[]>> | null = null;
/** Carica le optional feature per un insieme di tipi (es. ["EI","PB"] per un Warlock) — cache per
 * combinazione esatta di tipi, così due chiamate con la stessa combinazione riusano la stessa
 * promise invece di rifiltrare/rifetchare ad ogni render. */
/** Tutte le scelte di classe che l'app conosce, in un unico elenco — per la sezione omonima del
 * Compendio. Stessi tipi già usati dalla scheda personaggio (CLASS_OPTIONAL_FEATURE_TYPES) più le
 * infusioni dell'Artefice, che in scheda hanno una sezione propria. */
export const TUTTI_I_TIPI_SCELTE = ["EI", "PB", "FS:F", "FS:P", "FS:R", "FS:B", "MM", "AI"];

export function loadClassChoices(): Promise<RawOptionalFeature[]> {
  return loadOptionalFeaturesByTypes(TUTTI_I_TIPI_SCELTE);
}

export function loadOptionalFeaturesByTypes(types: string[]): Promise<RawOptionalFeature[]> {
  optionalFeatureLoadersByKey ??= new Map();
  const key = [...types].sort().join(",");
  let promise = optionalFeatureLoadersByKey.get(key);
  if (!promise) {
    promise = loadAllOptionalFeatures().then((all) => all.filter((f) => f.featureType?.some((t) => types.includes(t))));
    optionalFeatureLoadersByKey.set(key, promise);
  }
  return promise;
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
      classFeatures: files.flatMap((file) => file?.classFeature ?? []),
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
        feature.className === subclass.className &&
        feature.subclassShortName === shortName &&
        feature.subclassSource === subclass.source,
    )
    .sort((a, b) => a.level - b.level);
}

/** Risolve le feature di classe (non di sottoclasse), ordinate per livello. */
export function resolveClassFeatures(data: ClassData, cls: RawClass): RawClassFeature[] {
  return data.classFeatures
    .filter((feature) => feature.className === cls.name && feature.classSource === cls.source)
    .sort((a, b) => a.level - b.level);
}
