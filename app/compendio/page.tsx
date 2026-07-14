"use client";

import { useEffect, useState } from "react";
import {
  formatChallengeRating,
  formatSpeed,
  searchCompendium,
  type CompendiumKind,
  type Creature,
  type CreatureAction,
  type MagicItem,
  type Spell,
} from "@/lib/open5e";

const TABS: { kind: CompendiumKind; label: string; icon: string; placeholder: string }[] = [
  { kind: "incantesimi", label: "Incantesimi", icon: "✨", placeholder: "Cerca un incantesimo (in inglese)…" },
  { kind: "mostri", label: "Mostri", icon: "🐉", placeholder: "Cerca un mostro (in inglese)…" },
  { kind: "oggetti", label: "Oggetti magici", icon: "💍", placeholder: "Cerca un oggetto magico (in inglese)…" },
];

type Entry = Spell | Creature | MagicItem;

export default function CompendiumPage() {
  const [kind, setKind] = useState<CompendiumKind>("incantesimi");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Entry | null>(null);

  useEffect(() => {
    setSelected(null);
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await searchCompendium<Entry>(kind, query, controller.signal);
        setResults(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError("Impossibile contattare il compendio (Open5e). Riprova tra poco.");
        }
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [kind, query]);

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold text-accent-strong">Compendio</h1>
        <p className="text-sm text-muted mt-1">
          Regole SRD 5.2 via{" "}
          <a
            href="https://open5e.com"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            Open5e
          </a>
          . Il database è in inglese.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.kind}
            onClick={() => {
              setKind(tab.kind);
              setQuery("");
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

      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={TABS.find((tab) => tab.kind === kind)?.placeholder}
        className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
      />

      {selected ? (
        <EntryDetail kind={kind} entry={selected} onBack={() => setSelected(null)} />
      ) : (
        <div className="space-y-2">
          {loading && <p className="text-sm text-muted text-center py-6">Ricerca in corso…</p>}
          {error && <p className="text-sm text-danger text-center py-6">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <p className="text-sm text-muted text-center py-6">
              {query.trim() ? "Nessun risultato." : "Digita qualcosa per iniziare a cercare."}
            </p>
          )}
          <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface">
            {results.map((entry) => (
              <li key={entry.key}>
                <button
                  onClick={() => setSelected(entry)}
                  className="w-full text-left px-4 py-3 hover:bg-surface-raised transition-colors flex items-center justify-between gap-3"
                >
                  <span className="font-bold text-foreground">{entry.name}</span>
                  <EntrySubtitle kind={kind} entry={entry} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function EntrySubtitle({ kind, entry }: { kind: CompendiumKind; entry: Entry }) {
  if (kind === "incantesimi") {
    const spell = entry as Spell;
    return (
      <span className="text-xs text-muted shrink-0">
        {spell.school.name} · {spell.level === 0 ? "trucchetto" : `liv. ${spell.level}`}
      </span>
    );
  }
  if (kind === "mostri") {
    const creature = entry as Creature;
    return (
      <span className="text-xs text-muted shrink-0">
        GS {formatChallengeRating(creature.challenge_rating)} · {creature.type.name}
      </span>
    );
  }
  const item = entry as MagicItem;
  return <span className="text-xs text-muted shrink-0">{item.rarity.name}</span>;
}

function EntryDetail({
  kind,
  entry,
  onBack,
}: {
  kind: CompendiumKind;
  entry: Entry;
  onBack: () => void;
}) {
  return (
    <div className="rounded-xl border border-edge bg-surface p-5 space-y-4">
      <button onClick={onBack} className="text-sm text-muted hover:text-foreground">
        ← Risultati
      </button>
      <h2 className="text-2xl font-display font-bold text-accent-strong">{entry.name}</h2>

      {kind === "incantesimi" && <SpellDetail spell={entry as Spell} />}
      {kind === "mostri" && <CreatureDetail creature={entry as Creature} />}
      {kind === "oggetti" && <ItemDetail item={entry as MagicItem} />}
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

function SpellDetail({ spell }: { spell: Spell }) {
  const components = [
    spell.verbal && "V",
    spell.somatic && "S",
    spell.material && "M",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="Scuola" value={spell.school.name} />
        <Stat label="Livello" value={spell.level === 0 ? "Trucchetto" : spell.level} />
        <Stat label="Tempo di lancio" value={spell.casting_time} />
        <Stat label="Gittata" value={spell.range_text} />
        <Stat label="Componenti" value={components} />
        <Stat label="Durata" value={`${spell.duration}${spell.concentration ? " (concentrazione)" : ""}`} />
        <Stat label="Classi" value={spell.classes.map((c) => c.name).join(", ")} />
        {spell.ritual && <Stat label="Rituale" value="Sì" />}
      </div>
      {spell.material_specified && (
        <p className="text-sm text-muted italic">Materiali: {spell.material_specified}</p>
      )}
      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
        {spell.desc}
      </p>
      {spell.higher_level && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-1">
            A livelli superiori
          </p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{spell.higher_level}</p>
        </div>
      )}
    </>
  );
}

const ACTION_GROUPS: { type: CreatureAction["action_type"]; label: string }[] = [
  { type: "ACTION", label: "Azioni" },
  { type: "BONUS_ACTION", label: "Azioni bonus" },
  { type: "REACTION", label: "Reazioni" },
  { type: "LEGENDARY_ACTION", label: "Azioni leggendarie" },
];

function CreatureDetail({ creature }: { creature: Creature }) {
  const abilities: [string, number][] = [
    ["FOR", creature.ability_scores.strength],
    ["DES", creature.ability_scores.dexterity],
    ["COS", creature.ability_scores.constitution],
    ["INT", creature.ability_scores.intelligence],
    ["SAG", creature.ability_scores.wisdom],
    ["CAR", creature.ability_scores.charisma],
  ];

  return (
    <>
      <p className="text-sm text-muted italic">
        {creature.size.name} {creature.type.name} · {creature.alignment}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat
          label="CA"
          value={`${creature.armor_class}${creature.armor_detail ? ` (${creature.armor_detail})` : ""}`}
        />
        <Stat label="PF" value={`${creature.hit_points} (${creature.hit_dice})`} />
        <Stat label="Velocità" value={formatSpeed(creature.speed)} />
        <Stat label="Grado sfida" value={formatChallengeRating(creature.challenge_rating)} />
      </div>
      <div className="grid grid-cols-6 gap-2 text-center">
        {abilities.map(([label, score]) => (
          <div key={label} className="rounded-lg border border-edge bg-surface-raised py-2">
            <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
            <p className="text-sm font-bold text-foreground">{score}</p>
          </div>
        ))}
      </div>
      <Stat label="Percezione passiva" value={creature.passive_perception} />
      <Stat label="Scurovisione" value={creature.darkvision_range ? `${creature.darkvision_range} ft.` : undefined} />
      <Stat label="Linguaggi" value={creature.languages?.as_string} />

      {creature.traits && creature.traits.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted">Tratti</p>
          {creature.traits.map((trait) => (
            <p key={trait.name} className="text-sm text-foreground">
              <span className="font-bold">{trait.name}.</span> {trait.desc}
            </p>
          ))}
        </div>
      )}

      {ACTION_GROUPS.map((group) => {
        const actions = creature.actions?.filter((action) => action.action_type === group.type);
        if (!actions || actions.length === 0) return null;
        return (
          <div key={group.type} className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted">{group.label}</p>
            {actions.map((action, index) => (
              <p key={`${action.name}-${index}`} className="text-sm text-foreground">
                <span className="font-bold">{action.name}.</span> {action.desc}
              </p>
            ))}
          </div>
        );
      })}
    </>
  );
}

function ItemDetail({ item }: { item: MagicItem }) {
  return (
    <>
      <p className="text-sm text-muted italic">
        {item.category.name} · {item.rarity.name}
        {item.requires_attunement && ` · richiede sintonia${item.attunement_detail ? ` (${item.attunement_detail})` : ""}`}
      </p>
      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{item.desc}</p>
    </>
  );
}
