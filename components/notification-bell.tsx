"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRealtime } from "@/components/realtime-provider";

const NOTIFICATION_LABELS: Record<string, (dati: Record<string, unknown>) => string> = {
  friend_request: (dati) => `${String(dati.fromName ?? "Qualcuno")} ti ha inviato una richiesta di amicizia.`,
  friend_accepted: (dati) => `${String(dati.fromName ?? "Qualcuno")} ha accettato la tua richiesta di amicizia.`,
  campaign_invite: (dati) =>
    `${String(dati.inviterName ?? "Il master")} ti ha invitato nella campagna "${String(dati.campaignNome ?? "")}".`,
};

export function NotificationBell() {
  const { status } = useSession();
  const { notifications, unreadCount, markRead, markAllRead } = useRealtime();
  const [open, setOpen] = useState(false);

  if (status !== "authenticated") return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="relative text-lg text-muted hover:text-foreground transition-colors"
        aria-label="Notifiche"
      >
        🔔
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-30 w-72 max-h-96 overflow-y-auto rounded-lg border border-edge bg-surface-raised shadow-lg">
            <div className="flex items-center justify-between border-b border-edge px-3 py-2">
              <span className="text-xs font-bold uppercase tracking-widest text-muted">Notifiche</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-accent-strong hover:underline">
                  Segna tutte come lette
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="p-3 text-sm text-muted">Nessuna notifica.</p>
            ) : (
              <ul className="divide-y divide-edge">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      onClick={() => markRead(n.id)}
                      className={`block w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface ${
                        n.letta ? "text-muted" : "text-foreground font-bold"
                      }`}
                    >
                      {NOTIFICATION_LABELS[n.tipo]?.(n.datiJson) ?? n.tipo}
                      <p className="text-[10px] text-muted mt-0.5 font-normal">
                        {new Date(n.createdAt).toLocaleString("it-IT")}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
