import type { RawCreature } from "./data";

/**
 * Le righe dello stat block che stanno fra le caratteristiche e i tratti: tiri salvezza, abilità,
 * resistenze, immunità, vulnerabilità e immunità alle condizioni.
 *
 * Erano semplicemente assenti dal Compendio — il tipo RawCreature non le modellava affatto — e
 * senza di loro una scheda è inutilizzabile al tavolo: della Resistenza alle armi non magiche di
 * un demone, o dei suoi tiri salvezza, non c'era traccia.
 */

type Lingua = "en" | "it";

const CARATTERISTICHE: Record<string, string> = {
  str: "For",
  dex: "Des",
  con: "Cos",
  int: "Int",
  wis: "Sag",
  cha: "Car",
};

const ABILITA: Record<string, string> = {
  acrobatics: "Acrobazia",
  "animal handling": "Addestrare Animali",
  arcana: "Arcano",
  athletics: "Atletica",
  deception: "Inganno",
  history: "Storia",
  insight: "Intuizione",
  intimidation: "Intimidire",
  investigation: "Indagare",
  medicine: "Medicina",
  nature: "Natura",
  perception: "Percezione",
  performance: "Intrattenere",
  persuasion: "Persuasione",
  religion: "Religione",
  "sleight of hand": "Rapidità di Mano",
  stealth: "Furtività",
  survival: "Sopravvivenza",
};

const DANNI: Record<string, string> = {
  acid: "acido",
  bludgeoning: "contundenti",
  cold: "freddo",
  fire: "fuoco",
  force: "forza",
  lightning: "fulmine",
  necrotic: "necrotico",
  piercing: "perforanti",
  poison: "veleno",
  psychic: "psichico",
  radiant: "radiante",
  slashing: "taglienti",
  thunder: "tuono",
};

const CONDIZIONI: Record<string, string> = {
  blinded: "accecato",
  charmed: "affascinato",
  deafened: "assordato",
  exhaustion: "affaticamento",
  frightened: "spaventato",
  grappled: "afferrato",
  incapacitated: "incapacitato",
  invisible: "invisibile",
  paralyzed: "paralizzato",
  petrified: "pietrificato",
  poisoned: "avvelenato",
  prone: "prono",
  restrained: "trattenuto",
  stunned: "stordito",
  unconscious: "privo di sensi",
};

/** Note che 5etools scrive in inglese dentro i gruppi di resistenze ("from nonmagical attacks"). */
const NOTE: Record<string, string> = {
  "from nonmagical attacks": "da attacchi non magici",
  "from nonmagical attacks not made with silvered weapons":
    "da attacchi non magici non effettuati con armi argentate",
  "from nonmagical attacks not made with adamantine weapons":
    "da attacchi non magici non effettuati con armi adamantine",
  nonmagical: "non magici",
};

const traduci = (mappa: Record<string, string>, valore: string, lingua: Lingua) =>
  lingua === "it" ? (mappa[valore.toLowerCase()] ?? valore) : valore;

/** "For +9, Cos +9, Sag +7, Car +7" — nell'ordine dello stat block, non in quello dell'oggetto. */
export function formatTiriSalvezza(save: RawCreature["save"], lingua: Lingua = "it"): string {
  if (!save) return "";
  return (["str", "dex", "con", "int", "wis", "cha"] as const)
    .filter((k) => save[k])
    .map((k) => `${lingua === "it" ? CARATTERISTICHE[k] : k.toUpperCase()} ${save[k]}`)
    .join(", ");
}

/** "Percezione +10, Religione +15" */
export function formatAbilita(skill: RawCreature["skill"], lingua: Lingua = "it"): string {
  if (!skill) return "";
  return Object.entries(skill)
    .filter(([nome]) => nome !== "other")
    .map(([nome, bonus]) => {
      const etichetta = traduci(ABILITA, nome, lingua);
      return `${etichetta.charAt(0).toUpperCase()}${etichetta.slice(1)} ${bonus}`;
    })
    .join(", ");
}

/**
 * Resistenze/immunità/vulnerabilità: una lista mista di stringhe semplici e gruppi con una nota
 * ("contundenti, perforanti e taglienti da attacchi non magici"). I gruppi restano separati da
 * punto e virgola, come sulla scheda stampata, altrimenti la nota sembrerebbe valere per tutto.
 */
export function formatListaDanni(
  lista: RawCreature["resist"],
  chiave: "resist" | "immune" | "vulnerable",
  lingua: Lingua = "it",
): string {
  if (!lista?.length) return "";
  const semplici: string[] = [];
  const gruppi: string[] = [];

  for (const voce of lista) {
    if (typeof voce === "string") {
      semplici.push(traduci(DANNI, voce, lingua));
      continue;
    }
    if (voce.special) {
      gruppi.push(voce.special);
      continue;
    }
    const tipi = (voce[chiave] ?? []).map((t) => (typeof t === "string" ? traduci(DANNI, t, lingua) : ""));
    const pre = voce.preNote ? `${traduci(NOTE, voce.preNote, lingua)} ` : "";
    const nota = voce.note ? ` ${traduci(NOTE, voce.note, lingua)}` : "";
    if (tipi.length > 0) gruppi.push(`${pre}${tipi.join(", ")}${nota}`.trim());
  }

  return [semplici.join(", "), ...gruppi].filter(Boolean).join("; ");
}

/** "avvelenato, affascinato" */
export function formatCondizioni(
  lista: RawCreature["conditionImmune"],
  lingua: Lingua = "it",
): string {
  if (!lista?.length) return "";
  return lista
    .map((voce) =>
      typeof voce === "string"
        ? traduci(CONDIZIONI, voce, lingua)
        : (voce.conditionImmune ?? []).map((c) => traduci(CONDIZIONI, c, lingua)).join(", "),
    )
    .filter(Boolean)
    .join(", ");
}
