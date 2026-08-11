"use client";

import { bestItalianName, useItalianSearchIndex } from "@/lib/fivetools/compendio-detail";
import {
  MENTION_CHIP_CLASS,
  splitMessageWithMentions,
  type ParsedMentionToken,
} from "@/lib/fivetools/mention-token";

export function MentionText({
  testo,
  onOpenMention,
}: {
  testo: string;
  onOpenMention: (mention: ParsedMentionToken) => void;
}) {
  const parts = splitMessageWithMentions(testo);
  return (
    <>
      {parts.map((part, index) =>
        typeof part === "string" ? (
          <span key={index}>{part}</span>
        ) : (
          <MentionChip key={index} mention={part} onOpenMention={onOpenMention} />
        ),
      )}
    </>
  );
}

// Il token salvato nel messaggio porta sempre il nome INGLESE (chiave stabile del Compendio,
// vedi lib/fivetools/mention-token.ts) — l'italiano è la lingua predefinita di tutta l'app, quindi
// qui va risolto e mostrato al posto dell'inglese quando disponibile, non accanto ad esso: a
// differenza di DualName/Autocomplete la chip ha spazio per un solo nome, niente sottotitolo.
function MentionChip({
  mention,
  onOpenMention,
}: {
  mention: ParsedMentionToken;
  onOpenMention: (mention: ParsedMentionToken) => void;
}) {
  const italianIndex = useItalianSearchIndex(mention.kind, true);
  const italiano = bestItalianName(italianIndex, mention.name, mention.source);
  return (
    <button onClick={() => onOpenMention(mention)} className={MENTION_CHIP_CLASS}>
      #{italiano ?? mention.name}
    </button>
  );
}
