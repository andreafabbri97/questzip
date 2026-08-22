"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  deleteDirectMessage,
  getDirectChatReadState,
  getDirectMessages,
  markDirectChatRead,
  sendDirectMessage,
} from "@/app/actions/chat";
import { useRealtime } from "@/components/realtime-provider";
import { MessageList, type ChatMessageData } from "@/components/chat/message-list";
import { MessageComposer } from "@/components/chat/message-composer";
import { MentionModal } from "@/components/chat/mention-modal";
import type { ParsedMentionToken } from "@/lib/fivetools/mention-token";

// Vedi lo stesso helper in campaign-chat.tsx.
function messageSignature(m: { authorId: string; testo: string; replyToId: string | null }) {
  return `${m.authorId} ${m.testo} ${m.replyToId ?? ""}`;
}

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

  const [messages, setMessages] = useState<ChatMessageData[] | null>(null);
  // Ultima lettura dell'ALTRO partecipante (mai la mia: serve solo a colorare le spunte sui
  // messaggi che HO inviato io) — aggiornata sia dal fetch iniziale sia dal realtime ("dm-read").
  const [otherLastReadAt, setOtherLastReadAt] = useState<Date | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageData | null>(null);
  const [openMention, setOpenMention] = useState<ParsedMentionToken | null>(null);
  const [error, setError] = useState("");

  // Vedi lo stesso helper in campaign-chat.tsx: coda FIFO signature->tempId per riconciliare
  // l'eco realtime del proprio messaggio anche se arriva prima della risposta del server action.
  const pendingRef = useRef(new Map<string, string[]>());

  const [loadedFor, setLoadedFor] = useState(otherUserId);
  if (otherUserId !== loadedFor) {
    setLoadedFor(otherUserId);
    setMessages(null);
    setOtherLastReadAt(null);
    setReplyTo(null);
    setError("");
  }

  // Stesso cambio-conversazione di sopra, ma un ref non si può leggere/scrivere durante il
  // render (vedi campaign-chat.tsx) — va in un effetto a parte.
  useEffect(() => {
    pendingRef.current.clear();
  }, [otherUserId]);

  const upsertMessage = (message: ChatMessageData, tempId?: string) => {
    let resolvedTempId = tempId;
    if (!resolvedTempId) {
      const sig = messageSignature(message);
      const queue = pendingRef.current.get(sig);
      if (queue && queue.length > 0) {
        resolvedTempId = queue.shift();
        if (queue.length === 0) pendingRef.current.delete(sig);
      }
    }
    setMessages((prev) => {
      if (!prev) return prev;
      if (prev.some((m) => m.id === message.id)) {
        return prev.map((m) => (m.id === message.id ? message : m));
      }
      if (resolvedTempId && prev.some((m) => m.id === resolvedTempId)) {
        return prev.map((m) => (m.id === resolvedTempId ? message : m));
      }
      return [...prev, message];
    });
  };

  useEffect(() => {
    let cancelled = false;
    getDirectMessages(otherUserId).then((rows) => {
      if (!cancelled) setMessages(rows);
    });
    getDirectChatReadState(otherUserId).then((lastReadAt) => {
      if (!cancelled) setOtherLastReadAt(lastReadAt);
    });
    markDirectChatRead(otherUserId)
      .then(() => {
        if (!cancelled) refreshThreads();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otherUserId]);

  // Rete di sicurezza indipendente dal realtime: se si torna su questa scheda dopo un po',
  // riallinea la cronologia — unita col locale per non far sparire un invio ancora in corso.
  useEffect(() => {
    // "annullato" non è pedanteria: la cleanup toglie il listener ma NON annulla una richiesta
    // già partita, che altrimenti scriverebbe la cronologia della conversazione precedente dentro
    // quella appena aperta.
    let annullato = false;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      getDirectMessages(otherUserId).then((rows) => {
        if (annullato) return;
        setMessages((prev) => {
          const serverIds = new Set(rows.map((r) => r.id));
          const pendingLocal = (prev ?? []).filter((m) => m.status && !serverIds.has(m.id));
          return [...rows, ...pendingLocal];
        });
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      annullato = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [otherUserId]);

  useEffect(() => {
    // La stanza personale riceve TUTTE le DM dell'utente (con qualunque amico), non solo quelle
    // della conversazione aperta qui — va filtrato per mittente/destinatario di QUESTA thread.
    const unsubscribeNew = subscribe("dm-message", (payload) => {
      // userIdLow/userIdHigh viaggiano nel payload realtime (li usa già realtime-provider) ma non
      // fanno parte di ChatMessageData, che descrive solo ciò che serve a disegnare la bolla.
      const message = (payload as {
        message?: ChatMessageData & { userIdLow?: string; userIdHigh?: string };
      }).message;
      if (!message) return;
      // Filtrare per AUTORE non basta: la stanza personale riceve anche le DM che invio io a
      // chiunque altro (il broadcast va pure a user-<mittente>), e quelle hanno authorId === userId
      // — quindi passavano il filtro e finivano dentro la conversazione sbagliata. La coppia
      // (userIdLow, userIdHigh) identifica univocamente la thread.
      const [basso, alto] = [userId, otherUserId].sort();
      if (message.userIdLow !== basso || message.userIdHigh !== alto) return;
      upsertMessage(message);
      // La thread è aperta proprio ora: segnala subito come letto invece di lasciare il pallino
      // acceso finché non la si riapre.
      markDirectChatRead(otherUserId).then(refreshThreads).catch(() => {});
    });
    const unsubscribeDeleted = subscribe("dm-message-deleted", (payload) => {
      const messageId = (payload as { messageId?: string }).messageId;
      if (!messageId) return;
      setMessages((prev) => prev?.filter((m) => m.id !== messageId) ?? prev);
    });
    // Solo l'evento generato dall'ALTRA parte: se il lettore sono io (su un secondo dispositivo,
    // o l'eco del mio stesso markDirectChatRead) non deve toccare otherLastReadAt.
    const unsubscribeRead = subscribe("dm-read", (payload) => {
      const { readerId, lastReadAt } = payload as { readerId?: string; lastReadAt?: string };
      if (readerId !== otherUserId || !lastReadAt) return;
      setOtherLastReadAt(new Date(lastReadAt));
    });
    return () => {
      unsubscribeNew();
      unsubscribeDeleted();
      unsubscribeRead();
    };
    // refreshThreads cambia riferimento ad ogni render di RealtimeProvider: includerlo
    // ri-sottoscriverebbe ad ogni notifica in arrivo, inutilmente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribe, otherUserId, userId]);

  if (!messages || !userId) {
    return <p className="text-muted p-4">Caricamento…</p>;
  }

  const resolveAuthor = (id: string) =>
    id === userId
      ? { name: session?.user?.name ?? null, image: session?.user?.image ?? null }
      : { name: otherName, image: otherImage };

  const isRead = (message: ChatMessageData) =>
    !!otherLastReadAt && otherLastReadAt >= new Date(message.createdAt);

  // Invio ottimistico, stesso principio di CampaignChat: la bolla compare subito, non solo
  // quando (e se) torna l'eco realtime.
  const send = async (testo: string) => {
    setError("");
    if (!userId) return;
    const tempId = `temp-${crypto.randomUUID()}`;
    // Rispondere a un messaggio non ancora confermato (id temporaneo) farebbe fallire l'insert
    // lato server sul cast della colonna uuid — non dovrebbe arrivare qui (message-list.tsx
    // nasconde "Rispondi" sui messaggi con status), ma si ignora comunque per sicurezza.
    const currentReplyTo = replyTo && !replyTo.status ? replyTo : null;
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
    const sig = messageSignature(optimistic);
    const queue = pendingRef.current.get(sig) ?? [];
    queue.push(tempId);
    pendingRef.current.set(sig, queue);

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

  // Ritenta l'invio di una bolla "failed", riusando lo stesso id temporaneo — vedi lo stesso
  // helper in campaign-chat.tsx.
  const retry = async (message: ChatMessageData) => {
    setError("");
    if (!userId) return;
    const tempId = message.id;
    setMessages(
      (prev) => prev?.map((m) => (m.id === tempId ? { ...m, status: "sending" as const } : m)) ?? prev,
    );
    const sig = messageSignature(message);
    const queue = pendingRef.current.get(sig) ?? [];
    queue.push(tempId);
    pendingRef.current.set(sig, queue);
    try {
      const real = await sendDirectMessage(otherUserId, message.testo, message.replyToId ?? undefined);
      if (real) upsertMessage(real, tempId);
      else setMessages((prev) => prev?.filter((m) => m.id !== tempId) ?? prev);
    } catch (err) {
      setMessages(
        (prev) => prev?.map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m)) ?? prev,
      );
      setError((err as Error).message);
    }
  };

  // Una bolla "failed" non è mai arrivata al server — rimuoverla è puramente locale.
  const dismissFailed = (messageId: string) => {
    setMessages((prev) => prev?.filter((m) => m.id !== messageId) ?? prev);
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
    // min-h-0: senza, questo contenitore non si restringe mai sotto l'altezza del proprio
    // contenuto (default CSS min-height:auto) dentro il riquadro chat ad altezza fissa che lo
    // ospita — impediva a MessageList di restringersi e far scattare il proprio scroll interno,
    // facendo scorrere l'intera pagina invece della sola lista messaggi.
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-edge px-3 py-2 shrink-0">
        <Link
          href={`/profilo/${otherUserId}`}
          className="text-sm font-bold text-foreground hover:text-accent-strong transition-colors"
        >
          💬 {otherName ?? "Utente"}
        </Link>
      </div>
      <MessageList
        messages={messages}
        currentUserId={userId}
        canDelete={(message) => message.authorId === userId}
        resolveAuthor={resolveAuthor}
        isRead={isRead}
        onReply={setReplyTo}
        onDelete={remove}
        onRetry={retry}
        onDismissFailed={dismissFailed}
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
        onOpenMention={setOpenMention}
      />
      <MentionModal mention={openMention} onClose={() => setOpenMention(null)} />
    </div>
  );
}
