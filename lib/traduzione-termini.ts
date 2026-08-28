/**
 * Correzioni di terminologia D&D applicate al testo che torna dalla traduzione automatica.
 *
 * Il glossario di translate.ts agisce solo quando il testo INTERO è il termine (i nomi delle
 * classi): dentro una descrizione lunga non può fare niente, e lì Google Translate rende
 * "familiar" con "famigliare" invece di "famiglio" — segnalato dall'utente leggendo il Compendio.
 *
 * La sostituzione è deliberatamente prudente: "famigliare" è anche un aggettivo italiano legittimo
 * ("un volto famigliare"), e in quel ruolo SEGUE il sostantivo. Si corregge quindi solo quando la
 * parola è preceduta da un determinante — cioè quando è lei stessa il sostantivo, e in D&D quel
 * sostantivo è il famiglio.
 */
const DETERMINANTI_SINGOLARI =
  "il|lo|un|uno|del|dello|al|allo|dal|dallo|nel|nello|sul|sullo|col|suo|tuo|mio|proprio|questo|quel|quello|ogni";
const DETERMINANTI_PLURALI =
  "i|gli|dei|degli|ai|agli|dai|dagli|nei|negli|sui|sugli|suoi|tuoi|miei|propri|questi|quei|quegli";

const CORREZIONI: [RegExp, string][] = [
  [new RegExp(String.raw`\b(${DETERMINANTI_SINGOLARI})\s+famigliare\b`, "gi"), "$1 famiglio"],
  [new RegExp(String.raw`\b(${DETERMINANTI_PLURALI})\s+famigliari\b`, "gi"), "$1 famigli"],
];

export function correggiTerminiDnd(testo: string): string {
  let risultato = testo;
  for (const [pattern, sostituzione] of CORREZIONI) risultato = risultato.replace(pattern, sostituzione);
  return risultato;
}
