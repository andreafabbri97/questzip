"use client";

import { useEffect, useState } from "react";

/**
 * Tasto "condividi" con due comportamenti, scelti da ciò che il dispositivo sa fare.
 *
 * Su telefono `navigator.share` apre il menu di sistema — WhatsApp, Telegram, mail, quello che c'è
 * installato — ed è il gesto che l'utente si aspetta. Su desktop quel menu quasi mai esiste, e il
 * ripiego utile non è un errore ma copiare il link negli appunti; l'etichetta resta la stessa
 * perché quale dei due succederà si sa solo al clic.
 *
 * L'API è disponibile solo in HTTPS e solo dentro un gesto dell'utente: per questo la condivisione
 * parte nel gestore del clic, senza await prima della chiamata.
 */
export function BottoneCondividi({
  titolo,
  testo,
  percorso,
  className = "",
}: {
  titolo: string;
  testo: string;
  /** Percorso interno ("/compendio?..."): il dominio lo mette il browser, così vale in locale e in produzione. */
  percorso: string;
  className?: string;
}) {
  const [esito, setEsito] = useState<"idle" | "copiato" | "errore">("idle");

  useEffect(() => {
    if (esito === "idle") return;
    const timer = setTimeout(() => setEsito("idle"), 2000);
    return () => clearTimeout(timer);
  }, [esito]);

  const condividi = async () => {
    const url = `${window.location.origin}${percorso}`;
    try {
      // Deciso al clic, non nel render: sul server navigator non esiste, e differenziare il
      // markup in base a lui farebbe divergere l'idratazione.
      if (typeof navigator.share === "function") {
        await navigator.share({ title: titolo, text: testo, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setEsito("copiato");
    } catch (error) {
      // Chiudere il menu di sistema senza scegliere nulla arriva qui come AbortError: è una
      // rinuncia dell'utente, non un guasto, e segnalarla come errore sarebbe fuorviante.
      if (error instanceof DOMException && error.name === "AbortError") return;
      setEsito("errore");
    }
  };

  return (
    <button
      onClick={condividi}
      aria-label="Condividi"
      className={`card-elevated-hover rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-xs font-bold text-foreground transition-colors hover:border-accent/40 hover:text-accent-strong ${className}`}
    >
      {esito === "copiato" ? "✅ Link copiato" : esito === "errore" ? "⚠️ Non riuscito" : "🔗 Condividi"}
    </button>
  );
}
