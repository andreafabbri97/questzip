"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { RenderEntries, type FiveEntry } from "@/lib/fivetools/entries";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

const CLOSE_ANIMATION_MS = 150;

export interface SimpleEntryData {
  title: string;
  meta?: string;
  entries: FiveEntry[];
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
          {data && <RenderEntries entries={data.entries} />}
        </div>
      </div>
    </div>,
    document.body,
  );
}
