"use client";

import { useState } from "react";
import { IntField } from "@/components/int-field";
import {
  ABILITIES,
  ABILITY_CODE_TO_KEY,
  ABILITY_LABELS,
  POINT_BUY_BUDGET,
  RECUPERO_LABELS,
  RECUPERO_OPTIONS,
  SKILLS,
  STANDARD_ARRAY,
  abilityModifier,
  calculateMulticlassHitPoints,
  canonicalClassName,
  formatModifier,
  multiclassCasterLevel,
  pactMagicForLevel,
  pointBuyCost,
  primaryCastingAbility,
  roll4d6DropLowest,
  savingThrowModifier,
  skillModifier,
  spellAttackBonus,
  spellSaveDC,
  spellSlotsForCasterLevel,
  totalLevel,
  warlockLevel,
  type Ability,
  type Character,
  type LimitedFeature,
} from "@/lib/dnd";
import { loadClassData } from "@/lib/fivetools/data";
import { rollDie } from "./helpers";

export function DeathSaves({
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

export function HitPointCalculator({
  character,
  onApply,
}: {
  character: Character;
  onApply: (hpMax: number) => void;
}) {
  const [hitDice, setHitDice] = useState<number[]>([]);

  // hitDice è indicizzato per POSIZIONE nell'array (ClassEntry non ha un id stabile) — se una
  // classe viene rimossa o riordinata nella sezione "Classi" qui sopra mentre questo calcolatore
  // ha già dei dadi scelti, le posizioni si disallineano: il dado scelto per la classe rimossa
  // finirebbe silenziosamente attribuito a quella successiva. Si azzera la selezione ogni volta
  // che cambia l'elenco dei nomi di classe, invece di tenere scelte ormai riferite a posizioni
  // che non corrispondono più alle stesse classi.
  const classSignature = character.classi.map((c) => c.nome).join("|");
  const [loadedSignature, setLoadedSignature] = useState(classSignature);
  if (classSignature !== loadedSignature) {
    setLoadedSignature(classSignature);
    setHitDice([]);
  }

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

export function InspirationToggle({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  return (
    <button
      onClick={() => onChange({ ...character, ispirazione: !character.ispirazione })}
      className={`card-elevated-hover flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
        character.ispirazione
          ? "glow-accent border-accent bg-accent/15 text-accent-strong"
          : "border-edge bg-surface-raised text-muted hover:text-foreground"
      }`}
    >
      <span className="text-lg leading-none">{character.ispirazione ? "⭐" : "☆"}</span>
      Ispirazione
    </button>
  );
}

export function HitDiceTracker({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  // Il TOTALE dei dadi vita coincide sempre col livello totale (regola RAW), a prescindere dal
  // mix di classi — solo il TIPO di dado differisce per classe, qui non tracciato perché servirebbe
  // salvarlo per ogni riga di classe (oggi assente da ClassEntry) solo per questo scopo.
  const totale = totalLevel(character.classi);
  const usati = Math.min(character.dadiVitaUsati, totale);
  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-2 text-center">
      <p className="text-[10px] uppercase tracking-widest text-muted">Dadi Vita</p>
      <div className="flex items-center justify-center gap-1 mt-1">
        <button
          onClick={() => onChange({ ...character, dadiVitaUsati: usati + 1 })}
          disabled={usati >= totale}
          className="size-6 rounded-full border border-edge text-danger disabled:opacity-30"
          aria-label="Spendi un dado vita (riposo breve)"
        >
          −
        </button>
        <span className="w-14 text-sm font-bold text-foreground">
          {totale - usati}/{totale}
        </span>
        <button
          onClick={() =>
            // Riposo lungo: recupera metà del totale (arrotondato per eccesso), regola RAW.
            onChange({ ...character, dadiVitaUsati: Math.max(0, usati - Math.ceil(totale / 2)) })
          }
          disabled={usati <= 0}
          className="rounded-full border border-edge px-2 text-[10px] font-bold text-accent-strong disabled:opacity-30"
          aria-label="Riposo lungo: recupera metà dei dadi vita"
        >
          riposo lungo
        </button>
      </div>
    </div>
  );
}

export function AttunedItemsSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const items = character.oggettiArmonizzati;
  const setItems = (next: string[]) => onChange({ ...character, oggettiArmonizzati: next });

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <div className="flex items-center justify-between">
        {/* Il tetto di 3 è una regola RAW fissa, non una preferenza — per questo il bottone
            "+ Aggiungi" sparisce del tutto oltre 3 invece di limitarsi a disabilitarlo. */}
        <span className="text-[10px] uppercase tracking-widest text-muted">
          Oggetti magici armonizzati
        </span>
        <span className="text-xs text-muted">{items.length}/3</span>
      </div>
      {items.map((nome, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={nome}
            onChange={(event) =>
              setItems(items.map((v, i) => (i === index ? event.target.value : v)))
            }
            placeholder="Nome oggetto"
            className="input-focus flex-1 rounded-md border border-edge bg-surface px-2 py-1 text-sm text-foreground"
          />
          <button
            onClick={() => setItems(items.filter((_, i) => i !== index))}
            className="text-muted hover:text-danger text-sm shrink-0"
            aria-label="Rimuovi oggetto armonizzato"
          >
            ×
          </button>
        </div>
      ))}
      {items.length < 3 && (
        <button
          onClick={() => setItems([...items, ""])}
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          + Aggiungi
        </button>
      )}
    </div>
  );
}

export function LimitedFeaturesSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const features = character.privilegiLimitati;
  const setFeatures = (next: LimitedFeature[]) =>
    onChange({ ...character, privilegiLimitati: next });
  const updateFeature = (id: string, patch: Partial<LimitedFeature>) =>
    setFeatures(features.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          ⚡ Privilegi a usi limitati
        </h2>
        <button
          onClick={() =>
            setFeatures([
              ...features,
              { id: crypto.randomUUID(), nome: "", usiMax: 1, usiUsati: 0, recupero: "riposoLungo" },
            ])
          }
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          + Aggiungi
        </button>
      </div>
      {features.length === 0 ? (
        <p className="text-sm text-muted">
          Nessuno — es. Rabbia, Canalizzare Divinità, Punti Ki, Ispirazione Bardica…
        </p>
      ) : (
        <ul className="space-y-2">
          {features.map((f) => (
            <li
              key={f.id}
              className="rounded-lg border border-edge bg-surface-raised p-3 flex flex-wrap items-center gap-3"
            >
              <input
                value={f.nome}
                onChange={(event) => updateFeature(f.id, { nome: event.target.value })}
                placeholder="Nome (es. Rabbia)"
                className="input-focus flex-1 min-w-[140px] rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
              />
              <label className="flex items-center gap-1.5 text-xs text-muted shrink-0">
                Max
                <IntField
                  min={1}
                  max={99}
                  value={f.usiMax}
                  onChange={(value) =>
                    updateFeature(f.id, { usiMax: value, usiUsati: Math.min(f.usiUsati, value) })
                  }
                  className="w-12 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
                />
              </label>
              <select
                value={f.recupero}
                onChange={(event) =>
                  updateFeature(f.id, {
                    recupero: event.target.value as LimitedFeature["recupero"],
                  })
                }
                className="shrink-0 rounded-md border border-edge bg-surface px-1.5 py-1 text-xs text-foreground"
              >
                {RECUPERO_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {RECUPERO_LABELS[r]}
                  </option>
                ))}
              </select>
              <SlotCounter
                label="Usi"
                max={f.usiMax}
                used={f.usiUsati}
                onChange={(used) => updateFeature(f.id, { usiUsati: used })}
              />
              <button
                onClick={() => setFeatures(features.filter((x) => x.id !== f.id))}
                className="text-muted hover:text-danger text-sm shrink-0"
                aria-label={`Rimuovi ${f.nome || "privilegio"}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PhysicalDescriptionSection({
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
    "input-focus mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground";

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="text-sm uppercase tracking-widest text-muted hover:text-foreground transition-colors"
      >
        Aspetto {expanded ? "▲" : "▼"}
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-edge pt-3">
          {character.ritrattoUrl && (
            // URL arbitrario fornito dal giocatore, non un asset locale ottimizzabile da next/image
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={character.ritrattoUrl}
              alt={character.nome}
              className="max-h-64 rounded-lg border border-edge mx-auto"
            />
          )}
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">
              URL ritratto (opzionale)
            </span>
            <input
              value={character.ritrattoUrl}
              onChange={(event) => set("ritrattoUrl", event.target.value)}
              placeholder="https://…"
              className={fieldClass}
            />
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(
              [
                ["eta", "Età"],
                ["altezza", "Altezza"],
                ["peso", "Peso"],
                ["occhi", "Occhi"],
                ["carnagione", "Carnagione"],
                ["capelli", "Capelli"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted">{label}</span>
                <input
                  value={character[key]}
                  onChange={(event) => set(key, event.target.value)}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type GenMode = "manuale" | "array" | "punti" | "dadi";
const GEN_MODE_LABELS: Record<GenMode, string> = {
  manuale: "Manuale",
  array: "Array standard",
  punti: "Acquisto punti",
  dadi: "Tira i dadi",
};

export function AbilityScoreSection({
  character,
  onChange,
  setAbility,
}: {
  character: Character;
  onChange: (character: Character) => void;
  setAbility: (ability: Ability, value: number) => void;
}) {
  const [mode, setMode] = useState<GenMode>("manuale");
  const [pool, setPool] = useState<number[]>([...STANDARD_ARRAY]);
  const [assignment, setAssignment] = useState<Partial<Record<Ability, number>>>({});

  const switchMode = (next: GenMode) => {
    if (next === "punti" && mode !== "punti") {
      const hasScores = Object.values(character.caratteristiche).some((v) => v !== 8);
      if (
        hasScores &&
        !window.confirm(
          "Passando ad Acquisto punti le caratteristiche attuali verranno azzerate a 8. Continuare?",
        )
      ) {
        return;
      }
    }
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
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-muted">Caratteristiche</h2>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(GEN_MODE_LABELS) as GenMode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                mode === m
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
                <IntField
                  min={1}
                  max={30}
                  value={score}
                  onChange={(value) => setAbility(ability, value)}
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

export function SavingThrowsAndSkills({
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

  const [roll, setRoll] = useState<{ label: string; die: number; mod: number; total: number } | null>(
    null,
  );
  const rollCheck = (label: string, mod: number) => {
    const die = rollDie(20);
    setRoll({ label, die, mod, total: die + mod });
  };

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-muted">Tiri salvezza</h2>
        <button
          onClick={suggestFromClass}
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          Suggerisci dalla classe di origine
        </button>
      </div>
      {roll && (
        <p className="text-sm font-bold text-accent-strong">
          🎲 {roll.label}: {roll.die} {formatModifier(roll.mod)} ={" "}
          <span className="text-lg">{roll.total}</span>
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {ABILITIES.map((ability) => {
          const proficient = character.trsCompetenti.includes(ability);
          const mod = savingThrowModifier(character.caratteristiche[ability], proficient, level);
          return (
            <div key={ability} className="flex items-stretch gap-1">
              <button
                onClick={() => toggleSave(ability)}
                className={`flex flex-1 items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
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
              <button
                onClick={() => rollCheck(ABILITY_LABELS[ability], mod)}
                aria-label={`Tira salvezza su ${ABILITY_LABELS[ability]}`}
                className="shrink-0 rounded-lg border border-edge px-2 text-muted hover:text-accent-strong hover:border-accent transition-colors"
              >
                🎲
              </button>
            </div>
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
            <div key={skill.nome} className="flex items-stretch gap-1">
              <button
                onClick={() => cycleSkill(skill.nome)}
                className={`flex flex-1 min-w-0 items-center justify-between rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  esperto
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
              <button
                onClick={() => rollCheck(skill.nome, mod)}
                aria-label={`Tira ${skill.nome}`}
                className="shrink-0 rounded-lg border border-edge px-2 text-muted hover:text-accent-strong hover:border-accent transition-colors"
              >
                🎲
              </button>
            </div>
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

export function SpellSlotsSection({
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
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-4">
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
