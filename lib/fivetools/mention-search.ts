import {
  loadBackgrounds,
  loadClassData,
  loadConditions,
  loadCreatures,
  loadFeats,
  loadItems,
  loadRaces,
  loadSpells,
  type CompendiumKind,
} from "@/lib/fivetools/data";

export interface MentionCandidate {
  kind: CompendiumKind;
  name: string;
  source: string;
}

export const MENTION_KIND_LABELS: Record<CompendiumKind, string> = {
  incantesimi: "Incantesimo",
  mostri: "Mostro",
  oggetti: "Oggetto",
  razze: "Razza",
  talenti: "Talento",
  background: "Background",
  condizioni: "Condizione",
  classi: "Classe",
};

export const MENTION_KIND_LOADERS: Record<CompendiumKind, () => Promise<{ name: string; source: string }[]>> = {
  incantesimi: loadSpells,
  mostri: loadCreatures,
  oggetti: loadItems,
  razze: loadRaces,
  talenti: loadFeats,
  background: loadBackgrounds,
  condizioni: loadConditions,
  classi: () => loadClassData().then((data) => data.classes),
};

let allCandidatesPromise: Promise<MentionCandidate[]> | null = null;

// Carica le 8 categorie in parallelo una sola volta (i singoli loader di lib/fivetools/data.ts
// hanno già una cache propria, condivisa anche con /compendio) e le unisce in un elenco piatto —
// la fusione stessa avviene una volta sola, non ad ogni tasto premuto nel composer.
function loadAllMentionCandidates(): Promise<MentionCandidate[]> {
  if (!allCandidatesPromise) {
    allCandidatesPromise = Promise.all(
      (Object.keys(MENTION_KIND_LOADERS) as CompendiumKind[]).map((kind) =>
        MENTION_KIND_LOADERS[kind]().then((entries) =>
          entries.map((e) => ({ kind, name: e.name, source: e.source })),
        ),
      ),
    ).then((lists) => lists.flat());
  }
  return allCandidatesPromise;
}

export async function searchMentionCandidates(query: string, limit = 8): Promise<MentionCandidate[]> {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const all = await loadAllMentionCandidates();
  return all.filter((c) => c.name.toLowerCase().includes(q)).slice(0, limit);
}
