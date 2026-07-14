"use client";

import { useCallback, useEffect, useRef } from "react";
import PartySocket from "partysocket";

type PartyRoomArgs = { kind: "combat"; campaignId: string } | { kind: "dungeon"; dungeonId: string };

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
      : `dungeon:${args.dungeonId}`
    : null;

  useEffect(() => {
    const host = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    if (!args || !host) return;

    let cancelled = false;
    let socket: PartySocket | null = null;

    (async () => {
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
