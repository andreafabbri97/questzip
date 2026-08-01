import Link from "next/link";

const sections = [
  {
    href: "/campagne",
    icon: "🗺️",
    title: "Campagne",
    description:
      "Crea le tue campagne, tieni il diario delle sessioni e la lista dei giocatori.",
    ready: true,
  },
  {
    href: "/personaggi",
    icon: "🛡️",
    title: "Personaggi",
    description:
      "Schede personaggio con caratteristiche, modificatori automatici e punti ferita.",
    ready: true,
  },
  {
    href: "/compendio",
    icon: "📖",
    title: "Compendio",
    description:
      "Incantesimi, mostri, oggetti magici, razze, talenti, classi e regole — anche in italiano ufficiale.",
    ready: true,
  },
  {
    href: "/guida",
    icon: "❓",
    title: "Guida e FAQ",
    description:
      "Come usare QuestZip: primi passi, gestire una sessione dal vivo passo passo, domande frequenti.",
    ready: true,
  },
];

export default function Home() {
  return (
    // Da lg in su il blocco si centra verticalmente nello spazio sotto l'header invece di
    // restare ancorato in cima — su un monitor 2K/4K un contenuto così corto (titolo, 3 card,
    // un paragrafo) lasciava un vuoto enorme sotto, sembrava dimenticato in un angolo invece che
    // pensato per lo schermo. min-h invece di h fissa: su mobile/tablet (sotto lg) resta il
    // flusso normale dall'alto, qui il contenuto è già abbastanza per riempire lo schermo.
    <div className="lg:flex lg:min-h-[calc(100dvh-10rem)] lg:flex-col lg:justify-center">
      {/* Stessa scala di larghezza di Campagne/Chat/Personaggi (non quella più stretta usata la
          prima volta): i margini laterali devono essere coerenti con le altre pagine, non un
          compromesso a sé per "restare leggibile" — qui c'erano margini doppi rispetto al resto
          dell'app. */}
      <div className="space-y-10 max-w-2xl lg:max-w-5xl 2xl:max-w-6xl [@media(min-width:2200px)]:max-w-[1600px] mx-auto w-full">
        <section className="text-center pt-8 sm:pt-14 lg:pt-0 space-y-4">
          <h1 className="heading-ornate text-4xl sm:text-5xl 2xl:text-6xl font-bold text-accent-strong">
            QuestZip
          </h1>
          <p className="text-muted max-w-xl 2xl:max-w-2xl mx-auto text-balance 2xl:text-lg">
            Il compagno di viaggio per le tue campagne di D&amp;D 5e. Per master
            e giocatori, dal telefono o dal PC, anche al tavolo.
          </p>
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {sections.map((section) =>
            section.ready ? (
              <Link
                key={section.title}
                href={section.href}
                className="group card-elevated card-elevated-hover rounded-xl border border-edge bg-surface p-5 lg:p-7 transition-colors hover:border-accent/50 hover:bg-surface-raised"
              >
                <div className="text-3xl lg:text-4xl mb-3 transition-transform group-hover:scale-110">
                  {section.icon}
                </div>
                <h2 className="text-lg lg:text-xl font-bold text-foreground group-hover:text-accent-strong transition-colors">
                  {section.title}
                </h2>
                <p className="text-sm lg:text-base text-muted mt-1">{section.description}</p>
              </Link>
            ) : (
              <div
                key={section.title}
                className="rounded-xl border border-dashed border-edge bg-surface/50 p-5 lg:p-7 opacity-70"
              >
                <div className="text-3xl lg:text-4xl mb-3 grayscale">{section.icon}</div>
                <h2 className="text-lg lg:text-xl font-bold text-muted">
                  {section.title}
                  <span className="ml-2 align-middle text-[10px] uppercase tracking-widest border border-edge rounded-full px-2 py-0.5">
                    presto
                  </span>
                </h2>
                <p className="text-sm lg:text-base text-muted mt-1">{section.description}</p>
              </div>
            ),
          )}
        </section>

        <p className="text-center text-xs lg:text-sm text-muted">
          Le Campagne sono condivise in tempo reale fra master e giocatori. I Personaggi hanno un
          bottone &quot;Salva&quot; esplicito (avvisa se stai per uscire con modifiche non salvate,
          come un documento) e sono sincronizzati anche sul tuo account: li ritrovi da qualsiasi
          dispositivo, anche se cambi telefono o svuoti il browser — porti tu lo scatto in una
          campagna condivisa quando vuoi. Il tiro dadi 🎲 è sempre nella barra di navigazione: si
          apre senza uscire dalla pagina.
        </p>
      </div>
    </div>
  );
}
