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

const TIME_UNIT_NAMES: Record<string, string> = {
  action: "azione",
  "bonus": "azione bonus",
  reaction: "reazione",
  minute: "minuto",
  minutes: "minuti",
  hour: "ora",
  hours: "ore",
};

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
  return time
    .map(({ number, unit }) => `${number} ${TIME_UNIT_NAMES[unit] ?? unit}`)
    .join(" o ");
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
        const unit = TIME_UNIT_NAMES[entry.duration.type] ?? entry.duration.type;
        const base = `${entry.duration.amount ?? ""} ${unit}`;
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

export function formatCreatureType(type: RawCreature["type"]): string {
  if (!type) return "—";
  return typeof type === "string" ? type : type.type;
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

export function formatProficiencyList(
  list: (string | { proficiency: string })[] | undefined,
): string {
  if (!list || list.length === 0) return "—";
  return list
    .map((entry) => (typeof entry === "string" ? stripTags(entry) : stripTags(entry.proficiency)))
    .join(", ");
}
