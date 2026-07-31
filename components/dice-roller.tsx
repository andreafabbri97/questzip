"use client";

import { useRef, useState } from "react";
import { IntField } from "@/components/int-field";
import { formatModifier } from "@/lib/dnd";
import { Dice3D, type Dice3DHandle, type Dice3DStatus } from "@/components/dice-3d";

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
  // Se questo tiro specifico ha usato i dadi 3D fisici o il tumble numerico di scorta — deciso
  // al momento del tiro (non solo dallo stato attuale di Dice3D), così un tiro riuscito via 3D
  // resta segnato tale anche se più tardi qualcosa smettesse di funzionare, e viceversa.
  usedDice3D: boolean;
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
  // un dado vero che gira prima di fermarsi — usato solo quando i dadi 3D non sono disponibili
  // (vedi dice3dStatus sotto): con quelli veri l'animazione è la scena stessa, non serve.
  const [displayValue, setDisplayValue] = useState<number | null>(null);
  // Se si preme "Tira" di nuovo prima che il tumble precedente finisca, questo id fa smettere
  // la vecchia catena di setTimeout invece di lasciarla continuare in parallelo a quella nuova
  // (altrimenti i due tumble si mischierebbero, con numeri che saltano in modo incoerente).
  const rollIdRef = useRef(0);

  // Dadi 3D fisici (BabylonJS+Ammo, vedi dice-3d.tsx): montato solo dopo il primo tiro (sotto,
  // dentro "latest &&"), così chi apre il tiro dadi e non tira mai non paga il caricamento.
  // "ready" solo quando la scena ha finito di inizializzarsi con successo — altrimenti (ancora in
  // caricamento, o WebGL/OffscreenCanvas non disponibile) si ricade sempre sul tumble numerico.
  const dice3dRef = useRef<Dice3DHandle>(null);
  const [dice3dStatus, setDice3dStatus] = useState<Dice3DStatus>("loading");

  const latest = history[0];
  const modeEnabled = die === 20 && quantity === 1;

  const roll = async () => {
    const effectiveMode = modeEnabled ? mode : "normale";
    // Quanti dadi fisici/finti servono per determinare il risultato — tutti quelli di quantity
    // in modalità normale, ma solo 2 con vantaggio/svantaggio (uno dei due viene comunque
    // scartato, non ha senso animarne di più).
    const diceToRoll = effectiveMode === "normale" ? quantity : 2;

    const rollId = ++rollIdRef.current;
    setRolling(true);

    let diceValues: number[];
    let usedDice3D = false;
    if (dice3dStatus === "ready" && dice3dRef.current) {
      try {
        diceValues = await dice3dRef.current.roll(`${diceToRoll}d${die}`);
        if (diceValues.length !== diceToRoll) throw new Error("Risultato 3D incompleto.");
        usedDice3D = true;
      } catch {
        // La scena era pronta ma qualcosa è andato storto durante QUESTO tiro (raro) — non
        // lasciare l'utente senza risultato, si ricade sul tiro "invisibile" con RNG normale.
        diceValues = Array.from({ length: diceToRoll }, () => rollDie(die));
      }
    } else {
      diceValues = Array.from({ length: diceToRoll }, () => rollDie(die));
    }
    if (rollIdRef.current !== rollId) return; // superato da un tiro più recente nel frattempo

    let rolls: number[];
    let discarded: number | undefined;
    if (effectiveMode === "normale") {
      rolls = diceValues;
    } else {
      const [first, second] = diceValues;
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
      usedDice3D,
      timestamp: new Date().toLocaleTimeString("it-IT", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    if (usedDice3D) {
      // I dadi fisici hanno già finito di rotolare (abbiamo aspettato la loro promise) — nessun
      // tumble da far girare, si rivela subito.
      setHistory((previous) => [result, ...previous].slice(0, 30));
      setRolling(false);
      return;
    }

    // Percorso di scorta: stesso tumble numerico di sempre. Il numero finto ha la stessa "forma"
    // del totale vero (somma di diceToRoll dadi + modificatore) — con più dadi o un modificatore
    // alto restare sempre in un range piccolo per poi "saltare" di colpo sembrerebbe un bug.
    const fakeTotal = () =>
      Array.from({ length: diceToRoll }, () => rollDie(die)).reduce((sum, value) => sum + value, 0) +
      modifier;
    const tumbleSteps = [70, 70, 90, 110, 140, 180, 230];
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
  // Il numero grande resta nascosto mentre i dadi 3D stanno ancora rotolando (la scena stessa È
  // l'animazione, mostrarlo sopra sarebbe ridondante/confuso) — col tumble numerico invece deve
  // restare visibile, è lui l'animazione.
  const hideBigNumber = rolling && latest?.usedDice3D;

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
          disabled={rolling}
          className="w-full rounded-xl bg-accent text-background font-display font-bold text-lg py-3 transition-transform hover:bg-accent-strong active:scale-95 disabled:opacity-60 disabled:active:scale-100"
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
          {/* Dimensione fissa SEMPRE (mai collassata a 0, nemmeno per nasconderlo): BabylonJS
              inizializza la scena contro le dimensioni reali del contenitore in quel momento, e
              se più tardi il contenitore tornasse a 0px e poi di nuovo a dimensione reale non si
              ridimensiona da solo — qui la visibilità la decide solo l'opacity.
              Mostrato/nascosto in base a se QUESTO tiro specifico ha davvero usato i dadi 3D
              (latest.usedDice3D), non se il motore è astrattamente "pronto": il motore diventa
              pronto in genere DOPO che il primo tiro è già stato deciso col percorso di scorta
              (Dice3D si monta solo qui sotto, un attimo prima), quindi durante il primo tiro
              sarebbe comunque "ready" ma vuoto — un riquadro vuoto visibile sembrava un bug. */}
          {dice3dStatus !== "unavailable" && (
            <div
              className={`mb-3 h-56 sm:h-64 w-full overflow-hidden rounded-lg border border-edge bg-surface-raised/60 transition-opacity duration-300 ${
                latest.usedDice3D ? "opacity-100" : "opacity-0"
              }`}
            >
              <Dice3D ref={dice3dRef} onStatusChange={setDice3dStatus} className="h-full w-full" />
            </div>
          )}
          {!hideBigNumber && (
            <div className="[perspective:400px]">
              <div
                className={`text-6xl font-display font-bold ${rolling ? "animate-dice" : ""} ${
                  isCrit ? "text-accent-strong" : isFumble ? "text-danger" : "text-foreground"
                }`}
              >
                {rolling ? (displayValue ?? latest.total) : latest.total}
              </div>
            </div>
          )}
          <p className="text-sm text-muted mt-2">
            {latest.quantity > 1 ? `${latest.quantity}d${latest.die}` : `d${latest.die}`}
            {latest.modifier !== 0 && ` ${formatModifier(latest.modifier)}`}
            {latest.mode !== "normale" && ` · ${latest.mode}`}
            {/* I tiri veri (e lo scartato in vantaggio/svantaggio) restano nascosti finché il
                risultato sopra non è ancora rivelato — mostrarli subito spoilerebbe il risultato
                prima che l'animazione (numerica o dei dadi 3D) finisca di "rivelarlo". */}
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
