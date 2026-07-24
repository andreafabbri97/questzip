import type { CompendiumKind } from "@/lib/fivetools/data";

export interface ParsedMentionToken {
  name: string;
  kind: CompendiumKind;
  source: string;
}

// Il testo del messaggio contiene direttamente questo token grezzo, es. "#{Fireball|incantesimi|xphb}"
// — mostrato all'utente come chip pulito "#Fireball". Il disambiguatore (tipo+fonte) è nel testo
// stesso, non in una colonna a parte: un'unica fonte di verità, zero rischio di disallineamento
// fra testo e riferimenti se in futuro il messaggio venisse mai modificato altrove.
const MENTION_TOKEN_RE = /#\{([^|}]+)\|([^|}]+)\|([^}]+)\}/g;

export function encodeMentionToken(name: string, kind: CompendiumKind, source: string): string {
  return `#{${name}|${kind}|${source}}`;
}

export function splitMessageWithMentions(testo: string): (string | ParsedMentionToken)[] {
  const parts: (string | ParsedMentionToken)[] = [];
  let lastIndex = 0;
  for (const match of testo.matchAll(MENTION_TOKEN_RE)) {
    if (match.index === undefined) continue;
    if (match.index > lastIndex) parts.push(testo.slice(lastIndex, match.index));
    parts.push({ name: match[1], kind: match[2] as CompendiumKind, source: match[3] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < testo.length) parts.push(testo.slice(lastIndex));
  return parts;
}
