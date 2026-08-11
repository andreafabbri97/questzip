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
export function usePartyRoom(
  args: PartyRoomArgs | null,
  onMessage: (data: unknown) => void,
  // Chiamato ad OGNI apertura della connessione, non solo la prima — PartySocket si riconnette
  // da sé dopo un blip di rete e ogni riconnessione riapre un socket nuovo, che rifà "open".
  // Usato dalla chat vocale per ri-annunciarsi (vedi useVoiceChat): senza, dopo un blip di rete
  // il canale di segnalazione torna su ma nessuno lo sa, e la chiamata resta silenziosamente
  // rotta finché non si esce e rientra a mano.
  onOpen?: () => void,
  // Chiamato quando il socket si chiude in modo INASPETTATO (blip di rete, non lo smontaggio
  // volontario del componente — quel caso è filtrato internamente) — usato dalla chat vocale per
  // mostrare "riconnessione in corso" invece di lasciare l'utente a fissare uno stato "connesso"
  // che in realtà per un momento non lo è più.
  onClose?: () => void,
) {
  const socketRef = useRef<PartySocket | null>(null);
  const onMessageRef = useRef(onMessage);
  useEffect(() => {
    onMessageRef.current = onMessage;
  });
  const onOpenRef = useRef(onOpen);
  useEffect(() => {
    onOpenRef.current = onOpen;
  });
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
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
        // Fira sia alla prima connessione sia ad ogni riconnessione automatica di PartySocket
        // (un blip di rete riapre un socket NUOVO, che rifà "open") — vedi il commento sul
        // parametro onOpen sopra.
        socket.addEventListener("open", () => onOpenRef.current?.());
        socket.addEventListener("close", () => {
          // "cancelled" diventa true PRIMA che parta socket?.close() nel cleanup qui sotto: un
          // vero smontaggio del componente non deve sembrare una perdita di connessione.
          if (!cancelled) onCloseRef.current?.();
        });
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
