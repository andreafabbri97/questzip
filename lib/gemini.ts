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

// "gemini-flash-lite-latest": alias mantenuto da Google (punta sempre al modello Flash-Lite più
// recente, resistente al ritiro dei modelli con versione fissa — verificato: "gemini-2.5-flash"
// risulta già non più disponibile per chi ha creato la chiave di recente). Preferito alla
// variante "flash" piena: quota giornaliera gratuita separata (verificato con una chiave di
// prova: la variante piena l'ha esaurita a ~20 richieste/giorno, la lite no) e comunque adeguata
// per compiti come estrazione strutturata/domande sul Compendio, non ragionamento complesso.
// GEMINI_MODEL resta disponibile per chi vuole un modello più pesante (es. un piano a pagamento).
const DEFAULT_MODEL = "gemini-flash-lite-latest";

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
