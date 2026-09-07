"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getVoceCondivisa } from "@/app/actions/compendio-pubblico";
import { COMPENDIO_LOADERS, COMPENDIO_TABS } from "@/lib/compendio-categorie";
import { descrizioneCreatura } from "@/lib/fivetools/creature-testo";
import { flattenEntries } from "@/lib/fivetools/entries";
import { leggiVoceDaUrl, percorsoVoce } from "@/lib/compendio-link";
import type { Entry } from "@/lib/fivetools/compendio-detail";
import type { RawCreature } from "@/lib/fivetools/data";

/**
 * Una voce del Compendio, aperta da un link condiviso — l'UNICA pagina dell'app visibile senza
 * account: un link mandato su WhatsApp deve aprirsi anche a chi QuestZip non ce l'ha, mentre da
 * qualunque altra parte si vada l'app continua a chiedere di accedere.
 *
 * Mostra una scheda sola, in sola lettura: niente elenco, niente ricerca, niente navigazione fra
 * le voci. Chi arriva qui vede quello che gli è stato mandato e un invito ad entrare, non una
 * porta aperta sul resto.
 *
 * I dati del manuale li scarica il browser di chi guarda, direttamente dal mirror pubblico di
 * 5e.tools, come già fa il Compendio: il nostro server e il nostro database restano fuori dal
 * giro, tranne per la singola riga di traduzione italiana.
 */
export default function VoceCondivisaPage() {
  return (
    <Suspense fallback={<p className="text-muted">Caricamento…</p>}>
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
  const [ita, setIta] = useState<{ nomeIta: string | null; descrizioneIta: string | null } | null>(
    null,
  );

  useEffect(() => {
    if (!voce || !tab) return;
    let annullato = false;
    COMPENDIO_LOADERS[tab.kind]().then((dati) => {
      if (annullato) return;
      const trovata =
        dati.find((e) => e.name === voce.nome && (!voce.fonte || e.source === voce.fonte)) ?? null;
      setEntry(trovata);
      if (trovata) {
        // Una riga sola, per chiave esatta: è il solo punto in cui questa pagina tocca il nostro
        // database (vedi app/actions/compendio-pubblico.ts).
        getVoceCondivisa(tab.kind, trovata.name, trovata.source)
          .then((riga) => {
            if (!annullato) setIta(riga);
          })
          .catch(() => {});
      }
    });
    return () => {
      annullato = true;
    };
  }, [voce, tab]);

  const nome = ita?.nomeIta ?? entry?.name ?? voce?.nome ?? "";
  const testo = ita?.descrizioneIta ?? testoDallaVoce(entry, tab?.kind);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/icon.svg" alt="" width={24} height={24} />
          <span className="font-display text-lg font-bold text-accent-strong">QuestZip</span>
        </Link>
        <Link
          href={voce ? percorsoVoce(voce) : "/compendio"}
          className="glow-accent rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-background"
        >
          Apri nel Compendio
        </Link>
      </header>

      {entry === undefined && <p className="text-sm text-muted">Caricamento della scheda…</p>}

      {entry === null && (
        <div className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-2">
          <p className="text-sm font-bold text-foreground">Questa scheda non è stata trovata.</p>
          <p className="text-sm text-muted">
            Il link potrebbe essere incompleto. Puoi cercarla nel Compendio.
          </p>
        </div>
      )}

      {entry && (
        <article className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
          <div>
            <h1 className="heading-ornate font-display text-2xl font-bold text-accent-strong">
              {nome}
            </h1>
            {/* Il nome inglese resta sempre visibile: è quello con cui si cerca sui manuali. */}
            {nome !== entry.name && <p className="text-sm text-muted">{entry.name}</p>}
            <p className="text-xs text-muted">
              {tab?.label} · {entry.source}
            </p>
          </div>

          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{testo}</p>
        </article>
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

/**
 * Testo da mostrare quando la traduzione italiana non c'è: la scheda in chiaro, ricavata dai dati
 * del manuale. Per i mostri esiste già un formatter completo (statistiche, tratti, azioni,
 * incantesimi); per tutto il resto vanno bene i paragrafi della voce.
 */
function testoDallaVoce(entry: Entry | null | undefined, kind: string | undefined): string {
  if (!entry) return "";
  if (kind === "mostri") return descrizioneCreatura(entry as RawCreature);
  const entries = (entry as { entries?: Parameters<typeof flattenEntries>[0] }).entries;
  return flattenEntries(entries).join("\n\n");
}
