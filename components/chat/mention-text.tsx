"use client";

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
          <button key={index} onClick={() => onOpenMention(part)} className={MENTION_CHIP_CLASS}>
            #{part.name}
          </button>
        ),
      )}
    </>
  );
}
