"use client";

import { useEffect, useState } from "react";
import { MentionModal } from "@/components/chat/mention-modal";
import { findCompendioMatch } from "@/lib/fivetools/mention-search";
import type { CompendiumKind } from "@/lib/fivetools/data";
import type { ParsedMentionToken } from "@/lib/fivetools/mention-token";

/**
 * Bottone "📖 Verifica" per un campo libero della scheda (talento/incantesimo/oggetto): cerca il
 * nome digitato nel Compendio (inglese o italiano, ufficiale o auto-tradotto dall'IA) e, se lo
 * trova, apre lo stesso modal di dettaglio già usato per le menzioni "#Nome" in chat. Se non lo
 * trova non mostra nulla — il campo resta testo libero, nessun errore per il giocatore.
 */
export function CompendioInfoButton({
  kind,
  nome,
  label = "📖 Verifica",
}: {
  kind: CompendiumKind;
  nome: string;
  label?: string;
}) {
  const [match, setMatch] = useState<{ name: string; source: string } | null>(null);
  const [mention, setMention] = useState<ParsedMentionToken | null>(null);

  const trimmed = nome.trim();
  // Chiave che identifica "cosa stiamo cercando" — quando cambia, azzera il match durante il
  // render (non dentro l'effetto sotto, che farebbe scattare un giro di render in più) prima di
  // avviare la nuova ricerca, così un vecchio match non resta visibile mentre il nome cambia.
  const key = trimmed ? `${kind}:${trimmed}` : null;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  if (key !== loadedKey) {
    setLoadedKey(key);
    setMatch(null);
  }

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    findCompendioMatch(kind, trimmed).then((found) => {
      if (!cancelled) setMatch(found);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, trimmed, key]);

  if (!match) return null;

  return (
    <>
      <button
        onClick={() => setMention({ name: match.name, kind, source: match.source })}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {label}
      </button>
      <MentionModal mention={mention} onClose={() => setMention(null)} />
    </>
  );
}
