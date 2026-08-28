import { RAW_BASE } from "@/lib/fivetools/books";
import type { FiveEntry } from "@/lib/fivetools/entries";
import { incantesimiDaSources, type IncantesimoDiClasse } from "@/lib/fivetools/incantesimi-classe";

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
  /** Incantesimi che la sottoclasse concede (liste ampliate dei patroni, domini, giuramenti...):
   *  la forma dei dati è varia, la legge lib/fivetools/incantesimi-classe.ts. */
  additionalSpells?: Partial<
    Record<"expanded" | "prepared" | "known" | "innate", Record<string, unknown>>
  >[];
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
  /** Voci "di famiglia" del manuale (Anello di Resistenza, Corno del Valhalla): una voce sola
   * con una tabella di varianti al suo interno. */
  itemGroup?: RawItem[];
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

/** Una "variante generica" di 5etools: un oggetto magico che non è legato a un oggetto base
 * preciso ma si applica a un'intera famiglia ("Dragon Slayer" vale per qualunque spada). Vive in
 * un file SEPARATO da items.json, con i dati veri annidati sotto `inherits`. */
interface RawMagicVariant {
  name: string;
  type?: string;
  inherits?: {
    source?: string;
    rarity?: string;
    reqAttune?: boolean | string;
    entries?: FiveEntry[];
  };
}

interface MagicVariantsFile {
  magicvariant: RawMagicVariant[];
}

/**
 * Gli oggetti magici più iconici del gioco — Flame Tongue, Dragon Slayer, Armatura Adamantina,
 * Arma/Armatura/Scudo +1/+2/+3, Anello di Resistenza — NON sono in items.json: 5etools li tiene
 * in magicvariants.json perché non sono un oggetto singolo ma una variante applicabile a
 * un'intera famiglia di oggetti base. Non caricandoli, il Compendio non li conteneva affatto:
 * cercare "Lingua di Fiamme" non dava alcun risultato, e le ~47 voci italiane ufficiali
 * corrispondenti restavano scollegate perché la controparte inglese semplicemente non esisteva.
 */
function normalizzaVariante(v: RawMagicVariant): RawItem | null {
  const dati = v.inherits;
  if (!dati?.source) return null;
  return {
    name: v.name,
    source: dati.source,
    rarity: dati.rarity,
    type: v.type,
    reqAttune: dati.reqAttune,
    entries: dati.entries,
  };
}

let itemsPromise: Promise<RawItem[]> | null = null;
/** Solo oggetti MAGICI (rarità reale) — usato dal tab "Oggetti magici" del Compendio. */
export function loadItems(): Promise<RawItem[]> {
  if (!itemsPromise) {
    itemsPromise = Promise.all([
      // "item" sono gli oggetti singoli; "itemGroup" le famiglie che nel manuale hanno una voce
      // sola con una tabella di varianti (Anello di Resistenza, Corno del Valhalla, Corazza di
      // Scaglie di Drago, Pergamena Magica). Erano assenti dal Compendio quanto le varianti
      // generiche, pur essendo voci a tutti gli effetti del Manuale del DM.
      fetchJson<ItemsFile>(`${RAW_BASE}/items.json`).then((file) => [
        ...(file?.item ?? []),
        ...(file?.itemGroup ?? []),
      ]),
      fetchJson<MagicVariantsFile>(`${RAW_BASE}/magicvariants.json`).then(
        (file) => (file?.magicvariant ?? []).map(normalizzaVariante).filter((v): v is RawItem => !!v),
      ),
    ]).then(([items, varianti]) =>
      [...items, ...varianti].filter((item) => item.rarity && item.rarity !== "none"),
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
      fetchJson<ItemsFile>(`${RAW_BASE}/items.json`).then((file) => [
        ...(file?.item ?? []),
        ...(file?.itemGroup ?? []),
      ]),
      fetchJson<BaseItemsFile>(`${RAW_BASE}/items-base.json`).then((file) => file?.baseitem ?? []),
      // Stesse varianti generiche caricate da loadItems: senza, un personaggio non poteva mettere
      // in inventario una Lingua di Fiamme o un'arma +1, fra gli oggetti magici più comuni in gioco.
      fetchJson<MagicVariantsFile>(`${RAW_BASE}/magicvariants.json`).then(
        (file) => (file?.magicvariant ?? []).map(normalizzaVariante).filter((v): v is RawItem => !!v),
      ),
    ]).then(([items, baseItems, varianti]) => [...items, ...baseItems, ...varianti]);
  }
  return inventoryItemsPromise;
}

