"use client";

import { useCallback, useEffect, useRef } from "react";
import PartySocket from "partysocket";

type PartyRoomArgs =
  | { kind: "combat"; campaignId: string }
  | { kind: "dungeon"; dungeonId: string }
  | { kind: "user"; userId: string };

// Apre (se NEXT_PUBLIC_PARTYKIT_HOST è configurato) una connessione realtime alla Durable
// Object su Cloudflare per la stanza indicata, previa richiesta di un token firmato che
// prova la membership sulla campagna (vedi app/api/party-token/route.ts). Se il realtime
// non è configurato o il token non arriva, l'hook resta silenziosamente inattivo: il resto
// dell'app funziona comunque con refresh manuale, com'era prima.
export function usePartyRoom(args: PartyRoomArgs | null, onMessage: (data: unknown) => void) {
  const socketRef = useRef<PartySocket | null>(null);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });

  const key = args
    ? args.kind === "combat"
      ? `combat:${args.campaignId}`
      : args.kind === "dungeon"
        ? `dungeon:${args.dungeonId}`
        : `user:${args.userId}`
    : null;

  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    if (!args || !host) return;

    let cancelled = false;
    let socket: PartySocket | null = null;

    (async () => {
      // try/catch attorno all'intera richiesta: se la sessione scade mentre la scheda resta
      // aperta, il middleware di autenticazione (proxy.ts) reindirizza questa richiesta alla
      // pagina di login HTML invece di rispondere con JSON — res.ok resta true (redirect seguito
      // fino a una 200 finale), ma res.json() lancerebbe un'eccezione qui dentro una promise
      // "fire and forget", senza nessuno pronto a intercettarla. Stesso principio di
      // "degrada invece di rompersi" già usato per lib/gemini.ts, lib/push.ts, lib/party.ts.
      try {
        const res = await fetch("/api/party-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(args),
        });
        if (!res.ok || cancelled) return;
        const { token, room } = (await res.json()) as { token: string; room: string };
        if (cancelled) return;

        socket = new PartySocket({ host, party: "main", room, query: { token } });
        socket.addEventListener("message", (event) => {
          try {
            onMessageRef.current(JSON.parse(event.data as string));
          } catch {
            // messaggio non JSON: ignorato
          }
        });
        socketRef.current = socket;
      } catch {
        // realtime non disponibile per questa sessione: il resto dell'app funziona comunque
      }
    })();

    return () => {
      cancelled = true;
      socket?.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const send = useCallback((data: unknown) => {
    socketRef.current?.send(JSON.stringify(data));
  }, []);

  return { send };
}
