"use client";

import { NotificationItem } from "@/components/notification-item";
import { useRealtime } from "@/components/realtime-provider";

// Legge la stessa lista condivisa della tendina della campanella (RealtimeProvider) invece di un
// fetch proprio: le notifiche nuove compaiono qui subito, senza bisogno di ricaricare la pagina.
export default function NotifichePage() {
  const { notifications, unreadCount, markRead, markAllRead, deleteNotification } = useRealtime();

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
              <NotificationItem
                notification={n}
                onRead={() => markRead(n.id)}
                onDelete={() => deleteNotification(n.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
