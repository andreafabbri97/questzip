"use client";

import { usePwaInstall } from "@/components/pwa-install-provider";

/** Banner "Installa l'app", stesso trattamento visivo di PushToggle qui accanto. Il rilevamento
 * vero e proprio (evento beforeinstallprompt, iOS, standalone) vive in PwaInstallProvider —
 * montato nel layout radice, non qui — questo componente si limita a renderizzare lo stato
 * condiviso. */
export function InstallPwaToggle() {
  const { availability, install } = usePwaInstall();

  if (availability === "checking") return <p className="text-sm text-muted">Controllo…</p>;
  if (availability === "standalone") {
    return <p className="text-sm text-foreground">Già installata su questo dispositivo. ✓</p>;
  }

  if (availability === "ios") {
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
        {availability === "promptable"
          ? "Installala per aprirla come un'app vera, a schermo intero e più veloce."
          : "Il browser non offre l'installazione diretta al momento (magari l'hai già rifiutata di recente, o non è supportata su questo browser)."}
      </p>
      {availability === "promptable" && (
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
