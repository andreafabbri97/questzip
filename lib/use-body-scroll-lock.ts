"use client";

import { useEffect } from "react";

/** Blocca lo scroll della pagina sotto un modal finché è aperto — bug ricorrente su ogni modal
 * dell'app (segnalato dall'utente con screenshot): l'overlay copriva lo schermo ma la pagina
 * sotto restava scrollabile lo stesso (particolarmente evidente su mobile/trackpad). */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [active]);
}
