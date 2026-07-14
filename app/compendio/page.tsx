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
import {
  formatAC,
  formatAbilityIncrease,
  formatAlignment,
  formatChallengeRating,
  formatComponents,
  formatCreatureType,
  formatDuration,
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
  formatTime,
} from "@/lib/fivetools/format";
import { abilityModifier, formatModifier } from "@/lib/dnd";

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
  const [kind, setKind] = useState<CompendiumKind>("incantesimi");
  const [edition, setEdition] = useState<EditionFilter>("entrambe");
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
    <div className="space-y-6 max-w-2xl mx-auto">
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
              setKind(tab.kind);
              setQuery("");
              setSelected(null);
              setPage(0);
            }}
            className={`rounded-lg border px-3 py-2 text-sm font-bold transition-colors ${
              kind === tab.kind
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      <div>
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

      {selected ? (
        <EntryDetail kind={kind} entry={selected} books={books} onBack={() => setSelected(null)} />
      ) : (
        <div className="space-y-2">
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
          <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface">
            {results.map((entry) => (
              <li key={`${entry.source}-${entry.name}`}>
                <button
                  onClick={() => setSelected(entry)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-raised transition-colors flex items-center justify-between gap-3"
                >
                  <span className="font-bold text-foreground">
                    {entry.name}
                    <ItalianName text={entry.name} />
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
                Pagina {currentPage + 1} di {totalPages} ({filtered.length} risultati)
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
      )}
    </div>
  );
}

function ItalianName({ text }: { text: string }) {
  const translated = useTranslatedText(text, "en", "it");
  if (!translated || translated.toLowerCase() === text.toLowerCase()) return null;
  return <span className="block text-xs font-normal text-muted">{translated}</span>;
}

function TranslatedBlock({ entries }: { entries: FiveEntry[] | undefined }) {
  const blocks = useMemo(() => flattenEntries(entries), [entries]);
  const [translated, setTranslated] = useState<string[] | null>(null);

  useEffect(() => {
    if (blocks.length === 0) return;
    let cancelled = false;
    translateBatch(blocks, "en", "it").then((result) => {
      if (cancelled) return;
      setTranslated(result.map((text, index) => text ?? blocks[index]));
    });
    return () => {
      cancelled = true;
    };
  }, [blocks]);

  if (blocks.length === 0) return null;
  return (
    <div className="space-y-1.5 border-t border-edge pt-3">
      <p className="text-[10px] uppercase tracking-widest text-muted">🇮🇹 Traduzione automatica</p>
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
  onBack,
}: {
  kind: CompendiumKind;
  entry: Entry;
  books: Map<string, BookMeta> | null;
  onBack: () => void;
}) {
  const meta = books?.get(entry.source);
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-4">
      <button onClick={onBack} className="text-sm text-muted hover:text-foreground">
        ← Risultati
      </button>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-display font-bold text-accent-strong">{entry.name}</h2>
          <ItalianName text={entry.name} />
        </div>
        <SourceBadge source={entry.source} books={books} />
      </div>
      {meta && <p className="text-xs text-muted -mt-2">{meta.name}</p>}

      {kind === "incantesimi" && <SpellDetail spell={entry as RawSpell} />}
      {kind === "mostri" && <CreatureDetail creature={entry as RawCreature} />}
      {kind === "oggetti" && <ItemDetail item={entry as RawItem} />}
      {kind === "razze" && <RaceDetail race={entry as RawRace} />}
      {kind === "talenti" && <FeatDetail feat={entry as RawFeat} />}
      {(kind === "background" || kind === "condizioni") && (
        <>
          <RenderEntries entries={(entry as RawBackground | RawCondition).entries} />
          <TranslatedBlock entries={(entry as RawBackground | RawCondition).entries} />
        </>
      )}
      {kind === "classi" && <ClassDetail cls={entry as RawClass} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function SpellDetail({ spell }: { spell: RawSpell }) {
  const material = formatMaterial(spell.components);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Scuola" value={formatSchool(spell.school)} />
        <Stat label="Livello" value={spell.level === 0 ? "Trucchetto" : spell.level} />
        <Stat label="Tempo di lancio" value={formatTime(spell.time)} />
        <Stat label="Gittata" value={formatRange(spell.range)} />
        <Stat label="Componenti" value={formatComponents(spell.components)} />
        <Stat label="Durata" value={formatDuration(spell.duration)} />
      </div>
      {material && <p className="text-sm text-muted italic">Materiali: {material}</p>}
      <RenderEntries entries={spell.entries} />
      {spell.entriesHigherLevel && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-1">A livelli superiori</p>
          <RenderEntries entries={spell.entriesHigherLevel} />
        </div>
      )}
      <TranslatedBlock entries={[...spell.entries, ...(spell.entriesHigherLevel ?? [])]} />
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

function CreatureDetail({ creature }: { creature: RawCreature }) {
  const abilities: [string, number][] = [
    ["FOR", creature.str],
    ["DES", creature.dex],
    ["COS", creature.con],
    ["INT", creature.int],
    ["SAG", creature.wis],
    ["CAR", creature.cha],
  ];

  return (
    <>
      <p className="text-sm text-muted italic">
        {formatSize(creature.size)} {formatCreatureType(creature.type)} ·{" "}
        {formatAlignment(creature.alignment)}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="CA" value={formatAC(creature.ac)} />
        <Stat label="PF" value={formatHP(creature.hp)} />
        <Stat label="Velocità" value={formatSpeed(creature.speed)} />
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
              <div key={`${item.name}-${index}`}>
                <p className="text-sm font-bold text-foreground">{item.name}</p>
                <RenderEntries entries={item.entries} />
                <TranslatedBlock entries={item.entries} />
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

function ItemDetail({ item }: { item: RawItem }) {
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
      <RenderEntries entries={item.entries} />
      <TranslatedBlock entries={item.entries} />
    </>
  );
}

function RaceDetail({ race }: { race: RawRace }) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Taglia" value={formatSize(race.size)} />
        <Stat label="Velocità" value={formatRaceSpeed(race.speed)} />
        <Stat label="Aumento caratteristiche" value={formatAbilityIncrease(race.ability)} />
        <Stat label="Scurovisione" value={race.darkvision ? `${race.darkvision} piedi` : undefined} />
      </div>
      <RenderEntries entries={race.entries} />
      <TranslatedBlock entries={race.entries} />
    </>
  );
}

function FeatDetail({ feat }: { feat: RawFeat }) {
  const prerequisite = formatPrerequisite(feat.prerequisite);
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {prerequisite && <Stat label="Prerequisiti" value={prerequisite} />}
        {feat.ability && <Stat label="Aumento caratteristiche" value={formatAbilityIncrease(feat.ability)} />}
      </div>
      <RenderEntries entries={feat.entries} />
      <TranslatedBlock entries={feat.entries} />
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

function ClassDetail({ cls }: { cls: RawClass }) {
  const [subclasses, setSubclasses] = useState<RawSubclass[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadClassData().then((data) => {
      if (cancelled) return;
      const names = new Set<string>();
      const matching = data.subclasses.filter(
        (sub) => sub.className === cls.name && sub.classSource === cls.source,
      );
      const deduped = matching.filter((sub) => {
        if (names.has(sub.name)) return false;
        names.add(sub.name);
        return true;
      });
      setSubclasses(deduped);
    });
    return () => {
      cancelled = true;
    };
  }, [cls.name, cls.source]);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
      {subclasses && subclasses.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-2">
            {cls.subclassTitle ?? "Sottoclassi"}
          </p>
          <ul className="flex flex-wrap gap-2">
            {subclasses.map((sub) => (
              <li
                key={sub.name}
                className="rounded-full border border-edge bg-surface-raised px-3 py-1 text-sm text-foreground"
              >
                {sub.name}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
