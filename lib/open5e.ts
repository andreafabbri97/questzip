const BASE_URL = "https://api.open5e.com/v2";
const SRD_DOCUMENT = "srd-2024";

interface NamedRef {
  name: string;
  key: string;
}

export interface Spell {
  key: string;
  name: string;
  desc: string;
  higher_level?: string;
  level: number;
  school: NamedRef;
  classes: NamedRef[];
  casting_time: string;
  range_text: string;
  duration: string;
  concentration: boolean;
  ritual: boolean;
  verbal: boolean;
  somatic: boolean;
  material: boolean;
  material_specified?: string;
}

export interface CreatureAction {
  name: string;
  desc: string;
  action_type: "ACTION" | "BONUS_ACTION" | "REACTION" | "LEGENDARY_ACTION" | string;
}

export interface Creature {
  key: string;
  name: string;
  type: NamedRef;
  size: NamedRef;
  alignment: string;
  challenge_rating: number;
  armor_class: number;
  armor_detail?: string;
  hit_points: number;
  hit_dice: string;
  speed: Record<string, number | string | boolean>;
  ability_scores: {
    strength: number;
    dexterity: number;
    constitution: number;
    intelligence: number;
    wisdom: number;
    charisma: number;
  };
  passive_perception: number;
  languages: { as_string: string };
  darkvision_range?: number | null;
  actions?: CreatureAction[];
  traits?: { name: string; desc: string }[];
}

export interface MagicItem {
  key: string;
  name: string;
  desc: string;
  category: NamedRef;
  rarity: NamedRef;
  requires_attunement: boolean;
  attunement_detail?: string | null;
}

export type CompendiumKind = "incantesimi" | "mostri" | "oggetti";

const ENDPOINTS: Record<CompendiumKind, string> = {
  incantesimi: "spells",
  mostri: "creatures",
  oggetti: "magicitems",
};

interface Open5eResponse<T> {
  count: number;
  results: T[];
}

export async function searchCompendium<T>(
  kind: CompendiumKind,
  query: string,
  signal: AbortSignal,
): Promise<T[]> {
  const params = new URLSearchParams({
    limit: "20",
    document__key: SRD_DOCUMENT,
  });
  if (query.trim()) params.set("name__icontains", query.trim());

  const response = await fetch(`${BASE_URL}/${ENDPOINTS[kind]}/?${params}`, {
    signal,
  });
  if (!response.ok) {
    throw new Error(`Open5e ha risposto con errore ${response.status}`);
  }
  const data: Open5eResponse<T> = await response.json();
  return data.results;
}

export function formatChallengeRating(cr: number): string {
  const fractions: Record<number, string> = {
    0.125: "1/8",
    0.25: "1/4",
    0.5: "1/2",
  };
  return fractions[cr] ?? String(cr);
}

export function formatSpeed(speed: Record<string, number | string | boolean>): string {
  const unit = typeof speed.unit === "string" ? speed.unit : "feet";
  const labels: Record<string, string> = {
    walk: "",
    fly: "volo",
    swim: "nuoto",
    climb: "scalata",
    burrow: "scavo",
  };
  return Object.entries(speed)
    .filter(([key, value]) => key in labels && typeof value === "number" && value > 0)
    .map(([key, value]) => `${labels[key] ? `${labels[key]} ` : ""}${value} ${unit}`)
    .join(", ");
}
