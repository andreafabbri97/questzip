"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EntriesBlock } from "@/lib/fivetools/compendio-detail";
import type { FiveEntry } from "@/lib/fivetools/entries";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

const CLOSE_ANIMATION_MS = 150;

export interface SimpleEntryData {
  title: string;
  meta?: string;
  entries: FiveEntry[];
  // Testo italiano già risolto (ufficiale o cache IA, qualità migliore della traduzione al volo)
  // quando disponibile per questa voce specifica — un paragrafo per elemento dell'array. Se
  // assente, si ricade sulla traduzione dal vivo di "entries" (EntriesBlock), mai testo inglese
  // grezzo: questo modal prima mostrava sempre e solo inglese (bug — "le traduzioni non ci
  // sono ancora", segnalato dall'utente), a differenza di ogni altro punto di dettaglio del
  // Compendio nell'app.
  textIt?: string[];
}

/**
 * Stesso guscio visivo di MentionModal (chat) ma per contenuti che non sono una voce vera e
 * propria del Compendio — privilegi a usi limitati e infusioni dell'Artefice, che vivono dentro i
 * dati di classe (RawClassFeature/RawSubclassFeature) o negli optionalfeatures, non fra gli 8
 * "kind" del Compendio — quindi non possono passare per EntryDetail/MentionModal così come sono.
 */
export function SimpleEntryModal({
  data,
  onClose,
}: {
  data: SimpleEntryData | null;
  onClose: () => void;
}) {
  const [rendered, setRendered] = useState(false);
  if (data && !rendered) setRendered(true);

  useBodyScrollLock(!!data);

  useEffect(() => {
    if (data) return;
    const timeout = setTimeout(() => setRendered(false), CLOSE_ANIMATION_MS);
    return () => clearTimeout(timeout);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [data, onClose]);

  if (!rendered) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-40 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-16 sm:pt-4 ${
        data ? "animate-overlay-in" : "animate-overlay-out"
      }`}
      onClick={onClose}
    >
      <div
        className={`card-elevated w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-edge bg-surface overflow-hidden ${
          data ? "animate-modal-in" : "animate-modal-out"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5 shrink-0">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">
            📖 {data?.title ?? ""}
          </span>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full border border-edge text-lg leading-none text-muted hover:text-foreground"
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto p-4">
          {data?.meta && <p className="text-xs text-muted mb-2">{data.meta}</p>}
          {data &&
            (data.textIt ? (
              <div className="space-y-2">
                {data.textIt.map((paragrafo, index) => (
                  <p key={index} className="text-sm text-foreground leading-relaxed">
                    {paragrafo}
                  </p>
                ))}
              </div>
            ) : (
              <EntriesBlock entries={data.entries} language="it" />
            ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}
