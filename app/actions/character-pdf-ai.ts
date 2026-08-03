"use server";

import { requireUserId } from "@/lib/campaign-auth";
import {
  characterSchema,
  newCharacter,
  type Character,
  type ClassEntry,
  type InventoryItem,
  type KnownFeat,
  type KnownSpell,
  type Weapon,
} from "@/lib/dnd";
import { askGemini } from "@/lib/gemini";
import { clamp } from "@/lib/pdf-character-import";

const PROMPT = `Sei un assistente che estrae dati da una scheda di personaggio di Dungeons & Dragons 5ª edizione, allegata come PDF o foto. Rispondi SOLO con un oggetto JSON valido, senza testo introduttivo, senza spiegazioni, senza blocchi markdown — solo il JSON, con esattamente questa forma:

{
  "nome": string,
  "razza": string,
  "classi": [{ "nome": string, "livello": number }],
  "caratteristiche": { "forza": number, "destrezza": number, "costituzione": number, "intelligenza": number, "saggezza": number, "carisma": number },
  "hpMax": number,
  "hpAttuali": number,
  "classeArmatura": number,
  "velocita": number,
  "background": string,
  "allineamento": string,
  "tratti": string,
  "ideali": string,
  "legami": string,
  "difetti": string,
  "linguaggi": [string],
  "incantesimi": [{ "nome": string, "livello": number }],
  "armi": [{ "nome": string, "dadoDanno": string }],
  "inventario": [string],
  "talenti": [string],
  "note": string
}

Traduci in italiano se la scheda originale è in un'altra lingua. Per ogni campo che non riesci a leggere con sicurezza, usa una stringa vuota, un array vuoto o 0 — non inventare un valore plausibile al posto di un dato mancante o illeggibile. Eccezione: se "hpAttuali" non è scritto esplicitamente sulla scheda, usa lo stesso valore di "hpMax" invece di 0 (un personaggio appena creato ha i punti ferita pieni, non a zero).`;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function mapAiResultToCharacter(parsed: unknown): Character {
  const obj = asObject(parsed);
  const base = newCharacter();
  const nome = asString(obj.nome);
  if (!nome) {
    throw new Error("Non sono riuscito a leggere un nome personaggio in questo file.");
  }

  const car = asObject(obj.caratteristiche);
  const hpMax = Math.max(1, Math.round(asNumber(obj.hpMax, base.hpMax)));

  const classi: ClassEntry[] = asArray(obj.classi)
    .map(asObject)
    .map((c) => ({ nome: asString(c.nome), livello: clamp(Math.round(asNumber(c.livello, 1)), 1, 20) }))
    .filter((c) => c.nome);

  const incantesimi: KnownSpell[] = asArray(obj.incantesimi)
    .map(asObject)
    .map((s) => ({
      id: crypto.randomUUID(),
      nome: asString(s.nome),
      livello: clamp(Math.round(asNumber(s.livello, 0)), 0, 9),
      preparato: false,
    }))
    .filter((s) => s.nome);

  const armi: Weapon[] = asArray(obj.armi)
    .map(asObject)
    .map((w) => ({
      id: crypto.randomUUID(),
      nome: asString(w.nome),
      // Stessa scelta prudente del parser deterministico (vedi lib/pdf-character-import.ts):
      // "finezza" (il migliore fra Forza e Destrezza) come default sicuro quando non è possibile
      // saperlo con certezza.
      caratteristica: "finezza" as const,
      competente: true,
      bonusExtra: 0,
      dadoDanno: asString(w.dadoDanno, "1d6"),
      tipoDanno: "",
      aDistanza: false,
    }))
    .filter((w) => w.nome);

  const inventario: InventoryItem[] = asArray(obj.inventario)
    .map((v) => asString(v))
    .filter(Boolean)
    .map((nome) => ({ id: crypto.randomUUID(), nome, quantita: 1, note: "", peso: 0 }));

  const talenti: KnownFeat[] = asArray(obj.talenti)
    .map((v) => asString(v))
    .filter(Boolean)
    .map((nome) => ({ id: crypto.randomUUID(), nome }));

  const linguaggi = asArray(obj.linguaggi)
    .map((v) => asString(v))
    .filter(Boolean);

  return {
    ...base,
    id: crypto.randomUUID(),
    nome,
    razza: asString(obj.razza),
    classi: classi.length > 0 ? classi : base.classi,
    caratteristiche: {
      forza: clamp(Math.round(asNumber(car.forza, 10)), 1, 30),
      destrezza: clamp(Math.round(asNumber(car.destrezza, 10)), 1, 30),
      costituzione: clamp(Math.round(asNumber(car.costituzione, 10)), 1, 30),
      intelligenza: clamp(Math.round(asNumber(car.intelligenza, 10)), 1, 30),
      saggezza: clamp(Math.round(asNumber(car.saggezza, 10)), 1, 30),
      carisma: clamp(Math.round(asNumber(car.carisma, 10)), 1, 30),
    },
    hpMax,
    hpAttuali: clamp(Math.round(asNumber(obj.hpAttuali, hpMax)), 0, hpMax),
    classeArmatura: Math.max(1, Math.round(asNumber(obj.classeArmatura, base.classeArmatura))),
    velocita: Math.max(0, Math.round(asNumber(obj.velocita, base.velocita))),
    background: asString(obj.background),
    allineamento: asString(obj.allineamento),
    tratti: asString(obj.tratti),
    ideali: asString(obj.ideali),
    legami: asString(obj.legami),
    difetti: asString(obj.difetti),
    linguaggi,
    incantesimi,
    armi,
    inventario,
    talenti,
    note: asString(obj.note),
  };
}

/** Fallback per PDF/foto NON riconosciuti da lib/pdf-character-import.ts (template diverso dal
 * nostro, scheda fotografata, ecc.) — chiamato solo su conferma esplicita dell'utente (vedi
 * ExportImport in app/personaggi/page.tsx), dato che il file viene inviato a Google per
 * l'analisi. Se l'IA non è configurata o non risponde, lancia un errore chiaro invece di un
 * personaggio vuoto/corrotto — mai fidarsi ciecamente dell'output di un modello: il risultato
 * passa comunque per characterSchema.parse() come ultima rete di sicurezza. */
export async function importCharacterFromPdfWithAi(
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<Character> {
  await requireUserId();

  const raw = await askGemini({ prompt: PROMPT, attachment: { bytes, mimeType } });
  if (!raw) {
    throw new Error("L'assistente IA non è disponibile in questo momento. Riprova più tardi.");
  }

  let parsed: unknown;
  try {
    // Gemini a volte avvolge il JSON in un blocco ```json ... ``` nonostante l'istruzione
    // esplicita di non farlo — rimosso qui invece di irrigidire il prompt.
    const cleaned = raw
      .replace(/^```(json)?/i, "")
      .replace(/```$/, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("L'IA non è riuscita a leggere questo file in un formato utilizzabile.");
  }

  return characterSchema.parse(mapAiResultToCharacter(parsed));
}
