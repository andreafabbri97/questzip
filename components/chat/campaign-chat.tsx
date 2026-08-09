"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { getCampaign } from "@/app/actions/campaigns";
import {
  deleteCampaignChatMessage,
  getCampaignChatMessages,
  getCampaignChatReadState,
  markCampaignChatRead,
  sendCampaignChatMessage,
} from "@/app/actions/chat";
import { usePartyRoom } from "@/lib/use-party-room";
import { useRealtime } from "@/components/realtime-provider";
import { MessageList, type ChatMessageData } from "@/components/chat/message-list";
import { MessageComposer } from "@/components/chat/message-composer";
import { MentionModal } from "@/components/chat/mention-modal";
import type { ParsedMentionToken } from "@/lib/fivetools/mention-token";

// Firma di contenuto (non l'id, che per una bolla ottimistica è ancora temporaneo) — usata per
// riconoscere l'eco realtime del proprio messaggio anche se arriva PRIMA che si risolva la
// promise della propria sendCampaignChatMessage (il broadcast realtime parte lato server prima
// di rispondere alla server action, quindi l'eco WebSocket può battere la risposta HTTP).
function messageSignature(m: { authorId: string; testo: string; replyToId: string | null }) {
  return `${m.authorId} ${m.testo} ${m.replyToId ?? ""}`;
}

