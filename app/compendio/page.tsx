"use client";

import { useEffect, useMemo, useState } from "react";
import { loadBooks, type BookMeta } from "@/lib/fivetools/books";
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
  type EditionFilter,
  type RawClass,
  type RawCreature,
  type RawItem,
  type RawRace,
  type RawSpell,
} from "@/lib/fivetools/data";
import { translateText } from "@/lib/fivetools/translate";
import { FlagIcon } from "@/components/flag-icon";
import { getRegoleIta } from "@/app/actions/compendio-ita";
import {
  DualName,
  EntryDetail,
  SourceBadge,
  type Entry,
  type Language,
} from "@/lib/fivetools/compendio-detail";
import {
  formatChallengeRating,
  formatCreatureType,
  formatHitDie,
  formatSchool,
  formatSize,
} from "@/lib/fivetools/format";

const TABS: { kind: CompendiumKind; label: string; icon: string }[] = [
  { kind: "incantesimi", label: "Incantesimi", icon: "✨" },
  { kind: "mostri", label: "Mostri", icon: "🐉" },
  { kind: "oggetti", label: "Oggetti magici", icon: "💍" },
  { kind: "razze", label: "Razze", icon: "🧝" },
  { kind: "talenti", label: "Talenti", icon: "🏅" },
  { kind: "background", label: "Background", icon: "📜" },
  { kind: "condizioni", label: "Condizioni", icon: "☠️" },
  { kind: "classi", label: "Classi", icon: "⚔️" },
];

const EDITIONS: { value: EditionFilter; label: string }[] = [
  { value: "entrambe", label: "Entrambe" },
  { value: "2014", label: "2014" },
  { value: "2024", label: "2024/25" },
];

type SortMode = "nome" | "cr" | "rarita" | "manuale";

function crToNumber(cr: RawCreature["cr"]): number {
  const s = typeof cr === "string" ? cr : (cr?.cr ?? "");
  if (s === "") return -1;
  if (s.includes("/")) {
    const [n, d] = s.split("/").map(Number);
    return d ? n / d : -1;
  }
  const n = Number(s);
  return Number.isNaN(n) ? -1 : n;
}

const RARITY_ORDER = ["none", "common", "uncommon", "rare", "very rare", "legendary", "artifact"];

const PAGE_SIZE = 30;

const LOADERS: Record<CompendiumKind, () => Promise<Entry[]>> = {
  incantesimi: loadSpells,
  mostri: loadCreatures,
  oggetti: loadItems,
  razze: loadRaces,
  talenti: loadFeats,
  background: loadBackgrounds,
  condizioni: loadConditions,
  classi: () => loadClassData().then((data) => data.classes),
};

