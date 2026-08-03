"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { askRulesAssistant } from "@/app/actions/ai-assistant";

/** Domanda veloce sulle regole D&D 5e durante la sessione ("quanto danno fa X", "come funziona
 * Y") — non una conversazione multi-turno, solo domanda/risposta. Aperto dall'icona 🤖 in header
 * (vedi components/nav.tsx), mostrata solo quando l'IA è configurata. */
export function AiAssistantModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    setAsking(true);
    setError(null);
    setAnswer(null);
    try {
      const result = await askRulesAssistant(trimmed);
      if (result) setAnswer(result);
      else setError("L'assistente IA non è disponibile in questo momento. Riprova più tardi.");
    } finally {
      setAsking(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-16 sm:pt-4 animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="card-elevated w-full max-w-lg rounded-xl border border-edge bg-surface p-5 space-y-4 animate-modal-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-display font-bold text-accent-strong">🤖 Assistente regole</h2>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full border border-edge text-lg leading-none text-muted hover:text-foreground"
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>

        <div className="space-y-2">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                ask();
              }
            }}
            placeholder="Es. Quanto danno fa Palla di Fuoco al 5° livello?"
            rows={2}
            autoFocus
            className="input-focus w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground"
          />
          <button
            onClick={ask}
            disabled={asking || !question.trim()}
            className="w-full rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors disabled:opacity-60"
          >
            {asking ? "Chiedo…" : "Chiedi"}
          </button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        {answer && (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap rounded-lg border border-edge bg-surface-raised p-3 text-sm text-foreground">
              {answer}
            </p>
            <p className="text-xs text-muted">
              Risposta generata da un&apos;IA — verifica sempre le regole ufficiali in caso di dubbio.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
