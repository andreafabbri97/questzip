export { auth as proxy } from "@/auth";

export const config = {
  // sw.js è ESCLUSO apposta: i browser rifiutano di registrare un service worker servito tramite
  // redirect ("The script resource is behind a redirect, which is disallowed"), e il gate di login
  // risponde proprio con un 307. Finché la sessione è valida il cookie viaggia e il file arriva,
  // ma appena scade (o al controllo di aggiornamento periodico che il browser fa da sé) la
  // registrazione fallisce, portandosi dietro notifiche push e cache offline. È un file statico
  // pubblico, già visibile nel repo e senza alcun dato utente: tenerlo dietro l'autenticazione non
  // proteggeva nulla.
  // api/compendio/invalida è escluso perché lo chiama uno SCRIPT, che una sessione non ce l'ha (e
  // quando il database non risponde nessuno ce l'avrebbe): si protegge da sé con un segreto
  // dedicato, vedi la route.
  matcher: [
    "/((?!api/auth|api/compendio|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js).*)",
  ],
};
