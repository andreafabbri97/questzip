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
import {
  getClassiIta,
  getIncantesimiIta,
  getMostriIta,
  getOggettiIta,
  getRazzeIta,
  getTalentiIta,
  getTraduzioniIa,
} from "@/app/actions/compendio-ita";
import { bestItalianName, buildItalianNameIndex } from "@/lib/fivetools/italian-names";

export interface MentionCandidate {
  kind: CompendiumKind;
  name: string;
  source: string;
  // Nome italiano ufficiale, presente solo se questa voce ha una controparte abbinata (vedi
  // scripts/ita-compendio/match-english-names.mjs) — usato solo per mostrare un aiuto nel menu
  // quando si cerca in italiano; il token inserito nel messaggio resta sempre quello inglese
  // (nessuna modifica al formato #{Nome|tipo|fonte} già in uso).
  nameIta?: string;
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

// Solo le categorie con una tabella italiana ufficiale abbinabile (background/condizioni no,
// non hanno mai avuto un giro di traduzione ufficiale in questo progetto).
const ITA_LOADERS: Partial<
  Record<CompendiumKind, () => Promise<{ nome: string; nomeInglese: string | null; fonteInglese: string | null }[]>>
> = {
  incantesimi: getIncantesimiIta,
  mostri: getMostriIta,
  razze: getRazzeIta,
  talenti: getTalentiIta,
  classi: getClassiIta,
  oggetti: getOggettiIta,
};

let allCandidatesPromise: Promise<MentionCandidate[]> | null = null;

// Carica le 8 categorie inglesi + le righe ufficiali/IA abbinabili in parallelo una sola volta (i
// singoli loader di lib/fivetools/data.ts hanno già una cache propria, condivisa anche con
// /compendio) e arricchisce ogni candidato con "nameIta" tramite buildItalianNameIndex/
// bestItalianName — la STESSA identica priorità (ufficiale fonte esatta > ufficiale qualsiasi
// fonte > cache IA) usata dal Compendio stesso. Prima questo file aveva una fusione "ultima riga
// vince" indipendente, senza il livello "ufficiale di un'altra fonte": una voce con nome
// ufficiale collegato solo a una fonte gemella (es. ristampe XPHB 2024) poteva mostrare qui un
// nome diverso da quello già corretto nel Compendio — segnalato dall'utente ("quei nomi si devono
// rifare tutti al Compendio, sia in chat, sia l'assistente IA, sia nel personaggio").
function loadAllMentionCandidates(): Promise<MentionCandidate[]> {
  if (!allCandidatesPromise) {
    allCandidatesPromise = Promise.all(
      (Object.keys(MENTION_KIND_LOADERS) as CompendiumKind[]).map(async (kind) => {
        const [entries, official, ia] = await Promise.all([
          MENTION_KIND_LOADERS[kind](),
          ITA_LOADERS[kind]?.() ?? Promise.resolve([]),
          getTraduzioniIa(kind),
        ]);
        const index = buildItalianNameIndex(official, ia);
        return entries.map((e): MentionCandidate => {
          const nameIta = bestItalianName(index, e.name, e.source);
          return nameIta ? { kind, name: e.name, source: e.source, nameIta } : { kind, name: e.name, source: e.source };
        });
      }),
    ).then((lists) => lists.flat());
  }
  return allCandidatesPromise;
}

export async function searchMentionCandidates(query: string, limit = 8): Promise<MentionCandidate[]> {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const all = await loadAllMentionCandidates();
  return all
    .filter((c) => c.name.toLowerCase().includes(q) || c.nameIta?.toLowerCase().includes(q))
    .slice(0, limit);
}

const candidatesByKindPromise = new Map<CompendiumKind, Promise<MentionCandidate[]>>();

// Stessa fusione inglese+ufficiale+IA di loadAllMentionCandidates sopra, ma per UNA sola
// categoria — usata da findCompendioMatch, che a differenza delle menzioni `#Nome` in chat
// conosce già il kind in anticipo (passato come prop dal chiamante, es. "talenti" per il bottone
// "📖 Verifica" di un talento in scheda) e non ha alcun bisogno di caricare anche le altre 7
// categorie (mostri da solo ha ~4500 voci) solo per scartarle subito dopo col filtro su kind.
// Bug segnalato dall'utente: il primo bottone "Verifica" aperto su qualsiasi pagina restava
// "in caricamento" per un momento percepibile proprio perché tirava dentro l'intero Compendio.
function loadMentionCandidatesForKind(kind: CompendiumKind): Promise<MentionCandidate[]> {
  let promise = candidatesByKindPromise.get(kind);
  if (!promise) {
    promise = Promise.all([
      MENTION_KIND_LOADERS[kind](),
      ITA_LOADERS[kind]?.() ?? Promise.resolve([]),
      getTraduzioniIa(kind),
    ]).then(([entries, official, ia]) => {
      const index = buildItalianNameIndex(official, ia);
      return entries.map((e): MentionCandidate => {
        const nameIta = bestItalianName(index, e.name, e.source);
        return nameIta ? { kind, name: e.name, source: e.source, nameIta } : { kind, name: e.name, source: e.source };
      });
    });
    candidatesByKindPromise.set(kind, promise);
  }
  return promise;
}

// Ignora maiuscole/accenti/punteggiatura — stessa euristica già in uso altrove nel progetto
// (es. normalizeItaName in inventory-equipment.tsx) per far combaciare un nome italiano digitato
// a mano con quello ufficiale/IA anche se differiscono per un accento o un apostrofo.
function normalizeCompendioName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Trova la voce di Compendio (nome inglese + fonte, per alimentare MentionModal) il cui nome
 * combacia ESATTAMENTE (non una sottostringa) con quanto scritto a mano in un campo libero della
 * scheda personaggio — talento, incantesimo, oggetto — provando sia il nome inglese sia quello
 * italiano (ufficiale o auto-tradotto dall'IA). Se il giocatore ha scritto un nome che non esiste
 * nel Compendio, ritorna null: il campo resta testo libero, niente errore.
 */
export async function findCompendioMatch(
  kind: CompendiumKind,
  nome: string,
): Promise<{ name: string; source: string } | null> {
  const q = normalizeCompendioName(nome);
  if (!q) return null;
  const candidates = await loadMentionCandidatesForKind(kind);
  const found = candidates.find(
    (c) => normalizeCompendioName(c.name) === q || (c.nameIta && normalizeCompendioName(c.nameIta) === q),
  );
  return found ? { name: found.name, source: found.source } : null;
}
