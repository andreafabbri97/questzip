import { GoogleGenAI, createPartFromBase64, createUserContent, type Content } from "@google/genai";

/**
 * Wrapper minimo per Gemini (server-side only, mai importato da un componente client — la chiave
 * non deve mai finire nel bundle del browser). Stesso trattamento di "servizio esterno opzionale"
 * già usato per PartyKit (lib/party.ts) e le notifiche push (lib/push.ts): se non configurato, o
 * se la chiamata fallisce per qualunque motivo (quota esaurita, rete, chiave invalida), le funzioni
 * IA ritornano semplicemente `null` — MAI un'eccezione che risale fino all'utente. Ogni chiamante
 * gestisce il `null` mostrando "assistente non disponibile" invece di rompersi: l'app deve
 * funzionare per intero anche senza IA, l'IA è solo un extra quando c'è.
 */

let client: GoogleGenAI | null | undefined;

function getClient(): GoogleGenAI | null {
  if (client !== undefined) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  client = apiKey ? new GoogleGenAI({ apiKey }) : null;
  return client;
}

// I nomi dei modelli Gemini cambiano spesso (nuove versioni, ritiri) — un env var con default
// evita di dover toccare il codice quando Google ne rilascia uno nuovo o ne ritira uno vecchio.
const DEFAULT_MODEL = "gemini-2.5-flash";

export interface AskGeminiInput {
  prompt: string;
  /** Un file allegato (es. un PDF) da far leggere al modello insieme al prompt — Gemini accetta
   * PDF direttamente come contenuto multimodale, non serve rasterizzare le pagine a mano. */
  attachment?: { bytes: ArrayBuffer; mimeType: string };
}

/** Chiede a Gemini una risposta testuale libera. Ritorna null se l'IA non è configurata o se
 * qualunque cosa va storta — mai un'eccezione. */
export async function askGemini({ prompt, attachment }: AskGeminiInput): Promise<string | null> {
  const ai = getClient();
  if (!ai) return null;

  try {
    const parts = attachment
      ? [
          createPartFromBase64(Buffer.from(attachment.bytes).toString("base64"), attachment.mimeType),
          prompt,
        ]
      : prompt;
    const contents: Content[] = [createUserContent(parts)];

    const response = await ai.models.generateContent({
      model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
      contents,
    });
    return response.text?.trim() || null;
  } catch {
    // Quota esaurita, rete assente, chiave invalida... qualunque causa, stesso esito: l'assistente
    // IA risulta "non disponibile" per questa richiesta, il resto dell'app non ne risente.
    return null;
  }
}

/** true solo se GEMINI_API_KEY è configurata — usata lato server action per decidere se mostrare
 * affatto un'opzione IA in UI (es. il bottone "Importa con IA"), senza dover tentare una vera
 * chiamata solo per scoprire che non è disponibile. */
export function geminiEnabled(): boolean {
  return getClient() !== null;
}
