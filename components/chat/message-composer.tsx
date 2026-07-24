"use client";

import { useState } from "react";

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

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="border-t border-edge p-3 space-y-2 shrink-0">
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
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Scrivi un messaggio…"
          rows={1}
          className="flex-1 resize-none rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground max-h-32"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          className="rounded-lg bg-accent text-background font-bold px-3 py-2 text-sm hover:bg-accent-strong transition-colors disabled:opacity-50"
        >
          Invia
        </button>
      </div>
    </div>
  );
}
