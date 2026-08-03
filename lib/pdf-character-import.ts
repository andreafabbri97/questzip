import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import {
  ALIGNMENTS,
  XP_PER_LEVEL,
  characterSchema,
  newCharacter,
  type Ability,
  type Character,
  type ClassEntry,
  type InventoryItem,
  type KnownFeat,
  type KnownSpell,
  type LimitedFeature,
  type Weapon,
} from "@/lib/dnd";

/**
 * Import da un PDF compilabile — specificamente il template di scheda cartacea che il gruppo usa
 * davvero (quello condiviso come riferimento per il design della scheda Personaggio di QuestZip,
 * vedi README). Non è un importatore generico per "un PDF qualsiasi": i nomi/posizioni dei campi
 * sono quelli di QUESTO template, fissi (lo stesso file .pdf vuoto è condiviso fra tutti gli
 * amici, solo i VALORI cambiano da un personaggio all'altro) — per questo ha senso avere una
 * mappa hard-coded invece di un parser che intuisce la struttura al volo.
 *
 * Scoperta analizzando il PDF con PyMuPDF (non a intuito): il campo chiamato "Background" NON
 * contiene il background — contiene il livello (confermato: il suo valore "5 + 3" sommato dà il
 * livello totale 8, che combacia esattamente col bonus di competenza +3 scritto altrove sulla
 * stessa scheda) — un difetto del template, non un errore di chi l'ha compilato. Il campo
 * "Alignment" invece corrisponde davvero all'Allineamento (confermato dall'utente) e il campo
 * "XP" finisce per esclusione nel Background — anche se il suo contenuto reale è spesso testo
 * simile a un allineamento (es. "legale n[eutrale]"): a quanto pare chi compila la scheda in
 * pratica segue il nome interno del campo mostrato dal proprio lettore PDF, non la didascalia
 * stampata nella pagina, quindi "XP" finisce per essere usato come terzo campo descrittivo libero
 * più che come punti esperienza veri e propri.
 */

type FieldValues = { text: Map<string, string>; check: Map<string, boolean> };

async function readFields(bytes: ArrayBuffer): Promise<FieldValues> {
  const pdf = await PDFDocument.load(bytes);
  const form = pdf.getForm();
  const text = new Map<string, string>();
  const check = new Map<string, boolean>();
  for (const field of form.getFields()) {
    // .trim(): alcuni nomi campo di questo template hanno spazi finali incoerenti (es. "Race ",
    // "Wpn2 AtkBonus ") — normalizzare qui evita di dover ricordare l'esatta whitespace di ogni
    // singolo campo nelle tabelle di mappatura sotto.
    const name = field.getName().trim();
    if (field instanceof PDFTextField) {
      text.set(name, (field.getText() ?? "").trim());
    } else if (field instanceof PDFCheckBox) {
      check.set(name, field.isChecked());
    }
  }
  return { text, check };
}

function toInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const match = value.match(/-?\d+/);
  if (!match) return fallback;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

// "Legale N" (troncato sulla scheda, colonna stretta) -> "Legale Neutrale": confronta per
// prefisso invece che per uguaglianza esatta, dato che il testo compilato a mano è spesso
// abbreviato o tagliato dalla larghezza della casella.
function matchAlignment(raw: string): string {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return "";
  const found = ALIGNMENTS.find(
    (a) => a.toLowerCase() === normalized || a.toLowerCase().startsWith(normalized),
  );
  return found ?? raw.trim();
}