export function CampaignChat({ campaignId }: { campaignId: string }) {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? null;
  const { refreshThreads } = useRealtime();

  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getCampaign>> | null>(null);
  const [messages, setMessages] = useState<ChatMessageData[] | null>(null);
  // userId -> ultima lettura di QUEL membro per questa chat — per decidere se un mio messaggio è
  // "letto da tutti" (spunta blu) o solo consegnato. Aggiornata sia dal fetch iniziale sia dal
  // realtime (evento "chat-read", vedi usePartyRoom sotto).
  const [readState, setReadState] = useState<Map<string, Date>>(new Map());
  const [replyTo, setReplyTo] = useState<ChatMessageData | null>(null);
  const [openMention, setOpenMention] = useState<ParsedMentionToken | null>(null);
  const [error, setError] = useState("");

  // Coda FIFO signature->tempId per gli invii ancora in sospeso di CUI SONO L'AUTORE — permette
  // di riconciliare l'eco realtime col tempId giusto anche se arriva prima della risposta del
  // server action (senza, la bolla ottimistica resta orfana per sempre su "invio in corso…").
  const pendingRef = useRef(new Map<string, string[]>());

  // Cambiare campagna deve svuotare subito la vista precedente (niente messaggi vecchi mostrati
  // mentre arrivano quelli nuovi) — durante il render, non in un effetto, per non chiamare
  // setState in modo sincrono nel suo corpo (stesso pattern già consolidato in questo progetto).
  const [loadedFor, setLoadedFor] = useState(campaignId);
  if (campaignId !== loadedFor) {
    setLoadedFor(campaignId);
    setDetail(null);
    setMessages(null);
    setReadState(new Map());
    setReplyTo(null);
    setError("");
  }

  // Stesso cambio-campagna di sopra, ma un ref non si può leggere/scrivere durante il render
  // (il React Compiler di questo progetto lo vieta esplicitamente) — va in un effetto a parte.
  useEffect(() => {
    pendingRef.current.clear();
  }, [campaignId]);

  // Aggiunge/aggiorna un messaggio senza mai duplicarlo — usato sia quando arriva l'eco realtime
  // sia quando si conferma un invio ottimistico: se un messaggio con lo stesso id (vero) è già in
  // lista (l'eco può arrivare prima O dopo la risposta del server action, l'ordine non è
  // garantito) lo aggiorna sul posto; altrimenti, se non è indicato un tempId esplicito, prova a
  // risolverne uno dalla coda per firma di contenuto (vedi pendingRef sopra) prima di accodarlo
  // come messaggio del tutto nuovo.
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
    getCampaign(campaignId).then((d) => {
      if (!cancelled) setDetail(d);
    });
    getCampaignChatMessages(campaignId).then((rows) => {
      if (!cancelled) setMessages(rows);
    });
    getCampaignChatReadState(campaignId).then((rows) => {
      if (!cancelled) setReadState(new Map(rows.map((r) => [r.userId, r.lastReadAt])));
    });
    markCampaignChatRead(campaignId)
      .then(() => {
        if (!cancelled) refreshThreads();
      })
      .catch(() => {});
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
    const payload = data as {
      type?: string;
      message?: ChatMessageData;
      messageId?: string;
      userId?: string;
      lastReadAt?: string;
    };
    if (payload?.type === "chat-message" && payload.message) {
      upsertMessage(payload.message);
      // La thread è aperta proprio ora: segnala subito come letto invece di lasciare che il
      // pallino resti acceso finché non la si riapre.
      markCampaignChatRead(campaignId).then(refreshThreads).catch(() => {});
    }
    if (payload?.type === "chat-message-deleted" && payload.messageId) {
      const id = payload.messageId;
      setMessages((prev) => prev?.filter((m) => m.id !== id) ?? prev);
    }
    if (payload?.type === "chat-read" && payload.userId && payload.lastReadAt) {
      const readUserId = payload.userId;
      const lastReadAt = new Date(payload.lastReadAt);
      setReadState((prev) => new Map(prev).set(readUserId, lastReadAt));
    }
  });

  if (!detail || !messages || !userId) {
    return <p className="text-muted p-4">Caricamento…</p>;
  }

  const memberMap = new Map(detail.members.map((m) => [m.userId, { name: m.name, image: m.image }]));
  const resolveAuthor = (id: string) => memberMap.get(id) ?? { name: null, image: null };
  const isDm = detail.myRole === "dm";

  // "Letto" per un messaggio mio = tutti gli ALTRI membri l'hanno aperto dopo il suo invio (come
  // la spunta blu di un gruppo WhatsApp) — se non ci sono altri membri (campagna con solo te) non
  // c'è nessuno ad attendere, considerato letto per definizione.
  const otherMemberIds = detail.members.map((m) => m.userId).filter((id) => id !== userId);
  const isRead = (message: ChatMessageData) =>
    otherMemberIds.length === 0 ||
    otherMemberIds.every((id) => {
      const lastReadAt = readState.get(id);
      return !!lastReadAt && lastReadAt >= new Date(message.createdAt);
    });

  // Invio ottimistico: la bolla compare SUBITO (come WhatsApp), non solo quando arriva l'eco
  // realtime — così il mittente vede il proprio messaggio a prescindere da eventuali intoppi
  // della connessione realtime, invece di dover ricaricare la pagina per vederlo.
  const send = async (testo: string) => {
    setError("");
    const tempId = `temp-${crypto.randomUUID()}`;
    // Rispondere a un messaggio non ancora confermato (id temporaneo, non un vero uuid) farebbe
    // fallire l'insert lato server sul cast della colonna uuid — la UI non lo permette già
    // (vedi message-list.tsx, "Rispondi" nascosto sui messaggi con status), ma qui si ignora
    // comunque per sicurezza, invece di propagare un errore DB grezzo.
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

  // Ritenta l'invio di una bolla "failed", riusando lo stesso id temporaneo (torna "sending" sul
  // posto invece di sparire e ricomparire) — il messaggio non è mai arrivato al server la prima
  // volta, quindi non c'è nulla da "aggiornare" lì, è un invio nuovo a tutti gli effetti.
  const retry = async (message: ChatMessageData) => {
    setError("");
    const tempId = message.id;
    setMessages(
      (prev) => prev?.map((m) => (m.id === tempId ? { ...m, status: "sending" as const } : m)) ?? prev,
    );
    const sig = messageSignature(message);
    const queue = pendingRef.current.get(sig) ?? [];
    queue.push(tempId);
    pendingRef.current.set(sig, queue);
    try {
      const real = await sendCampaignChatMessage(campaignId, message.testo, message.replyToId ?? undefined);
      if (real) upsertMessage(real, tempId);
      else setMessages((prev) => prev?.filter((m) => m.id !== tempId) ?? prev);
    } catch (err) {
      setMessages(
        (prev) => prev?.map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m)) ?? prev,
      );
      setError((err as Error).message);
    }
  };

  // Una bolla "failed" non è mai arrivata al server — rimuoverla è un'operazione puramente
  // locale, non una server action (a differenza di "Elimina" su un messaggio confermato).
  const dismissFailed = (messageId: string) => {
    setMessages((prev) => prev?.filter((m) => m.id !== messageId) ?? prev);
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
    // min-h-0: stesso motivo di DirectChat (vedi commento lì) — senza, il riquadro chat non si
    // restringeva mai sotto l'altezza dei propri contenuti, impedendo lo scroll interno della
    // lista messaggi e facendo scorrere l'intera pagina al suo posto.
    <div className="flex flex-col h-full min-h-0">
      <div className="border-b border-edge px-3 py-2 shrink-0">
        <p className="text-sm font-bold text-foreground">🗺️ {detail.campaign.nome}</p>
      </div>
      <MessageList
        messages={messages}
        currentUserId={userId}
        canDelete={(message) => isDm || message.authorId === userId}
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
