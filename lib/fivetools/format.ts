import type { RawCreature, TableCell } from "@/lib/fivetools/data";
import { stripTags } from "@/lib/fivetools/tags";

export function formatTableCell(cell: TableCell | undefined): string {
  if (cell === undefined || cell === "") return "—";
  if (typeof cell === "string" || typeof cell === "number") return String(cell);
  if (cell.type === "bonus") return cell.value !== undefined ? `+${cell.value}` : "—";
  return cell.value !== undefined ? String(cell.value) : "—";
}

const SCHOOL_NAMES: Record<string, string> = {
  A: "Abiurazione",
  C: "Evocazione (Conjuration)",
  D: "Divinazione",
  E: "Ammaliamento",
  V: "Invocazione",
  I: "Illusione",
  N: "Necromanzia",
  T: "Trasmutazione",
};

const SIZE_NAMES: Record<string, string> = {
  T: "Minuscola",
  S: "Piccola",
  M: "Media",
  L: "Grande",
  H: "Enorme",
  G: "Mastodontica",
};

const ALIGNMENT_NAMES: Record<string, string> = {
  L: "Legale",
  N: "Neutrale",
  C: "Caotico",
  G: "Buono",
  E: "Malvagio",
  U: "Non allineato",
  A: "Qualsiasi allineamento",
};

// I dati 5etools esprimono sempre l'unità al SINGOLARE con la quantità in un campo a parte
// ("number"/"amount"), quindi le vecchie chiavi plurali (minutes/hours) non venivano mai
// raggiunte: si leggeva "10 minuto", "8 ora", e le unità mai mappate ("day", "round") restavano
// in inglese. La forma giusta va quindi scelta in base alla quantità, non cercata come chiave.
const TIME_UNITS: Record<string, { uno: string; molti: string }> = {
  action: { uno: "azione", molti: "azioni" },
  bonus: { uno: "azione bonus", molti: "azioni bonus" },
  reaction: { uno: "reazione", molti: "reazioni" },
  round: { uno: "round", molti: "round" },
  turn: { uno: "turno", molti: "turni" },
  minute: { uno: "minuto", molti: "minuti" },
  hour: { uno: "ora", molti: "ore" },
  day: { uno: "giorno", molti: "giorni" },
  week: { uno: "settimana", molti: "settimane" },
  month: { uno: "mese", molti: "mesi" },
  year: { uno: "anno", molti: "anni" },
};

function formatTimeUnit(amount: number | undefined, unit: string): string {
  const names = TIME_UNITS[unit];
  const quantita = amount ?? 1;
  const testo = names ? (quantita === 1 ? names.uno : names.molti) : unit;
  return `${quantita} ${testo}`;
}

export function formatSchool(code: string): string {
  return SCHOOL_NAMES[code] ?? code;
}

export function formatSize(codes: string[] | undefined): string {
  return (codes ?? []).map((code) => SIZE_NAMES[code] ?? code).join("/");
}

export function formatAlignment(codes: string[] | undefined): string {
  if (!codes || codes.length === 0) return "—";
  return codes.map((code) => ALIGNMENT_NAMES[code] ?? code).join(" ");
}

export function formatChallengeRating(cr: RawCreature["cr"]): string {
  if (!cr) return "—";
  return typeof cr === "string" ? cr : cr.cr;
}

export function formatTime(time: { number: number; unit: string }[] | undefined): string {
  if (!time || time.length === 0) return "—";
  return time.map(({ number, unit }) => formatTimeUnit(number, unit)).join(" o ");
}

const RANGE_SHAPE_NAMES: Record<string, string> = {
  radius: "Raggio",
  cone: "Cono",
  line: "Linea",
  sphere: "Sfera",
  cube: "Cubo",
  hemisphere: "Emisfero",
  cylinder: "Cilindro",
};

// Conversione ufficiale D&D ITA: 1,5 m per 5 piedi (non i 0,3048 reali) — le distanze di gioco
// sono sempre multipli di 5 piedi, quindi *0.3 dà sempre un numero pulito (5→1,5, 10→3, 20→6…).
function feetToMeters(amount: number): number {
  return Math.round(amount * 0.3 * 10) / 10;
}

function formatDistanceAmount(amount: number, lang: "en" | "it"): string {
  if (lang !== "it") return String(amount);
  return String(feetToMeters(amount)).replace(".", ",");
}

