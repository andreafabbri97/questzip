"use server";

import { geminiEnabled } from "@/lib/gemini";

/** true solo se GEMINI_API_KEY è configurata sul server — usata da ogni superficie IA (import
 * PDF/foto, assistente regole, riassunto sessioni, bozze handout) per decidere se mostrare
 * affatto un'opzione IA in UI, senza dover tentare una chiamata vera solo per scoprirlo. Un solo
 * punto condiviso invece di una copia per feature. */
export async function isAiAvailable() {
  return geminiEnabled();
}
