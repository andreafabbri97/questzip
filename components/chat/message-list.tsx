"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { MentionText } from "@/components/chat/mention-text";
import type { ParsedMentionToken } from "@/lib/fivetools/mention-token";

export interface ChatMessageData {
  id: string;
  authorId: string;
  testo: string;
  replyToId: string | null;
  replyToAuthorId: string | null;
  replyToTesto: string | null;
  createdAt: Date | string;
  // Solo per bolle ottimistiche non ancora confermate dal server (vedi campaign-chat.tsx/
  // direct-chat.tsx) — mai presente su un messaggio caricato dal server o arrivato via realtime.
  status?: "sending" | "failed";
}

interface ChatAuthor {
  name: string | null;
  image: string | null;
}

// Stessa identica dimensione/stile dell'avatar nel selettore conversazioni (app/chat/page.tsx) —
// segnalato esplicitamente come "perfetto" lì, uniformato qui invece di avere due trattamenti
// diversi per la stessa immagine.
function Avatar({ src }: { src: string | null }) {
  if (!src) return <span className="size-9 shrink-0 rounded-full bg-surface-raised" />;
  return (
    <Image
      src={src}
      alt=""
      width={36}
      height={36}
      className="size-9 shrink-0 rounded-full object-cover"
    />
  );
}

function sameDay(a: Date | string, b: Date | string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatDateSeparator(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  if (sameDay(d, now)) return "Oggi";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, yesterday)) return "Ieri";
  return d.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/** Feed messaggi condiviso fra chat di campagna e DM — non sa nulla di come i messaggi vengono
 * caricati o trasmessi in tempo reale, solo come disegnarli. Le azioni "Rispondi"/"Elimina" sono
 * sempre visibili (non nascoste dietro :hover) apposta: su mobile non esiste hover, e questa
 * chat deve funzionare bene anche lì. Messaggi consecutivi dello stesso autore sono raggruppati
 * (avatar/nome solo sul primo del gruppo, come WhatsApp/Telegram), separati da un separatore di
 * data quando cambia il giorno. */
