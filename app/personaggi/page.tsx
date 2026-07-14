"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { getMyCampaigns } from "@/app/actions/campaigns";
import { syncCharacterToCampaign } from "@/app/actions/characters";
import {
  ABILITIES,
  ABILITY_LABELS,
  POINT_BUY_BUDGET,
  STANDARD_ARRAY,
  abilityModifier,
  calculateMulticlassHitPoints,
  characterSchema,
  formatModifier,
  newCharacter,
  pointBuyCost,
  proficiencyBonus,
  roll4d6DropLowest,
  totalLevel,
  type Ability,
  type Character,
  type ClassEntry,
} from "@/lib/dnd";
import { useLocalCollection } from "@/lib/storage";
import {
  loadClassData,
  loadRaces,
  resolveSubclassFeatures,
  type RawSubclass,
} from "@/lib/fivetools/data";
import { RenderEntries } from "@/lib/fivetools/entries";
import { useTranslatedText } from "@/lib/fivetools/translate";

const loadClassNames = () => loadClassData().then((data) => data.classes);

function formatClassSummary(classi: ClassEntry[]): string {
  return classi
    .filter((entry) => entry.nome.trim())
    .map((entry) => `${entry.nome} ${entry.livello}`)
    .join(" / ");
}

function ExportImport({
  characters,
  onImport,
}: {
  characters: Character[];
  onImport: (imported: Character[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(characters, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `questzip-personaggi-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    file
      .text()
      .then((text) => {
        const parsed = characterSchema.array().safeParse(JSON.parse(text));
        if (!parsed.success) {
          setError("File non valido: non sembra un export di personaggi QuestZip.");
          return;
        }
        onImport(parsed.data.map((character) => ({ ...character, id: crypto.randomUUID() })));
      })
      .catch(() => setError("Impossibile leggere il file."));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {characters.length > 0 && (
        <button
          onClick={exportAll}
          className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-muted hover:text-foreground hover:border-accent/50 transition-colors"
        >
          ⬇ Esporta tutti (JSON)
        </button>
      )}
      <label className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-muted hover:text-foreground hover:border-accent/50 transition-colors cursor-pointer">
        ⬆ Importa
        <input type="file" accept="application/json" onChange={importFile} className="hidden" />
      </label>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export default function CharactersPage() {
  const { items, persist, loaded } = useLocalCollection("questzip:personaggi", characterSchema);
  const [editingId, setEditingId] = useState<string | null>(null);

  const editing = items.find((character) => character.id === editingId) ?? null;

  const upsert = (character: Character) => {
    const exists = items.some((item) => item.id === character.id);
    persist(
      exists
        ? items.map((item) => (item.id === character.id ? character : item))
        : [...items, character],
    );
  };

  const remove = (id: string) => {
    persist(items.filter((item) => item.id !== id));
    setEditingId(null);
  };

  const create = () => {
    const character = newCharacter();
    upsert(character);
    setEditingId(character.id);
  };

  if (!loaded) {
    return <p className="text-muted">Caricamento…</p>;
  }

  if (editing) {
    return (
      <CharacterSheet
        character={editing}
        onChange={upsert}
        onDelete={() => remove(editing.id)}
        onBack={() => setEditingId(null)}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-accent-strong">Personaggi</h1>
        <button
          onClick={create}
          className="rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors"
        >
          + Nuovo
        </button>
      </div>

      <ExportImport
        characters={items}
        onImport={(imported) => persist([...items, ...imported])}
      />

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge bg-surface/50 p-10 text-center text-muted">
          <p className="text-4xl mb-3">🛡️</p>
          <p>Nessun personaggio ancora. Crea il tuo primo eroe!</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((character) => (
            <li key={character.id}>
              <button
                onClick={() => setEditingId(character.id)}
                className="w-full text-left rounded-xl border border-edge bg-surface p-4 hover:border-accent/50 hover:bg-surface-raised transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">
                    {character.nome || "Senza nome"}
                  </span>
                  <span className="text-xs text-muted">
                    PF {character.hpAttuali}/{character.hpMax} · CA{" "}
                    {character.classeArmatura}
                  </span>
                </div>
                <p className="text-sm text-muted mt-0.5">
                  {[character.razza, formatClassSummary(character.classi)]
                    .filter(Boolean)
                    .join(" ") || "—"}{" "}
                  · Livello {totalLevel(character.classi)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CharacterSheet({
  character,
  onChange,
  onDelete,
  onBack,
}: {
  character: Character;
  onChange: (character: Character) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const set = <K extends keyof Character>(key: K, value: Character[K]) =>
    onChange({ ...character, [key]: value });

  const setAbility = (ability: Ability, value: number) =>
    onChange({
      ...character,
      caratteristiche: { ...character.caratteristiche, [ability]: value },
    });

  const clampInt = (value: string, min: number, max: number, fallback: number) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground";
  const labelClass = "text-xs uppercase tracking-widest text-muted";

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-muted hover:text-foreground">
          ← Personaggi
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Eliminare ${character.nome || "il personaggio"}?`)) {
              onDelete();
            }
          }}
          className="text-sm text-danger hover:underline"
        >
          Elimina
        </button>
      </div>

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-4">
        <label className="block">
          <span className={labelClass}>Nome</span>
          <input
            value={character.nome}
            onChange={(event) => set("nome", event.target.value)}
            placeholder="Es. Thorin Scudodiquercia"
            className={`${inputClass} text-lg font-bold`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Razza</span>
          <Autocomplete
            value={character.razza}
            onChange={(value) => set("razza", value)}
            loader={loadRaces}
            placeholder="Elf, Dwarf, Halfling…"
            inputClassName={inputClass}
          />
        </label>
      </section>

      <CampaignSync character={character} />

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-widest text-muted">
            Classi {character.classi.length > 1 && "(multiclasse)"}
          </h2>
          <button
            onClick={() =>
              set("classi", [...character.classi, { nome: "", livello: 1 }])
            }
            className="text-xs font-bold text-accent-strong hover:underline"
          >
            + Aggiungi classe
          </button>
        </div>
        {character.classi.map((entry, index) => (
          <ClassRow
            key={index}
            entry={entry}
            isPrimary={index === 0}
            onChange={(next) =>
              set(
                "classi",
                character.classi.map((c, i) => (i === index ? next : c)),
              )
            }
            onRemove={() =>
              set(
                "classi",
                character.classi.filter((_, i) => i !== index),
              )
            }
            canRemove={character.classi.length > 1}
          />
        ))}
        <p className="text-sm text-muted">
          Livello totale {totalLevel(character.classi)} · Bonus di competenza:{" "}
          <span className="font-bold text-accent-strong">
            {formatModifier(proficiencyBonus(totalLevel(character.classi)))}
          </span>
        </p>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-5">
        <h2 className="text-sm uppercase tracking-widest text-muted mb-4">
          Punti ferita e difesa
        </h2>
        <div className="flex items-center justify-center gap-3 mb-5">
          <button
            onClick={() => set("hpAttuali", character.hpAttuali - 1)}
            className="size-11 rounded-full border border-edge bg-surface-raised text-danger text-xl font-bold hover:border-danger transition-colors"
            aria-label="Togli un punto ferita"
          >
            −
          </button>
          <div className="text-center min-w-28">
            <div
              className={`text-4xl font-display font-bold ${
                character.hpAttuali <= 0
                  ? "text-danger"
                  : character.hpAttuali <= character.hpMax / 2
                    ? "text-accent"
                    : "text-foreground"
              }`}
            >
              {character.hpAttuali}
              <span className="text-lg text-muted"> / {character.hpMax}</span>
            </div>
            <p className="text-xs text-muted">punti ferita</p>
          </div>
          <button
            onClick={() =>
              set("hpAttuali", Math.min(character.hpMax, character.hpAttuali + 1))
            }
            className="size-11 rounded-full border border-edge bg-surface-raised text-accent-strong text-xl font-bold hover:border-accent transition-colors"
            aria-label="Aggiungi un punto ferita"
          >
            +
          </button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <label className="block">
            <span className={labelClass}>PF max</span>
            <input
              type="number"
              min={1}
              max={999}
              value={character.hpMax}
              onChange={(event) => {
                const hpMax = clampInt(event.target.value, 1, 999, character.hpMax);
                onChange({
                  ...character,
                  hpMax,
                  hpAttuali: Math.min(character.hpAttuali, hpMax),
                });
              }}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>CA</span>
            <input
              type="number"
              min={1}
              max={40}
              value={character.classeArmatura}
              onChange={(event) =>
                set(
                  "classeArmatura",
                  clampInt(event.target.value, 1, 40, character.classeArmatura),
                )
              }
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Velocità (m)</span>
            <input
              type="number"
              min={0}
              max={60}
              value={character.velocita}
              onChange={(event) =>
                set("velocita", clampInt(event.target.value, 0, 60, character.velocita))
              }
              className={inputClass}
            />
          </label>
        </div>
        <HitPointCalculator character={character} onApply={(hpMax) => onChange({ ...character, hpMax, hpAttuali: hpMax })} />
      </section>

      <AbilityScoreSection character={character} onChange={onChange} setAbility={setAbility} clampInt={clampInt} />

      <section className="rounded-xl border border-edge bg-surface p-5">
        <label className="block">
          <span className={labelClass}>Note</span>
          <textarea
            value={character.note}
            onChange={(event) => set("note", event.target.value)}
            placeholder="Equipaggiamento, incantesimi, background…"
            rows={5}
            className={inputClass}
          />
        </label>
      </section>
    </div>
  );
}

