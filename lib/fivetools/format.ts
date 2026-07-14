import type { RawCreature } from "@/lib/fivetools/data";
import { stripTags } from "@/lib/fivetools/tags";

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

export function formatRange(
  range: { type: string; distance?: { type: string; amount?: number } } | undefined,
): string {
  if (!range) return "—";
  if (range.type === "self") return "Su di sé";
  if (range.type === "touch") return "A contatto";
  if (range.type === "special") return "Speciale";

  const distance = range.distance;
  if (!distance) return range.type;
  const unit = distance.type === "feet" ? "piedi" : distance.type;
  const amount = distance.amount ?? "";

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

export function formatSpeed(speed: RawCreature["speed"]): string {
  if (!speed) return "—";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(speed)) {
    if (!(key in SPEED_LABELS)) continue;
    const amount = typeof value === "number" ? value : typeof value === "object" ? value.number : null;
    if (!amount) continue;
    const label = SPEED_LABELS[key];
    parts.push(`${label ? `${label} ` : ""}${amount} piedi`);
  }
  return parts.join(", ") || "—";
}

export function formatCreatureType(type: RawCreature["type"]): string {
  if (!type) return "—";
  return typeof type === "string" ? type : type.type;
}
