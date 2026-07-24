"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getCampaign } from "@/app/actions/campaigns";
import {
  deleteCampaignChatMessage,
  getCampaignChatMessages,
  markThreadRead,
  sendCampaignChatMessage,
} from "@/app/actions/chat";
import { usePartyRoom } from "@/lib/use-party-room";
import { useRealtime } from "@/components/realtime-provider";
import { MessageList, type ChatMessageData } from "@/components/chat/message-list";
import { MessageComposer } from "@/components/chat/message-composer";
import { MentionModal } from "@/components/chat/mention-modal";
import type { ParsedMentionToken } from "@/lib/fivetools/mention-token";

export function CampaignChat({ campaignId }: { campaignId: string }) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const { refreshThreads } = useRealtime();
  const roomKey = `campaign-${campaignId}`;

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getCampaign>> | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[] | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessageData | null>(null);
  const [openMention, setOpenMention] = useState<ParsedMentionToken | null>(null);
  const [error, setError] = useState("");

  // Cambiare campagna deve svuotare subito la vista precedente (niente messaggi vecchi mostrati
  // mentre arrivano quelli nuovi) — durante il render, non in un effetto, per non chiamare
  // setState in modo sincrono nel suo corpo (stesso pattern già consolidato in questo progetto).
  const [loadedFor, setLoadedFor] = useState(campaignId);
  if (campaignId !== loadedFor) {
    setLoadedFor(campaignId);
    setDetail(null);
    setMessages(null);
    setReplyTo(null);
    setError("");
  }

  // Aggiunge/aggiorna un messaggio senza mai duplicarlo — usato sia quando arriva l'eco realtime
  // sia quando si conferma un invio ottimistico: se un messaggio con lo stesso id (vero) è già in
  // lista (l'eco può arrivare prima O dopo la risposta del server action, l'ordine non è
  // garantito) lo aggiorna sul posto, altrimenti sostituisce la bolla temporanea indicata da
  // tempId (se ancora presente) o lo accoda.
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
    getCampaign(campaignId).then((d) => {
      if (!cancelled) setDetail(d);
    });
    getCampaignChatMessages(campaignId).then((rows) => {
      if (!cancelled) setMessages(rows);
    });
    markThreadRead(roomKey).then(() => {
      if (!cancelled) refreshThreads();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Rete di sicurezza indipendente dal realtime: se si torna su questa scheda dopo un po' (es.
  // cambio app sul telefono), riallinea la cronologia — unisce col locale invece di sostituirlo
  // di netto, per non far sparire un eventuale messaggio ancora in fase di invio.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      getCampaignChatMessages(campaignId).then((rows) => {
        setMessages((prev) => {
          const serverIds = new Set(rows.map((r) => r.id));
          const pendingLocal = (prev ?? []).filter((m) => m.status && !serverIds.has(m.id));
          return [...rows, ...pendingLocal];
        });
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [campaignId]);

  // Stessa stanza "campaign-<id>" già usata da combattimento/jukebox quando la pagina Campagne è
  // aperta — qui siamo su /chat, una pagina diversa, quindi apriamo la nostra connessione, ma il
  // nome stanza (e quindi i messaggi che riceviamo) è lo stesso.
  usePartyRoom({ kind: "combat", campaignId }, (data) => {
    const payload = data as { type?: string; message?: ChatMessageData; messageId?: string };
    if (payload?.type === "chat-message" && payload.message) {
      upsertMessage(payload.message);
      // La thread è aperta proprio ora: segnala subito come letto invece di lasciare che il
      // pallino resti acceso finché non la si riapre.
      markThreadRead(roomKey).then(refreshThreads);
    }
    if (payload?.type === "chat-message-deleted" && payload.messageId) {
      const id = payload.messageId;
      setMessages((prev) => prev?.filter((m) => m.id !== id) ?? prev);
    }
  });

  if (!detail || !messages || !userId) {
    return <p className="text-muted p-4">Caricamento…</p>;
  }

  const memberMap = new Map(detail.members.map((m) => [m.userId, { name: m.name, image: m.image }]));
  const resolveAuthor = (id: string) => memberMap.get(id) ?? { name: null, image: null };
  const isDm = detail.myRole === "dm";

  // Invio ottimistico: la bolla compare SUBITO (come WhatsApp), non solo quando arriva l'eco
  // realtime — così il mittente vede il proprio messaggio a prescindere da eventuali intoppi
  // della connessione realtime, invece di dover ricaricare la pagina per vederlo.
  const send = async (testo: string) => {
    setError("");
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
      const real = await sendCampaignChatMessage(campaignId, testo, currentReplyTo?.id);
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
      await deleteCampaignChatMessage(messageId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-edge px-3 py-2 shrink-0">
        <p className="text-sm font-bold text-foreground">🗺️ {detail.campaign.nome}</p>
      </div>
      <MessageList
        messages={messages}
        currentUserId={userId}
        canDelete={(message) => isDm || message.authorId === userId}
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
