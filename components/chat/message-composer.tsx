"use client";

import { useEffect, useRef, useState } from "react";
import {
  MENTION_KIND_LABELS,
  searchMentionCandidates,
  type MentionCandidate,
} from "@/lib/fivetools/mention-search";
import { MENTION_CHIP_CLASS, encodeMentionToken, type ParsedMentionToken } from "@/lib/fivetools/mention-token";

// Zero-width space (non un nodo di testo vuoto) usato come ancora del cursore dopo un <br> — vedi
// insertLineBreakAtCaret più sotto per il perché. Rimosso qui in serializeEditor prima che il
// testo venga considerato quello scritto davvero dall'utente.
const CARET_ANCHOR = "​";

// Una chip menzione è un nodo NON editabile dentro il div contenteditable — il browser la tratta
// già come un'unica unità per il cursore/Backspace (comportamento nativo, nessuna gestione a
// mano necessaria), e porta con sé tipo+fonte come data-attribute, invece di doverli ritrovare
// per nome al momento dell'invio (l'ambiguità che aveva la vecchia versione a solo testo: due
// candidati con lo stesso nome visualizzato ma fonte diversa sarebbero stati indistinguibili).
function createMentionChip(candidate: { name: string; kind: MentionCandidate["kind"]; source: string }) {
  const span = document.createElement("span");
  span.contentEditable = "false";
  span.className = MENTION_CHIP_CLASS;
  span.dataset.mentionName = candidate.name;
  span.dataset.mentionKind = candidate.kind;
  span.dataset.mentionSource = candidate.source;
  span.textContent = `#${candidate.name}`;
  return span;
}

// Ricostruisce il testo grezzo del messaggio (coi token #{Nome|tipo|fonte}) leggendo i nodi
// figli dell'editor invece di tenere un secondo stato React in parallelo — un contenteditable
// "controllato" da React fa saltare il cursore ad ogni render, quindi il DOM resta l'unica fonte
// di verità e lo si legge solo quando serve (qui, e per rilevare "#query" durante la digitazione).
function serializeEditor(root: HTMLElement): string {
  let out = "";
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
    } else if (node instanceof HTMLElement && node.dataset.mentionName) {
      out += encodeMentionToken(
        node.dataset.mentionName,
        node.dataset.mentionKind as MentionCandidate["kind"],
        node.dataset.mentionSource ?? "",
      );
    } else if (node.nodeName === "BR") {
      out += "\n";
    } else {
      out += node.textContent ?? "";
    }
  }
  // Il browser converte a volte lo spazio digitato subito dopo una chip in uno spazio "non
  // divisibile" (U+00A0, per non farlo collassare secondo le regole HTML) — invisibile ma un
  // carattere diverso da uno spazio normale (verificato col test Playwright sopra). Normalizzato
  // qui, l'utente non ha mai scelto consapevolmente un carattere speciale.
  return out.replaceAll(CARET_ANCHOR, "").replaceAll(" ", " ");
}

// "#" seguito da testo senza spazi, esattamente al cursore — stessa query di prima, ma letta dal
// nodo di testo del DOM invece che da una stringa React, dato che qui il contenuto vive solo nel
// contenteditable. Il cursore non può mai trovarsi DENTRO una chip (contentEditable=false), quindi
// il testo del nodo corrente basta: una chip precedente delimita già il nodo di testo in corso.
function detectMentionQuery(
  root: HTMLElement,
): { node: Text; matchStart: number; caretOffset: number; query: string } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || range.startContainer.nodeType !== Node.TEXT_NODE) {
    return null;
  }
  const node = range.startContainer as Text;
  const before = node.data.slice(0, range.startOffset);
  const match = before.match(/#([^\s#]*)$/);
  if (!match) return null;
  return { node, matchStart: range.startOffset - match[0].length, caretOffset: range.startOffset, query: match[1] };
}

