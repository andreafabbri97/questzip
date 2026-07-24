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
  const { refreshUnread } = useRealtime();
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

  useEffect(() => {
    let cancelled = false;
    getCampaign(campaignId).then((d) => {
      if (!cancelled) setDetail(d);
    });
    getCampaignChatMessages(campaignId).then((rows) => {
      if (!cancelled) setMessages(rows);
    });
    markThreadRead(roomKey).then(() => {
      if (!cancelled) refreshUnread();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  // Stessa stanza "campaign-<id>" già usata da combattimento/jukebox quando la pagina Campagne è
  // aperta — qui siamo su /chat, una pagina diversa, quindi apriamo la nostra connessione, ma il
  // nome stanza (e quindi i messaggi che riceviamo) è lo stesso.
  usePartyRoom({ kind: "combat", campaignId }, (data) => {
    const payload = data as { type?: string; message?: ChatMessageData; messageId?: string };
    if (payload?.type === "chat-message" && payload.message) {
      setMessages((prev) => (prev ? [...prev, payload.message as ChatMessageData] : prev));
      // La thread è aperta proprio ora: segnala subito come letto invece di lasciare che il
      // pallino resti acceso finché non la si riapre.
      markThreadRead(roomKey).then(refreshUnread);
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

  const send = async (testo: string) => {
    setError("");
    try {
      await sendCampaignChatMessage(campaignId, testo, replyTo?.id);
      setReplyTo(null);
    } catch (err) {
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
