"use client";

import { splitMessageWithMentions, type ParsedMentionToken } from "@/lib/fivetools/mention-token";

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
          <button
            key={index}
            onClick={() => onOpenMention(part)}
            className="inline rounded bg-accent/20 px-1 font-bold text-accent-strong hover:bg-accent/30 transition-colors"
          >
            #{part.name}
          </button>
        ),
      )}
    </>
  );
}
