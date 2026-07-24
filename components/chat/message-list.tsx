"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { MentionText } from "@/components/chat/mention-text";
import type { ParsedMentionToken } from "@/lib/fivetools/mention-token";

export interface ChatMessageData {
  id: string;
  authorId: string;
  testo: string;
  replyToId: string | null;
  replyToAuthorId: string | null;
  replyToTesto: string | null;
  createdAt: Date | string;
  // Solo per bolle ottimistiche non ancora confermate dal server (vedi campaign-chat.tsx/
  // direct-chat.tsx) — mai presente su un messaggio caricato dal server o arrivato via realtime.
  status?: "sending" | "failed";
}

interface ChatAuthor {
  name: string | null;
  image: string | null;
}

function Avatar({ src }: { src: string | null }) {
  if (!src) return <span className="size-7 rounded-full bg-surface-raised shrink-0" />;
  return (
    <Image src={src} alt="" width={28} height={28} className="rounded-full shrink-0 object-cover" />
  );
}

/** Feed messaggi condiviso fra chat di campagna e DM (fase 5/6) — non sa nulla di come i
 * messaggi vengono caricati o trasmessi in tempo reale, solo come disegnarli. Le azioni
 * "Rispondi"/"Elimina" sono sempre visibili (non nascoste dietro :hover) apposta: su mobile non
 * esiste hover, e questa chat deve funzionare bene anche lì. */
export function MessageList({
  messages,
  currentUserId,
  canDelete,
  resolveAuthor,
  onReply,
  onDelete,
  onOpenMention,
}: {
  messages: ChatMessageData[];
  currentUserId: string;
  canDelete: (message: ChatMessageData) => boolean;
  resolveAuthor: (userId: string) => ChatAuthor;
  onReply: (message: ChatMessageData) => void;
  onDelete: (messageId: string) => void;
  onOpenMention: (mention: ParsedMentionToken) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  return (
    <div className="flex-1 overflow-y-auto space-y-3 p-3">
      {messages.length === 0 && (
        <p className="text-sm text-muted text-center py-6">Nessun messaggio ancora — scrivi il primo!</p>
      )}
      {messages.map((message) => {
        const author = resolveAuthor(message.authorId);
        const mine = message.authorId === currentUserId;
        const replyAuthor = message.replyToAuthorId ? resolveAuthor(message.replyToAuthorId) : null;
        return (
          <div key={message.id} className={`flex gap-2 ${mine ? "flex-row-reverse" : ""}`}>
            <Avatar src={author.image} />
            <div className={`max-w-[80%] sm:max-w-[70%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
              <div
                className={`rounded-xl px-3 py-2 text-sm ${
                  mine
                    ? "bg-accent/15 border border-accent/30"
                    : "bg-surface-raised border border-edge"
                }`}
              >
                {!mine && (
                  <p className="text-xs font-bold text-accent-strong mb-0.5">{author.name ?? "Utente"}</p>
                )}
                {message.replyToTesto && (
                  <div className="mb-1.5 rounded-md border-l-2 border-accent/50 bg-surface/60 px-2 py-1 text-xs">
                    <p className="font-bold text-accent-strong">{replyAuthor?.name ?? "Utente"}</p>
                    <p className="truncate text-muted">{message.replyToTesto}</p>
                  </div>
                )}
                <p className="whitespace-pre-wrap text-foreground">
                  <MentionText testo={message.testo} onOpenMention={onOpenMention} />
                </p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted mt-0.5 px-1">
                <span>
                  {new Date(message.createdAt).toLocaleTimeString("it-IT", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {message.status === "sending" && <span title="Invio in corso…">🕒</span>}
                {message.status === "failed" && (
                  <span className="text-danger" title="Messaggio non inviato">
                    ⚠ non inviato
                  </span>
                )}
                <button onClick={() => onReply(message)} className="hover:text-foreground">
                  Rispondi
                </button>
                {canDelete(message) && (
                  <button onClick={() => onDelete(message.id)} className="hover:text-danger">
                    Elimina
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
