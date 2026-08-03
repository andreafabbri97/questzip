"use server";

import { getCampaign } from "@/app/actions/campaigns";
import { getCampaignChatMessages } from "@/app/actions/chat";
import { askGemini } from "@/lib/gemini";

// Tetto sui caratteri passati al modello — la chat di campagna può arrivare a 150 messaggi
// (limite di getCampaignChatMessages), non serve mandarli tutti se il riassunto copre solo
// l'ultima sessione: taglia dalla fine (i messaggi più vecchi/meno rilevanti), non dall'inizio.
const MAX_TRANSCRIPT_CHARS = 12000;

/** Riassunto IA della chat di campagna da un certo punto in poi (di solito l'ultima nota di
 * sessione salvata) — pensato per precompilare il form "nuova nota" nel diario, MAI salvato in
 * automatico: il master lo rivede/modifica prima di confermare (stesso principio delle bozze di
 * contenuto per gli Handout). Ritorna null se l'IA non è disponibile, se non ci sono messaggi nel
 * periodo, o se qualunque cosa va storta — mai un'eccezione: è un comodo extra opzionale, non un
 * passaggio richiesto per usare il diario di sessione. `getCampaign`/`getCampaignChatMessages`
 * verificano già da soli che l'utente sia membro della campagna, non serve ripeterlo qui. */
export async function summarizeSession(
  campaignId: string,
  sinceIso: string | null,
): Promise<string | null> {
  const [detail, messages] = await Promise.all([
    getCampaign(campaignId),
    getCampaignChatMessages(campaignId),
  ]);
  if (!detail) return null;

  const since = sinceIso ? new Date(sinceIso) : null;
  const relevant = since ? messages.filter((m) => new Date(m.createdAt) > since) : messages;
  if (relevant.length === 0) return null;

  const nameById = new Map(detail.members.map((m) => [m.userId, m.name ?? "Qualcuno"]));
  let transcript = relevant.map((m) => `${nameById.get(m.authorId) ?? "Qualcuno"}: ${m.testo}`).join("\n");
  if (transcript.length > MAX_TRANSCRIPT_CHARS) {
    transcript = transcript.slice(-MAX_TRANSCRIPT_CHARS);
  }

  const prompt = `Sei l'assistente di un master di Dungeons & Dragons 5ª edizione. Leggi questo estratto della chat della campagna "${detail.campaign.nome}" e scrivi un riassunto in italiano della sessione di gioco (3-6 frasi, in terza persona, focalizzato sugli eventi narrativi/di gioco — ignora i messaggi puramente organizzativi tipo "ci vediamo alle 21" o le menzioni del Compendio). Rispondi SOLO col testo del riassunto, senza titoli né introduzioni.\n\n${transcript}`;

  return askGemini({ prompt });
}
