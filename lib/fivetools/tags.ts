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

// I tag possono stare uno dentro l'altro: il privilegio "Dedicated Weapon" del monaco comincia
// con "{@i 2nd-level monk {@variantrule optional class features|tce|optional feature}}". Una
// singola passata non basta — e soprattutto non basta una regex che accetti qualsiasi cosa fino
// alla prima graffa di chiusura, perche' si mangerebbe il tag esterno insieme a quello interno
// restituendo l'ultimo segmento dopo le pipe ("optional feature") e lasciando una graffa orfana:
// in scheda si leggeva "funzionalita' opzionale}" (segnalato dall'utente).
//
// Con [^{}] la regex riconosce solo il tag PIU' INTERNO, quello senza altri tag dentro; risolto
// quello, il giro successivo vede il padre ormai semplice. Tre passate coprono qualsiasi
// annidamento reale di 5etools; il ciclo si ferma da se' quando non cambia piu' niente, cosi' un
// tag malformato (una graffa mai chiusa) resta com'e' invece di bloccare la pagina.
const MAX_PASSATE = 3;

export function stripTags(text: string): string {
  let risultato = text;
  for (let passata = 0; passata < MAX_PASSATE && risultato.includes("{@"); passata++) {
    const precedente = risultato;
    risultato = risultato.replace(/\{@(\w+)(?:\s+([^{}]*))?\}/g, (_, tag: string, content = "") =>
      resolveTag(tag, content.trim()),
    );
    if (risultato === precedente) break;
  }
  return risultato;
}
