"use client";

import { useEffect, useState } from "react";

/** Altezza reale visibile del viewport (esclusa la tastiera virtuale su mobile), aggiornata in
 * tempo reale. Pensato per i modal a schermo intero con un input (es. l'assistente IA regole,
 * segnalato con screenshot da un browser in-app come quello di Instagram): le unità CSS
 * `dvh`/`svh` in teoria dovrebbero già escludere la tastiera, ma nei browser in-app/WebView
 * (Instagram, Facebook, TikTok — motore Android WebView, non il browser di sistema) il supporto è
 * incoerente e a volte NON si aggiornano quando la tastiera si apre, lasciando il modal
 * dimensionato per lo schermo intero e un vuoto enorme sopra l'input. `window.visualViewport` ha
 * un supporto più ampio e affidabile in questi contesti perché riflette il vero riquadro visibile
 * del layout, tastiera inclusa.
 *
 * Ritorna `null` finché l'API non è disponibile (SSR, o browser che non la supportano affatto):
 * in quel caso il chiamante deve ricadere sulla classe CSS `dvh` come già faceva prima. */
export function useVisualViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    return () => vv.removeEventListener("resize", update);
  }, []);

  return height;
}
