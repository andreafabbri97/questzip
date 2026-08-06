"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

interface UnsavedGuard {
  onSaveAndExit: () => void;
  onDiscard: () => void;
}

interface UnsavedChangesContextValue {
  registerGuard: (guard: UnsavedGuard | null) => void;
  guardNavigate: (navigate: () => void) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue | null>(null);

/** Per chi ha modifiche non salvate da proteggere (oggi solo la scheda Personaggio): registra una
 * guardia finché `dirty` è vero, la toglie (passando `null`) appena torna pulito o si smonta. */
export function useUnsavedChangesGuard(dirty: boolean, guard: UnsavedGuard) {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error("useUnsavedChangesGuard va usato dentro UnsavedChangesProvider.");
  const { registerGuard } = ctx;
  const guardRef = useRef(guard);
  // Aggiornato in un effetto (dopo il render, mai durante) invece che nel corpo della funzione:
  // mutare un ref durante il render è vietato dalle regole dei Hook, anche se qui il valore letto
  // non influenza mai l'output del render corrente.
  useEffect(() => {
    guardRef.current = guard;
  });

  useEffect(() => {
    if (!dirty) return;
    registerGuard({
      onSaveAndExit: () => guardRef.current.onSaveAndExit(),
      onDiscard: () => guardRef.current.onDiscard(),
    });
    return () => registerGuard(null);
  }, [dirty, registerGuard]);
}

/** Per chi naviga (link di navigazione, bottone "indietro" in scheda): esegue `navigate` subito se
 * non c'è nulla da proteggere, altrimenti mostra il modal "Modifiche non salvate" e la esegue solo
 * dopo la scelta dell'utente — stesso identico comportamento a prescindere da COME si prova a
 * lasciare la scheda (bottone dentro la pagina o link della barra di navigazione in alto/basso),
 * che prima erano due percorsi scollegati (bug segnalato dall'utente: uscendo dal link della barra
 * di navigazione non compariva nessun avviso, le modifiche sparivano in silenzio). */
export function useGuardedNavigation() {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error("useGuardedNavigation va usato dentro UnsavedChangesProvider.");
  return ctx.guardNavigate;
}

export function UnsavedChangesProvider({ children }: { children: ReactNode }) {
  const guardRef = useRef<UnsavedGuard | null>(null);
  const [pendingNavigate, setPendingNavigate] = useState<(() => void) | null>(null);

  const registerGuard = useCallback((guard: UnsavedGuard | null) => {
    guardRef.current = guard;
  }, []);

  const guardNavigate = useCallback((navigate: () => void) => {
    if (guardRef.current) setPendingNavigate(() => navigate);
    else navigate();
  }, []);

  const resolvePending = (action: (guard: UnsavedGuard) => void) => {
    const guard = guardRef.current;
    const navigate = pendingNavigate;
    setPendingNavigate(null);
    if (guard) action(guard);
    navigate?.();
  };

  return (
    <UnsavedChangesContext.Provider value={{ registerGuard, guardNavigate }}>
      {children}
      {pendingNavigate && (
        <UnsavedChangesModal
          onSaveAndExit={() => resolvePending((guard) => guard.onSaveAndExit())}
          onDiscard={() => resolvePending((guard) => guard.onDiscard())}
          onCancel={() => setPendingNavigate(null)}
        />
      )}
    </UnsavedChangesContext.Provider>
  );
}

function UnsavedChangesModal({
  onSaveAndExit,
  onDiscard,
  onCancel,
}: {
  onSaveAndExit: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  useBodyScrollLock(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-overlay-in"
      onClick={onCancel}
    >
      <div
        className="card-elevated w-full max-w-sm rounded-xl border border-edge bg-background p-5 space-y-4 animate-modal-in"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-display font-bold text-accent-strong">Modifiche non salvate</h2>
        <p className="text-sm text-muted">
          Stai per uscire senza salvare le modifiche a questo personaggio. Cosa vuoi fare?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onSaveAndExit}
            className="glow-accent rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97]"
          >
            💾 Salva ed esci
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-foreground hover:border-accent/50 transition-colors"
          >
            Annulla
          </button>
          <button onClick={onDiscard} className="rounded-lg px-4 py-2 text-sm text-danger hover:underline">
            Esci senza salvare
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
