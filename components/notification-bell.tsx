"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRealtime } from "@/components/realtime-provider";
import { respondToCampaignFriendInvite } from "@/app/actions/campaigns";

type NotificationRow = ReturnType<typeof useRealtime>["notifications"][number];

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
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-fuori-per-chiudere via listener globale invece di un overlay "fixed inset-0": un
  // overlay fixed annidato dentro l'header (che ha backdrop-blur) resterebbe confinato al suo
  // "containing block" — un elemento con backdrop-filter ne crea uno nuovo per i discendenti
  // fixed — quindi coprirebbe solo la striscia dell'header, non il resto della pagina.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (status !== "authenticated") return null;

  return (
    <div className="relative" ref={containerRef}>
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
                  <NotificationItem notification={n} onRead={() => markRead(n.id)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationItem({
  notification,
  onRead,
}: {
  notification: NotificationRow;
  onRead: () => void;
}) {
  const [responding, setResponding] = useState(false);
  const [responded, setResponded] = useState<"accettato" | "rifiutato" | null>(null);
  const label = NOTIFICATION_LABELS[notification.tipo]?.(notification.datiJson) ?? notification.tipo;
  const dateLabel = new Date(notification.createdAt).toLocaleString("it-IT");

  if (notification.tipo === "campaign_invite" && !responded) {
    const inviteId = String(notification.datiJson.inviteId ?? "");
    const respond = async (accept: boolean) => {
      setResponding(true);
      try {
        await respondToCampaignFriendInvite(inviteId, accept);
        setResponded(accept ? "accettato" : "rifiutato");
        onRead();
      } finally {
        setResponding(false);
      }
    };
    return (
      <div
        className={`px-3 py-2 text-sm ${notification.letta ? "text-muted" : "text-foreground font-bold"}`}
      >
        <p>{label}</p>
        <p className="text-[10px] text-muted mt-0.5 font-normal">{dateLabel}</p>
        <div className="flex gap-3 mt-1.5">
          <button
            onClick={() => respond(true)}
            disabled={responding}
            className="text-xs font-bold text-accent-strong hover:underline disabled:opacity-50"
          >
            Accetta
          </button>
          <button
            onClick={() => respond(false)}
            disabled={responding}
            className="text-xs text-muted hover:text-danger disabled:opacity-50"
          >
            Rifiuta
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onRead}
      className={`block w-full text-left px-3 py-2 text-sm transition-colors hover:bg-surface ${
        notification.letta ? "text-muted" : "text-foreground font-bold"
      }`}
    >
      {responded ? `✓ Invito ${responded}.` : label}
      <p className="text-[10px] text-muted mt-0.5 font-normal">{dateLabel}</p>
    </button>
  );
}
