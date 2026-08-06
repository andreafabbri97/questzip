"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DiceRoller } from "./dice-roller";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

export interface DiceRollerPreset {
  label: string;
  groups: { die: number; quantity: number }[];
  modifier: number;
}

const CLOSE_ANIMATION_MS = 150;

/**
 * Lo stesso identico dado (3D fisico incluso) della pagina /dadi, aperto in un modal e già
 * preimpostato per un tiro specifico — richiesto dall'utente per i bottoni Attacco/Danno delle
 * armi in scheda Personaggio invece del tiro istantaneo "invisibile" che c'era prima.
 */
export function DiceRollerModal({
  preset,
  onClose,
}: {
  preset: DiceRollerPreset | null;
  onClose: () => void;
}) {
  const [rendered, setRendered] = useState(false);
  if (preset && !rendered) setRendered(true);

  useBodyScrollLock(!!preset);

  useEffect(() => {
    if (preset) return;
    const timeout = setTimeout(() => setRendered(false), CLOSE_ANIMATION_MS);
    return () => clearTimeout(timeout);
  }, [preset]);

  useEffect(() => {
    if (!preset) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [preset, onClose]);

  if (!rendered) return null;

  // Chiave legata al preset: se si apre un tiro diverso mentre il modal è già aperto (es. clic su
  // "Danno" di un'altra arma), DiceRoller deve ripartire da zero coi nuovi valori, non tenere lo
  // stato interno del tiro precedente.
  const presetKey = preset
    ? `${preset.label}:${preset.groups.map((g) => `${g.quantity}d${g.die}`).join("+")}:${preset.modifier}`
    : null;

  return createPortal(
    <div
      className={`fixed inset-0 z-40 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-16 sm:pt-4 ${
        preset ? "animate-overlay-in" : "animate-overlay-out"
      }`}
      onClick={onClose}
    >
      <div
        className={`card-elevated w-full max-w-md max-h-[85vh] flex flex-col rounded-xl border border-edge bg-surface overflow-hidden ${
          preset ? "animate-modal-in" : "animate-modal-out"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5 shrink-0">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">
            🎲 {preset?.label ?? ""}
          </span>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full border border-edge text-lg leading-none text-muted hover:text-foreground"
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>
        {/* flex-1 min-h-0 (non solo overflow-y-auto): senza min-h-0 un figlio flex non si
            restringe mai sotto l'altezza del suo contenuto (default min-height: auto), quindi lo
            scroll interno non scattava mai — il pannello (max-h-[85vh] overflow-hidden) tagliava
            semplicemente il resto invece di farlo scorrere. Bug segnalato dall'utente su un
            portatile 15" 1080p, dove il contenuto del tiro dadi è più alto dei 85vh disponibili. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {preset && (
            <DiceRoller key={presetKey} initialGroups={preset.groups} initialModifier={preset.modifier} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
