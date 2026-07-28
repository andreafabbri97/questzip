"use client";

import { useEffect, useState } from "react";
import { getMyNotifications } from "@/app/actions/notifications";
import { NotificationItem } from "@/components/notification-item";
import { useRealtime } from "@/components/realtime-provider";

// Più alto del limite di 30 usato dalla tendina della campanella (solo un'anteprima) — qui è il
// centro notifiche vero e proprio.
const PAGE_LIMIT = 100;

export default function NotifichePage() {
  const { markRead: markReadShared, markAllRead: markAllReadShared } = useRealtime();
  const [notifications, setNotifications] = useState<Awaited<
    ReturnType<typeof getMyNotifications>
  > | null>(null);

  useEffect(() => {
    getMyNotifications(PAGE_LIMIT).then(setNotifications);
  }, []);

  // Aggiorna sia la lista locale di questa pagina (fino a 100) sia quella condivisa dal
  // provider (le ultime 30, usata dal badge/tendina in header) — così il conteggio in header
  // resta corretto anche segnando come lette notifiche da qui.
  const markRead = (id: string) => {
    setNotifications((prev) => prev?.map((n) => (n.id === id ? { ...n, letta: true } : n)) ?? prev);
    markReadShared(id);
  };

  const markAllRead = () => {
    setNotifications((prev) => prev?.map((n) => ({ ...n, letta: true })) ?? prev);
    markAllReadShared();
  };

  if (!notifications) return <p className="text-muted">Caricamento…</p>;

  const unreadCount = notifications.filter((n) => !n.letta).length;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <h1 className="heading-ornate text-3xl font-bold text-accent-strong">🔔 Notifiche</h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="shrink-0 text-sm font-bold text-accent-strong hover:underline"
          >
            Segna tutte come lette
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge bg-surface/50 p-10 text-center text-muted">
          <p className="text-4xl mb-3">🔔</p>
          <p>Nessuna notifica ancora.</p>
        </div>
      ) : (
        <ul className="divide-y divide-edge rounded-xl border border-edge bg-surface overflow-hidden">
          {notifications.map((n) => (
            <li key={n.id}>
              <NotificationItem notification={n} onRead={() => markRead(n.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
