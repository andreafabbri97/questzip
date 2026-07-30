"use client";

import { useEffect, useState } from "react";

// L'evento non è nei tipi DOM standard di TypeScript (proposta non ancora standardizzata) — stessa
// forma minima usata da ogni implementazione "Installa l'app" in giro.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type Status = "checking" | "standalone" | "ios" | "promptable" | "unsupported";

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

/** Banner "Installa l'app", stesso trattamento visivo di PushToggle qui accanto. A differenza
 * delle notifiche push, l'installazione PWA non ha un'API uniforme fra browser: su Chrome/Edge/
 * Android il browser stesso offre l'evento beforeinstallprompt da richiamare a comando; su iOS
 * Safari quell'evento non esiste affatto (Apple non lo supporta), l'unico modo è la voce manuale
 * "Aggiungi alla schermata Home" nel menu Condividi — da qui il ramo iOS con le istruzioni invece
 * di un bottone. */
export function InstallPwaToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Come in PushToggle: setState dentro un .then() (anche se qui non c'è niente da attendere
    // davvero) invece che sincrono nel corpo dell'effetto — regola del progetto contro le
    // cascading render, non solo stile.
    Promise.resolve().then(() => {
      if (cancelled) return;
      if (detectStandalone()) {
        setStatus("standalone");
      } else if (detectIOS()) {
        setStatus("ios");
      }
    });

    // Se nessuno dei due rami sopra scatta, resta "checking" finché non arriva (se arriva)
    // l'evento del browser o scade il timeout qualche riga più sotto.
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setStatus("promptable");
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    // Se il browser non supporta l'evento (Firefox, Safari desktop) o non lo offre subito,
    // niente segnale sincrono di "non arriverà mai" — un timeout generoso distingue comunque
    // "sto ancora aspettando" da "non succederà", invece di lasciare il testo su "Controllo…"
    // per sempre.
    const timeout = setTimeout(() => setStatus((s) => (s === "checking" ? "unsupported" : s)), 2500);
    return () => {
      cancelled = true;
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      clearTimeout(timeout);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setStatus(outcome === "accepted" ? "standalone" : "unsupported");
  };

  if (status === "checking") return <p className="text-sm text-muted">Controllo…</p>;
  if (status === "standalone") {
    return <p className="text-sm text-foreground">Già installata su questo dispositivo. ✓</p>;
  }

  if (status === "ios") {
    return (
      <div className="space-y-2 text-sm text-foreground">
        <p>Su iPhone/iPad si installa dal menu Condividi di Safari:</p>
        <ol className="list-decimal list-inside space-y-1 text-muted">
          <li>
            Tocca l&apos;icona <span className="font-bold text-foreground">Condividi</span> 📤 (il
            quadratino con la freccia verso l&apos;alto) nella barra di Safari — in basso su
            iPhone, in alto sull&apos;iPad.
          </li>
          <li>
            Scorri il menu e scegli <span className="font-bold text-foreground">Aggiungi alla schermata Home</span>.
          </li>
          <li>
            Conferma con <span className="font-bold text-foreground">Aggiungi</span>.
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-sm text-foreground">
        {status === "promptable"
          ? "Installala per aprirla come un'app vera, a schermo intero e più veloce."
          : "Il browser non offre l'installazione diretta al momento (magari l'hai già rifiutata di recente, o non è supportata su questo browser)."}
      </p>
      {status === "promptable" && (
        <button
          onClick={install}
          className="shrink-0 rounded-md border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-bold text-accent-strong hover:bg-accent/25 transition-colors"
        >
          Installa
        </button>
      )}
    </div>
  );
}