export default function CompendiumPage() {
  const [showRegole, setShowRegole] = useState(false);
  const [kind, setKind] = useState<CompendiumKind>("incantesimi");
  const [edition, setEdition] = useState<EditionFilter>("entrambe");
  const [language, setLanguage] = useState<Language>("en");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Entry | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("nome");

  const [books, setBooks] = useState<Map<string, BookMeta> | null>(null);
  const [dataByKind, setDataByKind] = useState<Partial<Record<CompendiumKind, Entry[]>>>({});
  const [translatedQuery, setTranslatedQuery] = useState<{ query: string; english: string } | null>(
    null,
  );

  useEffect(() => {
    loadBooks().then(setBooks);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      translateText(q, "it", "en").then((english) => {
        if (!cancelled && english) setTranslatedQuery({ query: q, english });
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    if (dataByKind[kind]) return;
    let cancelled = false;
    LOADERS[kind]().then((data) => {
      if (cancelled) return;
      setDataByKind((prev) => ({ ...prev, [kind]: data }));
    });
    return () => {
      cancelled = true;
    };
  }, [kind, dataByKind]);

  const categoryData = dataByKind[kind] ?? null;
  const loadingCategory = categoryData === null;

  const filtered = useMemo(() => {
    if (!categoryData || !books) return [];
    const q = query.trim().toLowerCase();
    const englishQuery =
      translatedQuery && translatedQuery.query === query.trim()
        ? translatedQuery.english.toLowerCase()
        : null;
    return categoryData
      .filter(
        (entry) =>
          !q ||
          entry.name.toLowerCase().includes(q) ||
          (englishQuery && entry.name.toLowerCase().includes(englishQuery)),
      )
      .filter((entry) => {
        if (edition === "entrambe") return true;
        return books.get(entry.source)?.edition === edition;
      })
      .sort((a, b) => {
        if (sortMode === "cr" && kind === "mostri") {
          const diff = crToNumber((a as RawCreature).cr) - crToNumber((b as RawCreature).cr);
          if (diff !== 0) return diff;
        }
        if (sortMode === "rarita" && kind === "oggetti") {
          const diff =
            RARITY_ORDER.indexOf((a as RawItem).rarity ?? "none") -
            RARITY_ORDER.indexOf((b as RawItem).rarity ?? "none");
          if (diff !== 0) return diff;
        }
        if (sortMode === "manuale") {
          const diff = (books.get(a.source)?.name ?? a.source).localeCompare(
            books.get(b.source)?.name ?? b.source,
          );
          if (diff !== 0) return diff;
        }
        return a.name.localeCompare(b.name);
      });
  }, [categoryData, books, query, edition, translatedQuery, sortMode, kind]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const results = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6 max-w-2xl lg:max-w-6xl 2xl:max-w-[1500px] mx-auto">
      <div>
        <h1 className="heading-ornate text-4xl font-bold text-accent-strong">Compendio</h1>
        <p className="text-sm text-muted mt-1">
          Contenuto completo (non solo SRD) via il mirror dati di{" "}
          <a
            href="https://5e.tools"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            5e.tools
          </a>
          . Database in inglese. Il primo caricamento di ogni scheda può richiedere qualche
          secondo.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            onClick={() => {
              setShowRegole(false);
              setKind(tab.kind);
              setQuery("");
              setSelected(null);
              setPage(0);
              setSortMode("nome");
            }}
            className={`card-elevated-hover rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
              !showRegole && kind === tab.kind
                ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface-raised text-muted hover:text-foreground hover:border-accent/40"
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => setShowRegole(true)}
          className={`card-elevated-hover rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
            showRegole
              ? "glow-accent border-accent bg-accent/15 text-accent-strong"
              : "border-edge bg-surface-raised text-muted hover:text-foreground hover:border-accent/40"
          }`}
        >
          <span className="mr-1.5">📚</span>
          Regole
        </button>
      </div>

      {showRegole && <RegoleSection />}

      {!showRegole && (
      <>
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[180px]">
          <p className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Edizione</p>
          <div className="grid grid-cols-3 gap-2">
            {EDITIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setEdition(option.value);
                  setSelected(null);
                  setPage(0);
                }}
                className={`rounded-lg border py-1.5 text-xs font-bold transition-all ${
                  edition === option.value
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface-raised text-muted hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Lingua</p>
          <div className="flex gap-2">
            {(["en", "it"] as Language[]).map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                title={lang === "en" ? "Inglese (originale)" : "Italiano (traduzione automatica)"}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-all ${
                  language === lang
                    ? "glow-accent border-accent bg-accent/15"
                    : "border-edge bg-surface-raised hover:border-accent/50"
                }`}
              >
                <FlagIcon lang={lang} className="w-5 h-auto rounded-sm" />
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-[180px]">
          <p className="text-[10px] uppercase tracking-widest text-muted mb-1.5">Ordina per</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { value: "nome", label: "Nome" },
                ...(kind === "mostri" ? [{ value: "cr", label: "GS" } as const] : []),
                ...(kind === "oggetti" ? [{ value: "rarita", label: "Rarità" } as const] : []),
                { value: "manuale", label: "Manuale" },
              ] as { value: SortMode; label: string }[]
            ).map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setSortMode(option.value);
                  setPage(0);
                }}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-all ${
                  sortMode === option.value
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface-raised text-muted hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {language === "it" && (
        <p className="text-xs text-muted -mt-2">
          🇮🇹 Traduzione automatica (qualità non garantita) — il testo originale è in inglese.
        </p>
      )}

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          🔍
        </span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
            setPage(0);
          }}
          placeholder="Cerca (in inglese o italiano)…"
          className="input-focus w-full rounded-lg border border-edge bg-surface-raised pl-10 pr-3 py-2.5 text-foreground"
        />
      </div>

      <div className="lg:grid lg:grid-cols-[360px_1fr] 2xl:grid-cols-[520px_1fr] lg:gap-6 lg:items-start">
        <div className={selected ? "hidden lg:block space-y-2" : "space-y-2"}>
          {loadingCategory && (
            <p className="text-sm text-muted text-center py-6">Caricamento contenuti in corso…</p>
          )}
          {!loadingCategory && categoryData && categoryData.length === 0 && (
            <p className="text-sm text-danger text-center py-6">
              Impossibile caricare il compendio. Verifica la connessione e riprova.
            </p>
          )}
          {!loadingCategory && categoryData && categoryData.length > 0 && results.length === 0 && (
            <p className="text-sm text-muted text-center py-6">Nessun risultato.</p>
          )}
          <ul className="card-elevated divide-y divide-edge rounded-xl border border-edge bg-surface overflow-x-hidden lg:max-h-[70vh] lg:overflow-y-auto">
            {results.map((entry) => (
              <li key={`${entry.source}-${entry.name}`}>
                <button
                  onClick={() => setSelected(entry)}
                  className={`w-full text-left px-4 py-3 transition-all flex items-center justify-between gap-3 ${
                    selected && selected.source === entry.source && selected.name === entry.name
                      ? "lg:bg-surface-raised lg:border-l-2 lg:border-accent"
                      : "hover:bg-surface-raised hover:pl-5"
                  }`}
                >
                  <span className="min-w-0 font-bold text-foreground">
                    <DualName text={entry.name} />
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <EntrySubtitle kind={kind} entry={entry} />
                    <SourceBadge source={entry.source} books={books} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
          {results.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="rounded-lg border border-edge px-3 py-1.5 text-muted disabled:opacity-30 hover:enabled:text-foreground"
              >
                ← Precedente
              </button>
              <span className="text-muted">
                Pag. {currentPage + 1} di {totalPages} ({filtered.length})
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="rounded-lg border border-edge px-3 py-1.5 text-muted disabled:opacity-30 hover:enabled:text-foreground"
              >
                Successiva →
              </button>
            </div>
          )}
        </div>

        <div className={selected ? "min-w-0" : "hidden lg:block min-w-0"}>
          {selected ? (
            <EntryDetail
              kind={kind}
              entry={selected}
              books={books}
              language={language}
              onBack={() => setSelected(null)}
            />
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-edge bg-surface/30 p-12 text-center text-muted min-h-[300px]">
              <p>Seleziona un elemento dall&apos;elenco per vedere i dettagli.</p>
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  );
}

const REGOLE_FONTI: Record<string, string> = {
  regole_base: "Regole Principali",
  costa_spada: "Costa della Spada",
};

const REGOLE_WARNINGS: Record<string, string> = {
  costa_spada:
    "estratta via OCR da scansioni (non un vero testo digitale come il resto del compendio): può contenere errori di riconoscimento. Utile per una ricerca rapida, non garantita parola per parola.",
};

// Sezione a sé, fuori dal sistema kind/Entry/LOADERS del resto del Compendio: quel sistema
// presuppone dati bilingue EN/IT con edizione (dal mirror 5e.tools), mentre "Regole" è
// contenuto italiano-solo estratto via OCR da scansioni pure — niente switch di lingua, niente
// filtro edizione, solo un elenco di sezioni con un badge esplicito sulla qualità del testo.
const QUICK_REF_TOPICS: { titolo: string; voci: string[] }[] = [
  {
    titolo: "Azioni, bonus azioni, reazioni",
    voci: [
      "1 azione per turno.",
      "1 bonus azione per turno — solo se qualcosa te ne concede una (talento, incantesimo, privilegio).",
      "1 reazione per round — utilizzabile anche fuori dal proprio turno, si ricarica all'inizio del turno successivo.",
      "Il movimento può essere diviso prima, dopo o durante un'azione.",
    ],
  },
  {
    titolo: "Copertura",
    voci: [
      "Mezza copertura: +2 CA e ai tiri salvezza su Destrezza.",
      "Tre quarti di copertura: +5 CA e ai tiri salvezza su Destrezza.",
      "Copertura totale: non può essere bersaglio diretto di un attacco o di un incantesimo.",
    ],
  },
  {
    titolo: "Visione e illuminazione",
    voci: [
      "Luce intensa: si vede normalmente.",
      "Luce fioca (penombra): svantaggio alle prove di Saggezza (Percezione) basate sulla vista.",
      "Oscurità: crea l'effetto della condizione Accecato per chi non ha scurovisione o altra vista speciale.",
      "Scurovisione: vede nell'oscurità come se fosse luce fioca entro il raggio indicato (di solito in scala di grigi).",
    ],
  },
  {
    titolo: "Condizioni in sintesi",
    voci: [
      "Affascinato — non può attaccare o bersagliare con effetti nocivi chi lo affascina.",
      "Afferrato — velocità 0, finisce se chi afferra è incapacitato o allontanato.",
      "Accecato — fallisce prove basate sulla vista, svantaggio ad attaccare, vantaggio per chi lo attacca.",
      "Assordato — fallisce prove basate sull'udito.",
      "Avvelenato — svantaggio a tiri per colpire e prove di caratteristica.",
      "Incapacitato — non può compiere azioni né reazioni.",
      "Invisibile — vantaggio ad attaccare, svantaggio per chi lo attacca (a meno che non lo localizzi).",
      "Paralizzato — incapacitato, fallisce TS Forza/Destrezza, colpi entro 1,5 m sono critici automatici.",
      "Pietrificato — trasformato in pietra, incapacitato, resistenza a tutti i danni.",
      "Prono — svantaggio ad attaccare, chi attacca in mischia ha vantaggio, a distanza svantaggio.",
      "Spaventato — svantaggio a prove e attacchi mentre la fonte della paura è in vista, non può avvicinarsi ad essa.",
      "Stordito — incapacitato, non può muoversi, fallisce TS Forza/Destrezza, chi lo attacca ha vantaggio.",
      "Trattenuto — velocità 0, svantaggio ad attaccare, fallisce TS Destrezza, chi lo attacca ha vantaggio.",
    ],
  },
  {
    titolo: "Cadute",
    voci: [
      "1d6 danni contundenti ogni 3 metri caduti, fino a un massimo di 20d6.",
      "Alla fine della caduta la creatura finisce prona, a meno che i danni subiti non siano 0.",
    ],
  },
  {
    titolo: "Combattimento subacqueo",
    voci: [
      "Senza velocità natatoria, nuotare costa metà movimento a meno di una prova di Atletica riuscita.",
      "Attacchi in mischia senza un'arma adatta (pugnale, giavellotto, lancia, tridente, spada corta): svantaggio.",
      "Attacchi a distanza: falliscono automaticamente oltre la gittata normale, svantaggio entro la gittata — eccetto balestre, fionde e armi da lancio come lance/giavellotti.",
      "Creature e oggetti completamente immersi ottengono resistenza ai danni da fuoco.",
    ],
  },
  {
    titolo: "Salire su un avversario più grande",
    voci: [
      "Come parte del movimento, spendendo metà velocità: prova contrapposta (Atletica o Acrobazia a scelta di chi sale) contro l'Atletica del bersaglio.",
      "Se riesce, chi sale occupa lo spazio della creatura più grande e si muove con essa.",
      "Il bersaglio può usare un'azione (prova di Atletica o Acrobazia contrapposta) per disarcionarlo.",
    ],
  },
];

function QuickReference() {
  const [open, setOpen] = useState(false);
  return (
    <div className="card-elevated rounded-xl border border-accent/40 bg-surface p-4 space-y-3">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between text-left"
      >
        <span className="text-sm font-bold text-accent-strong">⚡ Quick reference per il master</span>
        <span className="text-xs text-muted">{open ? "Nascondi" : "Mostra"}</span>
      </button>
      {open && (
        <div className="grid sm:grid-cols-2 gap-4">
          {QUICK_REF_TOPICS.map((topic) => (
            <div
              key={topic.titolo}
              className="card-elevated-hover rounded-lg border border-edge bg-surface-raised p-3"
            >
              <p className="text-xs font-bold uppercase tracking-widest text-accent-strong mb-1.5">
                {topic.titolo}
              </p>
              <ul className="space-y-1">
                {topic.voci.map((voce, index) => (
                  <li key={index} className="text-sm text-foreground leading-snug">
                    • {voce}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RegoleSection() {
  const [sections, setSections] = useState<Awaited<ReturnType<typeof getRegoleIta>> | null>(null);
  const [fonte, setFonte] = useState<string>("tutte");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    getRegoleIta().then(setSections);
  }, []);

  const filtered = useMemo(() => {
    if (!sections) return [];
    const q = query.trim().toLowerCase();
    return sections
      .filter((s) => fonte === "tutte" || s.fonte === fonte)
      .filter((s) => !q || s.titolo.toLowerCase().includes(q) || s.testo.toLowerCase().includes(q))
      .sort((a, b) => (a.pagina ?? 0) - (b.pagina ?? 0));
  }, [sections, fonte, query]);

  const selectedSection = selected !== null ? (sections?.find((s) => s.id === selected) ?? null) : null;

  return (
    <div className="space-y-4">
      <QuickReference />

      {fonte !== "regole_base" && (
        <div className="rounded-lg border border-edge bg-surface-raised p-3 text-xs text-muted">
          {fonte === "tutte" ? (
            <>
              ⚠️ Solo Regole Principali è stata riscritta a mano (testo pulito e affidabile); le
              altre fonti fra i risultati sono {REGOLE_WARNINGS.costa_spada}
            </>
          ) : (
            <>⚠️ {REGOLE_FONTI[fonte] ?? fonte} è {REGOLE_WARNINGS[fonte] ?? "estratta via OCR."}</>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {(["tutte", "regole_base", "costa_spada"] as const).map((f) => (
          <button
            key={f}
            onClick={() => {
              setFonte(f);
              setSelected(null);
            }}
            className={`card-elevated-hover rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
              fonte === f
                ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface-raised text-muted hover:text-foreground hover:border-accent/40"
            }`}
          >
            {f === "tutte" ? "Tutte le fonti" : REGOLE_FONTI[f]}
          </button>
        ))}
      </div>

      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          🔍
        </span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
          }}
          placeholder="Cerca nel testo…"
          className="input-focus w-full rounded-lg border border-edge bg-surface-raised pl-10 pr-3 py-2.5 text-foreground"
        />
      </div>

      <div className="lg:grid lg:grid-cols-[360px_1fr] 2xl:grid-cols-[520px_1fr] lg:gap-6 lg:items-start">
        <div className={selectedSection ? "hidden lg:block space-y-2" : "space-y-2"}>
          {sections === null && (
            <p className="text-sm text-muted text-center py-6">Caricamento in corso…</p>
          )}
          {sections && filtered.length === 0 && (
            <p className="text-sm text-muted text-center py-6">Nessun risultato.</p>
          )}
          <ul className="card-elevated divide-y divide-edge rounded-xl border border-edge bg-surface overflow-x-hidden lg:max-h-[70vh] lg:overflow-y-auto">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelected(s.id)}
                  className={`w-full text-left px-4 py-3 transition-all flex items-center justify-between gap-3 ${
                    selected === s.id
                      ? "lg:bg-surface-raised lg:border-l-2 lg:border-accent"
                      : "hover:bg-surface-raised hover:pl-5"
                  }`}
                >
                  <span className="min-w-0 font-bold text-foreground">{s.titolo}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted">
                    {REGOLE_FONTI[s.fonte] ?? s.fonte}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className={selectedSection ? "min-w-0" : "hidden lg:block min-w-0"}>
          {selectedSection ? (
            <div className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
              <button
                onClick={() => setSelected(null)}
                className="lg:hidden text-sm text-muted hover:text-foreground"
              >
                ← Indietro
              </button>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-foreground">{selectedSection.titolo}</h2>
                {selectedSection.fonte === "regole_base" ? (
                  <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-accent-strong">
                    ✓ Verificato
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-edge px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted">
                    📷 OCR
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
                {selectedSection.testo}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-edge bg-surface/30 p-12 text-center text-muted min-h-[300px]">
              <p>Seleziona una sezione dall&apos;elenco per vedere il testo.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntrySubtitle({ kind, entry }: { kind: CompendiumKind; entry: Entry }) {
  if (kind === "incantesimi") {
    const spell = entry as RawSpell;
    return (
      <span className="text-xs text-muted">
        {formatSchool(spell.school)} · {spell.level === 0 ? "trucchetto" : `liv. ${spell.level}`}
      </span>
    );
  }
  if (kind === "mostri") {
    const creature = entry as RawCreature;
    return (
      <span className="text-xs text-muted">
        GS {formatChallengeRating(creature.cr)} · {formatCreatureType(creature.type)}
      </span>
    );
  }
  if (kind === "oggetti") {
    const item = entry as RawItem;
    return <span className="text-xs text-muted capitalize">{item.rarity}</span>;
  }
  if (kind === "razze") {
    const race = entry as RawRace;
    return <span className="text-xs text-muted">{formatSize(race.size)}</span>;
  }
  if (kind === "classi") {
    const cls = entry as RawClass;
    return <span className="text-xs text-muted">{formatHitDie(cls.hd)}</span>;
  }
  return null;
}