export function formatFeet(amount: number, lang: "en" | "it" = "en"): string {
  return `${formatDistanceAmount(amount, lang)} ${lang === "it" ? "metri" : "piedi"}`;
}

export function formatRange(
  range: { type: string; distance?: { type: string; amount?: number } } | undefined,
  lang: "en" | "it" = "en",
): string {
  if (!range) return "—";
  if (range.type === "self") return "Su di sé";
  if (range.type === "touch") return "A contatto";
  if (range.type === "special") return "Speciale";

  const distance = range.distance;
  if (!distance) return range.type;
  const isFeet = distance.type === "feet";
  const unit = isFeet ? (lang === "it" ? "metri" : "piedi") : distance.type;
  const amount =
    distance.amount === undefined ? "" : isFeet ? formatDistanceAmount(distance.amount, lang) : distance.amount;

  if (range.type === "point") return `${amount} ${unit}`;
  const shape = RANGE_SHAPE_NAMES[range.type];
  return shape ? `${shape} di ${amount} ${unit}` : `${amount} ${unit}`;
}

export function formatDuration(
  durations:
    | { type: string; concentration?: boolean; duration?: { type: string; amount?: number } }[]
    | undefined,
): string {
  if (!durations || durations.length === 0) return "—";
  return durations
    .map((entry) => {
      if (entry.type === "instant") return "Istantanea";
      if (entry.type === "permanent") return "Permanente";
      if (entry.type === "special") return "Speciale";
      if (entry.duration) {
        const base = formatTimeUnit(entry.duration.amount, entry.duration.type);
        return entry.concentration ? `${base} (concentrazione)` : base;
      }
      return entry.type;
    })
    .join(" / ");
}

export function formatComponents(
  components: { v?: boolean; s?: boolean; m?: boolean | string } | undefined,
): string {
  if (!components) return "—";
  const parts: string[] = [];
  if (components.v) parts.push("V");
  if (components.s) parts.push("S");
  if (components.m) parts.push("M");
  return parts.join(", ") || "—";
}

export function formatMaterial(components: { m?: boolean | string } | undefined): string | null {
  const material = components?.m;
  return typeof material === "string" ? stripTags(material) : null;
}

export function formatAC(ac: RawCreature["ac"]): string {
  if (!ac || ac.length === 0) return "—";
  const first = ac[0];
  if (typeof first === "number") return String(first);
  const from = first.from?.map((item) => stripTags(item)).join(", ");
  return from ? `${first.ac} (${from})` : String(first.ac);
}

export function formatHP(hp: RawCreature["hp"]): string {
  if (!hp) return "—";
  if (typeof hp === "number") return String(hp);
  if (hp.average === undefined) return hp.formula ?? "—";
  return hp.formula ? `${hp.average} (${hp.formula})` : String(hp.average);
}

const SPEED_LABELS: Record<string, string> = {
  walk: "",
  fly: "volo",
  swim: "nuoto",
  climb: "scalata",
  burrow: "scavo",
};

export function formatSpeed(speed: RawCreature["speed"], lang: "en" | "it" = "en"): string {
  if (!speed) return "—";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(speed)) {
    if (!(key in SPEED_LABELS)) continue;
    const amount = typeof value === "number" ? value : typeof value === "object" ? value.number : null;
    if (!amount) continue;
    const label = SPEED_LABELS[key];
    const unit = lang === "it" ? "metri" : "piedi";
    parts.push(`${label ? `${label} ` : ""}${formatDistanceAmount(amount, lang)} ${unit}`);
  }
  return parts.join(", ") || "—";
}

// Tipo di creatura e rarità restavano gli unici valori in inglese in mezzo a dati tutti tradotti
// ("Grande dragon, Caotico Malvagio", "💍 very rare"): sono due elenchi chiusi e piccoli, quindi
// un dizionario è sufficiente — nessuna chiamata di traduzione.
const CREATURE_TYPE_NAMES: Record<string, string> = {
  aberration: "aberrazione",
  beast: "bestia",
  celestial: "celestiale",
  construct: "costrutto",
  dragon: "drago",
  elemental: "elementale",
  fey: "folletto",
  fiend: "immondo",
  giant: "gigante",
  humanoid: "umanoide",
  monstrosity: "mostruosità",
  ooze: "melma",
  plant: "pianta",
  undead: "non morto",
  swarm: "sciame",
};

