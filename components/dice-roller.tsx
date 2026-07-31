"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { z } from "zod";
import { IntField } from "@/components/int-field";
import { formatModifier } from "@/lib/dnd";
import { useLocalCollection } from "@/lib/storage";
import { Dice3D, type Dice3DHandle, type Dice3DStatus } from "@/components/dice-3d";

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

// Persistita in localStorage (vedi useLocalCollection sotto) — la cronologia dei tiri deve
// sopravvivere a un refresh della pagina o alla chiusura del modal, non solo restare in memoria
// per la durata della sessione.
const rollResultSchema = z.object({
  id: z.string(),
  die: z.number(),
  quantity: z.number(),
  modifier: z.number(),
  mode: z.enum(["normale", "vantaggio", "svantaggio"]),
  rolls: z.array(z.number()),
  discarded: z.number().optional(),
  total: z.number(),
  timestamp: z.string(),
  // Se questo tiro specifico ha usato i dadi 3D fisici o il tumble numerico di scorta — deciso
  // al momento del tiro (non solo dallo stato attuale di Dice3D), così un tiro riuscito via 3D
  // resta segnato tale anche se più tardi qualcosa smettesse di funzionare, e viceversa.
  usedDice3D: z.boolean(),
});
type RollResult = z.infer<typeof rollResultSchema>;

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export function DiceRoller() {
  const [die, setDie] = useState<number>(20);
  const [quantity, setQuantity] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [mode, setMode] = useState<RollMode>("normale");
  const { items: history, persist: persistHistory } = useLocalCollection(
    "questzip:tiri-dadi",
    rollResultSchema,
  );
  const [rolling, setRolling] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  // Valore "finto" mostrato mentre il dado tumbla, cambiato rapidamente per dare l'illusione di
  // un dado vero che gira prima di fermarsi — usato solo quando i dadi 3D non sono disponibili
  // (vedi dice3dStatus sotto): con quelli veri l'animazione è la scena stessa, non serve.
  const [displayValue, setDisplayValue] = useState<number | null>(null);
  // Se si preme "Tira" di nuovo prima che il tumble precedente finisca, questo id fa smettere
  // la vecchia catena di setTimeout invece di lasciarla continuare in parallelo a quella nuova
  // (altrimenti i due tumble si mischierebbero, con numeri che saltano in modo incoerente).
  const rollIdRef = useRef(0);

  // Dadi 3D fisici (BabylonJS+Ammo, vedi dice-3d.tsx): montato subito insieme al resto del
  // roller (non solo dopo il primo tiro) apposta — il caricamento richiede un attimo, montarlo
  // solo al click su "Tira" significava che il primissimo tiro dopo l'apertura del modal cadeva
  // quasi sempre sul tumble numerico di scorta, il motore non faceva ancora in tempo. Aprendo il
  // modal si comincia a caricare subito, così di solito è già pronto al primo tiro vero.
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
      persistHistory([result, ...history].slice(0, 30));
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

    persistHistory([result, ...history].slice(0, 30));
  };

  const deleteEntry = (id: string) => {
    persistHistory(history.filter((entry) => entry.id !== id));
  };

  const clearHistory = () => {
    persistHistory([]);
    setConfirmingClear(false);
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

      {/* Non più condizionata a "latest": deve montarsi già all'apertura del modal (vedi
          commento su dice3dRef sopra), non solo dopo il primo tiro. Prima del primo tiro mostra
          solo il riquadro dadi (invisibile finché non pronto) senza numero/testo sotto. */}
      <section
        className={`relative rounded-xl border p-6 text-center ${
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
            Proporzione ~2:1 (larghezza:altezza) apposta, non un'altezza scelta a caso: il
            "tavolo" fisico dove rotolano i dadi ha PROFONDITÀ FISSA in unità 3D — solo la
            larghezza si adatta al rapporto larghezza/altezza del contenitore (vedi
            world.onscreen.js, l'aspect di default della libreria è 300/150 = 2:1). Un riquadro
            più alto che largo (come prima) lascia il tavolo comunque stretto in profondità, con
            vuoto sotto ai dadi qualunque altezza gli si dia — non "sembrava" ingrandito, il
            tavolo davvero non cresce oltre la sua profondità fissa. Mostrato/nascosto in base a
            se l'ULTIMO tiro (se esiste) ha davvero usato i dadi 3D, non se il motore è
            astrattamente "pronto" — altrimenti resterebbe visibile ma vuoto ogni volta che un
            tiro cade sul percorso di scorta. */}
        {dice3dStatus !== "unavailable" && (
          <div className="relative mb-3 h-44 sm:h-60 w-full">
            <div
              className={`h-full w-full overflow-hidden rounded-lg border border-edge bg-surface-raised/60 transition-opacity duration-300 ${
                latest?.usedDice3D ? "opacity-100" : "opacity-0"
              }`}
            >
              <Dice3D ref={dice3dRef} onStatusChange={setDice3dStatus} className="h-full w-full" />
            </div>
            {/* Il primissimo tiro cade quasi sempre sul tumble numerico di scorta, perché il
                caricamento dei dadi 3D (~1MB fra motore, fisica e texture) richiede un attimo —
                senza questo avviso sembra che non succeda niente mentre si aspetta, come se il
                pulsante "Tira" si fosse bloccato. Sparisce non appena il motore risulta pronto
                (anche se sta ancora caricando ma un tiro precedente l'ha già usato con successo),
                non solo a rolling finito, altrimenti lampeggerebbe ad ogni tiro successivo. */}
            {dice3dStatus === "loading" && !history.some((entry) => entry.usedDice3D) && (
              <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
                Caricamento dadi 3D…
              </p>
            )}
          </div>
        )}
        {latest && (
          <>
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
                  risultato sopra non è ancora rivelato — mostrarli subito spoilerebbe il
                  risultato prima che l'animazione (numerica o dei dadi 3D) finisca di
                  "rivelarlo". */}
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
          </>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm uppercase tracking-widest text-muted">Cronologia</h2>
            <button
              onClick={() => setConfirmingClear(true)}
              className="text-xs font-bold text-muted hover:text-danger transition-colors"
            >
              Elimina cronologia
            </button>
          </div>
          {history.length > 1 && (
            <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface">
              {history.slice(1).map((entry) => (
                <li key={entry.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                  <span className="text-muted">
                    {entry.timestamp} ·{" "}
                    {entry.quantity > 1 ? `${entry.quantity}d${entry.die}` : `d${entry.die}`}
                    {entry.modifier !== 0 && ` ${formatModifier(entry.modifier)}`}
                    {entry.mode !== "normale" && ` (${entry.mode})`}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-foreground">{entry.total}</span>
                    <button
                      onClick={() => deleteEntry(entry.id)}
                      aria-label="Elimina questo tiro"
                      title="Elimina"
                      className="text-muted/50 hover:text-danger transition-colors text-xs px-1"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {confirmingClear && (
        <ClearHistoryConfirmModal onConfirm={clearHistory} onCancel={() => setConfirmingClear(false)} />
      )}
    </div>
  );
}

type RollMode = "normale" | "vantaggio" | "svantaggio";

/** Stesso identico pattern di DeleteCharacterModal (app/personaggi/page.tsx) — un modal custom
 * invece di window.confirm(), che l'utente ha esplicitamente chiesto di evitare qui. */
function ClearHistoryConfirmModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-overlay-in"
      onClick={onCancel}
    >
      <div
        className="card-elevated w-full max-w-sm rounded-xl border border-edge bg-background p-5 space-y-4 animate-modal-in"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-display font-bold text-danger">Eliminare tutta la cronologia?</h2>
        <p className="text-sm text-muted">
          Tutti i tiri salvati verranno eliminati definitivamente da questo dispositivo. Non si può
          annullare.
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="rounded-lg bg-danger text-background font-bold px-4 py-2 text-sm hover:opacity-90 transition-opacity"
          >
            Elimina tutto
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-foreground hover:border-accent/50 transition-colors"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
