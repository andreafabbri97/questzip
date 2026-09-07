"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loadBooks, type BookMeta } from "@/lib/fivetools/books";
import { COMPENDIO_LOADERS, COMPENDIO_TABS } from "@/lib/compendio-categorie";
import { EntryDetail, type Entry } from "@/lib/fivetools/compendio-detail";
import { leggiVoceDaUrl, percorsoVoce } from "@/lib/compendio-link";

/**
 * Una voce del Compendio aperta da un link condiviso — l'UNICA pagina dell'app visibile senza
 * account: un link mandato su WhatsApp deve aprirsi anche a chi QuestZip non ce l'ha, mentre da
 * qualunque altra parte si vada l'app continua a chiedere di accedere.
 *
 * La scheda è quella VERA, lo stesso componente del Compendio: chi riceve il link deve vedere
 * quello che vedrebbe chi gliel'ha mandato, non un riassunto. Quello che manca a chi non ha un
 * account è il testo tratto dai manuali italiani, che sta dietro letture di elenco riservate: le
 * schede restano complete, in italiano dove la traduzione della singola voce c'è.
 *
 * Intorno non c'è nient'altro: niente elenco, niente ricerca, nessuna navigazione fra le voci. È
 * una finestra su una scheda, non una porta aperta sul resto.
 */
export default function VoceCondivisaPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted">Caricamento…</p>}>
      <VoceCondivisaInner />
    </Suspense>
  );
}

function VoceCondivisaInner() {
  const searchParams = useSearchParams();
  const [voce] = useState(() => leggiVoceDaUrl(searchParams.toString()));
  const tab = COMPENDIO_TABS.find((t) => t.id === voce?.tab) ?? null;

  // undefined = sto ancora cercando, null = non c'è nulla da cercare o non l'ho trovata.
  const [entry, setEntry] = useState<Entry | null | undefined>(voce && tab ? undefined : null);
  const [books, setBooks] = useState<Map<string, BookMeta> | null>(null);

  useEffect(() => {
    loadBooks().then(setBooks).catch(() => {});
  }, []);

  useEffect(() => {
    if (!voce || !tab) return;
    let annullato = false;
    // I dati del manuale li scarica il browser di chi guarda, dal mirror pubblico di 5e.tools:
    // come già fa il Compendio, il nostro server non fa da tramite.
    COMPENDIO_LOADERS[tab.kind]().then((dati) => {
      if (annullato) return;
      setEntry(
        dati.find((e) => e.name === voce.nome && (!voce.fonte || e.source === voce.fonte)) ?? null,
      );
    });
    return () => {
      annullato = true;
    };
  }, [voce, tab]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/icon.svg" alt="" width={26} height={26} />
          <span className="font-display text-lg font-bold text-accent-strong">QuestZip</span>
        </Link>
        <Link
          href={voce ? percorsoVoce(voce) : "/compendio"}
          className="glow-accent shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-background"
        >
          Apri nel Compendio
        </Link>
      </header>

      {entry === undefined && <p className="text-sm text-muted">Caricamento della scheda…</p>}

      {entry === null && (
        <div className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-2">
          <p className="text-sm font-bold text-foreground">Questa scheda non è stata trovata.</p>
          <p className="text-sm text-muted">Il link potrebbe essere incompleto o non più valido.</p>
        </div>
      )}

      {entry && tab && (
        <EntryDetail
          kind={tab.kind}
          entry={entry}
          books={books}
          language="it"
          // Non c'è un elenco a cui tornare: questa pagina mostra una scheda e basta.
          onBack={() => {}}
        />
      )}

      <p className="text-center text-xs text-muted">
        QuestZip è un gestore di campagne D&amp;D.{" "}
        <Link href="/" className="font-bold text-accent-strong hover:underline">
          Scopri di più
        </Link>
        .
      </p>
    </div>
  );
}
