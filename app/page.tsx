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
    href: "/dadi",
    icon: "🎲",
    title: "Tira dadi",
    description:
      "Tutti i dadi da d4 a d100, con modificatori, vantaggio/svantaggio e cronologia.",
    ready: true,
  },
  {
    href: "/compendio",
    icon: "📖",
    title: "Compendio",
    description:
      "Incantesimi, mostri e oggetti magici consultabili al volo, via Open5e.",
    ready: true,
  },
];

export default function Home() {
  return (
    <div className="space-y-10">
      <section className="text-center pt-8 sm:pt-14 space-y-4">
        <h1 className="text-4xl sm:text-5xl font-bold text-accent-strong">
          QuestZip
        </h1>
        <p className="text-muted max-w-xl mx-auto text-balance">
          Il compagno di viaggio per le tue campagne di D&amp;D 5e. Per master
          e giocatori, dal telefono o dal PC, anche al tavolo.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sections.map((section) =>
          section.ready ? (
            <Link
              key={section.title}
              href={section.href}
              className="group rounded-xl border border-edge bg-surface p-5 transition-colors hover:border-accent/50 hover:bg-surface-raised"
            >
              <div className="text-3xl mb-3">{section.icon}</div>
              <h2 className="text-lg font-bold text-foreground group-hover:text-accent-strong transition-colors">
                {section.title}
              </h2>
              <p className="text-sm text-muted mt-1">{section.description}</p>
            </Link>
          ) : (
            <div
              key={section.title}
              className="rounded-xl border border-dashed border-edge bg-surface/50 p-5 opacity-70"
            >
              <div className="text-3xl mb-3 grayscale">{section.icon}</div>
              <h2 className="text-lg font-bold text-muted">
                {section.title}
                <span className="ml-2 align-middle text-[10px] uppercase tracking-widest border border-edge rounded-full px-2 py-0.5">
                  presto
                </span>
              </h2>
              <p className="text-sm text-muted mt-1">{section.description}</p>
            </div>
          ),
        )}
      </section>

      <p className="text-center text-xs text-muted">
        I dati sono salvati sul tuo dispositivo. Sincronizzazione tra master e
        giocatori in arrivo nelle prossime versioni.
      </p>
    </div>
  );
}
