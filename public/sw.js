// Service worker: notifiche push (invariato) + una cache minima per aprire l'app anche con wifi
// assente o instabile al tavolo — richiesto dall'utente ("con wifi ballerina può essere un
// problema reale"). Le funzioni di campagna (chat, party, combattimento) restano
// intrinsecamente online-only: sono dati condivisi in tempo reale, non ha senso fingerle
// disponibili offline. Quello che invece VIVE GIÀ solo sul dispositivo (scheda personaggio in
// localStorage, dadi) può restare usabile: qui si mette in cache solo la "shell" per farli
// aprire, i dati veri restano quelli già in localStorage, non c'è nulla di personale nella HTML
// di queste pagine da tenere aggiornato.
const CACHE_NAME = "questzip-shell-v1";

// Solo pagine SENZA dati di campagna condivisi/altrui: niente /campagne, /chat, /api — quelle
// restano puro network, mai messe in cache (dati sensibili o che cambiano in tempo reale, una
// versione vecchia in cache sarebbe peggio di un errore di rete onesto). I dadi non hanno una
// pagina propria (è un modal globale aperto dalla Nav, vedi components/nav.tsx) — bastano la
// shell e il JS già in cache di una qualunque di queste pagine per usarli offline.
const OFFLINE_SAFE_PATHS = ["/", "/personaggi", "/guida", "/offline"];

// Ogni rotta è protetta dal middleware (proxy.ts): a sessione assente o scaduta la richiesta
// viene REDIRETTA alla pagina di accesso, che risponde 200 — quindi il solo response.ok
// metterebbe in cache la schermata di login sotto "/", "/personaggi", "/guida" e "/offline".
// Peggio: /offline non viene mai visitato online, quindi resterebbe avvelenato per sempre, e una
// risposta "redirected" passata a respondWith() per una navigazione fa lanciare un TypeError —
// il fallback offline si romperebbe esattamente quando serve. Si mette in cache solo una risposta
// arrivata davvero da quell'indirizzo.
function isCacheableResponse(response) {
  return response.ok && !response.redirected && response.type === "basic";
}

function isCacheable(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/_next/static/")) return true;
  return OFFLINE_SAFE_PATHS.includes(url.pathname);
}

// Precarica subito le pagine sicure invece di aspettare che l'utente le visiti mentre è online:
// senza questo, /offline stesso (la pagina di riserva usata più sotto) non finirebbe mai in
// cache — nessuno ci naviga mai volontariamente mentre è online — e il fallback fallirebbe
// silenziosamente proprio la prima volta che la rete manca davvero.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        OFFLINE_SAFE_PATHS.map(async (path) => {
          try {
            const response = await fetch(path);
            if (isCacheableResponse(response)) await cache.put(path, response);
          } catch {
            // Niente rete proprio all'installazione (raro: il file sw.js stesso è appena
            // arrivato via rete) — quel percorso resta scoperto finché non verrà visitato una
            // volta online, non è un errore da propagare e bloccare l'installazione per questo.
          }
        }),
      );
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// Network-first: quando c'è connessione si vede sempre la versione più recente (e la cache si
// aggiorna in background), la cache serve solo come rete di sicurezza quando la richiesta fallisce
// — mai l'inverso (cache-first darebbe una shell vecchia anche quando la rete funziona bene).
//
// Per le NAVIGAZIONI la rete ha un timeout breve prima di ripiegare sulla cache: "wifi ballerina"
// (il caso concreto segnalato) spesso non fallisce di colpo, resta appesa a lungo prima di dare
// errore — un semplice network-first aspetterebbe quel tempo intero prima di mostrare qualunque
// cosa, che è la stessa esperienza frustrante che questa funzione dovrebbe risolvere (osservato
// anche in verifica: senza timeout, un fetch offline poteva restare appeso per svariati secondi
// prima che l'evento "load" del browser si considerasse concluso).
const NAVIGATION_TIMEOUT_MS = 4000;

// Sentinella (non un errore): il timeout scaduto NON significa "sei offline", significa solo
// "la rete ci sta mettendo troppo". Va distinto da un fallimento vero, perché la reazione è
// diversa — vedi il gestore fetch più sotto.
const TIMED_OUT = Symbol("timeout");

function timeout(ms) {
  return new Promise((resolve) => setTimeout(() => resolve(TIMED_OUT), ms));
}

// Ogni NAVIGAZIONE viene comunque intercettata, anche verso pagine non cacheable (/campagne,
// /chat...): senza, offline mostrerebbe l'errore nativo grezzo del browser invece della pagina
// /offline — l'unica differenza è che per quelle pagine non c'è nessuna versione in cache da
// offrire (mai state salvate), solo il fallback generico.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const cacheable = isCacheable(url);
  const isNavigation = request.mode === "navigate";
  if (!cacheable && !isNavigation) return;

  event.respondWith(
    (async () => {
      // Una sola richiesta di rete, riutilizzabile: se il timeout scatta ma non abbiamo nulla in
      // cache da offrire, si continua ad aspettare PROPRIO questa invece di rifarne un'altra.
      const network = fetch(request);
      network.catch(() => {}); // evita un "unhandled rejection" quando non la attendiamo subito

      const salvaInCache = async (response) => {
        if (cacheable && isCacheableResponse(response)) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      };

      try {
        const esito = isNavigation
          ? await Promise.race([network, timeout(NAVIGATION_TIMEOUT_MS)])
          : await network;

        if (esito !== TIMED_OUT) return salvaInCache(esito);

        // Rete lenta, non assente: la cache è un buon compromesso SOLO se contiene davvero questa
        // pagina. Per una pagina non cacheable (/campagne, /chat) mostrare "sei offline" a chi è
        // online sarebbe una bugia — meglio aspettare la risposta vera, per quanto lenta.
        const cached = cacheable ? await caches.match(request) : null;
        if (cached) return cached;
        return salvaInCache(await network);
      } catch {
        if (cacheable) {
          const cached = await caches.match(request);
          if (cached) return cached;
        }
        if (isNavigation) {
          const offline = await caches.match("/offline");
          if (offline) return offline;
        }
        throw new Error("Offline e nessuna versione in cache.");
      }
    })(),
  );
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
