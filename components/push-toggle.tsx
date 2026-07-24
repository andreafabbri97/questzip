"use client";

import { useEffect, useState } from "react";
import { subscribeToPush, unsubscribeFromPush } from "@/app/actions/push";

type Status = "checking" | "unsupported" | "off" | "on" | "denied";

// L'applicationServerKey della Push API vuole un Uint8Array, non la stringa base64url che il
// server distribuisce — conversione standard, identica in ogni implementazione web-push.
function urlBase64ToUint8Array(base64url: string) {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const base64 = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Attiva/disattiva le notifiche push del browser corrente. Sincronizzate con le notifiche
 * "normali" (campanella) perché sono lo STESSO evento lato server: lib/notifications.ts e
 * app/actions/chat.ts chiamano sendPushToUser() nello stesso momento in cui creano la notifica
 * in-app / inviano il messaggio — qui ci si limita a registrare il canale su cui riceverle. */
export function PushToggle() {
  const [status, setStatus] = useState<Status>("checking");
  const [error, setError] = useState("");

  // Ogni controllo (supporto browser, permesso, stato sottoscrizione) è racchiuso in una sola
  // catena di promise che termina in un unico .then() con il setState finale — mai una setState
  // sincrona in cima al corpo dell'effetto, stesso pattern già consolidato nel resto del progetto
  // (es. RealtimeProvider) per evitare il lint "set-state-in-effect".
  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(async (): Promise<Status> => {
        if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
        if (Notification.permission === "denied") return "denied";

        const registration = await navigator.serviceWorker.register("/sw.js");
        const sub = await registration.pushManager.getSubscription();
        if (!sub) return "off";

        // Auto-riparazione: se il browser ha già una sottoscrizione attiva ma il server l'ha
        // persa (es. ripulita dopo un invio fallito) la ri-registra, invece di lasciare lo stato
        // disallineato finché l'utente non tocca il toggle a mano.
        const json = sub.toJSON();
        if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
          subscribeToPush({
            endpoint: json.endpoint,
            keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
          }).catch(() => {});
        }
        return "on";
      })
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {
        if (!cancelled) setStatus("off");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setError("");
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setError("Notifiche push non configurate sul server.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Sottoscrizione incompleta.");
      }
      await subscribeToPush({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      });
      setStatus("on");
    } catch (err) {
      setError((err as Error).message || "Attivazione fallita.");
    }
  };

  const disable = async () => {
    setError("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFromPush(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch (err) {
      setError((err as Error).message || "Disattivazione fallita.");
    }
  };

  if (status === "checking") return <p className="text-sm text-muted">Controllo…</p>;
  if (status === "unsupported") {
    return <p className="text-sm text-muted">Questo browser non supporta le notifiche push.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-foreground">
          {status === "on"
            ? "Attive su questo dispositivo."
            : status === "denied"
              ? "Permesso negato — riabilitalo dalle impostazioni del browser."
              : "Ricevi un avviso anche a app chiusa: messaggi, richieste di amicizia, inviti campagna."}
        </p>
        {status === "on" ? (
          <button
            onClick={disable}
            className="shrink-0 text-xs font-bold text-muted hover:text-danger transition-colors"
          >
            Disattiva
          </button>
        ) : status !== "denied" ? (
          <button
            onClick={enable}
            className="shrink-0 rounded-md border border-accent/50 bg-accent/15 px-3 py-1.5 text-xs font-bold text-accent-strong hover:bg-accent/25 transition-colors"
          >
            Attiva
          </button>
        ) : null}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
