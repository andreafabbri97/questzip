// Messaggi differenziati per causa reale — prima un solo messaggio generico copriva sia il
// permesso negato (l'utente deve andare nelle impostazioni del browser, azione diversa da
// "riprova") sia l'assenza di un microfono collegato sia un errore imprevisto. getUserMedia
// espone il motivo tramite DOMException.name — verificato contro la specifica MediaDevices.
// Funzione pura senza dipendenze, estratta a parte (non dentro session-tools.tsx) apposta: quel
// file importa server action che a loro volta richiedono DATABASE_URL, rendendolo pesante da
// testare sotto Vitest solo per una funzione che non ha nulla a che fare col DB.
export function microphoneErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : null;
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Permesso al microfono negato — consentilo dalle impostazioni del browser per questo sito e riprova.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "Nessun microfono trovato su questo dispositivo.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "Il microfono è già in uso da un'altra app — chiudila e riprova.";
  }
  return "Non riesco ad accedere al microfono — controlla i permessi del browser.";
}
