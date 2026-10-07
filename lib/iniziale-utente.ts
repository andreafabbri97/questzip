/**
 * Iniziale da mostrare al posto della foto per chi non ne ha una sull'account Google.
 *
 * Sta in un modulo a parte e non dentro la nav perche' quel file si porta dietro sessione,
 * realtime e database: una funzione di tre righe diventerebbe impossibile da provare da sola.
 *
 * Si prova il nome, poi l'email; se non c'e' nemmeno quella resta un segno generico, perche' il
 * cerchio deve comunque comparire: da telefono e' l'unico modo di aprire il proprio profilo.
 */
export function inizialeUtente(nome?: string | null, email?: string | null): string {
  const base = (nome ?? "").trim() || (email ?? "").trim();
  return base ? base[0].toUpperCase() : "?";
}
