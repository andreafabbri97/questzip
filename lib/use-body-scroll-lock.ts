"use client";

import { useEffect } from "react";

/** Blocca lo scroll della pagina sotto un modal finché è aperto — bug ricorrente su ogni modal
 * dell'app (segnalato dall'utente con screenshot): l'overlay copriva lo schermo ma la pagina
 * sotto restava scrollabile lo stesso (particolarmente evidente su mobile/trackpad).
 *
 * Su iOS, "overflow: hidden" da solo non basta: se il modal è position:fixed e contiene un
 * input che riceve il focus, Safari scrolla comunque il documento sottostante per tenere
 * l'input visibile sopra la tastiera — trascinando con sé il modal "fixed" e facendolo uscire
 * dallo schermo (bug segnalato dall'utente sull'assistente regole da mobile). La tecnica che
 * risolve davvero è bloccare anche la posizione del body ("position: fixed" con lo scroll
 * corrente riportato via "top" negativo): senza un documento scrollabile sotto, Safari non ha
 * più nulla da spostare per inseguire la tastiera. Il ripristino riporta lo scroll esattamente
 * dov'era (non in cima alla pagina). */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const scrollY = window.scrollY;
    const { position, top, width, overflow } = document.body.style;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.position = position;
      document.body.style.top = top;
      document.body.style.width = width;
      document.body.style.overflow = overflow;
      window.scrollTo(0, scrollY);
    };
  }, [active]);
}