function CampaignSync({ character }: { character: Character }) {
  const { status } = useSession();
  const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof getMyCampaigns>> | null>(
    null,
  );
  const [selected, setSelected] = useState("");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    getMyCampaigns().then((list) => {
      setCampaigns(list);
      setSelected((prev) => prev || list[0]?.id || "");
    });
  }, [status]);

  if (status !== "authenticated") {
    return (
      <section className="rounded-xl border border-dashed border-edge bg-surface/50 p-4 text-sm text-muted flex items-center justify-between gap-3 flex-wrap">
        <span>Accedi per portare questo personaggio in una campagna condivisa.</span>
        <button
          onClick={() => signIn("google")}
          className="shrink-0 rounded-lg border border-edge px-3 py-1.5 text-xs font-bold text-foreground hover:border-accent transition-colors"
        >
          Accedi con Google
        </button>
      </section>
    );
  }

  if (campaigns === null) return null;

  if (campaigns.length === 0) {
    return (
      <section className="rounded-xl border border-dashed border-edge bg-surface/50 p-4 text-sm text-muted">
        Non fai parte di nessuna campagna condivisa ancora — creane una o unisciti da{" "}
        <span className="text-accent-strong">Campagne</span>.
      </section>
    );
  }

  const sync = async () => {
    if (!selected) return;
    setSyncing(true);
    setError(null);
    try {
      await syncCharacterToCampaign(selected, character);
      setSyncedAt(new Date());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <section className="rounded-xl border border-edge bg-surface p-4 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-widest text-muted shrink-0">
          Porta in campagna
        </span>
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
        >
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <button
          onClick={sync}
          disabled={syncing}
          className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-sm hover:bg-accent-strong transition-colors disabled:opacity-50"
        >
          {syncing ? "…" : "Sincronizza"}
        </button>
        {syncedAt && (
          <span className="text-xs text-accent-strong">
            ✓ Inviato alle {syncedAt.toLocaleTimeString("it-IT")}
          </span>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
      <p className="text-xs text-muted">
        ⚠️ Non è automatico: il gruppo vede uno scatto del personaggio al momento della
        sincronizzazione. Se lo modifichi dopo, premi di nuovo &ldquo;Sincronizza&rdquo; per aggiornarlo.
      </p>
    </section>
  );
}

function Autocomplete<T extends { name: string; source: string }>({
  value,
  onChange,
  loader,
  placeholder,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  loader: () => Promise<T[]>;
  placeholder: string;
  inputClassName: string;
}) {
  const [options, setOptions] = useState<T[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loader().then(setOptions);
  }, [loader]);

  const query = value.trim().toLowerCase();
  const suggestions =
    options && query.length >= 2
      ? Array.from(
          new Map(
            options.filter((o) => o.name.toLowerCase().includes(query)).map((o) => [o.name, o]),
          ).values(),
        ).slice(0, 8)
      : [];

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={inputClassName}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-edge bg-surface-raised shadow-lg">
          {suggestions.map((option) => (
            <li key={`${option.source}-${option.name}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.name);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface transition-colors"
              >
                {option.name}
                <ItalianHint text={option.name} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItalianHint({ text }: { text: string }) {
  const translated = useTranslatedText(text, "en", "it");
  if (!translated || translated.toLowerCase() === text.toLowerCase()) return null;
  return <span className="ml-2 text-xs text-muted">({translated})</span>;
}

function ClassRow({
  entry,
  isPrimary,
  onChange,
  onRemove,
  canRemove,
}: {
  entry: ClassEntry;
  isPrimary: boolean;
  onChange: (entry: ClassEntry) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const rowInputClass =
    "mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground";

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <span className="text-[10px] uppercase tracking-widest text-muted">
            {isPrimary ? "Classe di origine" : "Classe"}
          </span>
          <Autocomplete
            value={entry.nome}
            onChange={(nome) => onChange({ ...entry, nome, sottoclasse: undefined })}
            loader={loadClassNames}
            placeholder="Fighter, Wizard…"
            inputClassName={rowInputClass}
          />
        </div>
        <label className="block w-16 shrink-0">
          <span className="text-[10px] uppercase tracking-widest text-muted">Livello</span>
          <input
            type="number"
            min={1}
            max={20}
            value={entry.livello}
            onChange={(event) =>
              onChange({
                ...entry,
                livello: Math.min(20, Math.max(1, Number(event.target.value) || 1)),
              })
            }
            className={`${rowInputClass} text-center`}
          />
        </label>
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-muted hover:text-danger text-lg pb-1.5 shrink-0"
            aria-label="Rimuovi classe"
          >
            ×
          </button>
        )}
      </div>

      {entry.nome.trim() && (
        <ClassSubclassPicker
          key={entry.nome.trim().toLowerCase()}
          className={entry.nome}
          value={entry.sottoclasse}
          onChange={(sottoclasse) => onChange({ ...entry, sottoclasse })}
          inputClassName={rowInputClass}
        />
      )}

      {entry.sottoclasse && (
        <SubclassFeaturesToggle
          key={entry.sottoclasse}
          subclassName={entry.sottoclasse}
          className={entry.nome}
        />
      )}
    </div>
  );
}

function ClassSubclassPicker({
  className,
  value,
  onChange,
  inputClassName,
}: {
  className: string;
  value: string | undefined;
  onChange: (subclass: string | undefined) => void;
  inputClassName: string;
}) {
  const [subclasses, setSubclasses] = useState<RawSubclass[] | null>(null);
  const [title, setTitle] = useState("Sottoclasse");

  useEffect(() => {
    const name = className.trim().toLowerCase();
    if (!name) return;
    let cancelled = false;
    loadClassData().then((data) => {
      if (cancelled) return;
      const cls = data.classes.find((c) => c.name.toLowerCase() === name);
      if (!cls) return;
      setTitle(cls.subclassTitle ?? "Sottoclasse");
      const names = new Set<string>();
      const matches = data.subclasses.filter(
        (s) => s.className === cls.name && s.classSource === cls.source,
      );
      setSubclasses(matches.filter((s) => (names.has(s.name) ? false : (names.add(s.name), true))));
    });
    return () => {
      cancelled = true;
    };
  }, [className]);

  if (!subclasses || subclasses.length === 0) return null;

  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted">{title}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={inputClassName}
      >
        <option value="">— nessuna —</option>
        {subclasses.map((s) => (
          <option key={s.name} value={s.name}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function SubclassFeaturesToggle({
  subclassName,
  className,
}: {
  subclassName: string;
  className: string;
}) {
  const [showFeatures, setShowFeatures] = useState(false);
  const [features, setFeatures] = useState<
    { name: string; level: number; entries: import("@/lib/fivetools/entries").FiveEntry[] }[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    loadClassData().then((data) => {
      if (cancelled) return;
      const subclass = data.subclasses.find(
        (s) => s.name === subclassName && s.className.toLowerCase() === className.trim().toLowerCase(),
      );
      if (!subclass) return;
      setFeatures(resolveSubclassFeatures(data, subclass));
    });
    return () => {
      cancelled = true;
    };
  }, [subclassName, className]);

  return (
    <div>
      <button
        onClick={() => setShowFeatures((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {showFeatures ? "Nascondi" : "Come funziona"} {subclassName}
      </button>
      {showFeatures && (
        <div className="mt-2 space-y-3 border-t border-edge pt-3">
          {!features && <p className="text-sm text-muted">Caricamento…</p>}
          {features?.map((feature) => (
            <div
              key={`${feature.name}-${feature.level}`}
              className="rounded-lg border border-edge bg-surface p-3"
            >
              <p className="text-sm font-bold text-foreground mb-1.5">
                {feature.name}{" "}
                <span className="text-xs font-normal text-muted">(liv. {feature.level})</span>
              </p>
              <RenderEntries entries={feature.entries} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HitPointCalculator({
  character,
  onApply,
}: {
  character: Character;
  onApply: (hpMax: number) => void;
}) {
  const [hitDice, setHitDice] = useState<number[]>([]);
  const conModifier = abilityModifier(character.caratteristiche.costituzione);

  const suggested = calculateMulticlassHitPoints(
    character.classi.map((entry, index) => ({
      hitDieFaces: hitDice[index] ?? 8,
      livello: entry.livello,
    })),
    conModifier,
  );

  return (
    <div className="mt-4 pt-4 border-t border-edge space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-muted">Calcolatore PF</p>
      {character.classi.map((entry, index) => (
        <div key={index} className="flex items-center gap-3 text-sm">
          <span className="text-muted w-40 truncate">
            {entry.nome || `Classe ${index + 1}`} {entry.livello}
            {index === 0 && " (origine)"}
          </span>
          <select
            value={hitDice[index] ?? 8}
            onChange={(event) =>
              setHitDice((prev) => {
                const next = [...prev];
                while (next.length <= index) next.push(8);
                next[index] = Number(event.target.value);
                return next;
              })
            }
            className="rounded-md border border-edge bg-surface-raised px-2 py-1 text-sm text-foreground"
          >
            {[6, 8, 10, 12].map((faces) => (
              <option key={faces} value={faces}>
                d{faces}
              </option>
            ))}
          </select>
        </div>
      ))}
      <p className="text-sm text-muted">
        Con mod. COS {formatModifier(conModifier)} (1° livello della classe di origine
        massimizzato, il resto in media):{" "}
        <span className="font-bold text-accent-strong">{suggested} PF</span>
      </p>
      <button
        onClick={() => onApply(suggested)}
        className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-sm text-foreground hover:border-accent transition-colors"
      >
        Applica a PF max
      </button>
    </div>
  );
}

type GenMode = "manuale" | "array" | "punti" | "dadi";
const GEN_MODE_LABELS: Record<GenMode, string> = {
  manuale: "Manuale",
  array: "Array standard",
  punti: "Acquisto punti",
  dadi: "Tira i dadi",
};

function AbilityScoreSection({
  character,
  onChange,
  setAbility,
  clampInt,
}: {
  character: Character;
  onChange: (character: Character) => void;
  setAbility: (ability: Ability, value: number) => void;
  clampInt: (value: string, min: number, max: number, fallback: number) => number;
}) {
  const [mode, setMode] = useState<GenMode>("manuale");
  const [pool, setPool] = useState<number[]>([...STANDARD_ARRAY]);
  const [assignment, setAssignment] = useState<Partial<Record<Ability, number>>>({});

  const switchMode = (next: GenMode) => {
    setMode(next);
    setAssignment({});
    if (next === "array") setPool([...STANDARD_ARRAY]);
    if (next === "punti") {
      onChange({
        ...character,
        caratteristiche: {
          forza: 8,
          destrezza: 8,
          costituzione: 8,
          intelligenza: 8,
          saggezza: 8,
          carisma: 8,
        },
      });
    }
  };

  const reroll = () => {
    setPool(Array.from({ length: 6 }, () => roll4d6DropLowest()).sort((a, b) => b - a));
    setAssignment({});
  };

  const assignFromPool = (ability: Ability, index: number) => {
    setAssignment((prev) => ({ ...prev, [ability]: index }));
    setAbility(ability, pool[index]);
  };

  const spent = pointBuyCost(character.caratteristiche);
  const usedIndexes = new Set(Object.values(assignment));

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-muted">Caratteristiche</h2>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(GEN_MODE_LABELS) as GenMode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                mode === m
                  ? "border-accent bg-accent/15 text-accent-strong"
                  : "border-edge text-muted hover:text-foreground"
              }`}
            >
              {GEN_MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {mode === "punti" && (
        <p
          className={`text-sm font-bold ${spent > POINT_BUY_BUDGET ? "text-danger" : "text-accent-strong"}`}
        >
          Punti spesi: {spent} / {POINT_BUY_BUDGET}
        </p>
      )}

      {mode === "dadi" && (
        <button
          onClick={reroll}
          className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-sm text-foreground hover:border-accent transition-colors"
        >
          🎲 Tira i 6 dadi (4d6, scarta il minore)
        </button>
      )}

      {(mode === "array" || mode === "dadi") && (
        <p className="text-xs text-muted">
          Valori disponibili: {pool.join(", ")} — assegnali qui sotto.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ABILITIES.map((ability) => {
          const score = character.caratteristiche[ability];
          return (
            <div
              key={ability}
              className="rounded-lg border border-edge bg-surface-raised p-3 text-center"
            >
              <p className="text-[10px] uppercase tracking-widest text-muted">
                {ABILITY_LABELS[ability]}
              </p>
              <p className="text-2xl font-display font-bold text-accent-strong">
                {formatModifier(abilityModifier(score))}
              </p>

              {mode === "manuale" && (
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={score}
                  onChange={(event) =>
                    setAbility(ability, clampInt(event.target.value, 1, 30, score))
                  }
                  className="mt-1 w-16 mx-auto block rounded-md border border-edge bg-surface px-2 py-1 text-center text-sm text-foreground"
                />
              )}

              {mode === "punti" && (
                <div className="flex items-center justify-center gap-2 mt-1">
                  <button
                    onClick={() => setAbility(ability, Math.max(8, score - 1))}
                    disabled={score <= 8}
                    className="size-7 rounded-full border border-edge text-foreground disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="w-6 text-sm font-bold text-foreground">{score}</span>
                  <button
                    onClick={() => setAbility(ability, Math.min(15, score + 1))}
                    disabled={score >= 15}
                    className="size-7 rounded-full border border-edge text-foreground disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              )}

              {(mode === "array" || mode === "dadi") && (
                <select
                  value={assignment[ability] ?? ""}
                  onChange={(event) => assignFromPool(ability, Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1 text-center text-sm text-foreground"
                >
                  <option value="" disabled>
                    —
                  </option>
                  {pool.map((value, index) =>
                    !usedIndexes.has(index) || assignment[ability] === index ? (
                      <option key={index} value={index}>
                        {value}
                      </option>
                    ) : null,
                  )}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