const RARITY_NAMES: Record<string, string> = {
  common: "comune",
  uncommon: "non comune",
  rare: "raro",
  "very rare": "molto raro",
  legendary: "leggendario",
  artifact: "artefatto",
  varies: "variabile",
  unknown: "sconosciuta",
  "unknown (magic)": "sconosciuta (magico)",
};

export function formatRarity(rarity: string | undefined): string {
  if (!rarity) return "";
  return RARITY_NAMES[rarity.toLowerCase()] ?? rarity;
}

export function formatCreatureType(type: RawCreature["type"]): string {
  if (!type) return "—";
  const raw = typeof type === "string" ? type : type.type;
  return CREATURE_TYPE_NAMES[raw?.toLowerCase() ?? ""] ?? raw;
}

const ABILITY_ABBR: Record<string, string> = {
  str: "FOR",
  dex: "DES",
  con: "COS",
  int: "INT",
  wis: "SAG",
  cha: "CAR",
};

export function formatAbilityIncrease(ability: Record<string, number>[] | undefined): string {
  if (!ability || ability.length === 0) return "—";
  return ability
    .map((option) =>
      Object.entries(option)
        .filter(([key]) => key in ABILITY_ABBR)
        .map(([key, value]) => `${ABILITY_ABBR[key]} +${value}`)
        .join(", "),
    )
    .filter(Boolean)
    .join(" oppure ") || "A scelta";
}

interface FeatPrerequisite {
  ability?: Record<string, number>[];
  race?: { name: string }[];
  level?: number | { level: number };
}

export function formatPrerequisite(prereqs: FeatPrerequisite[] | undefined): string | null {
  if (!prereqs || prereqs.length === 0) return null;
  const parts = prereqs
    .map((prereq) => {
      const bits: string[] = [];
      if (prereq.ability) {
        for (const option of prereq.ability) {
          for (const [key, value] of Object.entries(option)) {
            if (key in ABILITY_ABBR) bits.push(`${ABILITY_ABBR[key]} ${value}+`);
          }
        }
      }
      if (prereq.race) bits.push(prereq.race.map((r) => r.name).join(" o "));
      if (prereq.level) {
        const level = typeof prereq.level === "number" ? prereq.level : prereq.level.level;
        bits.push(`Livello ${level}+`);
      }
      return bits.join(", ");
    })
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" oppure ") : null;
}

export function formatHitDie(hd: { number: number; faces: number } | undefined): string {
  if (!hd) return "—";
  return `${hd.number}d${hd.faces}`;
}

export function formatRaceSpeed(
  speed: number | Record<string, number> | undefined,
  lang: "en" | "it" = "en",
): string {
  if (speed === undefined) return "—";
  const unit = lang === "it" ? "metri" : "piedi";
  if (typeof speed === "number") return `${formatDistanceAmount(speed, lang)} ${unit}`;
  return (
    Object.entries(speed)
      .map(
        ([key, value]) =>
          `${SPEED_LABELS[key] ? `${SPEED_LABELS[key]} ` : ""}${formatDistanceAmount(value, lang)} ${unit}`,
      )
      .join(", ") || "—"
  );
}

// Conversione libbre->kg: 5etools ("weight") è sempre in libbre, l'app usa i kg ovunque
// (peso inventario, capacità di trasporto) — 0,45 kg/libbra, stesso principio già in uso per
// le distanze (conversione "pulita" ufficiale, non i decimali del valore reale). Numero grezzo
// esportato a sé (non solo la stringa formattata sotto) — serve anche per precompilare il campo
// "Peso unitario" dell'inventario alla selezione di un oggetto dal Compendio, dove serve il
// valore numerico vero, non un testo con la virgola già pronto per la UI.
export function weightLbToKg(weightLb: number): number {
  return Math.round(weightLb * 0.45 * 10) / 10;
}

export function formatItemWeight(weightLb: number | undefined): string | null {
  if (weightLb === undefined) return null;
  return `${String(weightLbToKg(weightLb)).replace(".", ",")} kg`;
}

