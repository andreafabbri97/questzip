"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePartyRoom } from "@/lib/use-party-room";

interface VoiceSignal {
  type?: string;
  // Impostato dal server (party/campaign-room.ts sovrascrive sempre userId col mittente
  // verificato) — mai fidarsi di un valore scritto dal client per "chi ha inviato questo".
  userId?: string;
  to?: string;
  kind?: "offer" | "answer" | "ice";
  payload?: unknown;
}

// STUN pubblico gratuito (nessun account, nessun costo) — basta per la stragrande maggioranza
// delle reti domestiche/mobili. Senza un server TURN di riserva, una manciata di reti molto
// restrittive potrebbe non riuscire a stabilire la connessione diretta con un singolo
// partecipante: compromesso accettato per restare a costo zero, vedi README.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
];

export interface VoiceParticipant {
  userId: string;
  stream: MediaStream | null;
}

/**
 * Chat vocale P2P (mesh WebRTC, solo audio): il flusso audio non passa MAI dal server, solo lo
 * scambio iniziale di offerte/risposte/candidati ICE viaggia sulla stessa stanza realtime della
 * campagna già usata per token/chat/dadi/jukebox (party/campaign-room.ts) — zero servizi esterni,
 * zero costo aggiuntivo. Pensato per gruppi piccoli (5-8 persone, la taglia di questo progetto):
 * ogni partecipante manda il proprio audio direttamente a tutti gli altri, quindi non scala oltre
 * quella soglia (a differenza di un SFU/relay a pagamento, che qui si è deciso di evitare).
 */
export function useVoiceChat(campaignId: string, myUserId: string | null) {
  const [inCall, setInCall] = useState(false);
  const [muted, setMuted] = useState(false);
  const [participants, setParticipants] = useState<Map<string, VoiceParticipant>>(new Map());

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const inCallRef = useRef(false);
  // usePartyRoom ritorna "send" solo DOPO aver passato l'handler qui sotto — l'handler quindi
  // non può chiuderlo direttamente, legge invece questo ref (sincronizzato in un useEffect,
  // mai scritto durante il render).
  const sendRef = useRef<(data: unknown) => void>(() => {});

  const removePeer = useCallback((peerId: string) => {
    peersRef.current.get(peerId)?.close();
    peersRef.current.delete(peerId);
    setParticipants((prev) => {
      if (!prev.has(peerId)) return prev;
      const next = new Map(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const createPeer = useCallback(
    (peerId: string) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          sendRef.current({
            type: "voice-signal",
            to: peerId,
            kind: "ice",
            payload: event.candidate.toJSON(),
          });
        }
      };
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? null;
        setParticipants((prev) => {
          const next = new Map(prev);
          next.set(peerId, { userId: peerId, stream });
          return next;
        });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed" || pc.connectionState === "closed") removePeer(peerId);
      };
      peersRef.current.set(peerId, pc);
      return pc;
    },
    [removePeer],
  );

  const handleMessage = useCallback(
    async (raw: unknown) => {
      const message = raw as VoiceSignal;
      if (
        !message?.type?.startsWith("voice-") ||
        !message.userId ||
        message.userId === myUserId ||
        !inCallRef.current
      ) {
        return;
      }

      if (message.type === "voice-join") {
        // Chi è già in chiamata inizia l'offerta verso il nuovo arrivato — chi entra si limita
        // ad annunciarsi e ad aspettare le offerte, evitando che entrambi i lati della stessa
        // coppia propongano un'offerta insieme (glare).
        const pc = createPeer(message.userId);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendRef.current({ type: "voice-signal", to: message.userId, kind: "offer", payload: offer });
        return;
      }

      if (message.type === "voice-leave") {
        removePeer(message.userId);
        return;
      }

      if (message.type === "voice-signal" && message.to === myUserId) {
        const fromId = message.userId;
        if (message.kind === "offer") {
          const pc = peersRef.current.get(fromId) ?? createPeer(fromId);
          await pc.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendRef.current({ type: "voice-signal", to: fromId, kind: "answer", payload: answer });
        } else if (message.kind === "answer") {
          await peersRef.current
            .get(fromId)
            ?.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
        } else if (message.kind === "ice") {
          await peersRef.current
            .get(fromId)
            ?.addIceCandidate(message.payload as RTCIceCandidateInit)
            .catch(() => {});
        }
      }
    },
    [myUserId, createPeer, removePeer],
  );

  const { send } = usePartyRoom(
    campaignId && myUserId ? { kind: "combat", campaignId } : null,
    handleMessage,
  );

  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const join = useCallback(async () => {
    if (inCallRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localStreamRef.current = stream;
    inCallRef.current = true;
    setInCall(true);
    send({ type: "voice-join" });
  }, [send]);

  const leaveCall = useCallback(() => {
    if (!inCallRef.current) return;
    inCallRef.current = false;
    setInCall(false);
    send({ type: "voice-leave" });
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    setParticipants(new Map());
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setMuted(false);
  }, [send]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((track) => {
        track.enabled = !next;
      });
      return next;
    });
  }, []);

  // Esce dalla chiamata se il componente viene smontato (es. si cambia pagina) senza aver
  // premuto "Esci" — altrimenti il microfono resterebbe attivo in background.
  useEffect(() => {
    return () => {
      if (inCallRef.current) leaveCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { inCall, muted, participants, join, leave: leaveCall, toggleMute };
}