/** `spells/sources.json`: `{ FONTE: { "Nome Incantesimo": { class: [{name, source}] } } }` */
interface SpellSourcesFile {
  [fonte: string]: {
    [nomeIncantesimo: string]: {
      class?: { name: string; source: string }[];
      classVariant?: { name: string; source: string; definedInSource?: string }[];
    };
  };
}

let classSpellsPromise: Promise<Map<string, IncantesimoDiClasse[]>> | null = null;
/**
 * Quali incantesimi può scegliere ciascuna classe, indicizzati per "Classe|Fonte".
 *
 * Il dato NON sta sulle voci degli incantesimi (non hanno un campo "classes") ma in un file a
 * parte, `spells/sources.json`, che rovescia la relazione: per ogni incantesimo elenca le classi
 * che lo hanno in lista. Senza, dalla scheda di una classe non c'era modo di sapere cosa può
 * lanciare — bisognava uscire e cercarlo altrove, che è esattamente il buco segnalato dall'utente.
 *
 * Comprende sia la lista base (`class`) sia le liste che i manuali successivi AGGIUNGONO a quella
 * classe (`classVariant`): la Guida di Xanathar da sola porta trentasei incantesimi in più al
 * warlock, e chi gioca con quel manuale li ha davvero. L'origine viaggia insieme al nome, così
 * l'interfaccia può dire da dove arriva ciascuno invece di mescolarli in un elenco indistinto.
 */
export function loadClassSpells(): Promise<Map<string, IncantesimoDiClasse[]>> {
  if (!classSpellsPromise) {
    classSpellsPromise = fetchJson<SpellSourcesFile>(`${RAW_BASE}/spells/sources.json`).then((file) => {
      const perClasse = new Map<string, IncantesimoDiClasse[]>();
      const classi = new Set<string>();
      for (const incantesimi of Object.values(file ?? {})) {
        for (const info of Object.values(incantesimi)) {
          for (const c of [...(info.class ?? []), ...(info.classVariant ?? [])]) {
            classi.add(`${c.name}|${c.source}`);
          }
        }
      }
      for (const chiave of classi) {
        const [nome, fonte] = chiave.split("|");
        perClasse.set(chiave, incantesimiDaSources(file ?? {}, nome, fonte));
      }
      return perClasse;
    });
  }
  return classSpellsPromise;
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
// Mancavano le manovre del Maestro di Battaglia (43 voci!), le discipline elementali del monaco,
// i colpi arcani e le rune del guerriero: sono scelte a tutti gli effetti, che un giocatore deve
// poter leggere nel Compendio esattamente come una supplica occulta.
export const TUTTI_I_TIPI_SCELTE = [
  "EI", "PB", "FS:F", "FS:P", "FS:R", "FS:B", "MM", "AI", "MV:B", "ED", "AS", "RN",
];

/** Quali di quelle scelte sblocca ciascuna classe, per mostrarle nella sua scheda. */
export const SCELTE_PER_CLASSE: Record<string, string[]> = {
  Warlock: ["EI", "PB"],
  Fighter: ["FS:F", "MV:B", "AS", "RN"],
  Paladin: ["FS:P"],
  Ranger: ["FS:R"],
  Bard: ["FS:B"],
  Sorcerer: ["MM"],
  Monk: ["ED"],
  Artificer: ["AI"],
};

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
