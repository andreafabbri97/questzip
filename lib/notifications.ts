import { db } from "@/lib/db";
import { notifications, notificationTypeEnum } from "@/lib/db/schema";
import { broadcastNotification } from "@/lib/party";
import { sendPushToUser } from "@/lib/push";

type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

// Titolo/corpo della push OS per ciascun tipo — le notifiche push sono volutamente sincronizzate
// con quelle "normali" (campanella): stesso evento, stesso momento di creazione, solo un canale
// di consegna in più (vedi sendPushToUser, no-op se l'utente non ha sottoscrizioni attive).
const PUSH_CONTENT: Record<
  NotificationType,
  (dati: Record<string, unknown>) => { title: string; body: string; url: string }
> = {
  friend_request: (dati) => ({
    title: "Nuova richiesta di amicizia",
    body: `${String(dati.fromName ?? "Qualcuno")} vuole essere tuo amico su QuestZip.`,
    url: "/profilo",
  }),
  friend_accepted: (dati) => ({
    title: "Richiesta accettata",
    body: `${String(dati.fromName ?? "Qualcuno")} ha accettato la tua richiesta di amicizia.`,
    url: "/profilo",
  }),
  campaign_invite: (dati) => ({
    title: "Invito a una campagna",
    body: `${String(dati.inviterName ?? "Il master")} ti ha invitato in "${String(dati.campaignNome ?? "")}".`,
    url: "/campagne",
  }),
  campaign_invite_response: (dati) => ({
    title: dati.accepted ? "Invito accettato" : "Invito rifiutato",
    body: dati.accepted
      ? `${String(dati.responderName ?? "Qualcuno")} è entrato in "${String(dati.campaignNome ?? "")}".`
      : `${String(dati.responderName ?? "Qualcuno")} ha rifiutato l'invito a "${String(dati.campaignNome ?? "")}".`,
    url: "/campagne",
  }),
  xp_granted: (dati) => ({
    title: "XP assegnata",
    body: `Hai ricevuto ${String(dati.xp ?? "")} XP in "${String(dati.campaignNome ?? "")}" — vai sulla tua scheda per applicarla.`,
    url: "/personaggi",
  }),
};

/** Helper interno (non una server action): inserisce la notifica, la spinge in tempo reale verso
 * la stanza personale del destinatario (per la campanella) E come push OS (best-effort, vedi
 * lib/push.ts) — stesso pattern scrivi-poi-trasmetti già usato ovunque in app/actions/*.ts, con
 * un canale di trasmissione in più. */
export async function createNotification(
  userId: string,
  tipo: NotificationType,
  dati: Record<string, unknown>,
) {
  const [notification] = await db
    .insert(notifications)
    .values({ userId, tipo, datiJson: dati })
    .returning();
  await broadcastNotification(userId, notification);
  const push = PUSH_CONTENT[tipo](dati);
  await sendPushToUser(userId, { ...push, tag: `notification-${notification.id}` });
  return notification;
}