// "Ladro - Warlock" + "5  +  3" -> [{nome:"Ladro",livello:5},{nome:"Warlock",livello:3}] — i
// nomi delle classi e i livelli vivono in due campi separati sul PDF, associati per posizione
// (stesso ordine in entrambe le liste).
function parseClasses(classNames: string, classLevels: string): ClassEntry[] {
  const names = classNames
    .split(/[-/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const levels = classLevels
    .split("+")
    .map((s) => toInt(s, NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (names.length === 0) return [{ nome: "", livello: 1 }];
  return names.map((nome, i) => ({ nome, livello: clamp(levels[i] ?? 1, 1, 20) }));
}

const SKILL_CODE_TO_NAME: Record<string, string> = {
  ACRO: "Acrobazia",
  ANIM: "Addestrare Animali",
  ARC: "Arcano",
  ATH: "Atletica",
  STLTH: "Furtività",
  INV: "Indagare",
  DEC: "Inganno",
  INTI: "Intimidire",
  PERF: "Intrattenere",
  INS: "Intuizione",
  MED: "Medicina",
  NAT: "Natura",
  PERC: "Percezione",
  PERS: "Persuasione",
  SLE: "Rapidità di Mano",
  REL: "Religione",
  SURV: "Sopravvivenza",
  HIST: "Storia",
};

const ABILITY_SAVE_FIELD: Record<string, Ability> = {
  STRprof: "forza",
  DEXprof: "destrezza",
  CONprof: "costituzione",
  INTprof: "intelligenza",
  WISprof: "saggezza",
  CHAprof: "carisma",
};

// name/atk/dmg: i tre campi che descrivono un'arma nel riquadro apposito del PDF (fino a 6 armi).
// Il bonus d'attacco testuale NON viene riportato: QuestZip lo ricalcola sempre da vivo da
// caratteristica+competenza+bonus estra, riportarlo come testo fisso rischierebbe solo di restare
// disallineato alla prima modifica del personaggio.
const WEAPON_FIELDS = [1, 2, 3, 4, 5, 6].map((n) => ({
  name: n === 1 ? "Wpn Name" : `Wpn Name ${n}`,
  dmg: `Wpn${n} Damage`,
}));

function parseWeaponDamage(raw: string): { dado: string; tipo: string } {
  const diceMatch = raw.match(/\d+d\d+/i);
  const dado = diceMatch ? diceMatch[0] : "1d6";
  let rest = raw.replace(diceMatch?.[0] ?? "", "");
  rest = rest.replace(/[+-]\s?\d+/, "");
  return { dado, tipo: rest.replace(/\s+/g, " ").trim() };
}

const LIMITED_FEAT_FIELDS = [1, 2, 3, 4, 5, 6].map((n) => ({
  nome: `Limited Feat ${n}`,
  tot: `FeatTot ${n}`,
  left: `FeatLeft ${n}`,
  sr: `RecoverySR ${n}`,
  lr: `RecoveryLR ${n}`,
  dn: `RecoveryDN ${n}`,
}));

// Mappa geometrica campo incantesimo -> {livello, riga, ruolo}, generata analizzando le
// coordinate di ogni campo della pagina Incantesimi (script Python one-off, non nel repo): i nomi
// interni dei campi lì sono generati automaticamente da Acrobat e non seguono alcuno schema
// leggibile (es. "4_8", "Check Box 301143"), l'UNICO modo affidabile di sapere "questo campo è la
// riga 3 del 4° livello" è la posizione sulla pagina, non il nome. La tabella è quindi un dato
// fisso del template (uguale per ogni scheda compilata da questo stesso PDF), non qualcosa che si
// possa dedurre a runtime nel browser.
const SPELL_FIELD_MAP: Record<string, { level: number; row: number; role: "name" | "prepared" }> =
  {
    "0 1": { level: 0, row: 0, role: "name" },
    "0 2": { level: 0, row: 1, role: "name" },
    "0 3": { level: 0, row: 2, role: "name" },
    "0 4": { level: 0, row: 3, role: "name" },
    "0 5": { level: 0, row: 4, role: "name" },
    "0 6": { level: 0, row: 5, role: "name" },
    "0 7": { level: 0, row: 6, role: "name" },
    "0 8": { level: 0, row: 7, role: "name" },
    "SPELL NAME 111": { level: 1, row: 0, role: "name" },
    "SPELL NAME 1": { level: 1, row: 1, role: "name" },
    "SPELL NAME 2": { level: 1, row: 2, role: "name" },
    "SPELL NAME 3": { level: 1, row: 3, role: "name" },
    "SPELL NAME 4": { level: 1, row: 4, role: "name" },
    "SPELL NAME 5": { level: 1, row: 5, role: "name" },
    "SPELL NAME 6": { level: 1, row: 6, role: "name" },
    "SPELL NAME 7": { level: 1, row: 7, role: "name" },
    "SPELL NAME 8": { level: 1, row: 8, role: "name" },
    "SPELL NAME 9": { level: 1, row: 9, role: "name" },
    "SPELL NAME 10": { level: 1, row: 10, role: "name" },
    "SPELL NAME 11": { level: 1, row: 11, role: "name" },
    "SPELL NAME 12": { level: 1, row: 12, role: "name" },
    "Check Box 2510": { level: 1, row: 0, role: "prepared" },
    "Check Box 25100": { level: 1, row: 1, role: "prepared" },
    "Check Box 30900": { level: 1, row: 2, role: "prepared" },
    "Check Box 301000": { level: 1, row: 3, role: "prepared" },
    "Check Box 301100": { level: 1, row: 4, role: "prepared" },
    "Check Box 301200": { level: 1, row: 5, role: "prepared" },
    "Check Box 301300": { level: 1, row: 6, role: "prepared" },
    "Check Box 301400": { level: 1, row: 7, role: "prepared" },
    "Check Box 301500": { level: 1, row: 8, role: "prepared" },
    "Check Box 301600": { level: 1, row: 9, role: "prepared" },
    "Check Box 3017": { level: 1, row: 10, role: "prepared" },
    "Check Box 3018": { level: 1, row: 11, role: "prepared" },
    "Check Box 3019": { level: 1, row: 12, role: "prepared" },
    "1_11": { level: 2, row: 0, role: "name" },
    "2_11": { level: 2, row: 1, role: "name" },
    "3_11": { level: 2, row: 2, role: "name" },
    "4_7": { level: 2, row: 3, role: "name" },
    "5_6": { level: 2, row: 4, role: "name" },
    "6_5": { level: 2, row: 5, role: "name" },
    "7_5": { level: 2, row: 6, role: "name" },
    "8_5": { level: 2, row: 7, role: "name" },
    "9_5": { level: 2, row: 8, role: "name" },
    "10_5": { level: 2, row: 9, role: "name" },
    "11_5": { level: 2, row: 10, role: "name" },
    "12_5": { level: 2, row: 11, role: "name" },
    "13_5": { level: 2, row: 12, role: "name" },
    "Check Box 25101": { level: 2, row: 0, role: "prepared" },
    "Check Box 2511": { level: 2, row: 1, role: "prepared" },
    "Check Box 3091": { level: 2, row: 2, role: "prepared" },
    "Check Box 30101": { level: 2, row: 3, role: "prepared" },
    "Check Box 30111": { level: 2, row: 4, role: "prepared" },
    "Check Box 30121": { level: 2, row: 5, role: "prepared" },
    "Check Box 30131": { level: 2, row: 6, role: "prepared" },
    "Check Box 30141": { level: 2, row: 7, role: "prepared" },
    "Check Box 30151": { level: 2, row: 8, role: "prepared" },
    "Check Box 30161": { level: 2, row: 9, role: "prepared" },
    "Check Box 30171": { level: 2, row: 10, role: "prepared" },
    "Check Box 30181": { level: 2, row: 11, role: "prepared" },
    "Check Box 30191": { level: 2, row: 12, role: "prepared" },
    "1_12": { level: 3, row: 0, role: "name" },
    "2_12": { level: 3, row: 1, role: "name" },
    "3_12": { level: 3, row: 2, role: "name" },
    "4_8": { level: 3, row: 3, role: "name" },
    "5_7": { level: 3, row: 4, role: "name" },
    "6_6": { level: 3, row: 5, role: "name" },
    "7_6": { level: 3, row: 6, role: "name" },
    "8_6": { level: 3, row: 7, role: "name" },
    "9_6": { level: 3, row: 8, role: "name" },
    "10_6": { level: 3, row: 9, role: "name" },
    "11_6": { level: 3, row: 10, role: "name" },
    "12_6": { level: 3, row: 11, role: "name" },
    "13_6": { level: 3, row: 12, role: "name" },
    "Check Box 251011": { level: 3, row: 0, role: "prepared" },
    "Check Box 25111": { level: 3, row: 1, role: "prepared" },
    "Check Box 3099": { level: 3, row: 2, role: "prepared" },
    "Check Box 30109": { level: 3, row: 3, role: "prepared" },
    "Check Box 30119": { level: 3, row: 4, role: "prepared" },
    "Check Box 30129": { level: 3, row: 5, role: "prepared" },
    "Check Box 30139": { level: 3, row: 6, role: "prepared" },
    "Check Box 30149": { level: 3, row: 7, role: "prepared" },
    "Check Box 30159": { level: 3, row: 8, role: "prepared" },
    "Check Box 30169": { level: 3, row: 9, role: "prepared" },
    "Check Box 30179": { level: 3, row: 10, role: "prepared" },
    "Check Box 30189": { level: 3, row: 11, role: "prepared" },
    "Check Box 30199": { level: 3, row: 12, role: "prepared" },
    "1_13": { level: 4, row: 0, role: "name" },
    "2_13": { level: 4, row: 1, role: "name" },
    "3_13": { level: 4, row: 2, role: "name" },
    "4_9": { level: 4, row: 3, role: "name" },
    "5_8": { level: 4, row: 4, role: "name" },
    "6_7": { level: 4, row: 5, role: "name" },
    "7_7": { level: 4, row: 6, role: "name" },
    "8_7": { level: 4, row: 7, role: "name" },
    "9_7": { level: 4, row: 8, role: "name" },
    "10_7": { level: 4, row: 9, role: "name" },
    "11_7": { level: 4, row: 10, role: "name" },
    "12_7": { level: 4, row: 11, role: "name" },
    "13_7": { level: 4, row: 12, role: "name" },
    "Check Box 25102": { level: 4, row: 0, role: "prepared" },
    "Check Box 2512": { level: 4, row: 1, role: "prepared" },
    "Check Box 3092": { level: 4, row: 2, role: "prepared" },
    "Check Box 30102": { level: 4, row: 3, role: "prepared" },
    "Check Box 30112": { level: 4, row: 4, role: "prepared" },
    "Check Box 30122": { level: 4, row: 5, role: "prepared" },
    "Check Box 30132": { level: 4, row: 6, role: "prepared" },
    "Check Box 30142": { level: 4, row: 7, role: "prepared" },
    "Check Box 30152": { level: 4, row: 8, role: "prepared" },
    "Check Box 30162": { level: 4, row: 9, role: "prepared" },
    "Check Box 30172": { level: 4, row: 10, role: "prepared" },
    "Check Box 30182": { level: 4, row: 11, role: "prepared" },
    "Check Box 30192": { level: 4, row: 12, role: "prepared" },
    "1_14": { level: 5, row: 0, role: "name" },
    "2_14": { level: 5, row: 1, role: "name" },
    "3_14": { level: 5, row: 2, role: "name" },
    "4_10": { level: 5, row: 3, role: "name" },
    "5_9": { level: 5, row: 4, role: "name" },
    "6_8": { level: 5, row: 5, role: "name" },
    "7_8": { level: 5, row: 6, role: "name" },
    "8_8": { level: 5, row: 7, role: "name" },
    "9_8": { level: 5, row: 8, role: "name" },
    "Check Box 25123": { level: 5, row: 0, role: "prepared" },
    "Check Box 30923": { level: 5, row: 1, role: "prepared" },
    "Check Box 301023": { level: 5, row: 2, role: "prepared" },
    "Check Box 301123": { level: 5, row: 3, role: "prepared" },
    "Check Box 301223": { level: 5, row: 4, role: "prepared" },
    "Check Box 301323": { level: 5, row: 5, role: "prepared" },
    "Check Box 301423": { level: 5, row: 6, role: "prepared" },
    "Check Box 3015": { level: 5, row: 7, role: "prepared" },
    "Check Box 3016": { level: 5, row: 8, role: "prepared" },
    "1_15": { level: 6, row: 0, role: "name" },
    "2_15": { level: 6, row: 1, role: "name" },
    "3_15": { level: 6, row: 2, role: "name" },
    "4_11": { level: 6, row: 3, role: "name" },
    "5_10": { level: 6, row: 4, role: "name" },
    "6_9": { level: 6, row: 5, role: "name" },
    "7_9": { level: 6, row: 6, role: "name" },
    "8_9": { level: 6, row: 7, role: "name" },
    "9_9": { level: 6, row: 8, role: "name" },
    "Check Box 2513": { level: 6, row: 0, role: "prepared" },
    "Check Box 3093": { level: 6, row: 1, role: "prepared" },
    "Check Box 30103": { level: 6, row: 2, role: "prepared" },
    "Check Box 30113": { level: 6, row: 3, role: "prepared" },
    "Check Box 30123": { level: 6, row: 4, role: "prepared" },
    "Check Box 30133": { level: 6, row: 5, role: "prepared" },
    "Check Box 30143": { level: 6, row: 6, role: "prepared" },
    "Check Box 30153": { level: 6, row: 7, role: "prepared" },
    "Check Box 30163": { level: 6, row: 8, role: "prepared" },
    "1_16": { level: 7, row: 0, role: "name" },
    "2_16": { level: 7, row: 1, role: "name" },
    "3_16": { level: 7, row: 2, role: "name" },
    "4_12": { level: 7, row: 3, role: "name" },
    "5_11": { level: 7, row: 4, role: "name" },
    "6_10": { level: 7, row: 5, role: "name" },
    "7_10": { level: 7, row: 6, role: "name" },
    "8_10": { level: 7, row: 7, role: "name" },
    "9_10": { level: 7, row: 8, role: "name" },
    "Check Box 2516": { level: 7, row: 0, role: "prepared" },
    "Check Box 3096": { level: 7, row: 1, role: "prepared" },
    "Check Box 30106": { level: 7, row: 2, role: "prepared" },
    "Check Box 30116": { level: 7, row: 3, role: "prepared" },
    "Check Box 30126": { level: 7, row: 4, role: "prepared" },
    "Check Box 30136": { level: 7, row: 5, role: "prepared" },
    "Check Box 30146": { level: 7, row: 6, role: "prepared" },
    "Check Box 30156": { level: 7, row: 7, role: "prepared" },
    "Check Box 30166": { level: 7, row: 8, role: "prepared" },
    "1_17": { level: 8, row: 0, role: "name" },
    "2_17": { level: 8, row: 1, role: "name" },
    "3_17": { level: 8, row: 2, role: "name" },
    "4_13": { level: 8, row: 3, role: "name" },
    "5_12": { level: 8, row: 4, role: "name" },
    "6_11": { level: 8, row: 5, role: "name" },
    "7_11": { level: 8, row: 6, role: "name" },
    "Check Box 25161": { level: 8, row: 0, role: "prepared" },
    "Check Box 30961": { level: 8, row: 1, role: "prepared" },
    "Check Box 301061": { level: 8, row: 2, role: "prepared" },
    "Check Box 301161": { level: 8, row: 3, role: "prepared" },
    "Check Box 301261": { level: 8, row: 4, role: "prepared" },
    "Check Box 301361": { level: 8, row: 5, role: "prepared" },
    "Check Box 301461": { level: 8, row: 6, role: "prepared" },
    "1_18": { level: 9, row: 0, role: "name" },
    "2_18": { level: 9, row: 1, role: "name" },
    "3_18": { level: 9, row: 2, role: "name" },
    "4_14": { level: 9, row: 3, role: "name" },
    "5_13": { level: 9, row: 4, role: "name" },
    "6_12": { level: 9, row: 5, role: "name" },
    "7_12": { level: 9, row: 6, role: "name" },
    "Check Box 251": { level: 9, row: 0, role: "prepared" },
    "Check Box 309": { level: 9, row: 1, role: "prepared" },
    "Check Box 3010": { level: 9, row: 2, role: "prepared" },
    "Check Box 3011": { level: 9, row: 3, role: "prepared" },
    "Check Box 3012": { level: 9, row: 4, role: "prepared" },
    "Check Box 3013": { level: 9, row: 5, role: "prepared" },
    "Check Box 3014": { level: 9, row: 6, role: "prepared" },
  };

function parseSpells(text: Map<string, string>, check: Map<string, boolean>): KnownSpell[] {
  // riga (livello,row) -> preparato, letto dai checkbox PRIMA dei nomi, in modo che l'ordine di
  // iterazione della mappa non conti.
  const prepared = new Map<string, boolean>();
  for (const [field, meta] of Object.entries(SPELL_FIELD_MAP)) {
    if (meta.role === "prepared" && check.get(field)) {
      prepared.set(`${meta.level}-${meta.row}`, true);
    }
  }
  const spells: KnownSpell[] = [];
  for (const [field, meta] of Object.entries(SPELL_FIELD_MAP)) {
    if (meta.role !== "name") continue;
    const nome = text.get(field)?.trim();
    if (!nome) continue;
    spells.push({
      id: crypto.randomUUID(),
      nome,
      livello: meta.level,
      preparato: meta.level === 0 || prepared.get(`${meta.level}-${meta.row}`) === true,
    });
  }
  return spells;
}

function parseWeapons(text: Map<string, string>): Weapon[] {
  const weapons: Weapon[] = [];
  for (const { name, dmg } of WEAPON_FIELDS) {
    const nome = text.get(name)?.trim();
    if (!nome) continue;
    const { dado, tipo } = parseWeaponDamage(text.get(dmg) ?? "");
    weapons.push({
      id: crypto.randomUUID(),
      nome,
      // "finezza" (il migliore fra Forza e Destrezza) come default sicuro: il PDF non distingue
      // esplicitamente le armi da mischia/a distanza/in finezza, e sbagliare qui è meno grave che
      // indovinare Forza per un'arma pensata in Destrezza (o viceversa) — il giocatore corregge a
      // colpo d'occhio dalla propria scheda.
      caratteristica: "finezza",
      competente: true,
      bonusExtra: 0,
      dadoDanno: dado,
      tipoDanno: tipo,
      aDistanza: false,
    });
  }
  return weapons;
}

function parseLimitedFeatures(text: Map<string, string>, check: Map<string, boolean>): LimitedFeature[] {
  const features: LimitedFeature[] = [];
  for (const f of LIMITED_FEAT_FIELDS) {
    const nome = text.get(f.nome)?.trim();
    if (!nome) continue;
    const usiMax = Math.max(1, toInt(text.get(f.tot), 1));
    const left = text.get(f.left);
    const usiUsati = left ? clamp(usiMax - toInt(left, usiMax), 0, usiMax) : 0;
    const recupero = check.get(f.sr) ? "riposoBreve" : check.get(f.dn) ? "alba" : "riposoLungo";
    features.push({ id: crypto.randomUUID(), nome, usiMax, usiUsati, recupero });
  }
  return features;
}

function parseInventory(text: Map<string, string>): InventoryItem[] {
  const items: InventoryItem[] = [];
  const armor = text.get("Armor")?.trim();
  if (armor) items.push({ id: crypto.randomUUID(), nome: armor, quantita: 1, note: "Armatura", peso: 0 });
  for (const [field, value] of text) {
    if (!/^eq\d+$/.test(field)) continue;
    const nome = value.trim();
    if (!nome) continue;
    // Il peso non viene abbinato riga per riga: i due indici (eqN / PesoN) non sono allineati in
    // modo coerente in tutto il template (colonna sinistra e destra usano numerazioni diverse) —
    // meglio lasciare 0 (già il default dello schema) che rischiare di attribuire un peso sbagliato.
    items.push({ id: crypto.randomUUID(), nome, quantita: 1, note: "", peso: 0 });
  }
  return items;
}

/** Legge un file PDF (bytes) e prova a ricostruirne un Character — vedi il commento in cima al
 * file per il contesto su quale PDF è supportato e perché. Non tocca mai il database/l'account:
 * ritorna solo l'oggetto, il chiamante decide se/come salvarlo (stesso ruolo del parsing JSON per
 * l'import da file esistente, vedi ExportImport in app/personaggi/page.tsx). */
export async function importCharacterFromPdf(bytes: ArrayBuffer): Promise<Character> {
  const { text, check } = await readFields(bytes);

  const nome = text.get("CharacterName")?.trim();
  if (!nome) {
    throw new Error(
      "Non ho trovato un nome personaggio in questo PDF — assicurati che sia una scheda compilata con questo template.",
    );
  }

  const base = newCharacter();

  // Vedi il commento in cima al file: "Background" contiene in realtà il livello, "Alignment" è
  // davvero l'Allineamento, "XP" finisce nel Background per esclusione.
  const classi = parseClasses(text.get("ClassLevel") ?? "", text.get("Background") ?? "");
  const allineamento = matchAlignment(text.get("Alignment") ?? "");
  const background = text.get("XP")?.trim() ?? "";

  const trsCompetenti: Ability[] = [];
  for (const [field, ability] of Object.entries(ABILITY_SAVE_FIELD)) {
    if (check.get(field)) trsCompetenti.push(ability);
  }

  const abilitaCompetenti: string[] = [];
  const abilitaEsperte: string[] = [];
  for (const [code, nomeAbilita] of Object.entries(SKILL_CODE_TO_NAME)) {
    if (check.get(`${code}PE`)) abilitaEsperte.push(nomeAbilita);
    else if (check.get(`${code}P`)) abilitaCompetenti.push(nomeAbilita);
  }

  const hpMax = Math.max(1, toInt(text.get("HPMax"), base.hpMax));
  const hpAttualiRaw = text.get("HPCurrent");
  const visioneRadius = Math.max(0, toInt(text.get("Vision"), 0));

  const talentiRaw = text.get("Talenti1") ?? "";
  const talenti: KnownFeat[] = talentiRaw
    .split(/\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((nome) => ({ id: crypto.randomUUID(), nome }));

  const oggettiArmonizzati = [
    text.get("AttunedMagic 1"),
    text.get("AttunedMagic 2"),
    text.get("AttunedMagic 3"),
  ]
    .map((v) => v?.trim())
    .filter((v): v is string => !!v);

  const linguaggi = [text.get("Languages 1"), text.get("Languages 2")]
    .filter((v): v is string => !!v)
    .flatMap((v) => v.split(","))
    .map((s) => s.trim())
    .filter(Boolean);

  // Testi lunghi (tratti razziali, capacità di classe...) senza un posto strutturato dedicato in
  // scheda — finiscono nelle Note libere invece di essere scartati in silenzio.
  const flavorBlocks = [text.get("Testo2"), text.get("Testo3"), text.get("Testo6")]
    .map((v) => v?.trim())
    .filter((v): v is string => !!v);
  const note =
    flavorBlocks.length > 0
      ? `— Tratti razziali e di classe (importati dal PDF) —\n\n${flavorBlocks.join("\n\n")}`
      : "";

  const totalLevelValue = classi.reduce((sum, c) => sum + c.livello, 0);

  const character: Character = {
    ...base,
    id: crypto.randomUUID(),
    nome,
    classi,
    razza: text.get("Race")?.trim() ?? "",
    hpMax,
    hpAttuali: hpAttualiRaw ? clamp(toInt(hpAttualiRaw, hpMax), 0, hpMax) : hpMax,
    hpTemporanei: Math.max(0, toInt(text.get("HPTemp"), 0)),
    classeArmatura: Math.max(1, toInt(text.get("AC"), base.classeArmatura)),
    velocita: Math.max(0, toInt(text.get("Speed"), base.velocita)),
    visioneRadius,
    scurovisione: visioneRadius > 0,
    caratteristiche: {
      forza: clamp(toInt(text.get("STR"), 10), 1, 30),
      destrezza: clamp(toInt(text.get("DEX"), 10), 1, 30),
      costituzione: clamp(toInt(text.get("CON"), 10), 1, 30),
      intelligenza: clamp(toInt(text.get("INT"), 10), 1, 30),
      saggezza: clamp(toInt(text.get("WIS"), 10), 1, 30),
      carisma: clamp(toInt(text.get("CHA"), 10), 1, 30),
    },
    trsCompetenti,
    abilitaCompetenti,
    abilitaEsperte,
    esperienza: XP_PER_LEVEL[clamp(totalLevelValue, 1, 20) - 1],
    allineamento,
    background,
    tratti: text.get("Tratti car")?.trim() ?? "",
    legami: text.get("LEgami1")?.trim() ?? "",
    ideali: text.get("Ideali1")?.trim() ?? "",
    difetti: text.get("DIfetti1")?.trim() ?? "",
    nemici: text.get("Nemici1")?.trim() ?? "",
    eta: text.get("AGE")?.trim() ?? "",
    altezza: text.get("HEIGHT")?.trim() ?? "",
    peso: text.get("WEIGHT")?.trim() ?? "",
    occhi: text.get("EYES")?.trim() ?? "",
    carnagione: text.get("SKIN")?.trim() ?? "",
    capelli: text.get("HAIR")?.trim() ?? "",
    ispirazione: [1, 2, 3, 4].some((n) => check.get(`insp${n}`)),
    affaticamento: clamp(toInt(text.get("Exhaustion"), 0), 0, 6),
    livelloFollia: clamp(toInt(text.get("MadnessLvl"), 0), 0, 6),
    oggettiArmonizzati,
    privilegiLimitati: parseLimitedFeatures(text, check),
    linguaggi,
    inventario: parseInventory(text),
    monete: {
      oro: Math.max(0, toInt(text.get("GP"), 0)),
      argento: Math.max(0, toInt(text.get("SP"), 0)),
      rame: Math.max(0, toInt(text.get("CP"), 0)),
    },
    incantesimi: parseSpells(text, check),
    armi: parseWeapons(text),
    talenti,
    note,
  };

  return characterSchema.parse(character);
}
