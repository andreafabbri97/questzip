"use client";

import { useEffect, useState } from "react";

// Montato una volta nel layout radice: registra il service worker (public/sw.js) per TUTTI, non
// solo per chi attiva le notifiche push (PushToggle lo registra anche lui, ma solo se l'utente
// apre quella sezione — la cache offline deve essere lì per chiunque fin dal primo caricamento).
// Mostra anche un piccolo avviso quando il browser rileva di essere offline: senza, un'azione di
// campagna (Sincronizza, Assegna XP…) fallirebbe con un errore generico senza che sia chiaro
// perché — "sei offline" è più onesto e azionabile di un errore di rete grezzo.
export function OfflineSupport() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          // Il service worker può attivarsi a metà di QUESTO stesso caricamento, dopo che gli
          // script della pagina sono già stati richiesti fuori dal suo controllo (sw.js mette in
          // cache solo le richieste che intercetta) — senza questo passaggio quei chunk
          // resterebbero scoperti e la prossima apertura offline si bloccherebbe a metà
          // idratazione (bug osservato in verifica: pagina ferma su "Caricamento…" offline pur
          // con i dati già in localStorage). Ri-richiedendo qui gli stessi asset della pagina
          // corrente, se il worker è già attivo li vede passare e li salva.
          if (!navigator.serviceWorker.controller) return;
          const urls = [...document.querySelectorAll("script[src], link[rel='stylesheet'][href]")]
            .map((el) => el.getAttribute("src") || el.getAttribute("href"))
            .filter((src): src is string => !!src && src.startsWith("/_next/static/"));
          urls.forEach((src) => {
            fetch(src).catch(() => {});
          });
        })
        .catch(() => {});
    }

    // Letto solo dopo il mount (mai nel render iniziale, e mai sincrono nel corpo dell'effetto —
    // stesso pattern di PushToggle/PwaInstallProvider contro le cascading render): navigator.onLine
    // non esiste durante il rendering server, leggerlo lì darebbe un mismatch di idratazione.
    Promise.resolve().then(() => setOnline(navigator.onLine));
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    // NON sticky: la barra di navigazione è già `sticky top-0` (components/nav.tsx), e due elementi
    // appiccicati entrambi in cima si sovrappongono appena si scorre — il banner finiva sopra
    // l'header coprendolo. role="status" perché la comparsa dev'essere annunciata anche da un
    // lettore di schermo, non solo vista.
    <div
      role="status"
      className="bg-danger/90 px-4 py-1.5 text-center text-xs font-bold text-background"
    >
      📡 Sei offline — scheda personaggio e dadi restano usabili, le funzioni di campagna no.
    </div>
  );
}
