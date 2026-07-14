"use client";

import { useState } from "react";
import {
  ABILITIES,
  ABILITY_LABELS,
  abilityModifier,
  characterSchema,
  formatModifier,
  newCharacter,
  proficiencyBonus,
  type Ability,
  type Character,
} from "@/lib/dnd";
import { useLocalCollection } from "@/lib/storage";

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
                  {[character.razza, character.classe].filter(Boolean).join(" ") ||
                    "—"}{" "}
                  · Livello {character.livello}
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <label className="block">
            <span className={labelClass}>Razza</span>
            <input
              value={character.razza}
              onChange={(event) => set("razza", event.target.value)}
              placeholder="Nano"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Classe</span>
            <input
              value={character.classe}
              onChange={(event) => set("classe", event.target.value)}
              placeholder="Guerriero"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Livello</span>
            <input
              type="number"
              min={1}
              max={20}
              value={character.livello}
              onChange={(event) =>
                set("livello", clampInt(event.target.value, 1, 20, character.livello))
              }
              className={inputClass}
            />
          </label>
        </div>
        <p className="text-sm text-muted">
          Bonus di competenza:{" "}
          <span className="font-bold text-accent-strong">
            {formatModifier(proficiencyBonus(character.livello))}
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
      </section>

      <section className="rounded-xl border border-edge bg-surface p-5">
        <h2 className="text-sm uppercase tracking-widest text-muted mb-4">
          Caratteristiche
        </h2>
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
              </div>
            );
          })}
        </div>
      </section>

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
