"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { askRulesAssistant } from "@/app/actions/ai-assistant";
import { AiUsageHint } from "@/components/ai-usage-hint";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { useVisualViewportHeight } from "@/lib/use-visual-viewport-height";

interface Exchange {
  id: string;
  question: string;
  answer: string | null;
  error: string | null;
}

// Quanti scambi precedenti passiamo all'IA come contesto — deve combaciare con MAX_HISTORY in
// app/actions/ai-assistant.ts (non importato da lì apposta: quel file è "use server", questo file
// è "use client", e il numero serve solo per il testo mostrato qui, non per la logica vera).
const REMEMBERED_EXCHANGES = 3;

/** Domanda veloce sulle regole D&D 5e durante la sessione ("quanto danno fa X", "come funziona
 * Y") — mostrate impilate come in una chat perché è più naturale da leggere di un singolo
 * riquadro che si sovrascrive ad ogni domanda. Gli ultimi REMEMBERED_EXCHANGES scambi vengono
 * passati all'IA come contesto (vedi askRulesAssistant) così una domanda di seguito tipo "e a un
 * livello più alto?" viene interpretata correttamente — oltre quella soglia, l'IA non "ricorda"
 * più gli scambi più vecchi della stessa conversazione. Aperto
 * dall'icona 🤖 in header (vedi components/nav.tsx), mostrata solo quando l'IA è configurata. La
 * cronologia resta in memoria finché non si ricarica la pagina: il componente non si smonta mai
 * alla chiusura (stesso principio di DiceModal), solo "open" ne nasconde il rendering. */