export function MessageList({
  messages,
  currentUserId,
  canDelete,
  resolveAuthor,
  isRead,
  onReply,
  onDelete,
  onRetry,
  onDismissFailed,
  onOpenMention,
}: {
  messages: ChatMessageData[];
  currentUserId: string;
  canDelete: (message: ChatMessageData) => boolean;
  resolveAuthor: (userId: string) => ChatAuthor;
  /** Solo per i MIEI messaggi confermati (mai per quelli altrui, WhatsApp non mostra mai le
   * spunte sui messaggi ricevuti) — vero se letto da tutti i destinatari, falso se solo
   * consegnato (salvato sul server ma nessuno l'ha ancora aperto). */
  isRead: (message: ChatMessageData) => boolean;
  onReply: (message: ChatMessageData) => void;
  onDelete: (messageId: string) => void;
  onRetry: (message: ChatMessageData) => void;
  onDismissFailed: (messageId: string) => void;
  onOpenMention: (mention: ParsedMentionToken) => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // Anima in entrata solo l'ULTIMO messaggio quando l'elenco cresce rispetto al render
  // precedente (una nuova risposta in arrivo) — non l'intera cronologia quando si apre la chat,
  // altrimenti ogni apertura farebbe "volare dentro" decine di bolle insieme. Confronto per
  // valore durante il render (mai un ref, che il React Compiler non permette di leggere lì) —
  // stesso pattern di reset-a-render già consolidato in questo progetto.
  const [prevCount, setPrevCount] = useState(messages.length);
  const grew = messages.length > prevCount;
  if (messages.length !== prevCount) {
    setPrevCount(messages.length);
  }

  return (
    // min-h-0: senza, questo figlio flex non si restringe mai sotto l'altezza del proprio
    // contenuto (default CSS min-height:auto) — con una conversazione lunga l'intero riquadro
    // chat cresceva oltre l'altezza disponibile invece di scorrere al suo interno, facendo
    // scrollare la PAGINA intera. Stesso identico bug già corretto per i modal dei dadi.
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col space-y-0.5 p-3">
      {/* Ancora i messaggi in fondo vicino al composer quando la conversazione è corta, SENZA
          "justify-content: flex-end" sul contenitore — quella proprietà rompe silenziosamente lo
          scroll con tante righe: il browser calcola scrollHeight ignorando il contenuto che
          straborda PRIMA dell'inizio del riquadro (bug noto di flexbox, non specifico di questo
          progetto), risultando in scrollHeight===clientHeight anche con decine di messaggi fuori
          vista — lo scroll sembrava "non fare nulla" perché per il browser non c'era nulla da
          scorrere. Uno spacer con margin-top:auto ottiene lo stesso ancoraggio in fondo senza
          quel bug: assorbe lo spazio vuoto quando i messaggi sono pochi, senza mai interferire col
          calcolo dell'overflow quando invece sono tanti. Segnalato dall'utente ("non funziona lo
          scroll, scrolla solo la pagina intera").
      */}
      <div className="mt-auto" />
      {messages.length === 0 && (
        <p className="text-sm text-muted text-center py-6">Nessun messaggio ancora — scrivi il primo!</p>
      )}
      {messages.map((message, index) => {
        const prev = messages[index - 1];
        const showDateSeparator = !prev || !sameDay(prev.createdAt, message.createdAt);
        const isFirstInGroup =
          showDateSeparator || !prev || prev.authorId !== message.authorId || prev.status || message.status;

        const author = resolveAuthor(message.authorId);
        const mine = message.authorId === currentUserId;
        const replyAuthor = message.replyToAuthorId ? resolveAuthor(message.replyToAuthorId) : null;

        return (
          // shrink-0: senza, questo elemento è un figlio flex del contenitore scrollabile (anche
          // lui flex-col) e per default può RESTRINGERSI sotto la propria altezza naturale per
          // stare tutto dentro lo spazio disponibile invece di farlo scorrere — con tanti
          // messaggi il riquadro li comprimeva silenziosamente pur senza errori visibili,
          // scrollHeight restava sempre uguale a clientHeight e lo scroll non serviva mai perché
          // "non c'era" overflow, non perché i messaggi ci stessero davvero tutti.
          <div key={message.id} className="shrink-0">
            {showDateSeparator && (
              <div className="flex justify-center py-2.5">
                <span className="rounded-full bg-surface-raised px-3 py-1 text-[10px] uppercase tracking-widest text-muted">
                  {formatDateSeparator(message.createdAt)}
                </span>
              </div>
            )}
            <div
              className={`flex gap-2 ${mine ? "justify-end" : ""} ${isFirstInGroup ? "mt-2.5" : "mt-0.5"} ${
                grew && index === messages.length - 1 ? "animate-message-in" : ""
              }`}
            >
              {!mine && (isFirstInGroup ? <Avatar src={author.image} /> : <span className="size-9 shrink-0" />)}
              <div className={`max-w-[80%] sm:max-w-[70%] flex flex-col ${mine ? "items-end" : "items-start"}`}>
                <div
                  className={`px-3 py-2 text-sm ${
                    mine
                      ? `bg-accent/15 border border-accent/30 rounded-2xl ${isFirstInGroup ? "rounded-tr-md" : ""}`
                      : `bg-surface-raised border border-edge rounded-2xl ${isFirstInGroup ? "rounded-tl-md" : ""}`
                  }`}
                >
                  {!mine && isFirstInGroup && (
                    <p className="text-xs font-bold text-accent-strong mb-0.5">{author.name ?? "Utente"}</p>
                  )}
                  {message.replyToTesto && (
                    <div className="mb-1.5 rounded-md border-l-2 border-accent/50 bg-surface/60 px-2 py-1 text-xs">
                      <p className="font-bold text-accent-strong">{replyAuthor?.name ?? "Utente"}</p>
                      <p className="truncate text-muted">{message.replyToTesto}</p>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-foreground">
                    <MentionText testo={message.testo} onOpenMention={onOpenMention} />
                  </p>
                </div>
                {/* Sempre visibile su OGNI messaggio (non solo l'ultimo del gruppo) — su mobile
                    non esiste hover, e "Rispondi"/"Elimina" devono restare raggiungibili anche
                    per un messaggio in mezzo a un gruppo, non solo l'ultimo. */}
                <div className="flex items-center gap-2 text-[10px] text-muted mt-0.5 px-1">
                  <span>
                    {new Date(message.createdAt).toLocaleTimeString("it-IT", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {/* Solo sui MIEI messaggi confermati — grigia "consegnato" (salvato sul
                      server), color accento "letto" (tutti i destinatari l'hanno aperto). Niente
                      distinzione fra "inviato" e "consegnato" come nella spunta singola di
                      WhatsApp: qui il salvataggio sul server È la consegna, non c'è una fase
                      intermedia osservabile. */}
                  {mine && !message.status && (
                    <span
                      className={isRead(message) ? "text-accent-strong" : "text-muted/60"}
                      title={isRead(message) ? "Letto" : "Consegnato"}
                    >
                      ✓✓
                    </span>
                  )}
                  {message.status === "sending" && <span title="Invio in corso…">🕒</span>}
                  {message.status === "failed" && (
                    <span className="text-danger" title="Messaggio non inviato">
                      ⚠ non inviato
                    </span>
                  )}
                  {/* Nascosto sui messaggi non ancora confermati (id temporaneo, non un vero
                      uuid): rispondere a uno di questi farebbe fallire l'invio lato server sul
                      cast della colonna uuid. */}
                  {!message.status && (
                    <button onClick={() => onReply(message)} className="hover:text-foreground">
                      Rispondi
                    </button>
                  )}
                  {/* "Elimina" chiama una server action con l'id del messaggio — su una bolla
                      ancora "sending"/"failed" quell'id è temporaneo (non un vero uuid), la
                      query fallirebbe con un errore Postgres grezzo invece di rimuoverla. Una
                      bolla "failed" ha invece Riprova/Rimuovi, puramente locali (il messaggio
                      non è mai arrivato al server, niente da cancellare lì). */}
                  {!message.status && canDelete(message) && (
                    <button onClick={() => onDelete(message.id)} className="hover:text-danger">
                      Elimina
                    </button>
                  )}
                  {message.status === "failed" && (
                    <>
                      <button onClick={() => onRetry(message)} className="hover:text-foreground">
                        Riprova
                      </button>
                      <button
                        onClick={() => onDismissFailed(message.id)}
                        className="hover:text-danger"
                      >
                        Rimuovi
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
