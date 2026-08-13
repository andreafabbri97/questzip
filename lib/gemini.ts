import { ApiError, GoogleGenAI, createPartFromBase64, createUserContent, type Content } from "@google/genai";

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

// Ogni modello Gemini ha una quota RPD (richieste/giorno) SEPARATA sul livello gratuito —
// verificato il 13/08/2026 sulla dashboard aistudio.google.com/rate-limit del progetto dedicato a
// QuestZip: gemini-3.5-flash-lite ha 500 RPD, tutti gli altri modelli di testo (Flash "pieno" di
// ogni generazione, e la Flash-Lite di una generazione più vecchia) si fermano a 20 RPD. Invece di
// dipendere da un solo modello, si prova la catena in ordine di quota decrescente e si passa al
// successivo SOLO quando quello attuale segnala 429 (quota esaurita) — così un giorno di traffico
// più intenso del solito non lascia l'assistente IA "non disponibile" finché non resta esaurita
// anche la somma di tutte le quote, non solo la prima. "gemini-flash-lite-latest" è un alias
// mantenuto da Google (punta sempre al Flash-Lite più recente, oggi gemini-3.5-flash-lite,
// resistente al ritiro dei modelli con versione fissa — verificato: "gemini-2.5-flash" da solo
// risulta già non più disponibile per chi ha creato la chiave di recente), tenuto comunque per
// primo perché è la quota di gran lunga più ampia. Il resto della catena usa ID fissi perché sono
// scelti apposta come RISERVA aggiuntiva, non l'ultima versione — se un domani "-latest" punta
// altrove va bene lo stesso, sono comunque modelli Flash/Flash-Lite adeguati per compiti come
// estrazione strutturata/domande sul Compendio, non ragionamento complesso.
const MODEL_FALLBACK_CHAIN = [
  "gemini-flash-lite-latest",
  "gemini-2.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
];

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

  const parts = attachment
    ? [createPartFromBase64(Buffer.from(attachment.bytes).toString("base64"), attachment.mimeType), prompt]
    : prompt;
  const contents: Content[] = [createUserContent(parts)];

  // GEMINI_MODEL forza UN solo modello specifico (es. un piano a pagamento pensato apposta per
  // quello) — chi lo imposta esplicitamente non vuole un fallback automatico su altri modelli.
  // Senza override, si scorre MODEL_FALLBACK_CHAIN passando al successivo solo su 429 (quota
  // esaurita): altri errori (rete, chiave invalida, richiesta malformata) fallirebbero comunque su
  // ogni modello della catena, quindi non ha senso sprecarci sopra la quota degli altri.
  const models = process.env.GEMINI_MODEL ? [process.env.GEMINI_MODEL] : MODEL_FALLBACK_CHAIN;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({ model, contents });
      return response.text?.trim() || null;
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) continue;
      return null;
    }
  }
  return null;
}

/** true solo se GEMINI_API_KEY è configurata — usata lato server action per decidere se mostrare
 * affatto un'opzione IA in UI (es. il bottone "Importa con IA"), senza dover tentare una vera
 * chiamata solo per scoprire che non è disponibile. */
export function geminiEnabled(): boolean {
  return getClient() !== null;
}
