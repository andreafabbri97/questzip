"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { DiceRoller } from "@/components/dice-roller";

/** Renderizzato via portal direttamente sotto <body>, non annidato nell'header — un overlay
 * "fixed" dentro un antenato con backdrop-blur (l'header ce l'ha) resterebbe confinato al suo
 * riquadro invece di coprire tutta la pagina (stesso bug già trovato e corretto nel campanello
 * notifiche). Nessuno stato "mounted" per il portal: "open" parte sempre false, quindi
 * createPortal non viene mai chiamato durante il render server/idratazione, solo dopo
 * un'interazione dell'utente — a quel punto siamo già lato client per forza. */
export function DiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 p-4 pt-16 sm:pt-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-edge bg-background p-5 space-y-4"
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
