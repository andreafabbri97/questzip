"use server";

import { requireUserId } from "@/lib/campaign-auth";

import {
  loadBackgrounds,
  loadClassData,
  loadConditions,
  loadCreatures,
  loadFeats,
  loadInventoryItems,
  loadRaces,
  loadSpells,
} from "@/lib/fivetools/data";
import { flattenEntries } from "@/lib/fivetools/entries";
import { MENTION_KIND_LABELS, searchMentionCandidates, type MentionCandidate } from "@/lib/fivetools/mention-search";
import { askGemini } from "@/lib/gemini";
import { cercaVoceUfficiale, haTestoUfficiale } from "@/lib/compendio-ita-lookup";

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
// Testo UFFICIALE italiano (estratto dai manuali veri) della voce citata, quando esiste. Ha la
// precedenza sui dati inglesi di 5etools: il modello risponde con le stesse parole e gli stessi
// numeri che l'utente vede nella scheda del Compendio, invece di improvvisare una traduzione dei
// termini ("Fiotto Acido" è il nome ufficiale, "Spruzzo Acido" quello che verrebbe da sé).
async function buildContestoUfficiale(candidate: MentionCandidate): Promise<string | null> {
  if (!haTestoUfficiale(candidate.kind)) return null;
  const riga = await cercaVoceUfficiale(candidate.kind, candidate.name, candidate.source);
  if (!riga) return null;

  const label = MENTION_KIND_LABELS[candidate.kind];
  const campo = (k: string) => {
    const v = riga[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  const nome = campo("nome") ?? candidate.name;
  const intestazione = `${label} "${nome}" (nome inglese: ${candidate.name}), testo ufficiale dal manuale italiano`;

  switch (candidate.kind) {
    case "incantesimi": {
      const dati = [
        `livello ${riga.livello}`,
        campo("scuola") && `scuola ${campo("scuola")}`,
        campo("tempoDiLancio") && `lancio ${campo("tempoDiLancio")}`,
        campo("gittata") && `gittata ${campo("gittata")}`,
        campo("componenti") && `componenti ${campo("componenti")}`,
        campo("durata") && `durata ${campo("durata")}`,
      ].filter(Boolean).join(", ");
      return `${intestazione} — ${dati}. ${truncate(campo("descrizione") ?? "", MAX_EXCERPT_CHARS)}`;
    }
    case "mostri": {
      const dati = [
        campo("taglia"),
        campo("tipo"),
        campo("classeArmatura") && `CA ${campo("classeArmatura")}`,
        campo("puntiFerita") && `PF ${campo("puntiFerita")}`,
        campo("velocita") && `velocità ${campo("velocita")}`,
        campo("sfida") && `Grado Sfida ${campo("sfida")}`,
      ].filter(Boolean).join(", ");
      const corpo = [campo("tratti"), campo("azioni")].filter(Boolean).join(" ");
      return `${intestazione} — ${dati}. ${truncate(corpo, MAX_EXCERPT_CHARS)}`;
    }
    case "oggetti": {
      const dati = [campo("categoria"), campo("rarita"), riga.sintonia ? "richiede sintonia" : null]
        .filter(Boolean).join(", ");
      return `${intestazione} — ${dati}. ${truncate(campo("descrizione") ?? "", MAX_EXCERPT_CHARS)}`;
    }
    case "talenti": {
      const prereq = campo("prerequisito");
      return `${intestazione}${prereq ? ` — prerequisito: ${prereq}` : ""}. ${truncate(campo("descrizione") ?? "", MAX_EXCERPT_CHARS)}`;
    }
    case "razze":
      return `${intestazione}. ${truncate(campo("introduzione") ?? "", MAX_EXCERPT_CHARS)}`;
  }
}

async function buildEntryContext(candidate: MentionCandidate): Promise<string | null> {
  // Il manuale italiano vince sui dati inglesi quando la voce c'è: vedi buildContestoUfficiale.
  const ufficiale = await buildContestoUfficiale(candidate).catch(() => null);
  if (ufficiale) return ufficiale;

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
      // loadInventoryItems, non loadItems (solo magici): copre anche armi/armature/attrezzatura
      // comune, altrimenti l'assistente non trovava mai dati veri per un oggetto non magico
      // citato nella domanda, pur avendolo individuato come candidato pertinente.
      const item = (await loadInventoryItems()).find(matchesCandidate);
      if (!item) return null;
      const text = truncate(flattenEntries(item.entries).join(" "), MAX_EXCERPT_CHARS);
      const rarity = item.rarity && item.rarity !== "none" ? `, rarità ${item.rarity}` : "";
      return `${label} "${displayName}" (${candidate.source})${rarity}${item.reqAttune ? ", richiede sintonia" : ""}. ${text}`;
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

export interface RulesAssistantExchange {
  question: string;
  answer: string;
}

// Quanti scambi precedenti si allegano come contesto — un tetto basso perché serve solo a capire
// domande di seguito ellittiche ("e a un livello più alto?", "e per un mago invece?"), non a
// sostenere una conversazione lunga: più scambi vecchi nel prompt non migliorano la risposta e
// costano solo caratteri.
const MAX_HISTORY = 3;

/** Assistente regole D&D 5e in chat — pensato per una domanda veloce al tavolo ("quanto danno fa
 * X", "come funziona Y"). Ancorato ai dati veri del Compendio di QuestZip quando la domanda cita
 * qualcosa che vi compare (statistiche/testo descrittivo, non solo il nome — vedi
 * buildEntryContext), così le risposte su numeri precisi (danni, CA, GS...) vengono dai dati
 * ufficiali invece che dalla memoria del modello. `history` (opzionale) sono gli scambi precedenti
 * già mostrati in UI: la conversazione appare come una chat, quindi il modello deve poter capire
 * un rimando a una domanda precedente invece di ripartire da zero ogni volta. Ritorna null se
 * l'IA non è disponibile o se qualcosa va storto: la risposta compare comunque accompagnata da un
 * avviso di verificare le regole ufficiali in caso di dubbio (vedi il componente che la mostra). */
export async function askRulesAssistant(
  question: string,
  history: RulesAssistantExchange[] = [],
): Promise<string | null> {
  // Come per le bozze IA: senza questo controllo la quota Gemini del progetto è spendibile da
  // chiunque, dato che /campagne è raggiungibile senza login.
  await requireUserId();
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

  const recentHistory = history.slice(-MAX_HISTORY);
  const historyBlock =
    recentHistory.length > 0
      ? `Scambi precedenti in questa stessa conversazione, per capire domande di seguito che fanno riferimento a quanto già chiesto (es. "e a un livello più alto?"):\n${recentHistory.map((h) => `D: ${h.question}\nR: ${h.answer}`).join("\n")}\n\n`
      : "";

  const prompt = `Sei un mega-esperto di Dungeons & Dragons 5ª edizione (sia edizione 2014 sia 2024): conosci a fondo regole, incantesimi, mostri, classi, oggetti magici e ogni dettaglio meccanico del gioco. Rispondi in italiano, in modo breve, diretto e preciso (massimo 4-5 frasi, niente titoli/elenchi puntati a meno che non aiutino davvero la chiarezza). Se hai a disposizione dati ufficiali del Compendio qui sotto, usali come fonte primaria invece di affidarti solo alla memoria, specialmente per numeri esatti (danni, CA, GS, DC...). Se la domanda fa riferimento a uno scambio precedente della conversazione, usalo per interpretarla correttamente. Non usare markdown (niente **asterischi** per il grassetto, niente # per i titoli): la risposta viene mostrata come testo semplice, non renderizzata. Se la domanda non riguarda le regole di D&D 5e, dillo chiaramente invece di rispondere a caso.\n\n${historyBlock}${context}Domanda: ${trimmed}`;

  return askGemini({ prompt });
}
