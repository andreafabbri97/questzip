"use client";

import { useEffect, useState } from "react";
import { MentionModal } from "@/components/chat/mention-modal";
import { findCompendioMatch, precaricaCandidati } from "@/lib/fivetools/mention-search";
import type { CompendiumKind } from "@/lib/fivetools/data";
import type { ParsedMentionToken } from "@/lib/fivetools/mention-token";

/**
 * Bottone "📖 Verifica" per un campo libero della scheda (talento/incantesimo/oggetto/classe…):
 * apre lo stesso modal di dettaglio già usato per le menzioni "#Nome" in chat.
 *
 * La ricerca nel Compendio parte al CLIC, non quando la scheda si apre. Prima era il contrario: il
 * bottone si mostrava solo dopo aver verificato che il nome esistesse, e per saperlo ogni
 * categoria presente in scheda scaricava il proprio catalogo intero (tutti gli incantesimi, tutti
 * gli oggetti…) più le tabelle di traduzione dal database — a ogni apertura di scheda, anche di
 * chi non avrebbe cliccato niente. Da qui i bottoni che "ci mettevano un po' a comparire", e un
 * consumo di banda e di quota dello stesso genere di quello che nell'agosto 2026 ha esaurito il
 * piano del database.
 *
 * Ora il bottone c'è da subito e il lavoro si fa solo per chi vuole davvero leggere. Se il nome non
 * è nel Compendio lo dice, invece di sparire: un nome scritto a mano o importato da un PDF resta
 * testo libero, ma almeno si capisce perché non si apre niente.
 */
export function CompendioInfoButton({
  kind,
  nome,
  label = "📖 Verifica",
}: {
  kind: CompendiumKind;
  nome: string;
  label?: string;
}) {
  const [mention, setMention] = useState<ParsedMentionToken | null>(null);
  const [stato, setStato] = useState<"pronto" | "cerco" | "assente">("pronto");

  const trimmed = nome.trim();

  // "assente" è un avviso momentaneo: dopo qualche secondo il bottone torna com'era, così un
  // errore di battitura corretto nel frattempo non lascia un messaggio vecchio sullo schermo.
  useEffect(() => {
    if (stato !== "assente") return;
    const timer = setTimeout(() => setStato("pronto"), 4000);
    return () => clearTimeout(timer);
  }, [stato]);

  if (!trimmed) return null;

  const apri = async () => {
    setStato("cerco");
    const found = await findCompendioMatch(kind, trimmed);
    if (found) {
      setMention({ name: found.name, kind, source: found.source });
      setStato("pronto");
      return;
    }
    setStato("assente");
  };

  return (
    <>
      <button
        onClick={apri}
        // Il puntatore sopra il bottone è un buon indizio che il clic arriverà: si scalda la
        // cache in anticipo, ma solo per chi mostra di volerla. Su telefono non succede nulla e
        // il clic resta comunque con il suo avviso di attesa.
        onMouseEnter={() => precaricaCandidati(kind)}
        onFocus={() => precaricaCandidati(kind)}
        disabled={stato === "cerco"}
        className="text-xs font-bold text-accent-strong hover:underline disabled:opacity-60"
      >
        {stato === "cerco" ? "Cerco…" : stato === "assente" ? "Non è nel Compendio" : label}
      </button>
      <MentionModal mention={mention} onClose={() => setMention(null)} />
    </>
  );
}
