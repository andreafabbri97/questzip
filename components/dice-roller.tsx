"use client";

import { useRef, useState } from "react";
import { IntField } from "@/components/int-field";
import { formatModifier } from "@/lib/dnd";

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

type RollMode = "normale" | "vantaggio" | "svantaggio";

interface RollResult {
  id: string;
  die: number;
  quantity: number;
  modifier: number;
  mode: RollMode;
  rolls: number[];
  discarded?: number;
  total: number;
  timestamp: string;
}

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function DiceRoller() {
  const [die, setDie] = useState<number>(20);
  const [quantity, setQuantity] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<RollMode>("normale");
  const [history, setHistory] = useState<RollResult[]>([]);
  const [rolling, setRolling] = useState(false);
  // Valore "finto" mostrato mentre il dado tumbla, cambiato rapidamente per dare l'illusione di
  // un dado vero che gira prima di fermarsi — il risultato REALE è già calcolato ed entra subito
  // in cronologia (l'RNG non aspetta l'animazione), solo la rivelazione a schermo è ritardata.
  const [displayValue, setDisplayValue] = useState<number | null>(null);
  // Se si preme "Tira" di nuovo prima che il tumble precedente finisca, questo id fa smettere
  // la vecchia catena di setTimeout invece di lasciarla continuare in parallelo a quella nuova
  // (altrimenti i due tumble si mischierebbero, con numeri che saltano in modo incoerente).
  const rollIdRef = useRef(0);

  const latest = history[0];
  const modeEnabled = die === 20 && quantity === 1;

  const roll = () => {
    const effectiveMode = modeEnabled ? mode : "normale";
    let rolls: number[];
    let discarded: number | undefined;

    if (effectiveMode === "normale") {
      rolls = Array.from({ length: quantity }, () => rollDie(die));
    } else {
      const first = rollDie(die);
      const second = rollDie(die);
      const keepHigh = effectiveMode === "vantaggio";
      const kept = keepHigh ? Math.max(first, second) : Math.min(first, second);
      discarded = keepHigh ? Math.min(first, second) : Math.max(first, second);
      rolls = [kept];
    }

    const total = rolls.reduce((sum, value) => sum + value, 0) + modifier;
    const result: RollResult = {
      id: crypto.randomUUID(),
      die,
      quantity,
      modifier,
      mode: effectiveMode,
      rolls,
      discarded,
      total,
      timestamp: new Date().toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    // Il numero finto durante il tumble deve avere la stessa "forma" del totale vero — quanti
    // dadi contano davvero (tutti quelli con quantity in modalità normale, ma solo UNO con
    // vantaggio/svantaggio, dove il secondo è comunque scartato) più il modificatore. Prima
    // tumblava sempre un singolo d(die) grezzo: con 3d20 o un modificatore alto il numero finto
    // restava sempre 1-20 e poi "saltava" di colpo a un totale anche triplo — sembrava rotto,
    // non un dado che rallenta.
    const effectiveDieCount = effectiveMode === "normale" ? quantity : 1;
    const fakeTotal = () =>
      Array.from({ length: effectiveDieCount }, () => rollDie(die)).reduce(
        (sum, value) => sum + value,
        0,
      ) + modifier;

    // Tumble: mostra totali finti che cambiano sempre più lentamente (come un dado vero che
    // rallenta rotolando), poi si ferma esattamente sul risultato vero — mai l'inverso, per non
    // rischiare che l'ultimo numero "finto" mostrato combaci per caso con quello vero e sembri un
    // bug di doppia rivelazione.
    const tumbleSteps = [70, 70, 90, 110, 140, 180, 230];
    const rollId = ++rollIdRef.current;
    setRolling(true);
    const runStep = (index: number) => {
      if (rollIdRef.current !== rollId) return;
      if (index >= tumbleSteps.length) {
        setDisplayValue(null);
        setRolling(false);
        return;
      }
      setDisplayValue(fakeTotal());
      setTimeout(() => runStep(index + 1), tumbleSteps[index]);
    };
    runStep(0);

    setHistory((previous) => [result, ...previous].slice(0, 30));
  };

  const isCrit = !rolling && latest && latest.die === 20 && latest.rolls[0] === 20;
  const isFumble = !rolling && latest && latest.die === 20 && latest.rolls[0] === 1;

  return (
    <div className="space-y-6">
      <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-5">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-2">Dado</p>
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {DICE.map((sides) => (
              <button
                key={sides}
                onClick={() => setDie(sides)}
                className={`card-elevated-hover rounded-lg border py-2 text-sm font-bold transition-colors ${
                  die === sides
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface-raised text-muted hover:text-foreground"
                }`}
              >
                d{sides}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted">Quanti dadi</span>
            <IntField
              min={1}
              max={100}
              value={quantity}
              onChange={setQuantity}
              className="mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-widest text-muted">Modificatore</span>
            <IntField
              min={-20}
              max={20}
              value={modifier}
              onChange={setModifier}
              className="mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
            />
          </label>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-2">
            Tiro {!modeEnabled && "(solo per 1d20)"}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(["normale", "vantaggio", "svantaggio"] as const).map((value) => (
              <button
                key={value}
                disabled={!modeEnabled}
                onClick={() => setMode(value)}
                className={`card-elevated-hover rounded-lg border py-2 text-sm capitalize transition-colors disabled:opacity-40 ${
                  mode === value && modeEnabled
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface-raised text-muted enabled:hover:text-foreground"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={roll}
          className="w-full rounded-xl bg-accent text-background font-display font-bold text-lg py-3 transition-transform hover:bg-accent-strong active:scale-95"
        >
          Tira {quantity > 1 ? `${quantity}d${die}` : `d${die}`}
          {modifier !== 0 && ` ${formatModifier(modifier)}`}
        </button>
      </section>

      {latest && (
        <section
          className={`rounded-xl border p-6 text-center ${
            isCrit
              ? "border-accent-strong bg-accent/10"
              : isFumble
                ? "border-danger bg-danger/10"
                : "border-edge bg-surface"
          }`}
        >
          <div className="[perspective:400px]">
            <div
              className={`text-6xl font-display font-bold ${rolling ? "animate-dice" : ""} ${
                isCrit ? "text-accent-strong" : isFumble ? "text-danger" : "text-foreground"
              }`}
            >
              {rolling ? (displayValue ?? latest.total) : latest.total}
            </div>
          </div>
          <p className="text-sm text-muted mt-2">
            {latest.quantity > 1 ? `${latest.quantity}d${latest.die}` : `d${latest.die}`}
            {latest.modifier !== 0 && ` ${formatModifier(latest.modifier)}`}
            {latest.mode !== "normale" && ` · ${latest.mode}`}
            {/* I tiri veri (e lo scartato in vantaggio/svantaggio) restano nascosti finché il
                numero grande sopra sta ancora tumblando — mostrarli subito spoilerebbe il
                risultato prima che l'animazione finisca di "rivelarlo". */}
            {!rolling && (
              <>
                {" · "}
                [{latest.rolls.join(", ")}]
                {latest.discarded !== undefined && ` (scartato: ${latest.discarded})`}
              </>
            )}
          </p>
          {isCrit && <p className="text-accent-strong font-bold mt-1">Colpo critico! ⚔️</p>}
          {isFumble && <p className="text-danger font-bold mt-1">Fallimento critico… 💀</p>}
        </section>
      )}

      {history.length > 1 && (
        <section className="space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-muted">Cronologia</h2>
          <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface">
            {history.slice(1).map((entry) => (
              <li key={entry.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-muted">
                  {entry.timestamp} ·{" "}
                  {entry.quantity > 1 ? `${entry.quantity}d${entry.die}` : `d${entry.die}`}
                  {entry.modifier !== 0 && ` ${formatModifier(entry.modifier)}`}
                  {entry.mode !== "normale" && ` (${entry.mode})`}
                </span>
                <span className="font-bold text-foreground">{entry.total}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
