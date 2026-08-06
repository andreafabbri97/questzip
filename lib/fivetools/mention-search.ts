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

// Carica le 8 categorie inglesi + le 6 italiane abbinabili in parallelo una sola volta (i
// singoli loader di lib/fivetools/data.ts hanno già una cache propria, condivisa anche con
// /compendio) e le fonde in un elenco piatto — arricchendo un candidato inglese con "nameIta"
// quando esiste un abbinamento, invece di avere due righe duplicate per la stessa voce.
function loadAllMentionCandidates(): Promise<MentionCandidate[]> {
  if (!allCandidatesPromise) {
    const english = Promise.all(
      (Object.keys(MENTION_KIND_LOADERS) as CompendiumKind[]).map((kind) =>
        MENTION_KIND_LOADERS[kind]().then((entries) =>
          entries.map((e): MentionCandidate => ({ kind, name: e.name, source: e.source })),
        ),
      ),
    ).then((lists) => lists.flat());

    const italian = Promise.all(
      (Object.keys(ITA_LOADERS) as CompendiumKind[]).map((kind) =>
        ITA_LOADERS[kind]!().then((rows) =>
          rows
            .filter((r) => r.nomeInglese && r.fonteInglese)
            .map((r) => ({ kind, name: r.nomeInglese as string, source: r.fonteInglese as string, nameIta: r.nome })),
        ),
      ),
    ).then((lists) => lists.flat());

    // Voci autotradotte dall'IA (compendio_traduzione_ia): copre tutto ciò che non ha (ancora)
    // testo ufficiale — senza questo, la ricerca delle menzioni in italiano trovava solo il
    // piccolo sottoinsieme ufficiale (es. incantesimi PHB/Tasha/Xanathar) e falliva su tutto il
    // resto, obbligando a cercare sempre in inglese.
    const ia = Promise.all(
      (Object.keys(MENTION_KIND_LOADERS) as CompendiumKind[]).map((kind) =>
        getTraduzioniIa(kind).then((rows) =>
          rows
            .filter((r) => r.nomeIta)
            .map((r) => ({ kind, name: r.name, source: r.source, nameIta: r.nomeIta as string })),
        ),
      ),
    ).then((lists) => lists.flat());

    allCandidatesPromise = Promise.all([english, italian, ia]).then(([englishCandidates, italianMatches, iaMatches]) => {
      const byKey = new Map<string, MentionCandidate>();
      for (const c of englishCandidates) byKey.set(`${c.kind}:${c.name}:${c.source}`, c);
      // L'IA riempie nameIta per le voci senza testo ufficiale...
      for (const m of iaMatches) {
        const key = `${m.kind}:${m.name}:${m.source}`;
        const existing = byKey.get(key);
        if (existing) existing.nameIta = m.nameIta;
        else byKey.set(key, m);
      }
      // ...ma il nome ufficiale, quando esiste, ha sempre l'ultima parola (sovrascrive quello IA).
      for (const m of italianMatches) {
        const key = `${m.kind}:${m.name}:${m.source}`;
        const existing = byKey.get(key);
        if (existing) existing.nameIta = m.nameIta;
        else byKey.set(key, m);
      }
      return [...byKey.values()];
    });
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
    const english = MENTION_KIND_LOADERS[kind]().then((entries) =>
      entries.map((e): MentionCandidate => ({ kind, name: e.name, source: e.source })),
    );
    const italian = (ITA_LOADERS[kind]?.() ?? Promise.resolve([])).then((rows) =>
      rows
        .filter((r) => r.nomeInglese && r.fonteInglese)
        .map((r) => ({ kind, name: r.nomeInglese as string, source: r.fonteInglese as string, nameIta: r.nome })),
    );
    const ia = getTraduzioniIa(kind).then((rows) =>
      rows
        .filter((r) => r.nomeIta)
        .map((r) => ({ kind, name: r.name, source: r.source, nameIta: r.nomeIta as string })),
    );
    promise = Promise.all([english, italian, ia]).then(([englishCandidates, italianMatches, iaMatches]) => {
      const byKey = new Map<string, MentionCandidate>();
      for (const c of englishCandidates) byKey.set(`${c.name}:${c.source}`, c);
      for (const m of iaMatches) {
        const key = `${m.name}:${m.source}`;
        const existing = byKey.get(key);
        if (existing) existing.nameIta = m.nameIta;
        else byKey.set(key, m);
      }
      for (const m of italianMatches) {
        const key = `${m.name}:${m.source}`;
        const existing = byKey.get(key);
        if (existing) existing.nameIta = m.nameIta;
        else byKey.set(key, m);
      }
      return [...byKey.values()];
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
