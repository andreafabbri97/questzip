"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { usePartyRoom } from "@/lib/use-party-room";
import {
  getMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/actions/notifications";

type NotificationRow = Awaited<ReturnType<typeof getMyNotifications>>[number];

interface RealtimeContextValue {
  notifications: NotificationRow[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  /** Iscrizione a un tipo di messaggio realtime (es. "chat-message", "dm-message") senza aprire
   * una seconda connessione — tutto passa dall'unica stanza personale "user-<id>" già aperta
   * qui. Usata dalle thread di chat aperte (fase 5/6). */
  subscribe: (type: string, handler: (payload: unknown) => void) => () => void;
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
  const subscribersRef = useRef(new Map<string, Set<(payload: unknown) => void>>());

  useEffect(() => {
    if (status !== "authenticated" || !userId) return;
    let cancelled = false;
    getMyNotifications().then((rows) => {
      if (!cancelled) setNotifications(rows);
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
    if (status !== "authenticated") setNotifications([]);
  }

  usePartyRoom(userId ? { kind: "user", userId } : null, (data) => {
    const message = data as { type?: string; notification?: NotificationRow };
    if (!message?.type) return;
    if (message.type === "notification" && message.notification) {
      setNotifications((prev) => [message.notification as NotificationRow, ...prev]);
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

  const unreadCount = notifications.filter((n) => !n.letta).length;

  return (
    <RealtimeContext.Provider value={{ notifications, unreadCount, markRead, markAllRead, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
}
