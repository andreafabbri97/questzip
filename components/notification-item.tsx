"use client";

import { useState } from "react";
import Link from "next/link";
import { useRealtime } from "@/components/realtime-provider";
import { respondToCampaignFriendInvite } from "@/app/actions/campaigns";
import { respondToFriendRequest } from "@/app/actions/friends";
import { formatRelativeTime } from "@/lib/format-time";

type NotificationRow = ReturnType<typeof useRealtime>["notifications"][number];

export const NOTIFICATION_ICONS: Record<string, (dati: Record<string, unknown>) => string> = {
  friend_request: () => "👤",
  friend_accepted: () => "✅",
  campaign_invite: () => "🗺️",
  campaign_invite_response: (dati) => (dati.accepted ? "✅" : "❌"),
  xp_granted: () => "✨",
};

export const NOTIFICATION_LABELS: Record<string, (dati: Record<string, unknown>) => string> = {
  friend_request: (dati) => `${String(dati.fromName ?? "Qualcuno")} ti ha inviato una richiesta di amicizia.`,
  friend_accepted: (dati) => `${String(dati.fromName ?? "Qualcuno")} ha accettato la tua richiesta di amicizia.`,
  campaign_invite: (dati) =>
    `${String(dati.inviterName ?? "Il master")} ti ha invitato nella campagna "${String(dati.campaignNome ?? "")}".`,
  campaign_invite_response: (dati) =>
    dati.accepted
      ? `${String(dati.responderName ?? "Qualcuno")} è entrato in "${String(dati.campaignNome ?? "")}".`
      : `${String(dati.responderName ?? "Qualcuno")} ha rifiutato l'invito a "${String(dati.campaignNome ?? "")}".`,
  xp_granted: (dati) =>
    `Hai ricevuto ${String(dati.xp ?? "")} XP in "${String(dati.campaignNome ?? "")}".`,
};

// Stessa destinazione della push OS corrispondente (vedi PUSH_CONTENT in lib/notifications.ts) —
// cliccare una notifica nel centro notifiche porta nello stesso posto in cui porterebbe la push.
const NOTIFICATION_URLS: Record<string, string> = {
  friend_request: "/profilo",
  friend_accepted: "/profilo",
  campaign_invite: "/campagne",
  campaign_invite_response: "/campagne",
  xp_granted: "/personaggi",
};

/** Riga di notifica condivisa fra la tendina della campanella e /notifiche (centro notifiche a
 * pagina intera) — stesso rendering, incluse le azioni Accetta/Rifiuta inline per inviti
 * campagna e richieste di amicizia. Una volta agita, la notifica viene ELIMINATA (onDelete)
 * invece di lasciare un'etichetta "risposto" solo locale che si perderebbe comunque al refresh
 * (l'esito vero è già persistito nella tabella dell'invito/richiesta, non serve tenerlo qui). */
export function NotificationItem({
  notification,
  onRead,
  onDelete,
}: {
  notification: NotificationRow;
  onRead: () => void;
  onDelete: () => void;
}) {
  const [responding, setResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const icon = NOTIFICATION_ICONS[notification.tipo]?.(notification.datiJson) ?? "🔔";
  const label = NOTIFICATION_LABELS[notification.tipo]?.(notification.datiJson) ?? notification.tipo;
  const dateLabel = formatRelativeTime(notification.createdAt);
  const href = NOTIFICATION_URLS[notification.tipo] ?? null;

  const inviteId =
    notification.tipo === "campaign_invite" ? String(notification.datiJson.inviteId ?? "") : "";
  // Notifiche vecchie create prima di questa modifica non hanno requestId in datiJson: restano
  // semplici notifiche in sola lettura (ramo sotto), niente azioni inline per loro.
  const requestId =
    notification.tipo === "friend_request" ? String(notification.datiJson.requestId ?? "") : "";

  const deleteButton = (
    <button
      onClick={onDelete}
      aria-label="Elimina notifica"
      title="Elimina"
      className="shrink-0 self-start text-muted/50 hover:text-danger transition-colors text-xs px-1 py-0.5"
    >
      ✕
    </button>
  );

  if (inviteId || requestId) {
    const respond = async (accept: boolean) => {
      setResponding(true);
      setError(null);
      try {
        if (inviteId) await respondToCampaignFriendInvite(inviteId, accept);
        else await respondToFriendRequest(requestId, accept);
        onDelete();
      } catch (err) {
        // Casi reali: invito revocato dal master, oppure richiesta già accettata/rifiutata da un
        // altro dispositivo. Senza catch il click su "Accetta" non produceva NULLA - nessun
        // messaggio, notifica ferma lì - e sembrava che il bottone fosse rotto.
        setError((err as Error).message);
      } finally {
        setResponding(false);
      }
    };
    return (
      <div
        className={`flex gap-2.5 px-3 py-2.5 text-sm ${notification.letta ? "text-muted" : "text-foreground font-bold"}`}
      >
        <span className="shrink-0 text-base leading-none" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} onClick={onRead} className="block hover:underline">
              {label}
            </Link>
          ) : (
            <p>{label}</p>
          )}
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
          {error && <p className="text-[10px] text-danger mt-1 font-normal">{error}</p>}
        </div>
        {deleteButton}
      </div>
    );
  }

  const rowContent = (
    <>
      <span className="shrink-0 text-base leading-none" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        {label}
        <p className="text-[10px] text-muted mt-0.5 font-normal">{dateLabel}</p>
      </span>
    </>
  );

  return (
    <div
      className={`flex items-start gap-2.5 px-3 py-2.5 text-sm transition-colors hover:bg-surface ${
        notification.letta ? "text-muted" : "text-foreground font-bold"
      }`}
    >
      {href ? (
        <Link
          href={href}
          onClick={onRead}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
        >
          {rowContent}
        </Link>
      ) : (
        <button onClick={onRead} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
          {rowContent}
        </button>
      )}
      {deleteButton}
    </div>
  );
}
