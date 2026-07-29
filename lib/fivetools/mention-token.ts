import { COMPENDIUM_KINDS, type CompendiumKind } from "@/lib/fivetools/data";

const VALID_KINDS = new Set<string>(COMPENDIUM_KINDS);

export interface ParsedMentionToken {
  name: string;
  kind: CompendiumKind;
  source: string;
}

// Stile della chip "#Nome" — condiviso fra MentionText (messaggi già inviati) e MessageComposer
// (mentre si scrive, vedi lì): un'unica costante invece di due copie della stessa stringa di
// classi, per non rischiare che finiscano per divergere silenziosamente nel tempo.
export const MENTION_CHIP_CLASS =
  "inline rounded-full border border-accent/40 bg-accent/20 px-2 font-bold text-accent-strong hover:bg-accent/30 hover:border-accent/60 transition-colors cursor-pointer";

// Il testo del messaggio contiene direttamente questo token grezzo, es. "#{Fireball|incantesimi|xphb}"
// — mostrato all'utente come chip pulito "#Fireball". Il disambiguatore (tipo+fonte) è nel testo
// stesso, non in una colonna a parte: un'unica fonte di verità, zero rischio di disallineamento
// fra testo e riferimenti se in futuro il messaggio venisse mai modificato altrove.
const MENTION_TOKEN_RE = /#\{([^|}]+)\|([^|}]+)\|([^}]+)\}/g;

export function encodeMentionToken(name: string, kind: CompendiumKind, source: string): string {
  return `#{${name}|${kind}|${source}}`;
}

// Il token può arrivare da un messaggio scritto da chiunque, non solo da una chip scelta
// dall'autocomplete — niente vieta di digitarlo a mano con un "kind" inventato. Un token con kind
// non valido viene mostrato come testo semplice (il "#{...}" grezzo) invece che come chip
// cliccabile: senza questo controllo, cliccarla avrebbe fatto crashare MentionModal (kind
// sconosciuto in MENTION_KIND_LOADERS, nessun error boundary a contenere il danno).
export function splitMessageWithMentions(testo: string): (string | ParsedMentionToken)[] {
  const parts: (string | ParsedMentionToken)[] = [];
  let lastIndex = 0;
  for (const match of testo.matchAll(MENTION_TOKEN_RE)) {
    if (match.index === undefined) continue;
    if (!VALID_KINDS.has(match[2])) continue;
    if (match.index > lastIndex) parts.push(testo.slice(lastIndex, match.index));
    parts.push({ name: match[1], kind: match[2] as CompendiumKind, source: match[3] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < testo.length) parts.push(testo.slice(lastIndex));
  return parts;
}
