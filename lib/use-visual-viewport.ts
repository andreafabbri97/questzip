"use client";

import { useEffect, useState } from "react";

export interface VisualViewportRect {
  /** Altezza dell'area realmente visibile, tastiera virtuale esclusa. */
  height: number;
  /** Di quanto l'area visibile è scesa rispetto al viewport di layout. Su iOS la tastiera non
   * accorcia il viewport: lo SPOSTA verso l'alto, quindi senza questo valore un elemento
   * `position: fixed` ancorato a `top: 0` finisce fuori dallo schermo, sopra il bordo. */
  offsetTop: number;
}

/** Riquadro realmente visibile del viewport (tastiera virtuale esclusa), aggiornato in tempo reale.
 *
 * Pensato per i modal a schermo intero con un input (es. l'assistente IA regole, segnalato con
 * screenshot da un browser in-app come quello di Instagram): le unità CSS `dvh`/`svh` in teoria
 * dovrebbero già escludere la tastiera, ma nei browser in-app/WebView (Instagram, Facebook, TikTok
 * — motore Android WebView, non il browser di sistema) il supporto è incoerente e a volte NON si
 * aggiornano quando la tastiera si apre, lasciando il modal dimensionato per lo schermo intero e un
 * vuoto enorme sopra l'input. Nemmeno `position: fixed; inset: 0` basta: quello si riferisce al
 * viewport di LAYOUT, che con la tastiera aperta resta alto quanto tutto lo schermo — l'overlay si
 * estende quindi dietro la tastiera. `window.visualViewport` è l'unica misura che descrive davvero
 * ciò che l'utente vede.
 *
 * Ritorna `null` finché l'API non è disponibile (SSR, o browser che non la supportano affatto): in
 * quel caso il chiamante deve ricadere sulle unità CSS `dvh`. */
export function useVisualViewport(): VisualViewportRect | null {
  const [rect, setRect] = useState<VisualViewportRect | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setRect({ height: vv.height, offsetTop: vv.offsetTop });
    update();
    // "scroll" oltre a "resize": su iOS l'apertura della tastiera cambia offsetTop senza
    // necessariamente cambiare l'altezza, e quell'evento è l'unico che lo segnala.
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return rect;
}
