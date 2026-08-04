"use server";

import {
  loadBackgrounds,
  loadClassData,
  loadConditions,
  loadCreatures,
  loadFeats,
  loadItems,
  loadRaces,
  loadSpells,
} from "@/lib/fivetools/data";
import { flattenEntries } from "@/lib/fivetools/entries";
import { MENTION_KIND_LABELS, searchMentionCandidates, type MentionCandidate } from "@/lib/fivetools/mention-search";
import { askGemini } from "@/lib/gemini";

const WORD_RE = /[\p{L}'’]+/gu;
// Quante voci del Compendio si allegano al prompt come contesto ricco (statistiche + testo
// descrittivo, non solo il nome) — un tetto basso ma con contenuto denso, per restare entro una
// dimensione ragionevole del prompt anche quando la domanda cita più cose insieme.
const MAX_HINTS = 4;
const MAX_EXCERPT_CHARS = 700;

// Grounding vero (non solo "questo nome esiste"): prova finestre di 1-3 parole della domanda
// contro l'elenco già in cache di lib/fivetools/mention-search.ts (lo stesso usato per i mention
// "#" in chat), poi per ogni voce trovata recupera i dati REALI dal Compendio — statistiche e
// testo descrittivo, non solo nome/fonte — così il modello risponde sui dati di QuestZip invece
// di doverli ricordare a memoria (dove può sbagliare, specie su dettagli numerici precisi).
async function findMatchingCandidates(question: string): Promise<MentionCandidate[]> {
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
  const matches: MentionCandidate[] = [];
  for (const list of candidateLists) {
    for (const candidate of list) {
      const key = `${candidate.kind}:${candidate.name}:${candidate.source}`;
      if (seen.has(key)) continue;
      seen.add(key);
      matches.push(candidate);
      if (matches.length >= MAX_HINTS) return matches;
    }
  }
  return matches;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// Un estrattore per tipo di voce, perché la forma dei dati grezzi (5etools) è diversa per
// ciascuno — spell/mostro/oggetto/razza hanno campi statistici propri, non un blocco di testo
// unico. flattenEntries (già usata per la traduzione automatica del Compendio) appiattisce il
// testo descrittivo ricco in blocchi di stringhe semplici, qui uniti e troncati.
async function buildEntryContext(candidate: MentionCandidate): Promise<string | null> {
  const label = MENTION_KIND_LABELS[candidate.kind];
  const displayName = candidate.nameIta ?? candidate.name;
  const matchesCandidate = (row: { name: string; source: string }) =>
    row.name === candidate.name && row.source === candidate.source;

  switch (candidate.kind) {
    case "incantesimi": {
      const spell = (await loadSpells()).find(matchesCandidate);
      if (!spell) return null;
      const components = [
        spell.components?.v && "V",
        spell.components?.s && "S",
        spell.components?.m && "M",
      ]
        .filter(Boolean)
        .join(", ");
      const text = truncate(flattenEntries(spell.entries).join(" "), MAX_EXCERPT_CHARS);
      return `${label} "${displayName}" (${candidate.source}) — livello ${spell.level}, scuola ${spell.school}${components ? `, componenti ${components}` : ""}. ${text}`;
    }
    case "mostri": {
      const creature = (await loadCreatures()).find(matchesCandidate);
      if (!creature) return null;
      const cr = typeof creature.cr === "object" ? creature.cr?.cr : creature.cr;
      const hp = typeof creature.hp === "object" ? creature.hp?.average : creature.hp;
      const acEntry = creature.ac?.[0];
      const ac = typeof acEntry === "object" ? acEntry?.ac : acEntry;
      return `${label} "${displayName}" (${candidate.source}) — Grado Sfida ${cr ?? "?"}, CA ${ac ?? "?"}, PF ${hp ?? "?"}, caratteristiche FOR ${creature.str} DES ${creature.dex} COS ${creature.con} INT ${creature.int} SAG ${creature.wis} CAR ${creature.cha}.`;
    }
    case "oggetti": {
      const item = (await loadItems()).find(matchesCandidate);
      if (!item) return null;
      const text = truncate(flattenEntries(item.entries).join(" "), MAX_EXCERPT_CHARS);
      return `${label} "${displayName}" (${candidate.source}) — rarità ${item.rarity ?? "sconosciuta"}${item.reqAttune ? ", richiede sintonia" : ""}. ${text}`;
    }
    case "razze": {
      const race = (await loadRaces()).find(matchesCandidate);
      if (!race) return null;
      const text = truncate(flattenEntries(race.entries).join(" "), MAX_EXCERPT_CHARS);
      return `${label} "${displayName}" (${candidate.source})${race.darkvision ? `, scurovisione ${race.darkvision} piedi` : ""}. ${text}`;
    }
    case "talenti": {
      const feat = (await loadFeats()).find(matchesCandidate);
      if (!feat) return null;
      const text = truncate(flattenEntries(feat.entries).join(" "), MAX_EXCERPT_CHARS);
      return `${label} "${displayName}" (${candidate.source}). ${text}`;
    }
    case "background": {
      const row = (await loadBackgrounds()).find(matchesCandidate);
      if (!row) return null;
      const text = truncate(flattenEntries(row.entries).join(" "), MAX_EXCERPT_CHARS);
      return `${label} "${displayName}" (${candidate.source}). ${text}`;
    }
    case "condizioni": {
      const row = (await loadConditions()).find(matchesCandidate);
      if (!row) return null;
      const text = truncate(flattenEntries(row.entries).join(" "), MAX_EXCERPT_CHARS);
      return `${label} "${displayName}" (${candidate.source}). ${text}`;
    }
    case "classi": {
      const cls = (await loadClassData()).classes.find(matchesCandidate);
      if (!cls) return null;
      const hd = cls.hd ? `d${cls.hd.faces}` : "?";
      return `${label} "${displayName}" (${candidate.source}) — dado vita ${hd}${cls.spellcastingAbility ? `, incantatore (${cls.spellcastingAbility})` : ""}.`;
    }
    default:
      return null;
  }
}

/** Assistente regole D&D 5e in chat — pensato per una domanda veloce al tavolo ("quanto danno fa
 * X", "come funziona Y"), non una conversazione multi-turno. Ancorato ai dati veri del Compendio
 * di QuestZip quando la domanda cita qualcosa che vi compare (statistiche/testo descrittivo, non
 * solo il nome — vedi buildEntryContext), così le risposte su numeri precisi (danni, CA, GS...)
 * vengono dai dati ufficiali invece che dalla memoria del modello. Ritorna null se l'IA non è
 * disponibile o se qualcosa va storto: la risposta compare comunque accompagnata da un avviso di
 * verificare le regole ufficiali in caso di dubbio (vedi il componente che la mostra). */
export async function askRulesAssistant(question: string): Promise<string | null> {
  const trimmed = question.trim().slice(0, 500);
  if (!trimmed) return null;

  const candidates = await findMatchingCandidates(trimmed).catch(() => [] as MentionCandidate[]);
  const excerpts = (await Promise.all(candidates.map((c) => buildEntryContext(c).catch(() => null)))).filter(
    (e): e is string => !!e,
  );
  const context =
    excerpts.length > 0
      ? `Dati ufficiali dal Compendio di QuestZip, pertinenti alla domanda (usali come fonte primaria per qualunque dettaglio numerico o di regole — se la domanda chiede altro, ignorali):\n${excerpts.map((e) => `- ${e}`).join("\n")}\n\n`
      : "";

  const prompt = `Sei un mega-esperto di Dungeons & Dragons 5ª edizione (sia edizione 2014 sia 2024): conosci a fondo regole, incantesimi, mostri, classi, oggetti magici e ogni dettaglio meccanico del gioco. Rispondi in italiano, in modo breve, diretto e preciso (massimo 4-5 frasi, niente titoli/elenchi puntati a meno che non aiutino davvero la chiarezza). Se hai a disposizione dati ufficiali del Compendio qui sotto, usali come fonte primaria invece di affidarti solo alla memoria, specialmente per numeri esatti (danni, CA, GS, DC...). Non usare markdown (niente **asterischi** per il grassetto, niente # per i titoli): la risposta viene mostrata come testo semplice, non renderizzata. Se la domanda non riguarda le regole di D&D 5e, dillo chiaramente invece di rispondere a caso.\n\n${context}Domanda: ${trimmed}`;

  return askGemini({ prompt });
}
