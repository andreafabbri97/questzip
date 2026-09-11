"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DiceRoller } from "@/components/dice-roller";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

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

  useBodyScrollLock(open);

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
      // pt-10 invece di pt-16 su telefono: quei 24px in meno di margine cieco vanno tutti alla
      // cronologia dei tiri, che è la parte che si vuole vedere di più (richiesta dell'utente).
      className={`fixed inset-0 z-40 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-10 sm:pt-4 ${
        open ? "animate-overlay-in" : "animate-overlay-out pointer-events-none"
      }`}
      onClick={onClose}
    >
      <div
        // Il tetto in altezza è tutto lo schermo MENO il margine dell'overlay qui sopra (pt-10
        // + p-4 su telefono, p-4 sopra e sotto da tablet in su): così il pannello è alto quanto
        // si può — richiesta dell'utente, per vedere più cronologia senza scorrere — e non può
        // sbordare, perché il numero non è una percentuale scelta a occhio ma esattamente lo
        // spazio che resta. "dvh" e non "vh" perché vh conta anche la barra degli indirizzi del
        // telefono, che visibile non è. In larghezza un filo più del telefono, non di più: un
        // modal gigante starebbe solo largo.
        className={`card-elevated w-full max-w-lg sm:max-w-xl max-h-[calc(100dvh-3.5rem)] sm:max-h-[calc(100dvh-2rem)] flex flex-col rounded-xl border border-edge bg-background overflow-hidden ${
          open ? "animate-modal-in" : "animate-modal-out"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 shrink-0">
          <h2 className="text-lg font-display font-bold text-accent-strong">Tira dadi</h2>
          <button
            onClick={onClose}
            className="text-muted hover:text-foreground text-xl leading-none"
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>
        {/* flex-1 min-h-0: senza, un figlio flex non si restringe mai sotto l'altezza del suo
            contenuto e lo scroll interno non scatta mai — stesso bug (e stessa correzione) di
            DiceRollerModal, segnalato dall'utente su un portatile 15" 1080p dove il contenuto
            del tiro dadi è più alto dei 85vh disponibili. */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          <DiceRoller />
        </div>
      </div>
    </div>,
    document.body,
  );
}