// Verificato con un test Playwright reale (emulazione mobile, Pixel 7 e iPhone 14): con un nodo
// di testo VUOTO come ancora, Chromium fa atterrare il testo digitato subito dopo PRIMA del <br>
// invece che dopo (probabile pulizia interna dei nodi di testo vuoti in un contenteditable) — un
// carattere invisibile ma non-vuoto (CARET_ANCHOR) risolve, stesso trucco usato dagli editor di
// testo ricco (Slate, Draft.js) per lo stesso identico problema.
function insertLineBreakAtCaret() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const br = document.createElement("br");
  range.insertNode(br);
  const anchor = document.createTextNode(CARET_ANCHOR);
  br.parentNode?.insertBefore(anchor, br.nextSibling);
  range.setStart(anchor, 0);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function MessageComposer({
  replyTo,
  onCancelReply,
  onSend,
  onOpenMention,
}: {
  replyTo: { author: string; testo: string } | null;
  onCancelReply: () => void;
  onSend: (testo: string) => void;
  onOpenMention: (mention: ParsedMentionToken) => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [hasContent, setHasContent] = useState(false);

  // "#" seguito da testo senza spazi, esattamente al cursore — la query di menzione attiva.
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<MentionCandidate[]>([]);

  useEffect(() => {
    // searchMentionCandidates ritorna [] subito per una query vuota (senza caricare tutte le
    // categorie) — non serve un ramo sincrono a parte per "svuota i risultati".
    let cancelled = false;
    searchMentionCandidates(mentionQuery ?? "").then((results) => {
      if (!cancelled) setMentionResults(results);
    });
    return () => {
      cancelled = true;
    };
  }, [mentionQuery]);

  const handleInput = () => {
    const root = editorRef.current;
    if (!root) return;
    setHasContent((root.textContent ?? "").trim().length > 0);
    const ctx = detectMentionQuery(root);
    setMentionQuery(ctx?.query ?? null);
  };

  // mousedown (non click) con preventDefault: un click su un bottone del menu sposterebbe il
  // focus/la selezione fuori dal contenteditable PRIMA che il nostro handler possa leggere dove
  // si trovava il cursore — prevenendo il default sul mousedown la selezione resta esattamente
  // dov'era, quindi detectMentionQuery richiamato qui sotto la trova ancora valida.
  const pickMention = (candidate: MentionCandidate) => {
    const root = editorRef.current;
    if (!root) return;
    const ctx = detectMentionQuery(root);
    if (!ctx) return;
    const before = ctx.node.data.slice(0, ctx.matchStart);
    const after = ctx.node.data.slice(ctx.caretOffset);
    const chip = createMentionChip(candidate);
    const spaceAfter = document.createTextNode(` ${after}`);
    ctx.node.data = before;
    ctx.node.parentNode?.insertBefore(chip, ctx.node.nextSibling);
    ctx.node.parentNode?.insertBefore(spaceAfter, chip.nextSibling);

    const range = document.createRange();
    range.setStart(spaceAfter, 1);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);

    root.focus();
    setMentionQuery(null);
    setMentionResults([]);
    setHasContent(true);
  };

  const handleEditorClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-mention-name]");
    if (!chip) return;
    event.preventDefault();
    onOpenMention({
      name: chip.dataset.mentionName!,
      kind: chip.dataset.mentionKind as MentionCandidate["kind"],
      source: chip.dataset.mentionSource!,
    });
  };

  // Forza l'incolla a solo testo semplice — oltre a evitare che formattazione estranea finisca
  // nel messaggio, impedisce anche che un incolla porti dentro per sbaglio (o di proposito) uno
  // span con gli stessi data-attribute di una chip: serializeEditor si fiderebbe ciecamente di
  // qualunque nodo con data-mention-name, quindi solo testo semplice in ingresso lo esclude a monte.
  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain");
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    handleInput();
  };

  const send = () => {
    const root = editorRef.current;
    if (!root) return;
    const trimmed = serializeEditor(root).trim();
    if (!trimmed) return;
    onSend(trimmed);
    root.textContent = "";
    setHasContent(false);
    setMentionQuery(null);
    setMentionResults([]);
  };

  return (
    <div className="border-t border-edge p-3 space-y-2 shrink-0 relative">
      {mentionQuery !== null && mentionResults.length > 0 && (
        <div className="absolute bottom-full left-3 right-3 mb-1 rounded-lg border border-edge bg-surface-raised shadow-lg max-h-48 overflow-y-auto">
          {mentionResults.map((candidate) => (
            <button
              key={`${candidate.kind}-${candidate.name}-${candidate.source}`}
              onMouseDown={(event) => {
                event.preventDefault();
                pickMention(candidate);
              }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface transition-colors"
            >
              <span className="text-foreground truncate">
                {candidate.nameIta && candidate.nameIta !== candidate.name
                  ? `${candidate.nameIta} (${candidate.name})`
                  : candidate.name}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-muted shrink-0">
                {MENTION_KIND_LABELS[candidate.kind]}
              </span>
            </button>
          ))}
        </div>
      )}
      {replyTo && (
        <div className="flex items-start justify-between gap-2 rounded-md border-l-2 border-accent bg-surface-raised px-2 py-1.5 text-xs">
          <div className="min-w-0">
            <p className="font-bold text-accent-strong">Rispondi a {replyTo.author}</p>
            <p className="truncate text-muted">{replyTo.testo}</p>
          </div>
          <button onClick={onCancelReply} className="text-muted hover:text-foreground shrink-0" aria-label="Annulla risposta">
            ×
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onClick={handleEditorClick}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (event.shiftKey) insertLineBreakAtCaret();
            else send();
          }}
          data-placeholder="Scrivi un messaggio… usa # per citare il Compendio"
          className={`flex-1 min-h-9 max-h-32 overflow-y-auto resize-none rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground whitespace-pre-wrap break-words focus:outline-none focus:border-accent/50 ${
            hasContent ? "" : "before:content-[attr(data-placeholder)] before:text-muted"
          }`}
        />
        <button
          onClick={send}
          disabled={!hasContent}
          aria-label="Invia"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-background transition-colors hover:bg-accent-strong disabled:opacity-40"
        >
          <span className="text-lg leading-none">↑</span>
        </button>
      </div>
    </div>
  );
}
