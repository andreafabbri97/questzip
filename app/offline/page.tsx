import Link from "next/link";

// Mostrata dal service worker (public/sw.js) SOLO quando una navigazione fallisce per mancanza di
// rete e non c'è nessuna versione in cache di quella pagina — tipicamente una pagina di campagna
// (chat, party, combattimento), che è dati condivisi in tempo reale e non ha senso tenere offline.
// Scheda personaggio e dadi restano usabili offline perché la loro shell è in cache e i dati veri
// vivono già in localStorage: per questo il link qui sotto punta lì, non a "riprova".
export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <p className="text-4xl">📡</p>
      <h1 className="heading-ornate text-2xl font-bold text-accent-strong">Sei offline</h1>
      <p className="max-w-md text-sm text-muted">
        Questa pagina ha bisogno di una connessione (dati di campagna condivisi con il gruppo). La
        scheda personaggio e i dadi restano usabili anche senza rete, perché i tuoi dati sono già
        salvati su questo dispositivo.
      </p>
      <Link
        href="/personaggi"
        className="glow-accent rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97]"
      >
        Vai a Personaggi
      </Link>
    </div>
  );
}
