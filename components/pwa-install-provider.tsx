"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// L'evento non è nei tipi DOM standard di TypeScript (proposta non ancora standardizzata) — stessa
// forma minima usata da ogni implementazione "Installa l'app" in giro.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Availability = "checking" | "standalone" | "ios" | "promptable" | "unsupported";

interface PwaInstallContextValue {
  availability: Availability;
  install: () => Promise<void>;
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export function usePwaInstall() {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) throw new Error("usePwaInstall va usato dentro PwaInstallProvider.");
  return ctx;
}

// iPadOS 13+ si spaccia per desktop ("MacIntel") nello user agent — lo stesso trucco di
// rilevamento touch-point usato ovunque per distinguerlo da un vero Mac.
function detectIOS(): boolean {
  if (/iPad|iPhone|iPod/.test(navigator.userAgent)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function detectStandalone(): boolean {
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // Proprietà non standard, solo Safari/iOS (prima che esistesse display-mode).
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

/** Montato una volta sola nel layout radice (non nella pagina /profilo dove viene mostrato il
 * bottone "Installa"): beforeinstallprompt scatta UNA SOLA VOLTA per caricamento di pagina, non
 * ad ogni navigazione client-side — spesso il browser lo emette mentre l'utente è ancora sulla
 * Home, ben prima che arrivi mai su /profilo. Un listener attaccato solo lì dentro lo perderebbe
 * sistematicamente (bug osservato: Chrome mostrava l'icona di installazione nella barra degli
 * indirizzi, ma la pagina diceva "non disponibile" perché non stava più ascoltando). Qui invece
 * la cattura resta valida per tutta la sessione, a prescindere da dove l'utente naviga prima di
 * aprire /profilo. */
export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [availability, setAvailability] = useState<Availability>("checking");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    // setState dentro un .then() (anche se qui non c'è niente da attendere davvero) invece che
    // sincrono nel corpo dell'effetto — stesso pattern di PushToggle/RealtimeProvider, regola del
    // progetto contro le cascading render.
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (detectStandalone()) setAvailability("standalone");
      else if (detectIOS()) setAvailability("ios");
    });

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setAvailability("promptable");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    // Se l'utente accetta il prompt del sistema operativo (o installa da un altro punto, es. il
    // menu del browser) invece di passare dal nostro bottone, questo evento lo segnala comunque.
    const onInstalled = () => {
      setDeferredPrompt(null);
      setAvailability("standalone");
    };
    window.addEventListener("appinstalled", onInstalled);

    // Se il browser non supporta l'evento (Firefox, Safari desktop) o non lo offre affatto in
    // questa sessione, niente segnale sincrono di "non arriverà mai" — un timeout generoso
    // distingue comunque "sto ancora aspettando" da "non succederà".
    const timeout = setTimeout(
      () => setAvailability((s) => (s === "checking" ? "unsupported" : s)),
      3000,
    );
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      clearTimeout(timeout);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setAvailability(outcome === "accepted" ? "standalone" : "unsupported");
  };

  return (
    <PwaInstallContext.Provider value={{ availability, install }}>
      {children}
    </PwaInstallContext.Provider>
  );
}
