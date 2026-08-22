"use server";

import { askGemini } from "@/lib/gemini";
import { requireUserId } from "@/lib/campaign-auth";

// Ogni bozza richiede un utente autenticato. Non è una formalità: /campagne è deliberatamente
// raggiungibile SENZA login (auth.ts la lascia aperta perché mostra lei stessa il "Accedi con
// Google"), e generateCampaignDraft è invocata proprio da quella pagina — senza questo controllo
// chiunque, senza account, poteva bruciare la quota Gemini gratuita del progetto, lasciando il
// gruppo senza assistente per il resto della giornata.

/** Bozza di testo per un handout di campagna (lettera, cartello, iscrizione, volantino...) — MAI
 * salvata da sola: finisce nel campo testo del form di creazione, il master la rivede/modifica
 * come farebbe con un testo scritto da un giocatore, prima del salvataggio esplicito di sempre.
 * Ritorna null se l'IA non è disponibile o se qualcosa va storto — è un comodo extra opzionale,
 * scrivere un handout a mano resta sempre possibile. */
export async function generateHandoutDraft(titolo: string, hint: string): Promise<string | null> {
  await requireUserId();
  const trimmedTitle = titolo.trim();
  if (!trimmedTitle) return null;

  const prompt = `Sei l'assistente di un master di Dungeons & Dragons 5ª edizione. Scrivi il testo di un handout — un documento che il master mostra ai giocatori (una lettera, un'iscrizione, un cartello, un frammento di diario...) — con questo titolo: "${trimmedTitle}".${
    hint.trim() ? ` Indicazioni aggiuntive del master: ${hint.trim()}.` : ""
  } Scrivi in italiano, nello stile e nella persona appropriati al tipo di documento — il TESTO del documento stesso, non una descrizione esterna di cosa contiene. Massimo 150 parole. Non usare markdown (niente **asterischi**, niente # per i titoli): il testo finisce in un campo semplice, non renderizzato. Rispondi SOLO col testo dell'handout, senza titoli, virgolette o spiegazioni aggiuntive.`;

  return askGemini({ prompt });
}

/** Bozza di descrizione per un NPC (rubrica del master) — stesso principio di
 * generateHandoutDraft: mai salvata da sola, il master la rivede prima di confermare. */
export async function generateNpcDraft(nome: string, hint: string): Promise<string | null> {
  await requireUserId();
  const trimmedName = nome.trim();
  if (!trimmedName) return null;

  const prompt = `Sei l'assistente di un master di Dungeons & Dragons 5ª edizione. Scrivi una scheda sintetica per il PNG "${trimmedName}", pensata per essere consultata al volo dal master DURANTE la sessione: aspetto fisico in una frase, personalità/modo di parlare, motivazione o segreto principale, un dettaglio memorabile.${
    hint.trim() ? ` Indicazioni aggiuntive del master: ${hint.trim()}.` : ""
  } Scrivi in italiano. Massimo 120 parole. Non usare markdown (niente **asterischi**, niente # per i titoli): il testo finisce in un campo semplice, non renderizzato. Rispondi SOLO col testo della scheda, senza titoli, virgolette o spiegazioni aggiuntive.`;

  return askGemini({ prompt });
}

/** Bozza di ambientazione/trama per una NUOVA campagna (form di creazione) — stesso principio di
 * generateHandoutDraft: mai salvata da sola, finisce nel campo descrizione e il futuro master la
 * rivede/modifica prima di premere "Crea". A differenza degli altri generatori qui sopra non c'è
 * ancora nessun dato di campagna nel Compendio da ancorare: il prompt lavora solo dal nome. */
export async function generateCampaignDraft(nome: string, hint: string): Promise<string | null> {
  await requireUserId();
  const trimmedName = nome.trim();
  if (!trimmedName) return null;

  const prompt = `Sei l'assistente di un aspirante master di Dungeons & Dragons 5ª edizione che sta per creare una nuova campagna intitolata "${trimmedName}". Scrivi una breve presentazione della campagna ad uso del master: ambientazione e tono generale, la situazione di partenza, un gancio di trama iniziale per coinvolgere il gruppo.${
    hint.trim() ? ` Indicazioni aggiuntive del master: ${hint.trim()}.` : ""
  } Scrivi in italiano. Massimo 120 parole. Non usare markdown (niente **asterischi**, niente # per i titoli): il testo finisce in un campo semplice, non renderizzato. Rispondi SOLO col testo della presentazione, senza titoli, virgolette o spiegazioni aggiuntive.`;

  return askGemini({ prompt });
}

/** Bozza di descrizione/aggancio per una trama (tracciatore quest del master) — stesso principio
 * di generateHandoutDraft: mai salvata da sola, il master la rivede prima di confermare. */
export async function generateQuestDraft(titolo: string, hint: string): Promise<string | null> {
  await requireUserId();
  const trimmedTitle = titolo.trim();
  if (!trimmedTitle) return null;

  const prompt = `Sei l'assistente di un master di Dungeons & Dragons 5ª edizione. Scrivi una breve descrizione per la trama/missione "${trimmedTitle}", ad uso del master: qual è l'obiettivo, chi/cosa la muove, un possibile ostacolo o colpo di scena.${
    hint.trim() ? ` Indicazioni aggiuntive del master: ${hint.trim()}.` : ""
  } Scrivi in italiano. Massimo 120 parole. Non usare markdown (niente **asterischi**, niente # per i titoli): il testo finisce in un campo semplice, non renderizzato. Rispondi SOLO col testo della descrizione, senza titoli, virgolette o spiegazioni aggiuntive.`;

  return askGemini({ prompt });
}
