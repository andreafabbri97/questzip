"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  deleteDirectMessage,
  getDirectMessages,
  markThreadRead,
  sendDirectMessage,
} from "@/app/actions/chat";
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
  const { subscribe, refreshThreads } = useRealtime();
  // Duplica volutamente la stessa logica di ordinamento di canonicalPair (lib/social-auth.ts)
  // invece di importarla: quel file importa lib/db (solo server), non va bene in un componente
  // client — qui basta una riga.
  const roomKey = userId ? `dm-${[userId, otherUserId].sort().join("-")}` : null;

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

  // Vedi lo stesso helper in campaign-chat.tsx: evita bolle duplicate quando l'eco realtime e la
  // risposta del server action alla propria sendDirectMessage arrivano in ordine imprevedibile.
  const upsertMessage = (message: ChatMessageData, tempId?: string) => {
    setMessages((prev) => {
      if (!prev) return prev;
      if (prev.some((m) => m.id === message.id)) {
        return prev.map((m) => (m.id === message.id ? message : m));
      }
      if (tempId && prev.some((m) => m.id === tempId)) {
        return prev.map((m) => (m.id === tempId ? message : m));
      }
      return [...prev, message];
    });
  };

  useEffect(() => {
    let cancelled = false;
    getDirectMessages(otherUserId).then((rows) => {
      if (!cancelled) setMessages(rows);
    });
    if (roomKey) {
      markThreadRead(roomKey).then(() => {
        if (!cancelled) refreshThreads();
      });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUserId, roomKey]);

  // Rete di sicurezza indipendente dal realtime: se si torna su questa scheda dopo un po',
  // riallinea la cronologia — unita col locale per non far sparire un invio ancora in corso.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      getDirectMessages(otherUserId).then((rows) => {
        setMessages((prev) => {
          const serverIds = new Set(rows.map((r) => r.id));
          const pendingLocal = (prev ?? []).filter((m) => m.status && !serverIds.has(m.id));
          return [...rows, ...pendingLocal];
        });
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [otherUserId]);

  useEffect(() => {
    // La stanza personale riceve TUTTE le DM dell'utente (con qualunque amico), non solo quelle
    // della conversazione aperta qui — va filtrato per mittente/destinatario di QUESTA thread.
    const unsubscribeNew = subscribe("dm-message", (payload) => {
      const message = (payload as { message?: ChatMessageData }).message;
      if (!message) return;
      if (message.authorId !== otherUserId && message.authorId !== userId) return;
      upsertMessage(message);
      // La thread è aperta proprio ora: segnala subito come letto invece di lasciare il pallino
      // acceso finché non la si riapre.
      if (roomKey) markThreadRead(roomKey).then(refreshThreads);
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
    // refreshThreads cambia riferimento ad ogni render di RealtimeProvider: includerlo
    // ri-sottoscriverebbe ad ogni notifica in arrivo, inutilmente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, otherUserId, userId, roomKey]);

  if (!messages || !userId) {
    return <p className="text-muted p-4">Caricamento…</p>;
  }

  const resolveAuthor = (id: string) =>
    id === userId
      ? { name: session?.user?.name ?? null, image: session?.user?.image ?? null }
      : { name: otherName, image: otherImage };

  // Invio ottimistico, stesso principio di CampaignChat: la bolla compare subito, non solo
  // quando (e se) torna l'eco realtime.
  const send = async (testo: string) => {
    setError("");
    if (!userId) return;
    const tempId = `temp-${crypto.randomUUID()}`;
    const currentReplyTo = replyTo;
    const optimistic: ChatMessageData = {
      id: tempId,
      authorId: userId,
      testo,
      replyToId: currentReplyTo?.id ?? null,
      replyToAuthorId: currentReplyTo?.authorId ?? null,
      replyToTesto: currentReplyTo?.testo ?? null,
      createdAt: new Date(),
      status: "sending",
    };
    setMessages((prev) => (prev ? [...prev, optimistic] : prev));
    setReplyTo(null);
    try {
      const real = await sendDirectMessage(otherUserId, testo, currentReplyTo?.id);
      if (real) {
        upsertMessage(real, tempId);
      } else {
        setMessages((prev) => prev?.filter((m) => m.id !== tempId) ?? prev);
      }
    } catch (err) {
      setMessages((prev) =>
        prev?.map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m)) ?? prev,
      );
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
