"use client";

import { useEffect, useState } from "react";
import { IntField } from "@/components/int-field";
import { addCombatant } from "@/app/actions/encounters";
import { loadCreatures, loadItems, type RawCreature, type RawItem } from "@/lib/fivetools/data";
import { bestItalianName, useItalianSearchIndex } from "@/lib/fivetools/compendio-detail";
import { formatRarity } from "@/lib/fivetools/format";
import { translateText } from "@/lib/fivetools/translate";
import { generateName, NAME_RACES, type NameRace } from "@/lib/names";
import {
  adjustedEncounterXp,
  DIFFICULTY_LABELS,
  encounterMultiplier,
  pickTreasureRarity,
  rollGemsAndArt,
  rollHoardCoins,
  rollIndividualCoins,
  rollMagicItemCount,
  treasureTierForCr,
  xpBudget,
  XP_BY_CR,
  type CoinResult,
  type EncounterDifficulty,
  type TreasureTier,
} from "@/lib/dnd";

export function NameGenerator() {
  const [race, setRace] = useState<NameRace>("Umano");
  const [gender, setGender] = useState<"maschile" | "femminile">("maschile");
  const [names, setNames] = useState<string[]>([]);

  const roll = () => {
    setNames(Array.from({ length: 5 }, () => generateName(race, gender)));
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted">Genera nomi PNG</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={race}
          onChange={(event) => setRace(event.target.value as NameRace)}
          className="rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
        >
          {NAME_RACES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-edge overflow-hidden">
          {(["maschile", "femminile"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`px-2.5 py-1.5 text-xs font-bold transition-colors ${
                gender === g ? "bg-accent/15 text-accent-strong" : "text-muted hover:text-foreground"
              }`}
            >
              {g === "maschile" ? "M" : "F"}
            </button>
          ))}
        </div>
        <button
          onClick={roll}
          className="text-xs font-bold rounded-lg border border-edge px-2 py-1.5 text-foreground hover:border-accent transition-colors"
        >
          🎲 Genera
        </button>
      </div>
      {names.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {names.map((n, index) => (
            <li
              key={index}
              className="rounded-md border border-edge bg-surface-raised px-2.5 py-1 text-sm text-foreground"
            >
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const COIN_LABELS: { key: keyof CoinResult; label: string }[] = [
  { key: "mp", label: "mp" },
  { key: "mo", label: "mo" },
  { key: "me", label: "me" },
  { key: "ma", label: "ma" },
  { key: "mr", label: "mr" },
];

function formatCoins(coins: CoinResult): string {
  return COIN_LABELS.filter((c) => coins[c.key] > 0)
    .map((c) => `${coins[c.key]} ${c.label}`)
    .join(", ") || "—";
}

export function TreasureGenerator({ defaultCr }: { defaultCr: number }) {
  const [cr, setCr] = useState(defaultCr);
  const [mode, setMode] = useState<"individuale" | "tesoro">("individuale");
  const [items, setItems] = useState<RawItem[] | null>(null);
  const [result, setResult] = useState<{
    coins: CoinResult;
    gemsArt: { count: number; value: number } | null;
    magicItems: RawItem[];
  } | null>(null);
  const [rolling, setRolling] = useState(false);

  const roll = async () => {
    setRolling(true);
    const tier: TreasureTier = treasureTierForCr(cr);
    const coins = mode === "individuale" ? rollIndividualCoins(tier) : rollHoardCoins(tier);
    const gemsArt = mode === "tesoro" ? rollGemsAndArt(tier) : null;

    const magicItems: RawItem[] = [];
    if (mode === "tesoro") {
      const magicCount = rollMagicItemCount(tier);
      if (magicCount > 0) {
        const pool = items ?? (await loadItems());
        if (!items) setItems(pool);
        for (let i = 0; i < magicCount; i++) {
          const rarity = pickTreasureRarity(tier);
          const candidates = pool.filter((it) => it.rarity === rarity);
          if (candidates.length > 0) {
            magicItems.push(candidates[Math.floor(Math.random() * candidates.length)]);
          }
        }
      }
    }

    setResult({ coins, gemsArt, magicItems });
    setRolling(false);
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted">Genera ricompensa</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-edge overflow-hidden">
          {(["individuale", "tesoro"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1.5 text-xs font-bold transition-colors ${
                mode === m ? "bg-accent/15 text-accent-strong" : "text-muted hover:text-foreground"
              }`}
            >
              {m === "individuale" ? "Individuale" : "Tesoro (party)"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          GS
          <IntField
            min={0}
            max={30}
            value={cr}
            onChange={setCr}
            className="w-14 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <button
          onClick={roll}
          disabled={rolling}
          className="text-xs font-bold rounded-lg border border-edge px-2 py-1.5 text-foreground hover:border-accent transition-colors disabled:opacity-50"
        >
          🎲 Genera
        </button>
      </div>

      {result && (
        <div className="rounded-md border border-accent/40 bg-surface-raised px-3 py-2 space-y-1.5 text-sm">
          <p className="text-foreground">
            <span className="text-muted">Monete: </span>
            <span className="font-bold">{formatCoins(result.coins)}</span>
          </p>
          {result.gemsArt && (
            <p className="text-foreground">
              <span className="text-muted">Gemme/oggetti d&apos;arte: </span>
              <span className="font-bold">
                {result.gemsArt.count} da {result.gemsArt.value} mo ciascuno
              </span>
            </p>
          )}
          {result.magicItems.length > 0 && (
            <div>
              <p className="text-muted mb-1">Oggetti magici:</p>
              <ul className="space-y-0.5">
                {result.magicItems.map((item, index) => (
                  <li key={index} className="text-foreground">
                    <span className="font-bold">{item.name}</span>{" "}
                    <span className="text-xs text-muted capitalize">({formatRarity(item.rarity)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mode === "tesoro" && !result.gemsArt && result.magicItems.length === 0 && (
            <p className="text-xs text-muted">Solo monete questa volta.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function EncounterGenerator({
  encounterId,
  partyLevels,
  onAdded,
}: {
  encounterId: string;
  partyLevels: number[];
  onAdded: () => void;
}) {
  const [difficulty, setDifficulty] = useState<EncounterDifficulty>("medio");
  const [creatures, setCreatures] = useState<RawCreature[] | null>(null);
  const [suggestion, setSuggestion] = useState<{
    creature: RawCreature;
    count: number;
    totalXp: number;
    xpPerMonster: number;
  } | null>(null);
  const [adding, setAdding] = useState(false);
  // parte precompilata dal party sincronizzato, ma modificabile: utile per pianificare un
  // incontro con un party diverso da quello attuale (assenti, PNG aggiunti, ecc.)
  const [levels, setLevels] = useState<number[]>(partyLevels);
  // Il party cambia sotto i piedi (un PG sale di livello, il master assegna XP e la pagina si
  // rinfresca): senza risincronizzare, il "Budget XP" restava calcolato sui livelli di quando la
  // sezione è stata montata, e il bottone di reset compare solo se cambia il NUMERO di PG —
  // quindi con lo stesso numero di giocatori non c'era alcun modo di riallinearlo.
  const [partyCaricato, setPartyCaricato] = useState(partyLevels.join(","));
  if (partyCaricato !== partyLevels.join(",")) {
    setPartyCaricato(partyLevels.join(","));
    setLevels(partyLevels);
  }

  const updateLevel = (index: number, value: number) =>
    setLevels((prev) => prev.map((l, i) => (i === index ? Math.min(20, Math.max(1, value)) : l)));
  const addMember = () => setLevels((prev) => [...prev, 1]);
  const removeMember = (index: number) => setLevels((prev) => prev.filter((_, i) => i !== index));

  const budget = xpBudget(levels, difficulty);

  const generate = async () => {
    const pool = creatures ?? (await loadCreatures());
    if (!creatures) setCreatures(pool);

    const withXp = pool
      .map((creature) => ({ creature, xp: creatureXp(creature) }))
      .filter((entry) => entry.xp > 0);

    if (withXp.length === 0) return;

    const countOptions = [1, 1, 2, 2, 3, 4];
    const count = countOptions[Math.floor(Math.random() * countOptions.length)];
    // levels.length = numero di PG: il DMG fa salire/scendere il moltiplicatore di uno
    // scaglione sotto i 3 o dai 6 giocatori in su.
    const perMonsterTarget = budget / (count * encounterMultiplier(count, levels.length));

    let candidates = withXp.filter(
      (entry) => entry.xp >= perMonsterTarget * 0.4 && entry.xp <= perMonsterTarget * 1.6,
    );
    if (candidates.length === 0) {
      candidates = [...withXp]
        .sort((a, b) => Math.abs(a.xp - perMonsterTarget) - Math.abs(b.xp - perMonsterTarget))
        .slice(0, 20);
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setSuggestion({
      creature: pick.creature,
      count,
      totalXp: adjustedEncounterXp(pick.xp, count, levels.length),
      xpPerMonster: pick.xp,
    });
  };

  const addToEncounter = async () => {
    if (!suggestion) return;
    setAdding(true);
    const hp = combatantHp(suggestion.creature);
    for (let i = 0; i < suggestion.count; i++) {
      await addCombatant(encounterId, {
        nome:
          suggestion.count > 1 ? `${suggestion.creature.name} ${i + 1}` : suggestion.creature.name,
        iniziativa: 10,
        hpMax: hp,
        xp: suggestion.xpPerMonster,
      });
    }
    setAdding(false);
    setSuggestion(null);
    onAdded();
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted">Genera incontro casuale</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted mr-1">Party (livelli)</span>
        {levels.map((level, index) => (
          <span key={index} className="flex items-center gap-0.5">
            <IntField
              min={1}
              max={20}
              value={level}
              onChange={(value) => updateLevel(index, value)}
              className="w-10 rounded-md border border-edge bg-surface-raised px-1 py-1 text-xs text-foreground text-center"
            />
            <button
              onClick={() => removeMember(index)}
              className="text-muted hover:text-danger text-xs"
              aria-label={`Rimuovi PG ${index + 1} dal calcolo`}
            >
              ×
            </button>
          </span>
        ))}
        <button
          onClick={addMember}
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          + PG
        </button>
        {levels.length !== partyLevels.length && (
          <button
            onClick={() => setLevels(partyLevels)}
            className="text-xs text-muted hover:text-foreground hover:underline"
          >
            ↺ party attuale
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as EncounterDifficulty)}
          className="rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
        >
          {(Object.keys(DIFFICULTY_LABELS) as EncounterDifficulty[]).map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          Budget: {budget} XP ({levels.length} PG)
        </span>
        <button
          onClick={generate}
          className="text-xs font-bold rounded-lg border border-edge px-2 py-1.5 text-foreground hover:border-accent transition-colors"
        >
          🎲 Genera
        </button>
      </div>
      {suggestion && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/40 bg-surface-raised px-3 py-2">
          <span className="text-sm text-foreground">
            {suggestion.count}× <span className="font-bold">{suggestion.creature.name}</span>{" "}
            <span className="text-xs text-muted">
              (CR{" "}
              {typeof suggestion.creature.cr === "string"
                ? suggestion.creature.cr
                : suggestion.creature.cr?.cr}{" "}
              · {suggestion.totalXp} XP)
            </span>
          </span>
          <button
            onClick={addToEncounter}
            disabled={adding}
            className="text-xs font-bold rounded-lg bg-accent text-background px-2 py-1.5 hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
          >
            {adding ? "…" : "+ Aggiungi al combattimento"}
          </button>
        </div>
      )}
    </div>
  );
}

function combatantHp(creature: RawCreature): number {
  if (!creature.hp) return 10;
  if (typeof creature.hp === "number") return creature.hp;
  return creature.hp.average ?? 10;
}

function creatureXp(creature: RawCreature): number {
  return XP_BY_CR[typeof creature.cr === "string" ? creature.cr : (creature.cr?.cr ?? "")] ?? 0;
}

// Il bestiario (5etools) ha solo nomi inglesi — cercare "orco"/"drago" contro "orc"/"dragon" non
// trovava nulla, gli unici due punti di ricerca mostri dell'app (piazzamento token sulla mappa,
// aggiunta rapida al combattimento) erano rimasti indietro rispetto al resto del sito (Compendio,
// autocompletamento Personaggi, mention in chat) dopo che quei punti erano stati corretti per
// cercare anche in italiano. Stessa tecnica riusata qui: traduzione IT->EN della query (debounced)
// più il nome italiano reale (ufficiale o cache IA) di ciascun mostro, non solo il nome inglese
// grezzo. Segnalato dall'utente: la ricerca deve funzionare in italiano "ovunque nell'app".
function useCreatureSuggestions(query: string, open: boolean) {
  const [creatures, setCreatures] = useState<RawCreature[] | null>(null);
  useEffect(() => {
    if (!open || creatures) return;
    loadCreatures().then(setCreatures);
  }, [open, creatures]);

  const q = query.trim().toLowerCase();
  const [itQuery, setItQuery] = useState<{ query: string; en: string } | null>(null);
  useEffect(() => {
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      translateText(q, "it", "en").then((result) => {
        if (result) setItQuery({ query: q, en: result.trim().toLowerCase() });
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [q]);
  const translatedQuery = itQuery && itQuery.query === q && itQuery.en !== q ? itQuery.en : null;

  const italianIndex = useItalianSearchIndex("mostri", true);

  const suggestions =
    creatures && q.length >= 2
      ? creatures
          .filter((c) => {
            if (c.name.toLowerCase().includes(q)) return true;
            if (translatedQuery && c.name.toLowerCase().includes(translatedQuery)) return true;
            const italianName = bestItalianName(italianIndex, c.name, c.source);
            return !!italianName && italianName.toLowerCase().includes(q);
          })
          .slice(0, 6)
      : [];

  return { creatures, suggestions };
}

export function MonsterTokenSearch({
  onPick,
  picked,
}: {
  onPick: (name: string) => void;
  picked: string | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { suggestions } = useCreatureSuggestions(query, open);

  return (
    <div className="relative flex items-center gap-1.5">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Cerca mostro da piazzare…"
        className="rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-xs text-foreground w-52"
      />
      {picked && (
        <span className="text-xs text-accent-strong font-bold">
          {picked} — clicca sulla mappa
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 top-full mt-1 w-56 max-h-48 overflow-auto rounded-lg border border-edge bg-surface-raised shadow-lg">
          {suggestions.map((c, index) => (
            <li key={`${c.source}-${c.name}-${index}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(c.name);
                  setQuery(c.name);
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-surface transition-colors"
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Come MonsterQuickAdd, ma consegna la creatura INTERA invece dei soli numeri per l'iniziativa:
 * il Compendio homebrew (components/campagne/homebrew.tsx) ne ricava anche la descrizione, cosi'
 * un mostro si importa gia' scritto e poi si modifica, invece di ricopiarlo a mano.
 */
export function MonsterCompendiumPicker({
  onPick,
  placeholder = "Importa un mostro dal Compendio…",
}: {
  onPick: (creature: RawCreature) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { creatures, suggestions } = useCreatureSuggestions(query, open);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        aria-label="Importa un mostro dal Compendio"
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      {open && creatures === null && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-xs text-muted shadow-lg">
          Caricamento bestiario…
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-edge bg-surface-raised shadow-lg">
          {suggestions.map((c, index) => (
            <li key={`${c.source}-${c.name}-${index}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(c);
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-surface transition-colors"
              >
                {c.name} <span className="text-muted">({combatantHp(c)} PF)</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MonsterQuickAdd({
  onPick,
}: {
  onPick: (name: string, hp: number, legendaryActions: number, xp: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { creatures, suggestions } = useCreatureSuggestions(query, open);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Cerca mostro dal Compendio…"
        className="rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-xs text-foreground w-52"
      />
      {open && creatures === null && (
        <div className="absolute z-10 mt-1 w-56 rounded-lg border border-edge bg-surface-raised px-3 py-2 text-xs text-muted shadow-lg">
          Caricamento bestiario…
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-56 max-h-48 overflow-auto rounded-lg border border-edge bg-surface-raised shadow-lg">
          {suggestions.map((c, index) => (
            <li key={`${c.source}-${c.name}-${index}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(
                    c.name,
                    combatantHp(c),
                    c.legendary && c.legendary.length > 0 ? 3 : 0,
                    creatureXp(c),
                  );
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-surface transition-colors"
              >
                {c.name} <span className="text-muted">({combatantHp(c)} PF)</span>
                {c.legendary && c.legendary.length > 0 && (
                  <span className="ml-1 text-accent-strong">★</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

