"use client";

import { useEffect, useMemo, useState } from "react";
import { loadBooks, type BookMeta, type Edition } from "@/lib/fivetools/books";
import {
  loadBackgrounds,
  loadClassData,
  loadConditions,
  loadCreatures,
  loadFeats,
  loadItems,
  loadRaces,
  loadSpells,
  resolveClassFeatures,
  resolveSubclassFeatures,
  type ClassData,
  type CompendiumKind,
  type EditionFilter,
  type RawBackground,
  type RawClass,
  type RawCondition,
  type RawCreature,
  type RawFeat,
  type RawItem,
  type RawRace,
  type RawSpell,
  type RawSubclass,
} from "@/lib/fivetools/data";
import { flattenEntries, RenderEntries, type FiveEntry } from "@/lib/fivetools/entries";
import { translateBatch, translateText, useTranslatedText } from "@/lib/fivetools/translate";
import { stripTags } from "@/lib/fivetools/tags";
import { FlagIcon } from "@/components/flag-icon";
import {
  getClassiIta,
  getIncantesimiIta,
  getMostriIta,
  getRazzeIta,
  getRegoleIta,
} from "@/app/actions/compendio-ita";

// cache in memoria per la durata della pagina: gli elenchi sono piccoli, non serve rifetcharli
// ogni volta che si seleziona un'altra scheda
let itaSpellsPromise: ReturnType<typeof getIncantesimiIta> | null = null;
function loadIncantesimiIta() {
  if (!itaSpellsPromise) itaSpellsPromise = getIncantesimiIta();
  return itaSpellsPromise;
}
let itaMostriPromise: ReturnType<typeof getMostriIta> | null = null;
function loadMostriIta() {
  if (!itaMostriPromise) itaMostriPromise = getMostriIta();
  return itaMostriPromise;
}
let itaRazzePromise: ReturnType<typeof getRazzeIta> | null = null;
function loadRazzeIta() {
  if (!itaRazzePromise) itaRazzePromise = getRazzeIta();
  return itaRazzePromise;
}
let itaClassiPromise: ReturnType<typeof getClassiIta> | null = null;
function loadClassiIta() {
  if (!itaClassiPromise) itaClassiPromise = getClassiIta();
  return itaClassiPromise;
}

// confronta i nomi ignorando maiuscole/accenti/punteggiatura, per far combaciare il nome
// italiano ufficiale con la traduzione automatica del nome inglese di 5etools
function normalizeItaName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

type Language = "en" | "it";
import {
  formatAC,
  formatAbilityIncrease,
  formatAlignment,
  formatChallengeRating,
  formatComponents,
  formatCreatureType,
  formatDuration,
  formatFeet,
  formatHP,
  formatHitDie,
  formatMaterial,
  formatPrerequisite,
  formatProficiencyList,
  formatRaceSpeed,
  formatRange,
  formatSchool,
  formatSize,
  formatSpeed,
  formatTableCell,
  formatTime,
} from "@/lib/fivetools/format";
import { abilityModifier, formatModifier, proficiencyBonus } from "@/lib/dnd";

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

