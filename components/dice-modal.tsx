"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DiceRoller } from "@/components/dice-roller";

/** Renderizzato via portal direttamente sotto <body>, non annidato nell'header — un overlay
 * "fixed" dentro un antenato con backdrop-blur (l'header ce l'ha) resterebbe confinato al suo
 * riquadro invece di coprire tutta la pagina (stesso bug già trovato e corretto nel campanello
 * notifiche).
 *
 * Una volta aperta la prima volta, la modale non si smonta più alla chiusura: resta nel DOM,
 * solo nascosta (l'animazione di uscita ha già un fill-mode "forwards" che la lascia invisibile
 * da sola). Il roller dadi al suo interno può tenere viva una scena 3D per i dadi fisici
 * (BabylonJS/Ammo su Web Worker, vedi dice-3d.tsx) che non ha un modo pubblico per essere
 * distrutta dall'esterno — smontare e rimontare ad ogni apertura vorrebbe dire ricrearne una
 * nuova ogni volta (lento) lasciando quella vecchia a girare in background per sempre (leak).
 * Restando montata una sola volta, come bonus anche la cronologia dei tiri resta visibile fra
 * un'apertura e l'altra invece di azzerarsi ogni volta. */
export function DiceModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!everOpened) return null;

  return createPortal(
    <div
      aria-hidden={!open}
      className={`fixed inset-0 z-40 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-16 sm:pt-4 ${
        open ? "animate-overlay-in" : "animate-overlay-out pointer-events-none"
      }`}
      onClick={onClose}
    >
      <div
        className={`card-elevated w-full max-w-md rounded-xl border border-edge bg-background p-5 space-y-4 ${
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
