"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { usePartyRoom } from "@/lib/use-party-room";
import {
  deleteNotification as deleteNotificationAction,
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/actions/notifications";
import { getChatThreadsSummary, type ThreadActivity } from "@/app/actions/chat";

type NotificationRow = Awaited<ReturnType<typeof getMyNotifications>>[number];

interface RealtimeContextValue {
  notifications: NotificationRow[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  deleteNotification: (id: string) => void;
  /** Iscrizione a un tipo di messaggio realtime (es. "chat-message", "dm-message") senza aprire
   * una seconda connessione — tutto passa dall'unica stanza personale "user-<id>" già aperta
   * qui. Usata dalle thread di chat aperte (fase 5/6). */
  subscribe: (type: string, handler: (payload: unknown) => void) => () => void;
  /** roomKey ("campaign-<id>"/"dm-<a>-<b>") -> anteprima ultimo messaggio + conteggio non letti.
   * Le DM si aggiornano in tempo reale (viaggiano sulla stessa stanza personale già aperta qui);
   * la chat di campagna no — richiederebbe un socket per ogni campagna dell'utente, fuori scala
   * solo per un'anteprima — quindi si aggiorna quando si apre/lascia una thread o si ricarica
   * la pagina. */
  threadActivity: Map<string, ThreadActivity>;
  refreshThreads: () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime va usato dentro RealtimeProvider.");
  return ctx;
}

/** Unica connessione realtime personale per sessione (a differenza del resto dell'app, dove
 * più componenti sulla stessa pagina aprono ciascuno il proprio socket verso "campaign-<id>") —
 * qui serve un solo socket condiviso perché è montato una volta sola nel layout root e ci
 * transitano sia le notifiche sia i messaggi diretti. */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? null;

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [threadActivity, setThreadActivity] = useState<Map<string, ThreadActivity>>(new Map());
  const subscribersRef = useRef(new Map<string, Set<(payload: unknown) => void>>());

  const refreshThreads = () => {
    getChatThreadsSummary().then((rows) => {
      setThreadActivity(new Map(rows.map((row) => [row.roomKey, row])));
    });
  };

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let cancelled = false;
    getMyNotifications().then((rows) => {
      if (!cancelled) setNotifications(rows);
    });
    getChatThreadsSummary().then((rows) => {
      if (!cancelled) setThreadActivity(new Map(rows.map((row) => [row.roomKey, row])));
    });
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  // Svuota le notifiche al logout (status passa da "authenticated" a qualcos'altro) — durante
  // il render, non nell'effetto sopra, per non chiamare setState in modo sincrono nel suo corpo.
  const [notificationsForStatus, setNotificationsForStatus] = useState(status);
  if (status !== notificationsForStatus) {
    setNotificationsForStatus(status);
    if (status !== "authenticated") {
      setNotifications([]);
      setThreadActivity(new Map());
    }
  }

  usePartyRoom(userId ? { kind: "user", userId } : null, (data) => {
    const message = data as {
      type?: string;
      notification?: NotificationRow;
      message?: { userIdLow?: string; userIdHigh?: string; testo?: string; authorId?: string; createdAt?: string };
    };
    if (!message?.type) return;
    if (message.type === "notification" && message.notification) {
      setNotifications((prev) => [message.notification as NotificationRow, ...prev]);
    }
    // Le DM viaggiano già su questa stessa stanza: se una thread aperta da qualche parte non è
    // quella che ha appena ricevuto il messaggio, aggiorna subito anteprima+conteggio — se invece
    // è quella aperta, il componente DirectChat richiama refreshThreads() e lo corregge a stretto
    // giro (segnandola come letta).
    if (message.type === "dm-message" && message.message?.userIdLow && message.message.userIdHigh) {
      const roomKey = `dm-${message.message.userIdLow}-${message.message.userIdHigh}`;
      const incoming = message.message;
      setThreadActivity((prev) => {
        const next = new Map(prev);
        const existing = next.get(roomKey);
        next.set(roomKey, {
          roomKey,
          unreadCount: (existing?.unreadCount ?? 0) + 1,
          lastMessage: {
            testo: incoming.testo ?? "",
            authorId: incoming.authorId ?? "",
            // Non arriva nel payload realtime, e nelle DM non serve comunque: il prefisso
            // "Tu:"/niente nell'anteprima si decide solo confrontando authorId col mio id.
            authorName: null,
            createdAt: incoming.createdAt ? new Date(incoming.createdAt) : new Date(),
          },
        });
        return next;
      });
    }
    subscribersRef.current.get(message.type)?.forEach((handler) => handler(message));
  });

  const subscribe = (type: string, handler: (payload: unknown) => void) => {
    if (!subscribersRef.current.has(type)) subscribersRef.current.set(type, new Set());
    subscribersRef.current.get(type)!.add(handler);
    return () => {
      subscribersRef.current.get(type)?.delete(handler);
    };
  };

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, letta: true } : n)));
    markNotificationRead(id);
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, letta: true })));
    markAllNotificationsRead();
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    deleteNotificationAction(id);
  };

  const unreadCount = notifications.filter((n) => !n.letta).length;

  return (
    <RealtimeContext.Provider
      value={{
        notifications,
        unreadCount,
        markRead,
        markAllRead,
        deleteNotification,
        subscribe,
        threadActivity,
        refreshThreads,
      }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}