type Entry = RawSpell | RawCreature | RawItem | RawRace | RawFeat | RawBackground | RawCondition | RawClass;

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
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryData, books, query, edition, translatedQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const results = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-6 max-w-2xl lg:max-w-6xl 2xl:max-w-[1500px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-accent-strong">Compendio</h1>
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
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
              !showRegole && kind === tab.kind
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
        <button
          onClick={() => setShowRegole(true)}
          className={`rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
            showRegole
              ? "border-accent bg-accent/15 text-accent-strong"
              : "border-edge bg-surface-raised text-muted hover:text-foreground"
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
                className={`rounded-lg border py-1.5 text-xs font-bold transition-colors ${
                  edition === option.value
                    ? "border-accent bg-accent/15 text-accent-strong"
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
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
                  language === lang
                    ? "border-accent bg-accent/15"
                    : "border-edge bg-surface-raised hover:border-accent/50"
                }`}
              >
                <FlagIcon lang={lang} className="w-5 h-auto rounded-sm" />
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

      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(null);
          setPage(0);
        }}
        placeholder="Cerca (in inglese o italiano)…"
        className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
      />

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
          <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface overflow-x-hidden lg:max-h-[70vh] lg:overflow-y-auto">
            {results.map((entry) => (
              <li key={`${entry.source}-${entry.name}`}>
                <button
                  onClick={() => setSelected(entry)}
                  className={`w-full text-left px-4 py-3 hover:bg-surface-raised transition-colors flex items-center justify-between gap-3 ${
                    selected && selected.source === entry.source && selected.name === entry.name
                      ? "lg:bg-surface-raised lg:border-l-2 lg:border-accent"
                      : ""
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

// Sezione a sé, fuori dal sistema kind/Entry/LOADERS del resto del Compendio: quel sistema
// presuppone dati bilingue EN/IT con edizione (dal mirror 5e.tools), mentre "Regole" è
// contenuto italiano-solo estratto via OCR da scansioni pure — niente switch di lingua, niente
// filtro edizione, solo un elenco di sezioni con un badge esplicito sulla qualità del testo.
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
      {fonte !== "regole_base" && (
        <div className="rounded-lg border border-edge bg-surface-raised p-3 text-xs text-muted">
          ⚠️ {fonte === "costa_spada" ? "Costa della Spada è" : "Costa della Spada (fra i risultati) è"}{" "}
          estratta via OCR da scansioni (non un vero testo digitale come il resto del compendio):
          può contenere errori di riconoscimento. Utile per una ricerca rapida, non garantito
          parola per parola. Regole Principali invece è stata riscritta a mano, testo pulito e
          affidabile.
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
            className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
              fonte === f
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            {f === "tutte" ? "Tutte le fonti" : REGOLE_FONTI[f]}
          </button>
        ))}
      </div>

      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(null);
        }}
        placeholder="Cerca nel testo…"
        className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
      />

      <div className="lg:grid lg:grid-cols-[360px_1fr] 2xl:grid-cols-[520px_1fr] lg:gap-6 lg:items-start">
        <div className={selectedSection ? "hidden lg:block space-y-2" : "space-y-2"}>
          {sections === null && (
            <p className="text-sm text-muted text-center py-6">Caricamento in corso…</p>
          )}
          {sections && filtered.length === 0 && (
            <p className="text-sm text-muted text-center py-6">Nessun risultato.</p>
          )}
          <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface overflow-x-hidden lg:max-h-[70vh] lg:overflow-y-auto">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelected(s.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-surface-raised transition-colors flex items-center justify-between gap-3 ${
                    selected === s.id ? "lg:bg-surface-raised lg:border-l-2 lg:border-accent" : ""
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
            <div className="rounded-xl border border-edge bg-surface p-5 space-y-3">
              <button
                onClick={() => setSelected(null)}
                className="lg:hidden text-sm text-muted hover:text-foreground"
              >
                ← Indietro
              </button>
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-foreground">{selectedSection.titolo}</h2>
                {selectedSection.fonte === "costa_spada" ? (
                  <span className="shrink-0 rounded-full border border-edge px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted">
                    📷 OCR
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-accent-strong">
                    ✓ Verificato
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

/**
 * Nomi (a differenza delle descrizioni) sono corti: mostrarli in entrambe le lingue insieme
 * non confonde, anzi aiuta a riconoscere il termine — a differenza dei paragrafi lunghi,
 * dove inglese e italiano mischiati diventano illeggibili (da cui lo switch su EntriesBlock).
 */
function DualName({ text, inline = false }: { text: string; inline?: boolean }) {
  const translated = useTranslatedText(text, "en", "it");
  if (!translated || translated.toLowerCase() === text.toLowerCase()) return <>{text}</>;
  if (inline) {
    return (
      <>
        {text} <span className="text-muted font-normal">({translated})</span>
      </>
    );
  }
  return (
    <>
      <span className="block truncate">{text}</span>
      <span className="block truncate text-xs font-normal text-muted">{translated}</span>
    </>
  );
}

/** Corpo del testo (entries) nella lingua scelta: inglese formattato ricco, oppure italiano tradotto in blocchi semplici. */
function EntriesBlock({ entries, language }: { entries: FiveEntry[] | undefined; language: Language }) {
  const blocks = useMemo(() => flattenEntries(entries), [entries]);
  const [translated, setTranslated] = useState<string[] | null>(null);

  useEffect(() => {
    if (language !== "it" || blocks.length === 0) return;
    let cancelled = false;
    translateBatch(blocks, "en", "it").then((result) => {
      if (cancelled) return;
      setTranslated(result.map((text, index) => text ?? blocks[index]));
    });
    return () => {
      cancelled = true;
    };
  }, [blocks, language]);

  if (!entries || entries.length === 0) return null;

  if (language === "en") {
    return <RenderEntries entries={entries} />;
  }

  return (
    <div className="space-y-2">
      {translated ? (
        translated.map((text, index) => (
          <p key={index} className="text-sm text-foreground leading-relaxed">
            {text}
          </p>
        ))
      ) : (
        <p className="text-sm text-muted">Traduzione in corso…</p>
      )}
    </div>
  );
}

function SourceBadge({ source, books }: { source: string; books: Map<string, BookMeta> | null }) {
  const meta = books?.get(source);
  const edition: Edition = meta?.edition ?? "2014";
  return (
    <span
      className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${
        edition === "2024" ? "border-accent text-accent-strong" : "border-edge text-muted"
      }`}
      title={meta?.name ?? source}
    >
      {source}
    </span>
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

function EntryDetail({
  kind,
  entry,
  books,
  language,
  onBack,
}: {
  kind: CompendiumKind;
  entry: Entry;
  books: Map<string, BookMeta> | null;
  language: Language;
  onBack: () => void;
}) {
  const meta = books?.get(entry.source);
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-4">
      <button onClick={onBack} className="text-sm text-muted hover:text-foreground lg:hidden">
        ← Risultati
      </button>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-display font-bold text-accent-strong">
          <DualName text={entry.name} />
        </h2>
        <SourceBadge source={entry.source} books={books} />
      </div>
      {meta && <p className="text-xs text-muted -mt-2">{meta.name}</p>}

      {kind === "incantesimi" && <SpellDetail spell={entry as RawSpell} language={language} />}
      {kind === "mostri" && <CreatureDetail creature={entry as RawCreature} language={language} />}
      {kind === "oggetti" && <ItemDetail item={entry as RawItem} language={language} />}
      {kind === "razze" && <RaceDetail race={entry as RawRace} language={language} />}
      {kind === "talenti" && <FeatDetail feat={entry as RawFeat} language={language} />}
      {(kind === "background" || kind === "condizioni") && (
        <EntriesBlock
          entries={(entry as RawBackground | RawCondition).entries}
          language={language}
        />
      )}
      {kind === "classi" && <ClassDetail cls={entry as RawClass} language={language} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="rounded-lg border border-edge bg-surface-raised px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

const ITA_SOURCE_NAMES: Record<string, string> = {
  phb: "Manuale del Giocatore",
  mm: "Manuale dei Mostri",
};

function SpellDetail({ spell, language }: { spell: RawSpell; language: Language }) {
  const material = formatMaterial(spell.components);
  const translatedName = useTranslatedText(spell.name, "en", "it");
  const [itaSpells, setItaSpells] = useState<Awaited<ReturnType<typeof getIncantesimiIta>> | null>(
    null,
  );

  useEffect(() => {
    if (language !== "it") return;
    let cancelled = false;
    loadIncantesimiIta().then((data) => {
      if (!cancelled) setItaSpells(data);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const ufficiale = useMemo(() => {
    if (language !== "it" || !itaSpells || !translatedName) return null;
    const target = normalizeItaName(translatedName);
    return itaSpells.find((s) => normalizeItaName(s.nome) === target) ?? null;
  }, [language, itaSpells, translatedName]);

  if (ufficiale) {
    return (
      <>
        <p className="text-xs font-bold text-accent-strong">
          📖 Testo ufficiale · {ITA_SOURCE_NAMES[ufficiale.fonte] ?? ufficiale.fonte}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
          <Stat label="Scuola" value={ufficiale.scuola} />
          <Stat label="Livello" value={ufficiale.livello === 0 ? "Trucchetto" : ufficiale.livello} />
          <Stat label="Tempo di lancio" value={ufficiale.tempoDiLancio} />
          <Stat label="Gittata" value={ufficiale.gittata} />
          <Stat label="Componenti" value={ufficiale.componenti} />
          <Stat label="Durata" value={ufficiale.durata} />
        </div>
        <div className="border-t border-edge pt-3 space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted">Descrizione</p>
          {ufficiale.descrizione.split("\n\n").map((paragrafo, index) => (
            <p key={index} className="text-sm text-foreground leading-relaxed">
              {paragrafo}
            </p>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
        <Stat label="Scuola" value={formatSchool(spell.school)} />
        <Stat label="Livello" value={spell.level === 0 ? "Trucchetto" : spell.level} />
        <Stat label="Tempo di lancio" value={formatTime(spell.time)} />
        <Stat label="Gittata" value={formatRange(spell.range, language)} />
        <Stat label="Componenti" value={formatComponents(spell.components)} />
        <Stat label="Durata" value={formatDuration(spell.duration)} />
      </div>
      {material && <p className="text-sm text-muted italic">Materiali: {material}</p>}
      <div className="border-t border-edge pt-3 space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted">Descrizione</p>
        <EntriesBlock entries={spell.entries} language={language} />
      </div>
      {spell.entriesHigherLevel && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-1.5">A livelli superiori</p>
          <EntriesBlock entries={spell.entriesHigherLevel} language={language} />
        </div>
      )}
    </>
  );
}

const ACTION_GROUPS: { key: keyof RawCreature; label: string }[] = [
  { key: "trait", label: "Tratti" },
  { key: "action", label: "Azioni" },
  { key: "bonus", label: "Azioni bonus" },
  { key: "reaction", label: "Reazioni" },
  { key: "legendary", label: "Azioni leggendarie" },
];

const ITA_MONSTER_SECTIONS: { key: "tratti" | "azioni" | "azioniLeggendarie" | "reazioni"; label: string }[] = [
  { key: "tratti", label: "Tratti" },
  { key: "azioni", label: "Azioni" },
  { key: "azioniLeggendarie", label: "Azioni leggendarie" },
  { key: "reazioni", label: "Reazioni" },
];

function CreatureDetail({ creature, language }: { creature: RawCreature; language: Language }) {
  const abilities: [string, number][] = [
    ["FOR", creature.str],
    ["DES", creature.dex],
    ["COS", creature.con],
    ["INT", creature.int],
    ["SAG", creature.wis],
    ["CAR", creature.cha],
  ];

  const translatedName = useTranslatedText(creature.name, "en", "it");
  const [itaMostri, setItaMostri] = useState<Awaited<ReturnType<typeof getMostriIta>> | null>(null);

  useEffect(() => {
    if (language !== "it") return;
    let cancelled = false;
    loadMostriIta().then((data) => {
      if (!cancelled) setItaMostri(data);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const ufficiale = useMemo(() => {
    if (language !== "it" || !itaMostri || !translatedName) return null;
    const target = normalizeItaName(translatedName);
    return itaMostri.find((m) => normalizeItaName(m.nome) === target) ?? null;
  }, [language, itaMostri, translatedName]);

  if (ufficiale) {
    const itaAbilities: [string, { score: number; mod: string } | null][] = [
      ["FOR", ufficiale.caratteristiche?.FOR ?? null],
      ["DES", ufficiale.caratteristiche?.DES ?? null],
      ["COS", ufficiale.caratteristiche?.COS ?? null],
      ["INT", ufficiale.caratteristiche?.INT ?? null],
      ["SAG", ufficiale.caratteristiche?.SAG ?? null],
      ["CAR", ufficiale.caratteristiche?.CAR ?? null],
    ];
    return (
      <>
        <p className="text-xs font-bold text-accent-strong">
          📖 Testo ufficiale · {ITA_SOURCE_NAMES[ufficiale.fonte] ?? ufficiale.fonte}
        </p>
        {ufficiale.numericSuspect && (
          <p className="text-xs text-danger">
            ⚠️ Alcuni valori numerici di questa scheda potrebbero contenere refusi di estrazione dal PDF.
          </p>
        )}
        <p className="text-sm text-muted italic">
          {[ufficiale.taglia, ufficiale.tipo].filter(Boolean).join(" ")}
          {ufficiale.allineamento ? `, ${ufficiale.allineamento}` : ""}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 2xl:grid-cols-8 gap-3">
          <Stat label="CA" value={ufficiale.classeArmatura} />
          <Stat label="PF" value={ufficiale.puntiFerita} />
          <Stat label="Velocità" value={ufficiale.velocita} />
          <Stat label="Sfida" value={ufficiale.sfida ? `${ufficiale.sfida} (${ufficiale.pe} PE)` : null} />
        </div>
        <div className="grid grid-cols-6 gap-2 text-center">
          {itaAbilities.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-edge bg-surface-raised py-2">
              <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
              <p className="text-sm font-bold text-foreground">
                {value ? `${value.score} (${value.mod})` : "—"}
              </p>
            </div>
          ))}
        </div>
        <Stat label="Tiri salvezza" value={ufficiale.tiriSalvezza} />
        <Stat label="Abilità" value={ufficiale.abilita} />
        <Stat label="Vulnerabilità ai danni" value={ufficiale.vulnerabilitaDanni} />
        <Stat label="Resistenza ai danni" value={ufficiale.resistenzaDanni} />
        <Stat label="Immunità ai danni" value={ufficiale.immunitaDanni} />
        <Stat label="Immunità alle condizioni" value={ufficiale.immunitaCondizioni} />
        <Stat label="Sensi" value={ufficiale.sensi} />
        <Stat label="Linguaggi" value={ufficiale.linguaggi} />

        {ITA_MONSTER_SECTIONS.map((section) => {
          const text = ufficiale[section.key];
          if (!text) return null;
          return (
            <div key={section.key} className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-muted">{section.label}</p>
              {text.split("\n\n").map((paragrafo, index) => (
                <div key={index} className="rounded-lg border border-edge bg-surface-raised p-3">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                    {paragrafo}
                  </p>
                </div>
              ))}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-muted italic">
        {formatSize(creature.size)} {formatCreatureType(creature.type)} ·{" "}
        {formatAlignment(creature.alignment)}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 2xl:grid-cols-8 gap-3">
        <Stat label="CA" value={formatAC(creature.ac)} />
        <Stat label="PF" value={formatHP(creature.hp)} />
        <Stat label="Velocità" value={formatSpeed(creature.speed, language)} />
        <Stat label="Grado sfida" value={formatChallengeRating(creature.cr)} />
      </div>
      <div className="grid grid-cols-6 gap-2 text-center">
        {abilities.map(([label, score]) => (
          <div key={label} className="rounded-lg border border-edge bg-surface-raised py-2">
            <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
            <p className="text-sm font-bold text-foreground">
              {score} ({formatModifier(abilityModifier(score))})
            </p>
          </div>
        ))}
      </div>
      <Stat label="Percezione passiva" value={creature.passive} />
      <Stat label="Sensi" value={creature.senses?.join(", ")} />
      <Stat label="Linguaggi" value={creature.languages?.join(", ")} />

      {ACTION_GROUPS.map((group) => {
        const list = creature[group.key] as
          | { name: string; entries: import("@/lib/fivetools/entries").FiveEntry[] }[]
          | undefined;
        if (!list || list.length === 0) return null;
        return (
          <div key={group.key} className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted">{group.label}</p>
            {list.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className="rounded-lg border border-edge bg-surface-raised p-3"
              >
                <p className="text-sm font-bold text-foreground mb-1.5">
                  <DualName text={item.name} inline />
                </p>
                <EntriesBlock entries={item.entries} language={language} />
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

const ITEM_TYPE_NAMES: Record<string, string> = {
  RG: "Anello",
  WD: "Bacchetta",
  RD: "Verga",
  P: "Pozione",
  SC: "Pergamena",
  A: "Munizioni",
  M: "Arma da mischia",
  R: "Arma a distanza",
  LA: "Armatura leggera",
  MA: "Armatura media",
  HA: "Armatura pesante",
  S: "Scudo",
  INS: "Strumento",
};

function ItemDetail({ item, language }: { item: RawItem; language: Language }) {
  const typeName =
    (item.type && ITEM_TYPE_NAMES[item.type]) || (item.wondrous ? "Oggetto meraviglioso" : item.type);
  const attunement =
    item.reqAttune === true
      ? "richiede sintonia"
      : typeof item.reqAttune === "string"
        ? `richiede sintonia (${item.reqAttune})`
        : null;

  return (
    <>
      <p className="text-sm text-muted italic capitalize">
        {[typeName, item.rarity, attunement].filter(Boolean).join(" · ")}
      </p>
      <EntriesBlock entries={item.entries} language={language} />
    </>
  );
}

function RaceDetail({ race, language }: { race: RawRace; language: Language }) {
  const translatedName = useTranslatedText(race.name, "en", "it");
  const [itaRazze, setItaRazze] = useState<Awaited<ReturnType<typeof getRazzeIta>> | null>(null);

  useEffect(() => {
    if (language !== "it") return;
    let cancelled = false;
    loadRazzeIta().then((data) => {
      if (!cancelled) setItaRazze(data);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const ufficiale = useMemo(() => {
    if (language !== "it" || !itaRazze || !translatedName) return null;
    const target = normalizeItaName(translatedName);
    return itaRazze.find((r) => normalizeItaName(r.nome) === target) ?? null;
  }, [language, itaRazze, translatedName]);

  if (ufficiale) {
    return (
      <>
        <p className="text-xs font-bold text-accent-strong">
          📖 Testo ufficiale · {ITA_SOURCE_NAMES[ufficiale.fonte] ?? ufficiale.fonte}
        </p>
        {ufficiale.introduzione && (
          <p className="text-sm text-muted italic">{ufficiale.introduzione}</p>
        )}
        <div className="space-y-2">
          {ufficiale.tratti.map((tratto, index) => (
            <div key={index} className="rounded-lg border border-edge bg-surface-raised p-3">
              <p className="text-sm font-bold text-foreground mb-1">{tratto.nome}</p>
              <p className="text-sm text-foreground leading-relaxed">{tratto.testo}</p>
            </div>
          ))}
        </div>
        {ufficiale.sottorazze.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-muted">Sottorazze</p>
            {ufficiale.sottorazze.map((sottorazza, sIndex) => (
              <div key={sIndex} className="rounded-lg border border-edge bg-surface p-3 space-y-2">
                <p className="text-sm font-bold text-accent-strong">{sottorazza.nome}</p>
                {sottorazza.tratti.map((tratto, tIndex) => (
                  <div key={tIndex} className="rounded-lg border border-edge bg-surface-raised p-3">
                    <p className="text-sm font-bold text-foreground mb-1">{tratto.nome}</p>
                    <p className="text-sm text-foreground leading-relaxed">{tratto.testo}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 2xl:grid-cols-8 gap-3">
        <Stat label="Taglia" value={formatSize(race.size)} />
        <Stat label="Velocità" value={formatRaceSpeed(race.speed, language)} />
        <Stat label="Aumento caratteristiche" value={formatAbilityIncrease(race.ability)} />
        <Stat
          label="Scurovisione"
          value={race.darkvision ? formatFeet(race.darkvision, language) : undefined}
        />
      </div>
      <div className="border-t border-edge pt-3">
        <EntriesBlock entries={race.entries} language={language} />
      </div>
    </>
  );
}

function FeatDetail({ feat, language }: { feat: RawFeat; language: Language }) {
  const prerequisite = formatPrerequisite(feat.prerequisite);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {prerequisite && <Stat label="Prerequisiti" value={prerequisite} />}
        {feat.ability && <Stat label="Aumento caratteristiche" value={formatAbilityIncrease(feat.ability)} />}
      </div>
      <div className="border-t border-edge pt-3">
        <EntriesBlock entries={feat.entries} language={language} />
      </div>
    </>
  );
}

const CLASS_ABILITY_NAMES: Record<string, string> = {
  str: "Forza",
  dex: "Destrezza",
  con: "Costituzione",
  int: "Intelligenza",
  wis: "Saggezza",
  cha: "Carisma",
};

function buildTableColumns(cls: RawClass) {
  const groups = cls.classTableGroups ?? [];
  const labels = groups.flatMap((g) => g.colLabels.map((label) => stripTags(label)));
  const getCells = (levelIndex: number) =>
    groups.flatMap((g) => (g.rows ?? g.rowsSpellProgression ?? [])[levelIndex] ?? []);
  return { labels, getCells };
}

function ClassDetail({ cls, language }: { cls: RawClass; language: Language }) {
  const [classData, setClassData] = useState<ClassData | null>(null);
  const translatedName = useTranslatedText(cls.name, "en", "it");
  const [itaClassi, setItaClassi] = useState<Awaited<ReturnType<typeof getClassiIta>> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    loadClassData().then((data) => {
      if (!cancelled) setClassData(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (language !== "it") return;
    let cancelled = false;
    loadClassiIta().then((data) => {
      if (!cancelled) setItaClassi(data);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const ufficiale = useMemo(() => {
    if (language !== "it" || !itaClassi || !translatedName) return null;
    const target = normalizeItaName(translatedName);
    const match = itaClassi.find((c) => normalizeItaName(c.nome) === target);
    if (!match || Object.keys(match.tabellaLivelli).length === 0) return null;
    return match;
  }, [language, itaClassi, translatedName]);

  if (ufficiale) {
    const livelli = Object.entries(ufficiale.tabellaLivelli)
      .map(([livello, dati]) => ({ livello: Number(livello), ...dati }))
      .sort((a, b) => a.livello - b.livello);
    return (
      <>
        <p className="text-xs font-bold text-accent-strong">
          📖 Testo ufficiale · {ITA_SOURCE_NAMES[ufficiale.fonte] ?? ufficiale.fonte}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
          <Stat label="Dado vita" value={ufficiale.dadoVita} />
          <Stat label="Armature" value={ufficiale.armature} />
          <Stat label="Armi" value={ufficiale.armi} />
          <Stat label="Strumenti" value={ufficiale.strumenti} />
          <Stat label="Tiri salvezza" value={ufficiale.tiriSalvezza} />
          <Stat label="Abilità" value={ufficiale.abilita} />
        </div>
        {ufficiale.equipaggiamento && (
          <p className="text-sm text-muted">{ufficiale.equipaggiamento}</p>
        )}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted">Progressione</p>
          <p className="text-xs text-muted">
            Tabella ricostruita dal PDF: alcuni livelli senza nuovi privilegi non sono mostrati.
          </p>
          <div className="space-y-1.5">
            {livelli
              .filter((l) => l.privilegi.length > 0)
              .map((l) => (
                <div
                  key={l.livello}
                  className="flex items-start gap-3 rounded-lg border border-edge bg-surface-raised px-3 py-2"
                >
                  <span className="text-sm font-bold text-accent-strong shrink-0 w-16">
                    Liv. {l.livello}
                  </span>
                  <span className="text-sm text-foreground">{l.privilegi.join(", ")}</span>
                </div>
              ))}
          </div>
        </div>
      </>
    );
  }

  if (!classData) {
    return <p className="text-sm text-muted">Caricamento…</p>;
  }

  const names = new Set<string>();
  const subclasses = classData.subclasses
    .filter((sub) => sub.className === cls.name && sub.classSource === cls.source)
    .filter((sub) => (names.has(sub.name) ? false : (names.add(sub.name), true)));

  const classFeatures = resolveClassFeatures(classData, cls);
  const featuresByLevel = new Map<number, string[]>();
  for (const feature of classFeatures) {
    const list = featuresByLevel.get(feature.level) ?? [];
    list.push(feature.name);
    featuresByLevel.set(feature.level, list);
  }
  const columns = buildTableColumns(cls);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-6 gap-3">
        <Stat label="Dado vita" value={formatHitDie(cls.hd)} />
        <Stat
          label="Caratteristica incantatore"
          value={cls.spellcastingAbility ? CLASS_ABILITY_NAMES[cls.spellcastingAbility] : undefined}
        />
        <Stat
          label="Tiri salvezza"
          value={cls.proficiency?.map((code) => CLASS_ABILITY_NAMES[code] ?? code).join(", ")}
        />
        <Stat label="Armature" value={formatProficiencyList(cls.startingProficiencies?.armor)} />
        <Stat label="Armi" value={formatProficiencyList(cls.startingProficiencies?.weapons)} />
      </div>

      {classFeatures.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted">Progressione</p>
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-sm 2xl:text-xs">
              <thead>
                <tr className="bg-surface-raised">
                  <th className="px-3 py-2 2xl:px-2 2xl:py-1.5 text-left text-[10px] uppercase tracking-widest text-muted">
                    Liv.
                  </th>
                  <th className="px-3 py-2 2xl:px-2 2xl:py-1.5 text-left text-[10px] uppercase tracking-widest text-muted whitespace-nowrap">
                    Bonus comp.
                  </th>
                  {columns.labels.map((label, index) => (
                    <th
                      key={`${label}-${index}`}
                      className="px-3 py-2 2xl:px-2 2xl:py-1.5 text-left text-[10px] uppercase tracking-widest text-muted whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-2 2xl:px-2 2xl:py-1.5 text-left text-[10px] uppercase tracking-widest text-muted">
                    Caratteristiche
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 20 }, (_, index) => index + 1).map((level) => (
                  <tr
                    key={level}
                    className={level % 2 === 0 ? "bg-surface" : "bg-surface-raised/40"}
                  >
                    <td className="px-3 py-2 2xl:px-2 2xl:py-1.5 font-bold text-foreground">{level}</td>
                    <td className="px-3 py-2 2xl:px-2 2xl:py-1.5 text-muted">
                      {formatModifier(proficiencyBonus(level))}
                    </td>
                    {columns.getCells(level - 1).map((cell, index) => (
                      <td key={index} className="px-3 py-2 2xl:px-2 2xl:py-1.5 text-foreground whitespace-nowrap">
                        {formatTableCell(cell)}
                      </td>
                    ))}
                    <td className="px-3 py-2 2xl:px-2 2xl:py-1.5 text-foreground">
                      {(featuresByLevel.get(level) ?? []).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {classFeatures.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted">Caratteristiche di classe</p>
          {classFeatures.map((feature) => (
            <div
              key={`${feature.name}-${feature.level}`}
              className="rounded-lg border border-edge bg-surface-raised p-3"
            >
              <p className="text-sm font-bold text-foreground mb-1.5">
                <span className="text-accent-strong">Liv. {feature.level}</span> ·{" "}
                <DualName text={feature.name} inline />
              </p>
              <EntriesBlock entries={feature.entries} language={language} />
            </div>
          ))}
        </div>
      )}

      {subclasses.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted">
            {cls.subclassTitle ?? "Sottoclassi"}
          </p>
          {subclasses.map((sub) => (
            <SubclassAccordion
              key={sub.name}
              subclass={sub}
              classData={classData}
              language={language}
            />
          ))}
        </div>
      )}
    </>
  );
}

function SubclassAccordion({
  subclass,
  classData,
  language,
}: {
  subclass: RawSubclass;
  classData: ClassData;
  language: Language;
}) {
  const [open, setOpen] = useState(false);
  const features = useMemo(
    () => resolveSubclassFeatures(classData, subclass),
    [classData, subclass],
  );

  return (
    <div className="rounded-lg border border-edge bg-surface-raised overflow-hidden">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface transition-colors"
      >
        <span className="text-sm font-bold text-foreground">
          <DualName text={subclass.name} inline />
        </span>
        <span className="text-muted text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-edge pt-3">
          {features.length === 0 && (
            <p className="text-sm text-muted">Nessuna caratteristica trovata.</p>
          )}
          {features.map((feature) => (
            <div key={`${feature.name}-${feature.level}`}>
              <p className="text-sm font-bold text-foreground mb-1.5">
                <span className="text-accent-strong">Liv. {feature.level}</span> ·{" "}
                <DualName text={feature.name} inline />
              </p>
              <EntriesBlock entries={feature.entries} language={language} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
