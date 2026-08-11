"use client";

import { useEffect, useRef, useState } from "react";
import { IntField } from "@/components/int-field";
import { grantXp, grantXpToParty } from "@/app/actions/characters";
import {
  addCombatant,
  addPartyToEncounter,
  endEncounter,
  getActiveEncounter,
  nextTurn,
  removeCombatant,
  startEncounter,
  updateCombatant,
} from "@/app/actions/encounters";
import {
  CONDIZIONI_5E,
  multiclassCasterLevel,
  pactMagicForLevel,
  spellSlotsForCasterLevel,
  warlockLevel,
} from "@/lib/dnd";
import { EncounterGenerator, MonsterQuickAdd, NameGenerator, TreasureGenerator } from "./generators";
import { usePartyRoom } from "@/lib/use-party-room";

// Un breve lampo di colore quando i PF cambiano (danno/cura), sia da un click locale che da un
// aggiornamento realtime in arrivo da un altro dispositivo — stesso segnale visivo in entrambi i
// casi, perché entrambi passano dallo stesso stato React, non serve distinguerli.
function HpValue({
  hpAttuali,
  hpMax,
  suffix = "",
}: {
  hpAttuali: number;
  hpMax: number;
  suffix?: string;
}) {
  const [flash, setFlash] = useState<"su" | "giu" | null>(null);
  const prevRef = useRef(hpAttuali);

  useEffect(() => {
    if (prevRef.current === hpAttuali) return;
    setFlash(hpAttuali > prevRef.current ? "su" : "giu");
    prevRef.current = hpAttuali;
    const timeout = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(timeout);
  }, [hpAttuali]);

  return (
    <span
      className={`inline-block w-16 rounded text-center text-xs transition-colors duration-500 ${
        flash === "giu"
          ? "bg-danger/25 text-danger"
          : flash === "su"
            ? "bg-accent/25 text-accent-strong"
            : "text-foreground"
      }`}
    >
      {hpAttuali}/{hpMax}
      {suffix}
    </span>
  );
}

type Combatant = NonNullable<Awaited<ReturnType<typeof getActiveEncounter>>>["combatants"][number];