export function AiAssistantModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<Exchange[]>([]);
  const [asking, setAsking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(open);
  // vh/dvh non si aggiornano in modo affidabile all'apertura della tastiera in alcuni browser
  // in-app (Instagram/Facebook, motore Android WebView) — segnalato con screenshot: il modal
  // restava dimensionato per lo schermo intero, con un vuoto enorme sopra l'input. Quando
  // l'API è disponibile, l'altezza reale visibile (tastiera esclusa) sovrascrive la classe CSS.
  const visualViewportHeight = useVisualViewportHeight();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Scorre in fondo ad ogni nuova domanda E quando arriva la risposta (la "bolla" che sostituisce
  // i tre puntini può cambiare altezza, senza questo secondo trigger l'ultimo scambio potrebbe
  // restare tagliato a metà se la risposta è più lunga del previsto.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [history, asking]);

  if (!open) return null;

  const ask = async () => {
    const trimmed = question.trim();
    if (!trimmed || asking) return;
    const id = crypto.randomUUID();
    setHistory((prev) => [...prev, { id, question: trimmed, answer: null, error: null }]);
    setQuestion("");
    setAsking(true);
    try {
      // `history` (chiusura sullo stato PRIMA dell'aggiornamento appena sopra) sono gli scambi già
      // completati mostrati in chat — passati come contesto così una domanda di seguito tipo "e a
      // un livello più alto?" viene interpretata correttamente invece di ripartire da zero.
      const previousExchanges = history
        .filter((entry): entry is typeof entry & { answer: string } => !!entry.answer)
        .map((entry) => ({ question: entry.question, answer: entry.answer }));
      const result = await askRulesAssistant(trimmed, previousExchanges);
      setHistory((prev) =>
        prev.map((entry) =>
          entry.id !== id
            ? entry
            : result
              ? { ...entry, answer: result }
              : {
                  ...entry,
                  error: "L'assistente IA non è disponibile in questo momento. Riprova più tardi.",
                },
        ),
      );
    } catch {
      setHistory((prev) =>
        prev.map((entry) => (entry.id === id ? { ...entry, error: "Qualcosa è andato storto." } : entry)),
      );
    } finally {
      setAsking(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto bg-black/60 backdrop-blur-sm p-4 pt-16 sm:pt-4 animate-overlay-in"
      onClick={onClose}
    >
      <div
        className="card-elevated flex h-[min(34rem,82dvh)] w-full max-w-lg flex-col rounded-xl border border-edge bg-surface overflow-hidden animate-modal-in"
        style={
          // Sovrascrive la classe h-[...dvh] con l'altezza REALE misurata da visualViewport
          // (tastiera esclusa) quando l'API è disponibile — 96px è il margine verticale del
          // wrapper esterno (pt-16 + p-4 su mobile), 34rem resta il tetto massimo desktop.
          visualViewportHeight != null
            ? { height: `min(34rem, ${Math.max(320, visualViewportHeight - 96)}px)` }
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5 shrink-0">
          <span className="text-xs font-bold uppercase tracking-widest text-muted">
            🤖 Assistente regole
          </span>
          <button
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded-full border border-edge text-lg leading-none text-muted hover:text-foreground"
            aria-label="Chiudi"
          >
            ×
          </button>
        </div>

        {/* "justify-end" NON va messo sul contenitore che scorre: quando il contenuto supera
            l'altezza, la parte in eccesso finisce SOPRA il bordo superiore e diventa
            irraggiungibile — non esiste scroll negativo. Su telefono, dove lo spazio è poco, una
            risposta lunga risultava quindi tagliata e impossibile da leggere per intero
            (segnalato dall'utente). L'ancoraggio in basso quando i messaggi sono pochi si ottiene
            invece con un wrapper interno "min-h-full + justify-end": se il contenuto è corto resta
            attaccato al composer, se è lungo il wrapper cresce e si scorre normalmente.
            min-h-0 serve perché un figlio flex possa davvero andare in overflow (stesso motivo per
            cui c'è in message-list.tsx). */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="flex min-h-full flex-col justify-end gap-4">
          {history.length === 0 && (
            <p className="py-6 text-center text-sm text-muted">
              Fai una domanda sulle regole di D&amp;D 5e — es. &quot;Quanto danno fa Palla di Fuoco al
              5° livello?&quot;
            </p>
          )}
          {history.map((entry, index) => (
            <div
              key={entry.id}
              className={`space-y-1.5 ${index === history.length - 1 ? "animate-message-in" : ""}`}
            >
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-tr-md border border-accent/30 bg-accent/15 px-3 py-2 text-sm text-foreground">
                  {entry.question}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-sm">
                  🤖
                </span>
                {entry.answer ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-md border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground">
                    {entry.answer}
                  </p>
                ) : entry.error ? (
                  <p className="max-w-[85%] rounded-2xl rounded-tl-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                    {entry.error}
                  </p>
                ) : (
                  // Indicatore "sta scrivendo…" in stile messaggistica — tre puntini che
                  // rimbalzano in sequenza (stesso ritardo scaglionato usato ovunque per questo
                  // effetto), molto più chiaro di un bottone che dice solo "Chiedo…".
                  <span className="flex items-center gap-1 rounded-2xl rounded-tl-md border border-edge bg-surface-raised px-3 py-2.5">
                    <span className="size-1.5 rounded-full bg-muted animate-bounce [animation-delay:-0.3s]" />
                    <span className="size-1.5 rounded-full bg-muted animate-bounce [animation-delay:-0.15s]" />
                    <span className="size-1.5 rounded-full bg-muted animate-bounce" />
                  </span>
                )}
              </div>
            </div>
          ))}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-edge p-3 space-y-1.5 shrink-0">
          <div className="flex items-end gap-2">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  ask();
                }
              }}
              placeholder="Fai una domanda sulle regole…"
              rows={1}
              autoFocus
              className="input-focus flex-1 min-h-9 max-h-24 resize-none rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground"
            />
            <button
              onClick={ask}
              disabled={asking || !question.trim()}
              aria-label="Chiedi"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-background transition-colors hover:bg-accent-strong disabled:opacity-40"
            >
              <span className="text-lg leading-none">↑</span>
            </button>
          </div>
          <p className="text-center text-[10px] text-muted">
            Risposte generate da un&apos;IA — verifica sempre le regole ufficiali in caso di dubbio.
            Ricorda gli ultimi {REMEMBERED_EXCHANGES} scambi di questa conversazione, non l&apos;intera cronologia.
          </p>
          <AiUsageHint className="text-center" refreshKey={`${history.length}:${asking}`} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
