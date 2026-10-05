"use client";

import { IntField } from "@/components/int-field";
import { formatModifier } from "@/lib/dnd";
import type { DiceRollerPreset } from "@/components/dice-roller-modal";

/**
 * La casella dell'iniziativa, col suo tiro.
 *
 * Estratta dal corpo della scheda per poterla provare da sola: montare CharacterSheet intero in un
 * test vorrebbe dire simulare campagne, razze e navigazione, cioè tutto tranne quello che qui
 * interessa — che il dado parta col modificatore giusto.
 */
export function InitiativeCard({
  modificatore,
  bonusExtra,
  onBonusExtraChange,
  onRoll,
  labelClass = "text-[10px] uppercase tracking-widest text-muted",
}: {
  modificatore: number;
  bonusExtra: number;
  onBonusExtraChange: (value: number) => void;
  onRoll: (preset: DiceRollerPreset) => void;
  labelClass?: string;
}) {
  return (
    <div className="rounded-lg border border-edge bg-surface-raised px-2 sm:px-3 py-2 text-center">
      <span className={labelClass}>Iniziativa</span>
      <div className="flex items-center justify-center gap-1.5">
        <p className="text-lg font-bold text-foreground">{formatModifier(modificatore)}</p>
        <button
          onClick={() =>
            onRoll({ label: "Iniziativa", groups: [{ die: 20, quantity: 1 }], modifier: modificatore })
          }
          aria-label="Tira iniziativa"
          title="Tira iniziativa"
          className="shrink-0 rounded-lg border border-edge px-1.5 py-0.5 text-sm text-muted hover:text-accent-strong hover:border-accent transition-colors"
        >
          🎲
        </button>
      </div>
      <IntField
        value={bonusExtra}
        onChange={onBonusExtraChange}
        className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1 text-center text-xs text-foreground"
        placeholder="bonus"
        aria-label="Bonus extra all'iniziativa"
      />
    </div>
  );
}
