"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FlagIcon } from "@/components/flag-icon";
import { MENTION_KIND_LOADERS } from "@/lib/fivetools/mention-search";
import type { ParsedMentionToken } from "@/lib/fivetools/mention-token";
import { EntryDetail, type Entry, type Language } from "@/lib/fivetools/compendio-detail";

const CLOSE_ANIMATION_MS = 150;

/** Click su una menzione "#Nome" in chat: apre il dettaglio Compendio in un modal invece di
 * navigare verso /compendio, che ti farebbe uscire dalla conversazione. Renderizza lo stesso
 * EntryDetail già usato dalla pagina Compendio (estratto in fase 4 proprio per questo), con lo
 * stesso switch di lingua 🇬🇧/🇮🇹 disponibile lì. */
export function MentionModal({
  mention,
  onClose,
}: {
  mention: ParsedMentionToken | null;
  onClose: () => void;
}) {
  const [entry, setEntry] = useState<Entry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [language, setLanguage] = useState<Language>("it");

  // "rendered" resta true un istante dopo che "mention" passa a null, per lasciar giocare
  // l'animazione di chiusura invece di sparire di scatto (stesso pattern degli altri modal).
  const [rendered, setRendered] = useState(false);
  if (mention && !rendered) setRendered(true);
  useEffect(() => {
    if (mention) return;
    const timeout = setTimeout(() => setRendered(false), CLOSE_ANIMATION_MS);
    return () => clearTimeout(timeout);
  }, [mention]);

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

  if (!rendered) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-40 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 p-4 pt-16 sm:pt-4 ${
        mention ? "animate-overlay-in" : "animate-overlay-out"
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-edge bg-surface overflow-hidden ${
          mention ? "animate-modal-in" : "animate-modal-out"
        }`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5 shrink-0">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">📖 Compendio</span>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              {(["en", "it"] as Language[]).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  title={lang === "en" ? "Inglese (originale)" : "Italiano (traduzione automatica)"}
                  className={`flex items-center justify-center rounded-md border p-1 transition-colors ${
                    language === lang
                      ? "border-accent bg-accent/15"
                      : "border-edge bg-surface-raised hover:border-accent/50"
                  }`}
                >
                  <FlagIcon lang={lang} className="w-4 h-auto rounded-sm" />
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="flex size-7 items-center justify-center rounded-full border border-edge text-lg leading-none text-muted hover:text-foreground"
              aria-label="Chiudi"
            >
              ×
            </button>
          </div>
        </div>
        <div className="overflow-y-auto p-1">
          {entry ? (
            <EntryDetail kind={mention!.kind} entry={entry} books={null} language={language} onBack={onClose} />
          ) : notFound ? (
            <p className="p-4 text-sm text-muted">Elemento non trovato nel Compendio.</p>
          ) : (
            <p className="p-4 text-sm text-muted">Caricamento…</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
