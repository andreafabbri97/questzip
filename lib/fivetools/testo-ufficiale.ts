/**
 * Il testo ufficiale italiano di un oggetto è utilizzabile come descrizione?
 *
 * Gli oggetti italiani vengono da un PDF letto via OCR, e per le armi e le armature comuni la
 * riga della tabella del manuale non ha una descrizione: al suo posto finisce la lettera della
 * colonna "Tipo" — "M" per le armi da mischia, "R" per quelle a distanza. Il dettaglio mostrava
 * quella lettera sotto il titolo "Descrizione" e, peggio, nel farlo scartava i dati veri
 * dell'oggetto (dado di danno, gittata, peso, costo): verificando "Bastone Ferrato" dalla scheda
 * di un personaggio si leggeva solo "M" (segnalato dall'utente).
 *
 * Qui si distingue una descrizione da un residuo di tabella. Non serve capire la lingua: una
 * descrizione vera è una frase, un residuo è una sigla.
 */
const MINIMO_CARATTERI = 15;
const MINIMO_PAROLE = 3;

export function descrizioneUfficialeUsabile(descrizione: string | null | undefined): boolean {
  const testo = (descrizione ?? "").trim();
  if (testo.length < MINIMO_CARATTERI) return false;
  // Due parole lunghe possono superare i caratteri minimi restando un'intestazione di colonna
  // ("Armatura Media"), quindi contano anche le parole.
  return testo.split(/\s+/).filter(Boolean).length >= MINIMO_PAROLE;
}
