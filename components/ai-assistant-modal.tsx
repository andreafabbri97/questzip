"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { askRulesAssistant } from "@/app/actions/ai-assistant";
import { AiUsageHint } from "@/components/ai-usage-hint";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import { useVisualViewport } from "@/lib/use-visual-viewport";

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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useBodyScrollLock(open);
  // vh/dvh non si aggiornano in modo affidabile all'apertura della tastiera in alcuni browser
  // in-app (Instagram/Facebook, motore Android WebView) — segnalato con screenshot: il modal
  // restava dimensionato per lo schermo intero, con un vuoto enorme sopra l'input. Nemmeno
  // "fixed inset-0" basta, perché si riferisce al viewport di LAYOUT, che con la tastiera aperta
  // resta alto quanto tutto lo schermo: l'overlay finiva dietro la tastiera. Quando l'API è
  // disponibile, il riquadro davvero visibile sovrascrive quindi le classi CSS.
  const viewport = useVisualViewport();
  // Sotto questa altezza visibile (telefono in orizzontale con la tastiera aperta) ogni riga di
  // servizio toglie spazio alla conversazione, che è l'unica cosa per cui il modal esiste.
  const spazioRidotto = viewport != null && viewport.height < 420;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      // Trappola del focus: senza, il Tab esce dal modal e va a finire sui link della pagina
      // sotto, che è coperta dall'overlay — si naviga alla cieca su elementi che non si vedono.
      if (event.key !== "Tab" || !modalRef.current) return;
      const focusabili = modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea, input, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusabili.length === 0) return;
      const primo = focusabili[0];
      const ultimo = focusabili[focusabili.length - 1];
      const attivo = document.activeElement;
      if (event.shiftKey && (attivo === primo || !modalRef.current.contains(attivo))) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && attivo === ultimo) {
        event.preventDefault();
        primo.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // Alla chiusura il focus torna da dove era partito (l'icona 🤖 in header): senza, finisce sul
  // <body> e il Tab successivo riparte dall'inizio della pagina.
  useEffect(() => {
    if (!open) return;
    const origine = document.activeElement as HTMLElement | null;
    return () => origine?.focus?.();
  }, [open]);

  // Il campo cresce con il testo invece di scorrere dentro una riga sola: su telefono rileggere
  // una domanda lunga dentro un campo alto 36px è impraticabile. Il tetto è la classe max-h-24.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [question]);

  // Scorre in fondo ad ogni nuova domanda E quando arriva la risposta (la "bolla" che sostituisce
  // i tre puntini può cambiare altezza, senza questo secondo trigger l'ultimo scambio potrebbe
  // restare tagliato a metà se la risposta è più lunga del previsto). Si scorre il contenitore dei
  // messaggi DIRETTAMENTE, non con scrollIntoView su un elemento in fondo: quello scorre ogni
  // antenato scrollabile, overlay compreso, e su telefono faceva scivolare via l'intero modal
  // invece della sola conversazione. L'altezza del viewport è fra le dipendenze perché aprendo la
  // tastiera lo spazio si dimezza: senza, l'ultimo messaggio finirebbe fuori dall'area visibile.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" });
  }, [history, asking, viewport?.height]);

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
      // NIENTE overflow-y-auto qui: un overlay scrollabile è esattamente ciò che permetteva di
      // "trascinare via" il modal con la tastiera aperta invece di scorrere la conversazione.
      // L'overlay copre l'area visibile e basta; a scorrere è solo l'elenco dei messaggi.
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-overlay-in"
      style={
        // Ancorato al viewport VISIBILE, non a quello di layout: con la tastiera aperta "inset-0"
        // si estende dietro la tastiera (Android) oppure fuori dallo schermo (iOS, dove il
        // viewport visibile viene spostato invece che accorciato).
        viewport
          ? { top: viewport.offsetTop, height: viewport.height, bottom: "auto" }
          : undefined
      }
      onClick={onClose}
    >
      <div
        // h-full + max-h: il modal non può MAI essere più alto dell'area visibile, quindi non
        // esiste nulla da scorrere fuori. Prima un pavimento fisso di 320px lo rendeva più alto
        // dello spazio rimasto non appena si apriva la tastiera.
        className="card-elevated flex h-full max-h-[34rem] w-full max-w-lg flex-col rounded-xl border border-edge bg-surface overflow-hidden animate-modal-in"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titolo-assistente-ia"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-edge px-4 py-2.5 shrink-0">
          <span
            id="titolo-assistente-ia"
            className="text-xs font-bold uppercase tracking-widest text-muted"
          >
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
        {/* overscroll-contain: arrivati in cima o in fondo alla conversazione il gesto NON si
            propaga all'overlay o alla pagina sotto — senza, su telefono continuare a trascinare
            "tirava" tutto il modal. */}
        <div ref={scrollerRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">
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
              ref={textareaRef}
              className="input-focus flex-1 min-h-9 max-h-24 resize-none overflow-y-auto rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground"
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
          {/* Con la tastiera aperta su un telefono in orizzontale restano ~200px in tutto: fra
              intestazione, campo di scrittura e queste due righe di servizio, alla conversazione
              non resterebbe nulla. Sotto quella soglia si nascondono — riappaiono appena la
              tastiera si chiude, quindi l'avvertenza resta comunque leggibile. */}
          {!spazioRidotto && (
            <>
              <p className="text-center text-[10px] text-muted">
                Risposte generate da un&apos;IA — verifica sempre le regole ufficiali in caso di dubbio.
                Ricorda gli ultimi {REMEMBERED_EXCHANGES} scambi di questa conversazione, non l&apos;intera cronologia.
              </p>
              <AiUsageHint className="text-center" refreshKey={`${history.length}:${asking}`} />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
