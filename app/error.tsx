"use client";

import { useEffect } from "react";

// Error boundary di Next.js (App Router): senza questo file, QUALUNQUE eccezione non gestita nel
// render di un componente client (es. una menzione di chat forgiata a mano con dati inconsistenti,
// già capitato una volta in questo progetto) faceva sparire l'intera pagina lasciando solo una
// schermata bianca, senza nessun modo di recuperare se non ricaricare da zero. Cattura l'errore a
// livello di route, sotto lo stesso layout (nav/header restano visibili), con un modo di riprovare
// senza perdere la sessione.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <p className="text-4xl">🎲💥</p>
      <h1 className="heading-ornate text-2xl font-bold text-accent-strong">
        Qualcosa è andato storto
      </h1>
      <p className="max-w-md text-sm text-muted">
        Un errore imprevisto ha interrotto questa pagina — non è colpa tua, i tuoi dati non sono
        stati toccati. Prova a riprovare; se continua a succedere, ricarica la pagina.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="glow-accent rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors"
        >
          Riprova
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg border border-edge px-4 py-2 text-sm font-bold text-muted hover:text-foreground transition-colors"
        >
          Ricarica la pagina
        </button>
      </div>
    </div>
  );
}
