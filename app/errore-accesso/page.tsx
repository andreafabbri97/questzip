import Link from "next/link";

/**
 * Pagina di errore dell'accesso, al posto di quella predefinita di NextAuth.
 *
 * Quella diceva "Server error — There is a problem with the server configuration. Check the server
 * logs for more information": in inglese, e soprattutto fuorviante, perché nel caso più probabile
 * la configurazione non c'entra niente — è il database che non risponde (il 2026-08-28 il progetto
 * Neon aveva superato la quota mensile di trasferimento dati). Chi la vedeva pensava di avere
 * l'app rotta, e non aveva modo di capire che bastava aspettare.
 */
export default async function ErroreAccessoPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  // I codici di NextAuth: "Configuration" arriva anche quando l'adapter non riesce a parlare col
  // database, che è il caso di gran lunga più frequente qui.
  const banca = error === "Configuration";

  return (
    <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
      <p className="text-5xl">🐉</p>
      <h1 className="heading-ornate text-3xl font-bold text-accent-strong">Accesso non riuscito</h1>
      {banca ? (
        <>
          <p className="text-foreground">
            Al momento QuestZip non riesce a raggiungere il proprio database, quindi non può
            verificare chi sei.
          </p>
          <p className="text-sm text-muted">
            Di solito è temporaneo: capita quando il piano del database esaurisce il traffico
            mensile, e si risolve da sé al rinnovo. Le schede dei personaggi restano salvate anche
            sul dispositivo, quindi non si perde nulla.
          </p>
        </>
      ) : (
        <p className="text-foreground">
          Qualcosa è andato storto durante l&apos;accesso. Riprova fra un momento.
        </p>
      )}
      <div className="flex justify-center gap-3 pt-2">
        <Link
          href="/campagne"
          className="glow-accent rounded-lg bg-accent px-4 py-2 text-sm font-bold text-background transition-colors hover:bg-accent-strong"
        >
          Riprova
        </Link>
        <Link
          href="/personaggi"
          className="rounded-lg border border-edge px-4 py-2 text-sm font-bold text-foreground transition-colors hover:border-accent/60"
        >
          Vai ai personaggi
        </Link>
      </div>
      {error && <p className="pt-2 text-[11px] text-muted">Codice: {error}</p>}
    </div>
  );
}
