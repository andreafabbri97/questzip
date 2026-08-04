"use server";

import { askGemini } from "@/lib/gemini";

/** Bozza di testo per un handout di campagna (lettera, cartello, iscrizione, volantino...) — MAI
 * salvata da sola: finisce nel campo testo del form di creazione, il master la rivede/modifica
 * come farebbe con un testo scritto da un giocatore, prima del salvataggio esplicito di sempre.
 * Ritorna null se l'IA non è disponibile o se qualcosa va storto — è un comodo extra opzionale,
 * scrivere un handout a mano resta sempre possibile. */
export async function generateHandoutDraft(titolo: string, hint: string): Promise<string | null> {
  const trimmedTitle = titolo.trim();
  if (!trimmedTitle) return null;

  const prompt = `Sei l'assistente di un master di Dungeons & Dragons 5ª edizione. Scrivi il testo di un handout — un documento che il master mostra ai giocatori (una lettera, un'iscrizione, un cartello, un frammento di diario...) — con questo titolo: "${trimmedTitle}".${
    hint.trim() ? ` Indicazioni aggiuntive del master: ${hint.trim()}.` : ""
  } Scrivi in italiano, nello stile e nella persona appropriati al tipo di documento — il TESTO del documento stesso, non una descrizione esterna di cosa contiene. Massimo 150 parole. Non usare markdown (niente **asterischi**, niente # per i titoli): il testo finisce in un campo semplice, non renderizzato. Rispondi SOLO col testo dell'handout, senza titoli, virgolette o spiegazioni aggiuntive.`;

  return askGemini({ prompt });
}
