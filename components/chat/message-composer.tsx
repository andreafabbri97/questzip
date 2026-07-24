"use client";

import { useEffect, useRef, useState } from "react";
import {
  MENTION_KIND_LABELS,
  searchMentionCandidates,
  type MentionCandidate,
} from "@/lib/fivetools/mention-search";
import { encodeMentionToken } from "@/lib/fivetools/mention-token";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function MessageComposer({
  replyTo,
  onCancelReply,
  onSend,
}: {
  replyTo: { author: string; testo: string } | null;
  onCancelReply: () => void;
  onSend: (testo: string) => void;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // La textarea cresce da sola scrivendo, fino al tetto imposto da max-h-32 in classa (128px) —
  // reset a "auto" prima di rileggere scrollHeight, altrimenti il browser non farebbe mai
  // RIMPICCIOLIRE l'altezza cancellando testo.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

  // "#" seguito da testo senza spazi, esattamente al cursore: è la query di menzione attiva.
  // hashIndex è la posizione del "#" nel testo, per poter sostituire esattamente quel tratto
  // quando l'utente sceglie un elemento dall'elenco.
  const [mentionQuery, setMentionQuery] = useState<{ hashIndex: number; query: string } | null>(
    null,
  );
  const [mentionResults, setMentionResults] = useState<MentionCandidate[]>([]);
  // Nome → (tipo, fonte) scelti dall'autocomplete in QUESTO messaggio non ancora inviato. Solo le
  // menzioni scelte da qui diventano chip cliccabili al momento dell'invio — scrivere "#Nome" a
  // mano senza passare dall'elenco resta testo semplice, come su Slack/Discord/FB.
  const [selectedMentions, setSelectedMentions] = useState<Map<string, { kind: MentionCandidate["kind"]; source: string }>>(
    new Map(),
  );

  useEffect(() => {
    // searchMentionCandidates ritorna [] subito per una query vuota (senza caricare tutte le
    // categorie) — non serve un ramo sincrono a parte per "svuota i risultati".
    let cancelled = false;
    searchMentionCandidates(mentionQuery?.query ?? "").then((results) => {
      if (!cancelled) setMentionResults(results);
    });
    return () => {
      cancelled = true;
    };
  }, [mentionQuery]);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value;
    setText(value);
    const cursor = event.target.selectionStart ?? value.length;
    const match = value.slice(0, cursor).match(/#([^\s#]*)$/);
    setMentionQuery(match ? { hashIndex: cursor - match[0].length, query: match[1] } : null);
  };

  const pickMention = (candidate: MentionCandidate) => {
    if (!mentionQuery) return;
    const before = text.slice(0, mentionQuery.hashIndex);
    const after = text.slice(mentionQuery.hashIndex + 1 + mentionQuery.query.length);
    const inserted = `#${candidate.name} `;
    setText(before + inserted + after);
    setSelectedMentions((prev) =>
      new Map(prev).set(candidate.name, { kind: candidate.kind, source: candidate.source }),
    );
    setMentionQuery(null);
    setMentionResults([]);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      const pos = before.length + inserted.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    let encoded = trimmed;
    for (const [name, { kind, source }] of selectedMentions) {
      const pattern = new RegExp(`#${escapeRegExp(name)}\\b`, "g");
      encoded = encoded.replace(pattern, encodeMentionToken(name, kind, source));
    }
    onSend(encoded);
    setText("");
    setSelectedMentions(new Map());
    setMentionQuery(null);
  };

  return (
    <div className="border-t border-edge p-3 space-y-2 shrink-0 relative">
      {mentionQuery && mentionResults.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border border-edge bg-surface-raised shadow-lg max-h-48 overflow-y-auto">
          {mentionResults.map((candidate) => (
            <button
              key={`${candidate.kind}-${candidate.name}-${candidate.source}`}
              onClick={() => pickMention(candidate)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface transition-colors"
            >
              <span className="text-foreground truncate">{candidate.name}</span>
              <span className="text-[10px] uppercase tracking-widest text-muted shrink-0">
                {MENTION_KIND_LABELS[candidate.kind]}
              </span>
            </button>
          ))}
        </div>
      )}
      {replyTo && (
        <div className="flex items-start justify-between gap-2 rounded-md border-l-2 border-accent bg-surface-raised px-2 py-1.5 text-xs">
          <div className="min-w-0">
            <p className="font-bold text-accent-strong">Rispondi a {replyTo.author}</p>
            <p className="truncate text-muted">{replyTo.testo}</p>
          </div>
          <button onClick={onCancelReply} className="text-muted hover:text-foreground shrink-0" aria-label="Annulla risposta">
            ×
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Scrivi un messaggio… usa # per citare il Compendio"
          rows={1}
          className="flex-1 resize-none rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground max-h-32"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          aria-label="Invia"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-background transition-colors hover:bg-accent-strong disabled:opacity-40"
        >
          <span className="text-lg leading-none">↑</span>
        </button>
      </div>
    </div>
  );
}
