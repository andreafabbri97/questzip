import { db } from "@/lib/db";
import { notifications, notificationTypeEnum } from "@/lib/db/schema";
import { broadcastNotification } from "@/lib/party";

type NotificationType = (typeof notificationTypeEnum.enumValues)[number];

/** Helper interno (non una server action): inserisce la notifica e la spinge in tempo reale
 * verso la stanza personale del destinatario — stesso pattern scrivi-poi-trasmetti già usato
 * ovunque in app/actions/*.ts. */
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
  return notification;
}
