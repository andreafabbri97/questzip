"use client";

import { useState } from "react";
import { useRealtime } from "@/components/realtime-provider";
import { respondToCampaignFriendInvite } from "@/app/actions/campaigns";

type NotificationRow = ReturnType<typeof useRealtime>["notifications"][number];

export const NOTIFICATION_LABELS: Record<string, (dati: Record<string, unknown>) => string> = {
  friend_request: (dati) => `${String(dati.fromName ?? "Qualcuno")} ti ha inviato una richiesta di amicizia.`,
  friend_accepted: (dati) => `${String(dati.fromName ?? "Qualcuno")} ha accettato la tua richiesta di amicizia.`,
  campaign_invite: (dati) =>
    `${String(dati.inviterName ?? "Il master")} ti ha invitato nella campagna "${String(dati.campaignNome ?? "")}".`,
};

/** Riga di notifica condivisa fra la tendina della campanella e /notifiche (centro notifiche a
 * pagina intera) — stesso rendering, incluso Accetta/Rifiuta inline per gli inviti campagna. */
export function NotificationItem({
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
        className={`px-3 py-2.5 text-sm ${notification.letta ? "text-muted" : "text-foreground font-bold"}`}
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
      className={`block w-full text-left px-3 py-2.5 text-sm transition-colors hover:bg-surface ${
        notification.letta ? "text-muted" : "text-foreground font-bold"
      }`}
    >
      {responded ? `✓ Invito ${responded}.` : label}
      <p className="text-[10px] text-muted mt-0.5 font-normal">{dateLabel}</p>
    </button>
  );
}