function CombatantConditions({
  combatant,
  isDm,
  onChange,
}: {
  combatant: Combatant;
  isDm: boolean;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const condizioni = combatant.condizioni;

  if (condizioni.length === 0 && !isDm) return null;

  const remove = async (condizione: string) => {
    await updateCombatant(combatant.id, { condizioni: condizioni.filter((c) => c !== condizione) });
    onChange();
  };

  const add = async (condizione: string) => {
    setAdding(false);
    if (!condizione || condizioni.includes(condizione)) return;
    await updateCombatant(combatant.id, { condizioni: [...condizioni, condizione] });
    onChange();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {condizioni.map((condizione) => (
        <span
          key={condizione}
          className="flex items-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger"
        >
          {condizione}
          {isDm && (
            <button
              onClick={() => remove(condizione)}
              aria-label={`Rimuovi condizione ${condizione}`}
              className="hover:text-foreground"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {isDm &&
        (adding ? (
          <select
            autoFocus
            defaultValue=""
            onChange={(event) => add(event.target.value)}
            onBlur={() => setAdding(false)}
            className="rounded-full border border-edge bg-surface px-2 py-0.5 text-[10px] text-foreground"
          >
            <option value="" disabled>
              Scegli…
            </option>
            {CONDIZIONI_5E.filter((c) => !condizioni.includes(c)).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-edge px-2 py-0.5 text-[10px] text-muted hover:text-foreground transition-colors"
          >
            + Condizione
          </button>
        ))}
    </div>
  );
}

function CombatantDeathSaves({
  combatant,
  isDm,
  onChange,
}: {
  combatant: Combatant;
  isDm: boolean;
  onChange: () => void;
}) {
  const toggle = async (key: "tiriMorteSuccessi" | "tiriMorteFallimenti", index: number) => {
    if (!isDm) return;
    const current = combatant[key];
    const next = index < current ? index : index + 1;
    await updateCombatant(combatant.id, { [key]: next });
    onChange();
  };

  const dots = (value: number, key: "tiriMorteSuccessi" | "tiriMorteFallimenti", color: string) =>
    [0, 1, 2].map((i) => (
      <button
        key={i}
        disabled={!isDm}
        onClick={() => toggle(key, i)}
        aria-label={`${key} ${i + 1}`}
        className={`size-3.5 rounded-full border-2 transition-colors ${
          i < value ? color : "border-edge bg-transparent"
        }`}
      />
    ));

  return (
    <div className="flex items-center gap-3 text-[10px] text-muted">
      <span className="font-bold text-danger">☠️ Tiri salvezza contro la morte</span>
      <span className="flex items-center gap-1">
        {dots(combatant.tiriMorteSuccessi, "tiriMorteSuccessi", "border-accent-strong bg-accent-strong")}
      </span>
      <span className="flex items-center gap-1">
        {dots(combatant.tiriMorteFallimenti, "tiriMorteFallimenti", "border-danger bg-danger")}
      </span>
      {(combatant.tiriMorteSuccessi >= 3 || combatant.tiriMorteFallimenti >= 3) && (
        <span className="font-bold text-foreground">
          {combatant.tiriMorteSuccessi >= 3 ? "✓ Stabilizzato" : "✝ Morto"}
        </span>
      )}
    </div>
  );
}

function CombatantLegendaryActions({
  combatant,
  isDm,
  onChange,
}: {
  combatant: Combatant;
  isDm: boolean;
  onChange: () => void;
}) {
  const remaining = combatant.azioniLeggendarieMax - combatant.azioniLeggendarieUsate;

  const spend = async (delta: number) => {
    if (!isDm) return;
    const next = Math.min(
      combatant.azioniLeggendarieMax,
      Math.max(0, combatant.azioniLeggendarieUsate + delta),
    );
    await updateCombatant(combatant.id, { azioniLeggendarieUsate: next });
    onChange();
  };

  return (
    <div className="flex items-center gap-2 text-[10px] text-muted">
      <span className="font-bold text-accent-strong">★ Azioni leggendarie</span>
      <span className="text-foreground">
        {remaining}/{combatant.azioniLeggendarieMax}
      </span>
      {isDm && (
        <>
          <button
            onClick={() => spend(-1)}
            className="size-4 rounded border border-edge text-accent-strong leading-none"
            aria-label="Recupera un'azione leggendaria"
          >
            +
          </button>
          <button
            onClick={() => spend(1)}
            className="size-4 rounded border border-edge text-danger leading-none"
            aria-label="Spendi un'azione leggendaria"
          >
            −
          </button>
        </>
      )}
    </div>
  );
}

function CombatantConcentration({
  combatant,
  isDm,
  onChange,
}: {
  combatant: Combatant;
  isDm: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(combatant.concentrazione ?? "");

  const save = async () => {
    setEditing(false);
    await updateCombatant(combatant.id, { concentrazione: value.trim() || null });
    onChange();
  };

  if (!isDm && !combatant.concentrazione) return null;

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => event.key === "Enter" && save()}
          placeholder="Nome incantesimo"
          className="rounded border border-edge bg-surface px-1.5 py-0.5 text-[10px] text-foreground"
        />
      </div>
    );
  }

  return combatant.concentrazione ? (
    <button
      onClick={() => isDm && setEditing(true)}
      className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent-strong w-fit"
    >
      🔮 Concentrazione: {combatant.concentrazione}
    </button>
  ) : (
    <button
      onClick={() => setEditing(true)}
      className="rounded-full border border-dashed border-edge px-2 py-0.5 text-[10px] text-muted hover:text-foreground transition-colors w-fit"
    >
      + Concentrazione
    </button>
  );
}

// Sola lettura: gli slot si modificano sulla scheda in Personaggi, qui il party vede solo
// l'ultimo stato sincronizzato (stesso principio "scatto, non live" già usato per il resto
// della scheda condivisa in campagna).
export function PartySpellSlots({
  classi,
  slotUsati,
  slotPattoUsati,
}: {
  classi: { nome: string; livello: number }[];
  slotUsati: number[];
  slotPattoUsati: number;
}) {
  const casterLevel = multiclassCasterLevel(classi);
  const wlLevel = warlockLevel(classi);
  if (casterLevel === 0 && wlLevel === 0) return null;

  const maxSlots = spellSlotsForCasterLevel(casterLevel);
  const pact = pactMagicForLevel(wlLevel);

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-edge">
      <span className="text-[9px] uppercase tracking-widest text-muted">Slot</span>
      {maxSlots.map((max, index) =>
        max > 0 ? (
          <span key={index} className="text-[10px] text-foreground">
            {index + 1}°: {max - (slotUsati[index] ?? 0)}/{max}
          </span>
        ) : null,
      )}
      {pact.slots > 0 && (
        <span className="text-[10px] text-accent-strong">
          Patto ({pact.slotLevel}°): {pact.slots - slotPattoUsati}/{pact.slots}
        </span>
      )}
    </div>
  );
}
export function EncounterTracker({
  campaignId,
  isDm,
  partyLevels,
  onXpGranted,
}: {
  campaignId: string;
  isDm: boolean;
  partyLevels: number[];
  onXpGranted: () => void;
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getActiveEncounter>>>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getActiveEncounter(campaignId)
      .then(setData)
      .catch((err) => setError(err.message));
  };

  useEffect(refresh, [campaignId]);

  usePartyRoom({ kind: "combat", campaignId }, (message) => {
    if ((message as { type?: string } | null)?.type === "encounter-changed") refresh();
  });

  if (!data) {
    if (!isDm) return null;
    return (
      <section className="rounded-xl border border-dashed border-edge bg-surface/50 p-4">
        <button
          onClick={async () => {
            await startEncounter(campaignId);
            refresh();
          }}
          className="text-sm font-bold text-accent-strong hover:underline"
        >
          ⚔️ Inizia combattimento
        </button>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </section>
    );
  }

  const { encounter, combatants } = data;

  return (
    <section className="card-elevated rounded-xl border border-accent/40 bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-accent-strong">
          ⚔️ Combattimento — Round {encounter.round}
        </h2>
        {isDm && (
          <div className="flex gap-2">
            <button
              onClick={async () => {
                await nextTurn(encounter.id);
                refresh();
              }}
              className="text-xs font-bold rounded-lg border border-edge px-3 py-1.5 text-foreground hover:border-accent transition-colors"
            >
              Prossimo turno →
            </button>
            <button
              onClick={async () => {
                if (window.confirm("Terminare il combattimento?")) {
                  await endEncounter(campaignId);
                  refresh();
                }
              }}
              className="text-xs text-danger hover:underline"
            >
              Termina
            </button>
          </div>
        )}
      </div>

      {combatants.length === 0 ? (
        <p className="text-sm text-muted">Nessun combattente ancora.</p>
      ) : (
        <ul className="space-y-1.5">
          {combatants.map((c, index) => (
            <li
              key={c.id}
              className={`card-elevated rounded-lg border px-3 py-2 space-y-1.5 transition-colors duration-300 ${
                index === encounter.currentTurn
                  ? "glow-accent border-accent bg-accent/10"
                  : "border-edge bg-surface-raised"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isDm ? (
                    <IntField
                      value={c.iniziativa}
                      onChange={async (value) => {
                        await updateCombatant(c.id, { iniziativa: value });
                        refresh();
                      }}
                      aria-label={`Iniziativa di ${c.nome}`}
                      className="w-10 shrink-0 rounded border border-edge bg-surface px-1 py-0.5 text-center text-xs font-bold text-muted"
                    />
                  ) : (
                    <span className="text-xs font-bold text-muted w-6 shrink-0">{c.iniziativa}</span>
                  )}
                  <span
                    className={`text-sm truncate ${c.isPg ? "text-accent-strong font-bold" : "text-foreground"}`}
                  >
                    {c.nome}
                  </span>
                </div>
                {isDm ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={async () => {
                        await updateCombatant(c.id, { hpAttuali: Math.max(0, c.hpAttuali - 1) });
                        refresh();
                      }}
                      className="size-8 rounded border border-edge text-danger text-sm transition-transform active:scale-90"
                      aria-label="Togli un punto ferita"
                    >
                      −
                    </button>
                    <HpValue hpAttuali={c.hpAttuali} hpMax={c.hpMax} />
                    <button
                      onClick={async () => {
                        const hpAttuali = Math.min(c.hpMax, c.hpAttuali + 1);
                        await updateCombatant(c.id, {
                          hpAttuali,
                          // recuperare anche un solo PF azzera i tiri salvezza contro la morte (regola RAW)
                          ...(c.hpAttuali <= 0 && hpAttuali > 0
                            ? { tiriMorteSuccessi: 0, tiriMorteFallimenti: 0 }
                            : {}),
                        });
                        refresh();
                      }}
                      className="size-8 rounded border border-edge text-accent-strong text-sm transition-transform active:scale-90"
                      aria-label="Aggiungi un punto ferita"
                    >
                      +
                    </button>
                    <button
                      onClick={async () => {
                        await removeCombatant(c.id);
                        refresh();
                      }}
                      className="text-muted hover:text-danger text-xs ml-1 transition-colors"
                      aria-label={`Rimuovi ${c.nome}`}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted shrink-0">
                    <HpValue hpAttuali={c.hpAttuali} hpMax={c.hpMax} suffix=" PF" />
                  </span>
                )}
              </div>

              <CombatantConditions combatant={c} isDm={isDm} onChange={refresh} />

              {!c.isPg && c.azioniLeggendarieMax > 0 && (
                <CombatantLegendaryActions combatant={c} isDm={isDm} onChange={refresh} />
              )}

              {c.isPg && <CombatantConcentration combatant={c} isDm={isDm} onChange={refresh} />}

              {c.isPg && c.hpAttuali <= 0 && (
                <CombatantDeathSaves combatant={c} isDm={isDm} onChange={refresh} />
              )}
            </li>
          ))}
        </ul>
      )}

      {isDm && (
        <EncounterDmControls
          encounter={encounter}
          campaignId={campaignId}
          partyLevels={partyLevels}
          combatants={combatants}
          onChange={refresh}
          onXpGranted={onXpGranted}
        />
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}

function EncounterDmControls({
  encounter,
  campaignId,
  partyLevels,
  combatants,
  onChange,
  onXpGranted,
}: {
  encounter: { id: string };
  campaignId: string;
  partyLevels: number[];
  combatants: Combatant[];
  onChange: () => void;
  onXpGranted: () => void;
}) {
  const [nome, setNome] = useState("");
  const [iniziativa, setIniziativa] = useState(10);
  const [hpMax, setHpMax] = useState(10);
  const [azioniLeggendarieMax, setAzioniLeggendarieMax] = useState(0);
  const [xp, setXp] = useState(0);

  const add = async () => {
    if (!nome.trim() || hpMax < 1) return;
    await addCombatant(encounter.id, { nome: nome.trim(), iniziativa, hpMax, azioniLeggendarieMax, xp });
    setNome("");
    setAzioniLeggendarieMax(0);
    setXp(0);
    onChange();
  };

  return (
    <div className="border-t border-edge pt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={async () => {
            await addPartyToEncounter(encounter.id);
            onChange();
          }}
          className="text-xs font-bold rounded-lg border border-edge px-2 py-1.5 text-foreground hover:border-accent transition-colors"
        >
          + Aggiungi il party
        </button>
        <MonsterQuickAdd
          onPick={(name, hp, legendaryActions, monsterXp) => {
            setNome(name);
            setHpMax(hp);
            setAzioniLeggendarieMax(legendaryActions);
            setXp(monsterXp);
          }}
        />
      </div>

      <EncounterGenerator
        encounterId={encounter.id}
        partyLevels={partyLevels}
        onAdded={onChange}
      />
      <TreasureGenerator
        defaultCr={partyLevels.length > 0 ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length) : 1}
      />
      <NameGenerator />
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          placeholder="Nome combattente"
          className="flex-1 min-w-[140px] rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
        />
        <label className="flex items-center gap-1 text-xs text-muted">
          Iniz.
          <IntField
            value={iniziativa}
            onChange={setIniziativa}
            className="w-14 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          PF
          <IntField
            min={1}
            value={hpMax}
            onChange={setHpMax}
            className="w-14 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          Az. legg.
          <IntField
            min={0}
            value={azioniLeggendarieMax}
            onChange={setAzioniLeggendarieMax}
            className="w-12 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          XP
          <IntField
            min={0}
            value={xp}
            onChange={setXp}
            className="w-16 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <button
          onClick={add}
          className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97]"
        >
          Aggiungi
        </button>
      </div>

      <XpDistributor campaignId={campaignId} combatants={combatants} onGranted={onXpGranted} />
    </div>
  );
}

function XpDistributor({
  campaignId,
  combatants,
  onGranted,
}: {
  campaignId: string;
  combatants: Combatant[];
  onGranted: () => void;
}) {
  const monsterXp = combatants.filter((c) => !c.isPg).reduce((sum, c) => sum + c.xp, 0);
  // solo i PG davvero collegati a un personaggio sincronizzato possono ricevere XP (vedi
  // grantXpToParty) — un PG aggiunto a mano senza passare da "Aggiungi il party" non ha un
  // characterUserId e va escluso sia dal conteggio che dal bersaglio dell'assegnazione.
  const participantUserIds = combatants
    .filter((c): c is Combatant & { characterUserId: string } => c.isPg && Boolean(c.characterUserId))
    .map((c) => c.characterUserId);
  const pgCount = participantUserIds.length;
  const suggestedShare = pgCount > 0 ? Math.floor(monsterXp / pgCount) : monsterXp;

  const [perPlayer, setPerPlayer] = useState(suggestedShare);
  const [touched, setTouched] = useState(false);
  const [autoLevelUp, setAutoLevelUp] = useState(true);
  const [granting, setGranting] = useState(false);
  const [granted, setGranted] = useState(false);
  const [error, setError] = useState("");

  // il totale XP dei mostri cambia mentre il master aggiunge/rimuove combattenti: finché il
  // master non ha toccato il campo a mano, resta agganciato al suggerimento; una volta
  // modificato manualmente, resta quello che ha scelto anche se il suggerimento cambia dopo
  // (altrimenti una modifica manuale verrebbe silenziosamente scavalcata al prossimo mostro
  // aggiunto)
  const [lastSuggested, setLastSuggested] = useState(suggestedShare);
  if (suggestedShare !== lastSuggested) {
    setLastSuggested(suggestedShare);
    if (!touched) setPerPlayer(suggestedShare);
  }

  if (monsterXp === 0 && pgCount === 0) return null;

  const grant = async () => {
    setGranting(true);
    setError("");
    try {
      await grantXpToParty(campaignId, perPlayer, autoLevelUp, participantUserIds);
      setGranted(true);
      onGranted();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted">Distribuisci XP al party</p>
      <p className="text-xs text-muted">
        Mostri nel combattimento: {monsterXp} XP totali ÷ {pgCount || "?"} PG ={" "}
        {suggestedShare} XP a testa (modificabile).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          XP a testa
          <IntField
            min={0}
            value={perPlayer}
            onChange={(value) => {
              setPerPlayer(value);
              setTouched(true);
              setGranted(false);
            }}
            className="w-20 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={autoLevelUp}
            onChange={(event) => setAutoLevelUp(event.target.checked)}
          />
          Sali di livello automaticamente se possibile
        </label>
        <button
          onClick={grant}
          disabled={granting || perPlayer <= 0 || participantUserIds.length === 0}
          className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
        >
          {granting ? "Assegno…" : granted ? "✓ Assegnato" : "Assegna XP"}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-[10px] text-muted">
        Ogni giocatore vedrà l&apos;XP in sospeso sulla propria scheda Personaggio e dovrà
        applicarla lui (l&apos;app non modifica la scheda di qualcun altro direttamente).
      </p>
    </div>
  );
}

export function GrantXpInline({
  campaignId,
  targetUserId,
  onGranted,
}: {
  campaignId: string;
  targetUserId: string;
  onGranted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [autoLevelUp, setAutoLevelUp] = useState(true);
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        + Assegna XP
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <IntField
        min={0}
        value={amount}
        onChange={setAmount}
        className="w-16 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-foreground text-center"
        placeholder="XP"
        autoFocus
      />
      <label className="flex items-center gap-1 text-muted">
        <input
          type="checkbox"
          checked={autoLevelUp}
          onChange={(event) => setAutoLevelUp(event.target.checked)}
        />
        sali di livello auto
      </label>
      <button
        onClick={async () => {
          if (amount <= 0) return;
          setGranting(true);
          setError("");
          try {
            await grantXp(campaignId, targetUserId, amount, autoLevelUp);
            setOpen(false);
            setAmount(0);
            onGranted();
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setGranting(false);
          }
        }}
        disabled={granting || amount <= 0}
        className="rounded-md bg-accent text-background font-bold px-2 py-1 hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
      >
        {granting ? "…" : "Assegna"}
      </button>
      {error && <p className="w-full text-red-400">{error}</p>}
      <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
        ×
      </button>
    </div>
  );
}

