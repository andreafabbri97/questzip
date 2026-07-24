// Service worker minimo, esiste solo per le notifiche push (nessuna strategia di cache: il sito
// resta online-first come sempre, questo file non intercetta "fetch"). Prima volta che questo
// progetto ha un service worker — vedi lib/push.ts / components/push-toggle.tsx.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  const { title, body, url, tag } = payload;

  event.waitUntil(
    (async () => {
      // Se l'utente ha già aperto e in primo piano proprio quella pagina (es. la stessa chat con
      // cui sta già parlando), non serve anche una notifica OS sopra — stesso comportamento di
      // WhatsApp Web quando la chat è già a schermo.
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const alreadyThere = allClients.some(
        (client) => client.visibilityState === "visible" && client.url.endsWith(url),
      );
      if (alreadyThere) return;

      await self.registration.showNotification(title, {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag,
        data: { url },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = allClients.find((client) => client.url.endsWith(url));
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
