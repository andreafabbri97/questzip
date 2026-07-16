"use client";

import { useEffect, useState } from "react";
import { useSession, signIn } from "next-auth/react";
import { getMyCampaigns } from "@/app/actions/campaigns";
import { claimXp, getMyCharacterInCampaign, syncCharacterToCampaign } from "@/app/actions/characters";
import { getOggettiIta, getTalentiIta } from "@/app/actions/compendio-ita";
import {
  ABILITIES,
  ABILITY_CODE_TO_KEY,
  ABILITY_LABELS,
  ALIGNMENTS,
  CONDIZIONI_5E,
  DAMAGE_TYPES,
  LANGUAGES,
  POINT_BUY_BUDGET,
  SKILLS,
  STANDARD_ARRAY,
  abilityModifier,
  calculateMulticlassHitPoints,
  canonicalClassName,
  characterSchema,
  formatModifier,
  levelForXp,
  multiclassCasterLevel,
  newCharacter,
  pactMagicForLevel,
  passivePerception,
  pointBuyCost,
  primaryCastingAbility,
  proficiencyBonus,
  roll4d6DropLowest,
  savingThrowModifier,
  skillModifier,
  spellAttackBonus,
  spellSaveDC,
  spellSlotsForCasterLevel,
  totalLevel,
  warlockLevel,
  weaponAbilityModifier,
  weaponAttackBonus,
  xpForNextLevel,
  XP_PER_LEVEL,
  type Ability,
  type Character,
  type ClassEntry,
  type InventoryItem,
  type KnownFeat,
  type KnownSpell,
  type Weapon,
} from "@/lib/dnd";
import { useLocalCollection } from "@/lib/storage";
import {
  loadBackgrounds,
  loadClassData,
  loadFeats,
  loadItems,
  loadRaces,
  loadSpells,
  resolveClassFeatures,
  resolveSubclassFeatures,
  type RawBackground,
  type RawFeat,
  type RawItem,
  type RawRace,
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
    <div className="space-y-6 max-w-2xl lg:max-w-3xl mx-auto">
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
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((character) => (
            <li key={character.id}>
              <button
                onClick={() => setEditingId(character.id)}
                className="w-full h-full text-left rounded-xl border border-edge bg-surface p-4 hover:border-accent/50 hover:bg-surface-raised transition-colors"
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

  // Se il livello di una classe viene alzato a mano (es. creando direttamente un personaggio
  // di livello 5, non arrivandoci giocando), gli XP restano indietro e il personaggio mostra
  // un mismatch permanente finché qualcuno non li corregge a mano. Li allinea da solo al minimo
  // richiesto per quel livello — mai verso il basso: se il giocatore rimuove una classe o
  // abbassa un livello, gli XP già accumulati restano quelli, non li perde per uno sbaglio di
  // battitura. Le altre statistiche derivate (PF suggeriti, slot incantesimo, bonus competenza)
  // seguono già il livello di classe direttamente, non gli XP — non serve altro.
  const setClassi = (classi: ClassEntry[]) => {
    const newLevel = totalLevel(classi);
    const minXp = newLevel > 1 ? XP_PER_LEVEL[Math.min(20, newLevel) - 1] : 0;
    const esperienza = character.esperienza < minXp ? minXp : character.esperienza;
    onChange({ ...character, classi, esperienza });
  };

  const clampInt = (value: string, min: number, max: number, fallback: number) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) return fallback;
    return Math.min(max, Math.max(min, Math.trunc(parsed)));
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground";
  const labelClass = "text-xs uppercase tracking-widest text-muted";

  return (
    <div className="space-y-6 max-w-2xl lg:max-w-3xl mx-auto">
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

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
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
          <label className="block">
            <span className={labelClass}>Allineamento</span>
            <select
              value={character.allineamento}
              onChange={(event) => set("allineamento", event.target.value)}
              className={inputClass}
            >
              <option value="">— non scelto —</option>
              {ALIGNMENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelClass}>Background</span>
            <Autocomplete
              value={character.background}
              onChange={(value) => set("background", value)}
              loader={loadBackgrounds}
              placeholder="Acolyte, Soldier, Sage…"
              inputClassName={inputClass}
            />
          </label>
          <BackgroundTraits background={character.background} />
        </section>

        <section className="rounded-xl border border-edge bg-surface p-5 space-y-3 mt-6 lg:mt-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-widest text-muted">
              Classi {character.classi.length > 1 && "(multiclasse)"}
            </h2>
            <button
              onClick={() =>
                setClassi([...character.classi, { nome: "", livello: 1 }])
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
                setClassi(
                  character.classi.map((c, i) => (i === index ? next : c)),
                )
              }
              onRemove={() =>
                setClassi(
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
          <XpTracker character={character} onChange={onChange} />
          <LevelUpWizard character={character} onChange={onChange} />
        </section>
      </div>

      <CampaignSync character={character} onChange={onChange} />

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
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
              {character.hpTemporanei > 0 && (
                <span className="text-lg text-accent-strong"> +{character.hpTemporanei}</span>
              )}
            </div>
            <p className="text-xs text-muted">punti ferita</p>
          </div>
          <button
            onClick={() => {
              const hpAttuali = Math.min(character.hpMax, character.hpAttuali + 1);
              // recuperare anche un solo punto ferita azzera i tiri salvezza contro la morte (regola RAW)
              const resetDeathSaves =
                character.hpAttuali <= 0 && hpAttuali > 0
                  ? { tiriMorteSuccessi: 0, tiriMorteFallimenti: 0 }
                  : {};
              onChange({ ...character, hpAttuali, ...resetDeathSaves });
            }}
            className="size-11 rounded-full border border-edge bg-surface-raised text-accent-strong text-xl font-bold hover:border-accent transition-colors"
            aria-label="Aggiungi un punto ferita"
          >
            +
          </button>
        </div>
        {character.hpAttuali <= 0 && <DeathSaves character={character} onChange={onChange} />}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
            <span className={labelClass}>PF temporanei</span>
            <input
              type="number"
              min={0}
              max={999}
              value={character.hpTemporanei}
              onChange={(event) =>
                set("hpTemporanei", clampInt(event.target.value, 0, 999, character.hpTemporanei))
              }
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
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="rounded-lg border border-edge bg-surface-raised px-3 py-2 text-center">
            <span className={labelClass}>Iniziativa</span>
            <p className="text-lg font-bold text-foreground">
              {formatModifier(abilityModifier(character.caratteristiche.destrezza))}
            </p>
          </div>
          <div className="rounded-lg border border-edge bg-surface-raised px-3 py-2 text-center">
            <span className={labelClass}>Percezione passiva</span>
            <p className="text-lg font-bold text-foreground">
              {passivePerception(
                character.caratteristiche.saggezza,
                character.abilitaCompetenti.includes("Percezione"),
                character.abilitaEsperte.includes("Percezione"),
                totalLevel(character.classi),
              )}
            </p>
          </div>
        </div>
        <HitPointCalculator
          character={character}
          onApply={(hpMax) =>
            onChange({
              ...character,
              hpMax,
              hpAttuali: hpMax,
              tiriMorteSuccessi: 0,
              tiriMorteFallimenti: 0,
            })
          }
        />
      </section>

      <div className="mt-6 lg:mt-0">
        <AbilityScoreSection character={character} onChange={onChange} setAbility={setAbility} clampInt={clampInt} />
      </div>
      </div>

      <SavingThrowsAndSkills character={character} onChange={onChange} />

      <ActiveConditionsSection character={character} onChange={onChange} />

      <RaceTraits razza={character.razza} />

      <ClassFeaturesSection character={character} />

      <TalentiSection character={character} onChange={onChange} />

      <LanguagesAndResistancesSection character={character} onChange={onChange} />

      <PersonalitySection character={character} onChange={onChange} />

      <InventorySection character={character} onChange={onChange} />

      <WeaponsSection character={character} onChange={onChange} />

      <SpellSlotsSection character={character} onChange={onChange} />

      <SpellListSection character={character} onChange={onChange} />

      <section className="rounded-xl border border-edge bg-surface p-5">
        <label className="block">
          <span className={labelClass}>Note</span>
          <textarea
            value={character.note}
            onChange={(event) => set("note", event.target.value)}
            placeholder="Retroscena, alleati, altri dettagli…"
            rows={5}
            className={inputClass}
          />
        </label>
      </section>
    </div>
  );
}

function CampaignSync({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const { status } = useSession();
  const [campaigns, setCampaigns] = useState<Awaited<ReturnType<typeof getMyCampaigns>> | null>(
    null,
  );
  const [selected, setSelected] = useState("");
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingXp, setPendingXp] = useState(0);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;
    getMyCampaigns().then((list) => {
      setCampaigns(list);
      setSelected((prev) => prev || list[0]?.id || "");
    });
  }, [status]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    getMyCharacterInCampaign(selected).then((row) => {
      if (!cancelled) setPendingXp(row?.xpInSospeso ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const claim = async () => {
    if (!selected || pendingXp <= 0) return;
    setClaiming(true);
    try {
      const { amount, autoLevelUp } = await claimXp(selected);
      if (amount > 0) {
        const newXp = character.esperienza + amount;
        let classi = character.classi;
        // stesso identico effetto di confermare il wizard di level-up già esistente: aggiorna
        // solo il numero di livello, i PF restano un passo manuale successivo — per multiclasse
        // non tocca nulla, serve comunque scegliere quale classe sale
        if (autoLevelUp && classi.length === 1) {
          const newLevel = Math.min(20, levelForXp(newXp));
          if (newLevel > classi[0].livello) classi = [{ ...classi[0], livello: newLevel }];
        }
        onChange({ ...character, esperienza: newXp, classi });
      }
      setPendingXp(0);
    } finally {
      setClaiming(false);
    }
  };

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
      {pendingXp > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border border-accent-strong bg-accent/10 px-3 py-2">
          <span className="text-sm text-foreground">
            🎉 Il master ti ha assegnato <span className="font-bold">{pendingXp} XP</span> in
            questa campagna.
          </span>
          <button
            onClick={claim}
            disabled={claiming}
            className="rounded-lg bg-accent-strong text-background font-bold px-3 py-1.5 text-xs hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {claiming ? "…" : "Applica alla scheda"}
          </button>
        </div>
      )}
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
          <ClassNameWarning name={entry.nome} />
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

function ClassNameWarning({ name }: { name: string }) {
  const [names, setNames] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadClassNames().then((classes) => {
      if (!cancelled) setNames(classes.map((c) => c.name));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = name.trim();
  if (!trimmed || !names) return null;
  const canonical = canonicalClassName(trimmed).toLowerCase();
  if (names.some((n) => n.toLowerCase() === canonical)) return null;

  return (
    <p className="text-[10px] text-accent mt-1">
      ⚠️ Classe non riconosciuta dal Compendio: scegli un nome dai suggerimenti per avere slot
      incantesimi, privilegi e calcoli automatici collegati.
    </p>
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
    const name = canonicalClassName(className).toLowerCase();
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
        (s) => s.name === subclassName && s.className.toLowerCase() === canonicalClassName(className).toLowerCase(),
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

function ClassFeaturesSection({ character }: { character: Character }) {
  const classNames = Array.from(
    new Set(character.classi.map((c) => c.nome.trim()).filter(Boolean)),
  );
  if (classNames.length === 0) return null;
  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <h2 className="text-sm uppercase tracking-widest text-muted">Privilegi di classe</h2>
      {classNames.map((name) => (
        <ClassFeaturesToggle key={name} className={name} />
      ))}
    </section>
  );
}

function ClassFeaturesToggle({ className }: { className: string }) {
  const [showFeatures, setShowFeatures] = useState(false);
  const [features, setFeatures] = useState<
    { name: string; level: number; entries: import("@/lib/fivetools/entries").FiveEntry[] }[] | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    loadClassData().then((data) => {
      if (cancelled) return;
      const cls = data.classes.find((c) => c.name.toLowerCase() === canonicalClassName(className).toLowerCase());
      if (!cls) return;
      setFeatures(resolveClassFeatures(data, cls));
    });
    return () => {
      cancelled = true;
    };
  }, [className]);

  return (
    <div>
      <button
        onClick={() => setShowFeatures((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {showFeatures ? "Nascondi" : "Come funziona"} {className}
      </button>
      {showFeatures && (
        <div className="mt-2 space-y-3 border-t border-edge pt-3">
          {!features && <p className="text-sm text-muted">Caricamento…</p>}
          {features?.map((feature) => (
            <div
              key={`${feature.name}-${feature.level}`}
              className="rounded-lg border border-edge bg-surface-raised p-3"
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

function RaceTraits({ razza }: { razza: string }) {
  const [showTraits, setShowTraits] = useState(false);
  const [race, setRace] = useState<RawRace | null | undefined>(undefined);

  useEffect(() => {
    const name = razza.trim();
    if (!name) return;
    let cancelled = false;
    loadRaces().then((races) => {
      if (cancelled) return;
      setRace(races.find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [razza]);

  if (!razza.trim() || race === null) return null;

  return (
    <section className="rounded-xl border border-edge bg-surface p-5">
      <button
        onClick={() => setShowTraits((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {showTraits ? "Nascondi" : "Come funziona"} {razza}
      </button>
      {showTraits && (
        <div className="mt-3 border-t border-edge pt-3">
          {!race && <p className="text-sm text-muted">Caricamento…</p>}
          {race && <RenderEntries entries={race.entries} />}
        </div>
      )}
    </section>
  );
}

function BackgroundTraits({ background }: { background: string }) {
  const [showTraits, setShowTraits] = useState(false);
  const [data, setData] = useState<RawBackground | null | undefined>(undefined);

  useEffect(() => {
    const name = background.trim();
    if (!name) return;
    let cancelled = false;
    loadBackgrounds().then((backgrounds) => {
      if (cancelled) return;
      setData(backgrounds.find((b) => b.name.toLowerCase() === name.toLowerCase()) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [background]);

  if (!background.trim() || data === null) return null;

  return (
    <div>
      <button
        onClick={() => setShowTraits((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {showTraits ? "Nascondi" : "Come funziona"} {background}
      </button>
      {showTraits && (
        <div className="mt-2 border-t border-edge pt-3">
          {!data && <p className="text-sm text-muted">Caricamento…</p>}
          {data && <RenderEntries entries={data.entries} />}
        </div>
      )}
    </div>
  );
}

function XpTracker({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const level = totalLevel(character.classi);
  const next = xpForNextLevel(level);
  const derivedLevel = levelForXp(character.esperienza);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted">XP</span>
        <input
          type="number"
          min={0}
          max={999999}
          value={character.esperienza}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            onChange({
              ...character,
              esperienza: Number.isNaN(parsed) ? character.esperienza : Math.max(0, Math.trunc(parsed)),
            });
          }}
          className="w-24 rounded-md border border-edge bg-surface px-2 py-1 text-sm text-foreground"
        />
      </label>
      <p className="text-xs text-muted">
        {next === null
          ? "Livello massimo raggiunto."
          : `Prossimo livello a ${next.toLocaleString("it-IT")} XP.`}
      </p>
      {derivedLevel !== level && (
        <p className="text-xs font-bold text-accent-strong">
          ⚠️ Gli XP corrispondono al livello {derivedLevel}, le classi sommano al livello {level} —
          aggiorna il livello di classe quando sali.
        </p>
      )}
    </div>
  );
}

const ASI_LEVELS = [4, 8, 12, 16, 19];

function LevelUpWizard({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const [open, setOpen] = useState(false);
  const [classIndex, setClassIndex] = useState(0);
  const [features, setFeatures] = useState<
    { name: string; level: number; entries: import("@/lib/fivetools/entries").FiveEntry[] }[] | null
  >(null);

  const level = totalLevel(character.classi);
  const derivedLevel = levelForXp(character.esperienza);
  const canLevelUp = derivedLevel > level;

  const targetClass = character.classi[classIndex];
  const newLevel = targetClass ? targetClass.livello + 1 : 1;

  useEffect(() => {
    if (!open || !targetClass) return;
    let cancelled = false;
    loadClassData().then((data) => {
      if (cancelled) return;
      const cls = data.classes.find((c) => c.name.toLowerCase() === canonicalClassName(targetClass.nome).toLowerCase());
      if (!cls) {
        setFeatures([]);
        return;
      }
      setFeatures(resolveClassFeatures(data, cls).filter((f) => f.level === newLevel));
    });
    return () => {
      cancelled = true;
    };
  }, [open, targetClass, newLevel]);

  if (!canLevelUp && !open) return null;

  const confirm = () => {
    if (!targetClass) return;
    onChange({
      ...character,
      classi: character.classi.map((c, i) => (i === classIndex ? { ...c, livello: newLevel } : c)),
    });
    setOpen(false);
    setFeatures(null);
  };

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          🎉 Sali di livello!
        </button>
      ) : (
        <div className="mt-2 space-y-3 rounded-lg border border-accent-strong bg-surface-raised p-3">
          <p className="text-sm font-bold text-foreground">Level up!</p>
          {character.classi.length > 1 && (
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted">Classe che sale</span>
              <select
                value={classIndex}
                onChange={(event) => setClassIndex(Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
              >
                {character.classi.map((c, i) => (
                  <option key={i} value={i}>
                    {c.nome || `Classe ${i + 1}`} (liv. {c.livello} → {c.livello + 1})
                  </option>
                ))}
              </select>
            </label>
          )}
          {targetClass && (
            <p className="text-sm text-muted">
              {targetClass.nome || "Questa classe"} passa da livello {targetClass.livello} a{" "}
              <span className="font-bold text-accent-strong">{newLevel}</span>.
            </p>
          )}
          {ASI_LEVELS.includes(newLevel) && (
            <p className="text-sm font-bold text-accent-strong">
              ⭐ A questo livello ottieni un Aumento di Caratteristica (o un talento) — ricordati di
              assegnarlo nella sezione Caratteristiche.
            </p>
          )}
          <div>
            <p className="text-xs uppercase tracking-widest text-muted mb-1">Nuovi privilegi</p>
            {!features && <p className="text-sm text-muted">Caricamento…</p>}
            {features?.length === 0 && (
              <p className="text-sm text-muted">Nessun privilegio nuovo a questo livello.</p>
            )}
            {features?.map((feature) => (
              <div
                key={feature.name}
                className="rounded-lg border border-edge bg-surface p-3 mt-1.5"
              >
                <p className="text-sm font-bold text-foreground mb-1.5">{feature.name}</p>
                <RenderEntries entries={feature.entries} />
              </div>
            ))}
          </div>
          <p className="text-sm text-muted">
            Ricordati di aggiornare i Punti Ferita massimi con il calcolatore qui sopra dopo aver confermato.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={confirm}
              className="rounded-md bg-accent-strong px-3 py-1.5 text-sm font-bold text-white hover:opacity-90"
            >
              Conferma livello {newLevel}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setFeatures(null);
              }}
              className="text-sm text-muted hover:underline"
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonalitySection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const set = <K extends keyof Character>(key: K, value: Character[K]) =>
    onChange({ ...character, [key]: value });
  const fieldClass =
    "mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground";

  return (
    <section className="rounded-xl border border-edge bg-surface p-5">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="text-sm uppercase tracking-widest text-muted hover:text-foreground transition-colors"
      >
        Personalità {expanded ? "▲" : "▼"}
      </button>
      {expanded && (
        <div className="mt-3 grid sm:grid-cols-2 gap-3 border-t border-edge pt-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Tratti caratteriali</span>
            <textarea
              value={character.tratti}
              onChange={(event) => set("tratti", event.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Legami</span>
            <textarea
              value={character.legami}
              onChange={(event) => set("legami", event.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Ideali</span>
            <textarea
              value={character.ideali}
              onChange={(event) => set("ideali", event.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Difetti</span>
            <textarea
              value={character.difetti}
              onChange={(event) => set("difetti", event.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
        </div>
      )}
    </section>
  );
}

function InventorySection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const setInventario = (inventario: InventoryItem[]) => onChange({ ...character, inventario });
  const setMonete = (monete: Character["monete"]) => onChange({ ...character, monete });

  const addItem = () =>
    setInventario([...character.inventario, { id: crypto.randomUUID(), nome: "", quantita: 1, note: "" }]);

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">Equipaggiamento</h2>
        <button onClick={addItem} className="text-xs font-bold text-accent-strong hover:underline">
          + Aggiungi oggetto
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["oro", "argento", "rame"] as const).map((moneta) => (
          <label key={moneta} className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted capitalize">{moneta}</span>
            <input
              type="number"
              min={0}
              value={character.monete[moneta]}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                setMonete({
                  ...character.monete,
                  [moneta]: Number.isNaN(parsed) ? 0 : Math.max(0, Math.trunc(parsed)),
                });
              }}
              className="mt-1 w-full rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
            />
          </label>
        ))}
      </div>

      {character.inventario.length > 0 && (
        <div className="space-y-2">
          {character.inventario.map((item) => (
            <div key={item.id} className="rounded-lg border border-edge bg-surface-raised p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Autocomplete
                    value={item.nome}
                    onChange={(nome) =>
                      setInventario(
                        character.inventario.map((i) => (i.id === item.id ? { ...i, nome } : i)),
                      )
                    }
                    loader={loadItems}
                    placeholder="Pozione di Guarigione, Spada +1, torcia…"
                    inputClassName="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                  />
                </div>
                <input
                  type="number"
                  min={1}
                  value={item.quantita}
                  onChange={(event) => {
                    const parsed = Number(event.target.value);
                    setInventario(
                      character.inventario.map((i) =>
                        i.id === item.id
                          ? { ...i, quantita: Number.isNaN(parsed) ? 1 : Math.max(1, Math.trunc(parsed)) }
                          : i,
                      ),
                    );
                  }}
                  className="w-16 rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground text-center"
                />
                <button
                  onClick={() => setInventario(character.inventario.filter((i) => i.id !== item.id))}
                  className="text-muted hover:text-danger text-sm shrink-0"
                  aria-label={`Rimuovi ${item.nome || "oggetto"}`}
                >
                  ×
                </button>
              </div>
              <InventoryItemInfo nome={item.nome} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// confronta i nomi ignorando maiuscole/accenti/punteggiatura, stessa euristica usata nel
// Compendio (app/compendio/page.tsx) per far combaciare il nome italiano ufficiale con la
// traduzione automatica del nome inglese
function normalizeItaName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const ITEM_RARITY_LABELS: Record<string, string> = {
  common: "comune",
  uncommon: "non comune",
  rare: "raro",
  "very rare": "molto raro",
  legendary: "leggendario",
  artifact: "artefatto",
};

function InventoryItemInfo({ nome }: { nome: string }) {
  const [showInfo, setShowInfo] = useState(false);
  const [items, setItems] = useState<RawItem[] | null>(null);
  const [oggettiIta, setOggettiIta] = useState<Awaited<ReturnType<typeof getOggettiIta>> | null>(
    null,
  );

  useEffect(() => {
    loadItems().then(setItems);
  }, []);

  const match = items?.find((i) => i.name.toLowerCase() === nome.trim().toLowerCase()) ?? null;
  const translatedName = useTranslatedText(match?.name, "en", "it");

  useEffect(() => {
    if (!showInfo || !match) return;
    let cancelled = false;
    getOggettiIta().then((data) => {
      if (!cancelled) setOggettiIta(data);
    });
    return () => {
      cancelled = true;
    };
  }, [showInfo, match]);

  if (!match) return null;

  const rarity = match.rarity ? (ITEM_RARITY_LABELS[match.rarity] ?? match.rarity) : null;
  const attunement = match.reqAttune ? "richiede sintonia" : null;

  const ufficiale =
    oggettiIta && translatedName
      ? (oggettiIta.find((o) => normalizeItaName(o.nome) === normalizeItaName(translatedName)) ?? null)
      : null;

  return (
    <div className="pt-1 border-t border-edge/60">
      <button
        onClick={() => setShowInfo((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {[rarity, attunement].filter(Boolean).join(" · ") || "Oggetto magico"}
        {" — "}
        {showInfo ? "Nascondi" : "Come funziona"}
      </button>
      {showInfo && (
        <div className="mt-2">
          {ufficiale ? (
            <>
              <p className="text-[10px] font-bold text-accent-strong mb-1">📖 Testo ufficiale</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {ufficiale.descrizione}
              </p>
            </>
          ) : match.entries ? (
            <RenderEntries entries={match.entries} />
          ) : (
            <p className="text-sm text-muted">Nessuna descrizione disponibile.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ChipToggle({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      {label && <p className="text-[10px] uppercase tracking-widest text-muted mb-1.5">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-accent bg-accent/15 text-accent-strong"
                  : "border-edge bg-surface-raised text-muted hover:text-foreground"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LanguagesAndResistancesSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const toggle = (
    key: "linguaggi" | "resistenze" | "immunita" | "vulnerabilita",
    value: string,
  ) => {
    const current = character[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...character, [key]: next });
  };

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-4">
      <h2 className="text-sm uppercase tracking-widest text-muted">Lingue e resistenze</h2>
      <ChipToggle
        label="Lingue conosciute"
        options={LANGUAGES}
        selected={character.linguaggi}
        onToggle={(v) => toggle("linguaggi", v)}
      />
      <ChipToggle
        label="Resistenza ai danni"
        options={DAMAGE_TYPES}
        selected={character.resistenze}
        onToggle={(v) => toggle("resistenze", v)}
      />
      <ChipToggle
        label="Immunità ai danni"
        options={DAMAGE_TYPES}
        selected={character.immunita}
        onToggle={(v) => toggle("immunita", v)}
      />
      <ChipToggle
        label="Vulnerabilità ai danni"
        options={DAMAGE_TYPES}
        selected={character.vulnerabilita}
        onToggle={(v) => toggle("vulnerabilita", v)}
      />
    </section>
  );
}

function ActiveConditionsSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const toggle = (value: string) => {
    const next = character.condizioniAttive.includes(value)
      ? character.condizioniAttive.filter((v) => v !== value)
      : [...character.condizioniAttive, value];
    onChange({ ...character, condizioniAttive: next });
  };

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-2">
      <h2 className="text-sm uppercase tracking-widest text-muted">Condizioni attive</h2>
      <p className="text-xs text-muted">
        Per condizioni che durano oltre un singolo combattimento (es. una maledizione). Durante un
        combattimento in Campagna si usa invece il tracker lì.
      </p>
      <ChipToggle
        label=""
        options={CONDIZIONI_5E}
        selected={character.condizioniAttive}
        onToggle={toggle}
      />
    </section>
  );
}

function TalentiSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const setTalenti = (talenti: KnownFeat[]) => onChange({ ...character, talenti });

  const addTalento = () =>
    setTalenti([...character.talenti, { id: crypto.randomUUID(), nome: "" }]);

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">Talenti</h2>
        <button onClick={addTalento} className="text-xs font-bold text-accent-strong hover:underline">
          + Aggiungi talento
        </button>
      </div>
      {character.talenti.length === 0 && (
        <p className="text-sm text-muted">Nessun talento aggiunto ancora.</p>
      )}
      <div className="space-y-2">
        {character.talenti.map((talento) => (
          <div key={talento.id} className="rounded-lg border border-edge bg-surface-raised p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Autocomplete
                  value={talento.nome}
                  onChange={(nome) =>
                    setTalenti(
                      character.talenti.map((t) => (t.id === talento.id ? { ...t, nome } : t)),
                    )
                  }
                  loader={loadFeats}
                  placeholder="Alert, Lucky, Tough…"
                  inputClassName="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                />
              </div>
              <button
                onClick={() => setTalenti(character.talenti.filter((t) => t.id !== talento.id))}
                className="text-muted hover:text-danger text-sm shrink-0"
                aria-label={`Rimuovi ${talento.nome || "talento"}`}
              >
                ×
              </button>
            </div>
            <FeatInfo nome={talento.nome} />
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatInfo({ nome }: { nome: string }) {
  const [showInfo, setShowInfo] = useState(false);
  const [feats, setFeats] = useState<RawFeat[] | null>(null);
  const [talentiIta, setTalentiIta] = useState<Awaited<ReturnType<typeof getTalentiIta>> | null>(
    null,
  );

  useEffect(() => {
    loadFeats().then(setFeats);
  }, []);

  const match = feats?.find((f) => f.name.toLowerCase() === nome.trim().toLowerCase()) ?? null;
  const translatedName = useTranslatedText(match?.name, "en", "it");

  useEffect(() => {
    if (!showInfo || !match) return;
    let cancelled = false;
    getTalentiIta().then((data) => {
      if (!cancelled) setTalentiIta(data);
    });
    return () => {
      cancelled = true;
    };
  }, [showInfo, match]);

  if (!match) return null;

  const ufficiale =
    talentiIta && translatedName
      ? (talentiIta.find((t) => normalizeItaName(t.nome) === normalizeItaName(translatedName)) ?? null)
      : null;

  return (
    <div className="pt-1 border-t border-edge/60">
      <button
        onClick={() => setShowInfo((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {showInfo ? "Nascondi" : "Come funziona"}
      </button>
      {showInfo && (
        <div className="mt-2">
          {ufficiale ? (
            <>
              <p className="text-[10px] font-bold text-accent-strong mb-1">📖 Testo ufficiale</p>
              {ufficiale.prerequisito && (
                <p className="text-xs text-muted mb-1">Prerequisiti: {ufficiale.prerequisito}</p>
              )}
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {ufficiale.descrizione}
              </p>
            </>
          ) : (
            <RenderEntries entries={match.entries} />
          )}
        </div>
      )}
    </div>
  );
}

function WeaponsSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const setArmi = (armi: Weapon[]) => onChange({ ...character, armi });
  const level = totalLevel(character.classi);
  const forza = character.caratteristiche.forza;
  const destrezza = character.caratteristiche.destrezza;

  const addWeapon = () =>
    setArmi([
      ...character.armi,
      {
        id: crypto.randomUUID(),
        nome: "",
        caratteristica: "forza",
        competente: true,
        bonusExtra: 0,
        dadoDanno: "1d6",
        tipoDanno: "",
        aDistanza: false,
      },
    ]);

  const updateWeapon = (id: string, patch: Partial<Weapon>) =>
    setArmi(character.armi.map((weapon) => (weapon.id === id ? { ...weapon, ...patch } : weapon)));

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">Armi e attacchi</h2>
        <button onClick={addWeapon} className="text-xs font-bold text-accent-strong hover:underline">
          + Aggiungi arma
        </button>
      </div>
      {character.armi.length === 0 && <p className="text-sm text-muted">Nessuna arma aggiunta ancora.</p>}
      <div className="space-y-3">
        {character.armi.map((weapon) => {
          const bonus = weaponAttackBonus(
            weapon.caratteristica,
            forza,
            destrezza,
            weapon.competente,
            level,
            weapon.bonusExtra,
          );
          const dmgMod = weaponAbilityModifier(weapon.caratteristica, forza, destrezza);
          return (
            <div key={weapon.id} className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  value={weapon.nome}
                  onChange={(event) => updateWeapon(weapon.id, { nome: event.target.value })}
                  placeholder="Nome arma"
                  className="flex-1 min-w-0 rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                />
                <button
                  onClick={() => setArmi(character.armi.filter((w) => w.id !== weapon.id))}
                  className="text-muted hover:text-danger text-sm shrink-0"
                  aria-label={`Rimuovi ${weapon.nome || "arma"}`}
                >
                  ×
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted">Caratteristica</span>
                  <select
                    value={weapon.caratteristica}
                    onChange={(event) =>
                      updateWeapon(weapon.id, {
                        caratteristica: event.target.value as Weapon["caratteristica"],
                      })
                    }
                    className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                  >
                    <option value="forza">Forza</option>
                    <option value="destrezza">Destrezza</option>
                    <option value="finezza">Finezza (migliore tra For/Des)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted">Dado danno</span>
                  <input
                    value={weapon.dadoDanno}
                    onChange={(event) => updateWeapon(weapon.id, { dadoDanno: event.target.value })}
                    placeholder="1d6"
                    className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted">Tipo danno</span>
                  <input
                    value={weapon.tipoDanno}
                    onChange={(event) => updateWeapon(weapon.id, { tipoDanno: event.target.value })}
                    placeholder="tagliente…"
                    className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] uppercase tracking-widest text-muted">Bonus extra</span>
                  <input
                    type="number"
                    value={weapon.bonusExtra}
                    onChange={(event) => {
                      const parsed = Number(event.target.value);
                      updateWeapon(weapon.id, { bonusExtra: Number.isNaN(parsed) ? 0 : Math.trunc(parsed) });
                    }}
                    className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                  />
                </label>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={weapon.competente}
                    onChange={(event) => updateWeapon(weapon.id, { competente: event.target.checked })}
                  />
                  Competente
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={weapon.aDistanza}
                    onChange={(event) => updateWeapon(weapon.id, { aDistanza: event.target.checked })}
                  />
                  A distanza
                </label>
              </div>
              <p className="text-sm text-accent-strong font-semibold">
                Bonus attacco: {formatModifier(bonus)} · Danno: {weapon.dadoDanno}
                {dmgMod !== 0 ? ` ${formatModifier(dmgMod)}` : ""}
                {weapon.tipoDanno ? ` (${weapon.tipoDanno})` : ""}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SpellListSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const casterLevel = multiclassCasterLevel(character.classi);
  const wlLevel = warlockLevel(character.classi);
  if (casterLevel === 0 && wlLevel === 0) return null;

  const setIncantesimi = (incantesimi: KnownSpell[]) => onChange({ ...character, incantesimi });

  const addSpell = () =>
    setIncantesimi([
      ...character.incantesimi,
      { id: crypto.randomUUID(), nome: "", livello: 0, preparato: false },
    ]);

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">Incantesimi conosciuti</h2>
        <button onClick={addSpell} className="text-xs font-bold text-accent-strong hover:underline">
          + Aggiungi incantesimo
        </button>
      </div>
      {character.incantesimi.length === 0 && (
        <p className="text-sm text-muted">Nessun incantesimo aggiunto ancora.</p>
      )}
      <div className="space-y-2">
        {character.incantesimi.map((spell) => (
          <div key={spell.id} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <Autocomplete
                value={spell.nome}
                onChange={(nome) =>
                  setIncantesimi(
                    character.incantesimi.map((s) => (s.id === spell.id ? { ...s, nome } : s)),
                  )
                }
                loader={loadSpells}
                placeholder="Fireball, Cure Wounds…"
                inputClassName="w-full rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
              />
            </div>
            <input
              type="number"
              min={0}
              max={9}
              value={spell.livello}
              onChange={(event) => {
                const parsed = Number(event.target.value);
                setIncantesimi(
                  character.incantesimi.map((s) =>
                    s.id === spell.id
                      ? { ...s, livello: Number.isNaN(parsed) ? 0 : Math.min(9, Math.max(0, Math.trunc(parsed))) }
                      : s,
                  ),
                );
              }}
              aria-label="Livello incantesimo"
              className="w-14 rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground text-center"
            />
            <label className="flex items-center gap-1 text-xs text-muted shrink-0">
              <input
                type="checkbox"
                checked={spell.preparato}
                onChange={(event) =>
                  setIncantesimi(
                    character.incantesimi.map((s) =>
                      s.id === spell.id ? { ...s, preparato: event.target.checked } : s,
                    ),
                  )
                }
              />
              Preparato
            </label>
            <button
              onClick={() => setIncantesimi(character.incantesimi.filter((s) => s.id !== spell.id))}
              className="text-muted hover:text-danger text-sm shrink-0"
              aria-label={`Rimuovi ${spell.nome || "incantesimo"}`}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function DeathSaves({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const toggle = (key: "tiriMorteSuccessi" | "tiriMorteFallimenti", index: number) => {
    const current = character[key];
    // clic sul pallino già attivo più a destra = lo toglie, altrimenti riempie fino a quel punto
    const next = index < current ? index : index + 1;
    onChange({ ...character, [key]: next });
  };

  return (
    <div className="mb-5 rounded-lg border border-danger/40 bg-danger/5 p-3 space-y-2">
      <p className="text-xs font-bold text-danger">
        ☠️ 0 PF — tiri salvezza contro la morte
      </p>
      <DeathSaveRow
        label="Successi"
        value={character.tiriMorteSuccessi}
        color="border-accent-strong bg-accent-strong"
        onToggle={(i) => toggle("tiriMorteSuccessi", i)}
      />
      <DeathSaveRow
        label="Fallimenti"
        value={character.tiriMorteFallimenti}
        color="border-danger bg-danger"
        onToggle={(i) => toggle("tiriMorteFallimenti", i)}
      />
      {(character.tiriMorteSuccessi >= 3 || character.tiriMorteFallimenti >= 3) && (
        <p className="text-xs font-bold text-foreground">
          {character.tiriMorteSuccessi >= 3 ? "✓ Stabilizzato" : "✝ Morto"}
        </p>
      )}
    </div>
  );
}

function DeathSaveRow({
  label,
  value,
  color,
  onToggle,
}: {
  label: string;
  value: number;
  color: string;
  onToggle: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted w-20">{label}</span>
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          onClick={() => onToggle(i)}
          aria-label={`${label} ${i + 1}`}
          className={`size-5 rounded-full border-2 transition-colors ${
            i < value ? color : "border-edge bg-transparent"
          }`}
        />
      ))}
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

function SavingThrowsAndSkills({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const level = totalLevel(character.classi);

  const toggleSave = (ability: Ability) => {
    const has = character.trsCompetenti.includes(ability);
    onChange({
      ...character,
      trsCompetenti: has
        ? character.trsCompetenti.filter((a) => a !== ability)
        : [...character.trsCompetenti, ability],
    });
  };

  const cycleSkill = (skill: string) => {
    const competente = character.abilitaCompetenti.includes(skill);
    const esperto = character.abilitaEsperte.includes(skill);
    if (!competente && !esperto) {
      onChange({ ...character, abilitaCompetenti: [...character.abilitaCompetenti, skill] });
    } else if (competente && !esperto) {
      onChange({ ...character, abilitaEsperte: [...character.abilitaEsperte, skill] });
    } else {
      onChange({
        ...character,
        abilitaCompetenti: character.abilitaCompetenti.filter((s) => s !== skill),
        abilitaEsperte: character.abilitaEsperte.filter((s) => s !== skill),
      });
    }
  };

  const suggestFromClass = async () => {
    const primary = character.classi[0];
    if (!primary?.nome.trim()) return;
    const data = await loadClassData();
    const cls = data.classes.find(
      (c) => c.name.toLowerCase() === canonicalClassName(primary.nome).toLowerCase(),
    );
    const abilities = (cls?.proficiency ?? [])
      .map((code) => ABILITY_CODE_TO_KEY[code])
      .filter((a): a is Ability => Boolean(a));
    if (abilities.length > 0) onChange({ ...character, trsCompetenti: abilities });
  };

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-muted">Tiri salvezza</h2>
        <button
          onClick={suggestFromClass}
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          Suggerisci dalla classe di origine
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ABILITIES.map((ability) => {
          const proficient = character.trsCompetenti.includes(ability);
          const mod = savingThrowModifier(character.caratteristiche[ability], proficient, level);
          return (
            <button
              key={ability}
              onClick={() => toggleSave(ability)}
              className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                proficient
                  ? "border-accent bg-accent/10 text-accent-strong"
                  : "border-edge bg-surface-raised text-muted hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5">
                <span className={`size-2 rounded-full ${proficient ? "bg-accent" : "bg-edge"}`} />
                {ABILITY_LABELS[ability]}
              </span>
              <span className="font-bold">{formatModifier(mod)}</span>
            </button>
          );
        })}
      </div>

      <div>
        <h2 className="text-sm uppercase tracking-widest text-muted">Abilità</h2>
        <p className="text-xs text-muted mt-0.5">
          Click per alternare: nessuna → competente → esperto (bonus raddoppiato) → nessuna.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {SKILLS.map((skill) => {
          const competente = character.abilitaCompetenti.includes(skill.nome);
          const esperto = character.abilitaEsperte.includes(skill.nome);
          const mod = skillModifier(
            character.caratteristiche[skill.abilita],
            competente,
            esperto,
            level,
          );
          return (
            <button
              key={skill.nome}
              onClick={() => cycleSkill(skill.nome)}
              className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                esperto
                  ? "border-accent bg-accent/15 text-accent-strong"
                  : competente
                    ? "border-accent/50 bg-accent/5 text-foreground"
                    : "border-edge bg-surface-raised text-muted hover:text-foreground"
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`size-2 rounded-full shrink-0 ${
                    esperto ? "bg-accent" : competente ? "bg-accent/60" : "bg-edge"
                  }`}
                />
                <span className="truncate">{skill.nome}</span>
                <span className="text-[10px] text-muted shrink-0">
                  ({ABILITY_LABELS[skill.abilita].slice(0, 3)})
                </span>
              </span>
              <span className="font-bold shrink-0">{formatModifier(mod)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SlotCounter({
  label,
  max,
  used,
  onChange,
}: {
  label: string;
  max: number;
  used: number;
  onChange: (used: number) => void;
}) {
  const available = max - used;
  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-2 text-center">
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <div className="flex items-center justify-center gap-1 mt-1">
        <button
          onClick={() => onChange(used + 1)}
          disabled={available <= 0}
          className="size-6 rounded-full border border-edge text-danger disabled:opacity-30"
          aria-label="Usa slot"
        >
          −
        </button>
        <span className="w-10 text-sm font-bold text-foreground">
          {available}/{max}
        </span>
        <button
          onClick={() => onChange(used - 1)}
          disabled={used <= 0}
          className="size-6 rounded-full border border-edge text-accent-strong disabled:opacity-30"
          aria-label="Recupera slot"
        >
          +
        </button>
      </div>
    </div>
  );
}

function SpellSlotsSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const casterLevel = multiclassCasterLevel(character.classi);
  const wlLevel = warlockLevel(character.classi);
  const maxSlots = spellSlotsForCasterLevel(casterLevel);
  const pact = pactMagicForLevel(wlLevel);

  if (casterLevel === 0 && wlLevel === 0) return null;

  const castingAbility = primaryCastingAbility(character.classi);
  const level = totalLevel(character.classi);

  const setUsed = (index: number, used: number) => {
    const max = maxSlots[index];
    const next = Math.min(max, Math.max(0, used));
    onChange({
      ...character,
      slotUsati: character.slotUsati.map((v, i) => (i === index ? next : v)),
    });
  };

  const setPactUsed = (used: number) => {
    onChange({ ...character, slotPattoUsati: Math.min(pact.slots, Math.max(0, used)) });
  };

  const longRest = () =>
    onChange({ ...character, slotUsati: [0, 0, 0, 0, 0, 0, 0, 0, 0], slotPattoUsati: 0 });
  const shortRest = () => onChange({ ...character, slotPattoUsati: 0 });

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-muted">Slot incantesimi</h2>
        <div className="flex gap-3">
          {wlLevel > 0 && (
            <button
              onClick={shortRest}
              className="text-xs font-bold text-accent-strong hover:underline"
            >
              Riposo breve
            </button>
          )}
          <button
            onClick={longRest}
            className="text-xs font-bold text-accent-strong hover:underline"
          >
            Riposo lungo
          </button>
        </div>
      </div>

      {castingAbility && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-edge bg-surface-raised px-3 py-2 text-center">
            <span className="text-[10px] uppercase tracking-widest text-muted">CD tiro salvezza</span>
            <p className="text-lg font-bold text-foreground">
              {spellSaveDC(level, character.caratteristiche[castingAbility])}
            </p>
          </div>
          <div className="rounded-lg border border-edge bg-surface-raised px-3 py-2 text-center">
            <span className="text-[10px] uppercase tracking-widest text-muted">Bonus attacco</span>
            <p className="text-lg font-bold text-foreground">
              {formatModifier(spellAttackBonus(level, character.caratteristiche[castingAbility]))}
            </p>
          </div>
        </div>
      )}

      {casterLevel > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {maxSlots.map((max, index) =>
            max > 0 ? (
              <SlotCounter
                key={index}
                label={`Liv. ${index + 1}`}
                max={max}
                used={character.slotUsati[index] ?? 0}
                onChange={(used) => setUsed(index, used)}
              />
            ) : null,
          )}
        </div>
      )}

      {wlLevel > 0 && (
        <div className="pt-2 border-t border-edge space-y-2">
          <p className="text-xs text-muted">
            Patto Magico (Warlock, liv. {wlLevel}) — recupera con un riposo breve
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <SlotCounter
              label={`Liv. ${pact.slotLevel}`}
              max={pact.slots}
              used={character.slotPattoUsati}
              onChange={setPactUsed}
            />
          </div>
        </div>
      )}
    </section>
  );
}
