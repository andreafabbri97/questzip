"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { deleteDirectMessage, getDirectMessages, sendDirectMessage } from "@/app/actions/chat";
import { useRealtime } from "@/components/realtime-provider";
import { MessageList, type ChatMessageData } from "@/components/chat/message-list";
import { MessageComposer } from "@/components/chat/message-composer";
import { MentionModal } from "@/components/chat/mention-modal";
import type { ParsedMentionToken } from "@/lib/fivetools/mention-token";

/** A differenza di CampaignChat non apre un socket proprio: le DM viaggiano sulla stessa stanza
 * personale "user-<id>" già aperta una volta sola da RealtimeProvider per notifiche/badge — qui
 * ci si limita a iscriversi ai tipi di messaggio che interessano. */
export function DirectChat({
  otherUserId,
  otherName,
  otherImage,
}: {
  otherUserId: string;
  otherName: string | null;
  otherImage: string | null;
}) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const { subscribe } = useRealtime();

  const [messages, setMessages] = useState<ChatMessageData[] | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageData | null>(null);
  const [openMention, setOpenMention] = useState<ParsedMentionToken | null>(null);
  const [error, setError] = useState("");

  const [loadedFor, setLoadedFor] = useState(otherUserId);
  if (otherUserId !== loadedFor) {
    setLoadedFor(otherUserId);
    setMessages(null);
    setReplyTo(null);
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    getDirectMessages(otherUserId).then((rows) => {
      if (!cancelled) setMessages(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [otherUserId]);

  useEffect(() => {
    // La stanza personale riceve TUTTE le DM dell'utente (con qualunque amico), non solo quelle
    // della conversazione aperta qui — va filtrato per mittente/destinatario di QUESTA thread.
    const unsubscribeNew = subscribe("dm-message", (payload) => {
      const message = (payload as { message?: ChatMessageData }).message;
      if (!message) return;
      if (message.authorId !== otherUserId && message.authorId !== userId) return;
      setMessages((prev) => (prev ? [...prev, message] : prev));
    });
    const unsubscribeDeleted = subscribe("dm-message-deleted", (payload) => {
      const messageId = (payload as { messageId?: string }).messageId;
      if (!messageId) return;
      setMessages((prev) => prev?.filter((m) => m.id !== messageId) ?? prev);
    });
    return () => {
      unsubscribeNew();
      unsubscribeDeleted();
    };
  }, [subscribe, otherUserId, userId]);

  if (!messages || !userId) {
    return <p className="text-muted p-4">Caricamento…</p>;
  }

  const resolveAuthor = (id: string) =>
    id === userId
      ? { name: session?.user?.name ?? null, image: session?.user?.image ?? null }
      : { name: otherName, image: otherImage };

  const send = async (testo: string) => {
    setError("");
    try {
      await sendDirectMessage(otherUserId, testo, replyTo?.id);
      setReplyTo(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (messageId: string) => {
    setError("");
    try {
      await deleteDirectMessage(messageId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-edge px-3 py-2 shrink-0">
        <p className="text-sm font-bold text-foreground">💬 {otherName ?? "Utente"}</p>
      </div>
      <MessageList
        messages={messages}
        currentUserId={userId}
        canDelete={(message) => message.authorId === userId}
        resolveAuthor={resolveAuthor}
        onReply={setReplyTo}
        onDelete={remove}
        onOpenMention={setOpenMention}
      />
      {error && <p className="px-3 text-xs text-danger shrink-0">{error}</p>}
      <MessageComposer
        replyTo={
          replyTo
            ? { author: resolveAuthor(replyTo.authorId).name ?? "Utente", testo: replyTo.testo }
            : null
        }
        onCancelReply={() => setReplyTo(null)}
        onSend={send}
      />
      <MentionModal mention={openMention} onClose={() => setOpenMention(null)} />
    </div>
  );
}
