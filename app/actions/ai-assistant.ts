"use server";

import { MENTION_KIND_LABELS, searchMentionCandidates } from "@/lib/fivetools/mention-search";
import { askGemini } from "@/lib/gemini";

const WORD_RE = /[\p{L}'’]+/gu;
// Quanti abbinamenti al Compendio si allegano al prompt come contesto — un tetto basso apposta,
// serve solo a confermare al modello "questi nomi sono voci vere del Compendio, con questa
// fonte", non a costruire un vero indice di ricerca.
const MAX_HINTS = 6;

// Grounding leggero (non un vero RAG): prova finestre di 1-3 parole della domanda contro
// l'elenco già in cache di lib/fivetools/mention-search.ts (lo stesso usato per i mention "#" in
// chat) — se qualcosa combacia, il modello sa che è una voce vera del Compendio con la sua fonte
// ufficiale, invece di doverlo indovinare a memoria.
async function findGroundingHints(question: string): Promise<string[]> {
  const words = (question.match(WORD_RE) ?? []).filter((w) => w.length >= 3);
  const phrases = new Set<string>();
  for (let size = 1; size <= 3; size++) {
    for (let i = 0; i + size <= words.length; i++) {
      phrases.add(words.slice(i, i + size).join(" "));
    }
  }

  const candidateLists = await Promise.all(
    [...phrases].slice(0, 30).map((phrase) => searchMentionCandidates(phrase, 2)),
  );

  const seen = new Set<string>();
  const hints: string[] = [];
  for (const list of candidateLists) {
    for (const candidate of list) {
      const key = `${candidate.kind}:${candidate.name}:${candidate.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hints.push(
        `${MENTION_KIND_LABELS[candidate.kind]} "${candidate.nameIta ?? candidate.name}" (fonte: ${candidate.source})`,
      );
      if (hints.length >= MAX_HINTS) return hints;
    }
  }
  return hints;
}

/** Assistente regole D&D 5e in chat — pensato per una domanda veloce al tavolo ("quanto danno fa
 * X", "come funziona Y"), non una conversazione multi-turno. Ritorna null se l'IA non è
 * disponibile o se qualcosa va storto: la risposta compare accompagnata da un avviso di
 * verificare le regole ufficiali in caso di dubbio (vedi il componente che la mostra), non va mai
 * trattata come fonte definitiva. */
export async function askRulesAssistant(question: string): Promise<string | null> {
  const trimmed = question.trim().slice(0, 500);
  if (!trimmed) return null;

  const hints = await findGroundingHints(trimmed).catch(() => [] as string[]);
  const context =
    hints.length > 0
      ? `Voci del Compendio di QuestZip che sembrano rilevanti alla domanda (usale come riferimento se pertinenti, ignorale se non c'entrano):\n${hints.join("\n")}\n\n`
      : "";

  const prompt = `Sei un assistente esperto delle regole di Dungeons & Dragons 5ª edizione (sia edizione 2014 sia 2024). Rispondi in italiano, in modo breve e diretto (massimo 4-5 frasi, niente titoli/elenchi puntati a meno che non aiutino davvero la chiarezza). Se la domanda non riguarda le regole di D&D 5e, dillo chiaramente invece di rispondere a caso.\n\n${context}Domanda: ${trimmed}`;

  return askGemini({ prompt });
}