// 5etools esprime il prezzo di un oggetto in monete di RAME (1 mo = 10 ma = 100 mr) — quasi
// sempre un multiplo esatto di 100 (quindi mostrabile in mo, l'unità con cui i manuali indicano i
// prezzi), ma non sempre (es. oggetti che costano poche monete d'argento/rame): scelta l'unità più
// grande che divide il valore senza resto, altrimenti mo con decimali.
export function formatItemValue(valueCopper: number | undefined): string | null {
  if (valueCopper === undefined) return null;
  if (valueCopper % 100 === 0) return `${valueCopper / 100} mo`;
  if (valueCopper % 10 === 0) return `${valueCopper / 10} ma`;
  return `${valueCopper} mr`;
}

const DAMAGE_TYPE_NAMES: Record<string, string> = {
  S: "tagliente",
  P: "perforante",
  B: "contundente",
  A: "acido",
  C: "freddo",
  F: "fuoco",
  O: "forza",
  L: "fulmine",
  N: "necrotico",
  I: "veleno",
  Y: "psichico",
  R: "radiante",
  T: "tuono",
};

export function formatDamageType(code: string | undefined): string {
  return code ? (DAMAGE_TYPE_NAMES[code] ?? code) : "";
}

// Gittata di un'arma a distanza/da lancio: "20/60" (piedi, corta/lunga) nel formato 5etools —
// riusa formatFeet per restare coerente con la stessa conversione "pulita" già in uso ovunque
// nell'app per le distanze (incantesimi, velocità...).
export function formatWeaponRange(range: string | undefined, lang: "en" | "it" = "en"): string | null {
  if (!range) return null;
  const parts = range
    .split("/")
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  if (parts.length === 0) return null;
  return parts.map((ft) => formatFeet(ft, lang)).join(" / ");
}

export function formatProficiencyList(
  list: (string | { proficiency: string })[] | undefined,
): string {
  if (!list || list.length === 0) return "—";
  return list
    .map((entry) => (typeof entry === "string" ? stripTags(entry) : stripTags(entry.proficiency)))
    .join(", ");
}

// Etichetta della sezione sottoclassi (es. "Roguish Archetype", "Otherworldly Patron") — campo
// 5etools `subclassTitle`, sempre in inglese, mai passato da un endpoint di traduzione (non è un
// nome di entità cercabile nel Compendio, solo un'intestazione di sezione) — set piccolo e fisso
// (una per classe base + un fallback generico "<Classe> Subclass" per le classi 2024/XPHB), tenuto
// a mano come le altre mappe di questo file invece di affidarsi alla traduzione automatica.
// Segnalato dall'utente: l'italiano deve essere la lingua primaria in TUTTA l'app, non solo nel
// Compendio — questa intestazione restava sempre in inglese, senza nemmeno un sottotitolo.
const SUBCLASS_TITLE_NAMES: Record<string, string> = {
  "Artificer Specialist": "Specializzazione dell'Artefice",
  "Barbarian Subclass": "Sottoclasse del Barbaro",
  "Primal Path": "Cammino Primordiale",
  "Bard College": "Collegio Bardico",
  "Bard Subclass": "Sottoclasse del Bardo",
  "Divine Domain": "Dominio Divino",
  "Cleric Subclass": "Sottoclasse del Chierico",
  "Druid Circle": "Circolo Druidico",
  "Druid Subclass": "Sottoclasse del Druido",
  "Martial Archetype": "Archetipo Marziale",
  "Fighter Subclass": "Sottoclasse del Guerriero",
  "Monastic Tradition": "Tradizione Monastica",
  "Monk Subclass": "Sottoclasse del Monaco",
  "Sacred Oath": "Giuramento Sacro",
  "Paladin Subclass": "Sottoclasse del Paladino",
  "Ranger Archetype": "Archetipo del Ranger",
  "Ranger Conclave": "Consesso del Ranger",
  "Ranger Subclass": "Sottoclasse del Ranger",
  "Roguish Archetype": "Archetipo Furtivo",
  "Rogue Subclass": "Sottoclasse del Ladro",
  "Sorcerous Origin": "Origine Stregonesca",
  "Sorcerer Subclass": "Sottoclasse dello Stregone",
  "Otherworldly Patron": "Patrono Ultraterreno",
  "Warlock Subclass": "Sottoclasse del Warlock",
  "Arcane Tradition": "Tradizione Arcana",
  "Wizard Subclass": "Sottoclasse del Mago",
};

export function formatSubclassTitle(title: string | undefined): string {
  if (!title) return "Sottoclasse";
  return SUBCLASS_TITLE_NAMES[title] ?? title;
}
