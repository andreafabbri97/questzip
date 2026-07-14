/**
 * 5etools racchiude riferimenti incrociati e dati meccanici in tag tipo
 * {@spell fireball|xphb}, {@damage 8d6}, {@hit 4}. Qui li convertiamo in testo
 * semplice leggibile, senza ricreare i link ipertestuali del sito originale.
 *
 * Il testo sorgente resta in inglese (nessuna traduzione disponibile), quindi anche
 * questi frammenti meccanici restano in inglese per non mischiare le due lingue a metà
 * frase (es. "{@atk mw} {@hit 4} to hit" ha già "to hit" letterale subito dopo il tag).
 *
 * Convenzione dei tag con pipe: {@tag principale|fonte|testoVisualizzato?}.
 * Con 1-2 segmenti si mostra il primo (il nome); con 3+ l'ultimo (override esplicito).
 */
const ATK_TAGS: Record<string, string> = {
  mw: "Melee Weapon Attack:",
  rw: "Ranged Weapon Attack:",
  ms: "Melee Spell Attack:",
  rs: "Ranged Spell Attack:",
};

function resolveTag(tag: string, content: string): string {
  const parts = content.split("|");

  switch (tag) {
    case "atk":
      return ATK_TAGS[parts[0]] ?? parts[0];
    case "hit":
      return `${Number(parts[0]) >= 0 ? "+" : ""}${parts[0]}`;
    case "dc":
      return `DC ${parts[0]}`;
    case "h":
      return "Hit: ";
    case "recharge":
      return parts[0] ? `(Recharge ${parts[0]}-6)` : "(Recharge 6)";
    case "chance":
      return `${parts[0]}%`;
    // Tag dove i segmenti dopo il primo sono metadati di collegamento (capitolo, filtri di
    // ricerca...), non un testo alternativo da mostrare: qui va sempre mostrato il primo.
    case "book":
    case "filter":
    case "link":
      return parts[0];
    default:
      return parts.length >= 3 ? parts[parts.length - 1] : parts[0];
  }
}

export function stripTags(text: string): string {
  return text.replace(/\{@(\w+)(?:\s+([^}]*))?\}/g, (_, tag: string, content = "") =>
    resolveTag(tag, content.trim()),
  );
}
