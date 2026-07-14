"use client";

import { useEffect, useMemo, useState } from "react";
import { loadBooks, type BookMeta, type Edition } from "@/lib/fivetools/books";
import {
  loadCreatures,
  loadItems,
  loadSpells,
  type CompendiumKind,
  type EditionFilter,
  type RawCreature,
  type RawItem,
  type RawSpell,
} from "@/lib/fivetools/data";
import { RenderEntries } from "@/lib/fivetools/entries";
import {
  formatAC,
  formatAlignment,
  formatChallengeRating,
  formatComponents,
  formatCreatureType,
  formatDuration,
  formatHP,
  formatMaterial,
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
];

const EDITIONS: { value: EditionFilter; label: string }[] = [
  { value: "entrambe", label: "Entrambe" },
  { value: "2014", label: "2014" },
  { value: "2024", label: "2024/25" },
];

type Entry = RawSpell | RawCreature | RawItem;

export default function CompendiumPage() {
  const [kind, setKind] = useState<CompendiumKind>("incantesimi");
  const [edition, setEdition] = useState<EditionFilter>("entrambe");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Entry | null>(null);

  const [books, setBooks] = useState<Map<string, BookMeta> | null>(null);
  const [spells, setSpells] = useState<RawSpell[] | null>(null);
  const [creatures, setCreatures] = useState<RawCreature[] | null>(null);
  const [items, setItems] = useState<RawItem[] | null>(null);

  useEffect(() => {
    loadBooks().then(setBooks);
  }, []);

  useEffect(() => {
    const alreadyLoaded =
      (kind === "incantesimi" && spells) ||
      (kind === "mostri" && creatures) ||
      (kind === "oggetti" && items);
    if (alreadyLoaded) return;

    let cancelled = false;
    const loader =
      kind === "incantesimi" ? loadSpells() : kind === "mostri" ? loadCreatures() : loadItems();
    loader.then((data) => {
      if (cancelled) return;
      if (kind === "incantesimi") setSpells(data as RawSpell[]);
      else if (kind === "mostri") setCreatures(data as RawCreature[]);
      else setItems(data as RawItem[]);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, spells, creatures, items]);

  const categoryData: Entry[] | null =
    kind === "incantesimi" ? spells : kind === "mostri" ? creatures : items;
  const loadingCategory = categoryData === null;

  const results = useMemo(() => {
    if (!categoryData || !books) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return categoryData
      .filter((entry) => entry.name.toLowerCase().includes(q))
      .filter((entry) => {
        if (edition === "entrambe") return true;
        return books.get(entry.source)?.edition === edition;
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 60);
  }, [categoryData, books, query, edition]);

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

      <div className="grid grid-cols-3 gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            onClick={() => {
              setKind(tab.kind);
              setQuery("");
              setSelected(null);
            }}
            className={`rounded-lg border py-2 text-sm font-bold transition-colors ${
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
        }}
        placeholder="Cerca (in inglese)…"
        className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
      />

      {selected ? (
        <EntryDetail
          kind={kind}
          entry={selected}
          books={books}
          onBack={() => setSelected(null)}
        />
      ) : (
        <div className="space-y-2">
          {loadingCategory && (
            <p className="text-sm text-muted text-center py-6">
              Caricamento contenuti in corso…
            </p>
          )}
          {!loadingCategory && categoryData && categoryData.length === 0 && (
            <p className="text-sm text-danger text-center py-6">
              Impossibile caricare il compendio. Verifica la connessione e riprova.
            </p>
          )}
          {!loadingCategory && categoryData && categoryData.length > 0 && results.length === 0 && (
            <p className="text-sm text-muted text-center py-6">
              {query.trim() ? "Nessun risultato." : "Digita qualcosa per iniziare a cercare."}
            </p>
          )}
          <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface">
            {results.map((entry) => (
              <li key={`${entry.source}-${entry.name}`}>
                <button
                  onClick={() => setSelected(entry)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-raised transition-colors flex items-center justify-between gap-3"
                >
                  <span className="font-bold text-foreground">{entry.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <EntrySubtitle kind={kind} entry={entry} />
                    <SourceBadge source={entry.source} books={books} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SourceBadge({
  source,
  books,
}: {
  source: string;
  books: Map<string, BookMeta> | null;
}) {
  const meta = books?.get(source);
  const edition: Edition = meta?.edition ?? "2014";
  return (
    <span
      className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${
        edition === "2024"
          ? "border-accent text-accent-strong"
          : "border-edge text-muted"
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
  const item = entry as RawItem;
  return <span className="text-xs text-muted capitalize">{item.rarity}</span>;
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
        <h2 className="text-2xl font-display font-bold text-accent-strong">{entry.name}</h2>
        <SourceBadge source={entry.source} books={books} />
      </div>
      {meta && <p className="text-xs text-muted -mt-2">{meta.name}</p>}

      {kind === "incantesimi" && <SpellDetail spell={entry as RawSpell} />}
      {kind === "mostri" && <CreatureDetail creature={entry as RawCreature} />}
      {kind === "oggetti" && <ItemDetail item={entry as RawItem} />}
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
          <p className="text-xs uppercase tracking-widest text-muted mb-1">
            A livelli superiori
          </p>
          <RenderEntries entries={spell.entriesHigherLevel} />
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
        const list = creature[group.key] as { name: string; entries: import("@/lib/fivetools/entries").FiveEntry[] }[] | undefined;
        if (!list || list.length === 0) return null;
        return (
          <div key={group.key} className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted">{group.label}</p>
            {list.map((item, index) => (
              <div key={`${item.name}-${index}`}>
                <p className="text-sm font-bold text-foreground">{item.name}</p>
                <RenderEntries entries={item.entries} />
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
  const typeName = (item.type && ITEM_TYPE_NAMES[item.type]) || (item.wondrous ? "Oggetto meraviglioso" : item.type);
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
    </>
  );
}
