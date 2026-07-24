"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MENTION_KIND_LOADERS } from "@/lib/fivetools/mention-search";
import type { ParsedMentionToken } from "@/lib/fivetools/mention-token";
import { EntryDetail, type Entry } from "@/lib/fivetools/compendio-detail";

/** Click su una menzione "#Nome" in chat: apre il dettaglio Compendio in un modal invece di
 * navigare verso /compendio, che ti farebbe uscire dalla conversazione. Renderizza lo stesso
 * EntryDetail già usato dalla pagina Compendio (estratto in fase 4 proprio per questo), stesso
 * testo ufficiale italiano quando disponibile. */
export function MentionModal({
  mention,
  onClose,
}: {
  mention: ParsedMentionToken | null;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [notFound, setNotFound] = useState(false);

  // "mention" è un oggetto ricreato ad ogni render di MessageList (splitMessageWithMentions
  // ricostruisce l'array ogni volta) — confrontarlo per riferimento farebbe scattare il reset
  // qui sotto anche quando è "la stessa" menzione ancora aperta, causando uno sfarfallio su
  // "Caricamento…" ad ogni render del genitore. Si confronta invece per valore.
  const mentionKey = mention ? `${mention.kind}:${mention.name}:${mention.source}` : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (mentionKey !== loadedKey) {
    setLoadedKey(mentionKey);
    setEntry(null);
    setNotFound(false);
  }

  useEffect(() => {
    if (!mention) return;
    let cancelled = false;
    MENTION_KIND_LOADERS[mention.kind]().then((entries) => {
      if (cancelled) return;
      const found =
        entries.find((e) => e.name === mention.name && e.source === mention.source) ??
        entries.find((e) => e.name === mention.name);
      if (found) setEntry(found as Entry);
      else setNotFound(true);
    });
    return () => {
      cancelled = true;
    };
  }, [mention]);

  useEffect(() => {
    if (!mention) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mention, onClose]);

  if (!mention) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 p-4 pt-16 sm:pt-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full border border-edge bg-surface text-xl leading-none text-muted hover:text-foreground"
          aria-label="Chiudi"
        >
          ×
        </button>
        {entry ? (
          <EntryDetail kind={mention.kind} entry={entry} books={null} language="it" onBack={onClose} />
        ) : notFound ? (
          <div className="rounded-xl border border-edge bg-surface p-5">
            <p className="text-sm text-muted">Elemento non trovato nel Compendio.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-edge bg-surface p-5">
            <p className="text-sm text-muted">Caricamento…</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
