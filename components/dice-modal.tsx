"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DiceRoller } from "@/components/dice-roller";

const CLOSE_ANIMATION_MS = 150;

/** Renderizzato via portal direttamente sotto <body>, non annidato nell'header — un overlay
 * "fixed" dentro un antenato con backdrop-blur (l'header ce l'ha) resterebbe confinato al suo
 * riquadro invece di coprire tutta la pagina (stesso bug già trovato e corretto nel campanello
 * notifiche). "rendered" resta true per un breve istante anche dopo che "open" passa a false, per
 * lasciar giocare l'animazione di uscita invece di sparire di scatto — smontato solo alla fine. */
export function DiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [rendered, setRendered] = useState(open);
  if (open && !rendered) setRendered(true);

  useEffect(() => {
    if (open) return;
    const timeout = setTimeout(() => setRendered(false), CLOSE_ANIMATION_MS);
    return () => clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!rendered) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-40 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 p-4 pt-16 sm:pt-4 ${
        open ? "animate-overlay-in" : "animate-overlay-out"
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-xl border border-edge bg-background p-5 space-y-4 ${
          open ? "animate-modal-in" : "animate-modal-out"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-display font-bold text-accent-strong">Tira dadi</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-xl leading-none"
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>
        <DiceRoller />
      </div>
    </div>,
    document.body,
  );
}
