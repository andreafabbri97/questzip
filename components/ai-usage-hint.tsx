"use client";

import { useEffect, useState } from "react";
import { getGeminiUsageToday } from "@/app/actions/gemini-usage";

/** Piccola nota informativa ("~N richieste IA usate oggi") ripetuta vicino a OGNI funzione
 * assistita dall'IA (Assistente regole, bozze, riassunto sessioni, import PDF) — richiesto
 * esplicitamente dall'utente: sapere quanto è già stato usato oggi, non solo nella pagina Guida
 * centrale. Va montata SOLO dentro un blocco già condizionato su `isAiAvailable()` (stesso
 * pattern di ogni bottone "Genera bozza" esistente): non fa il controllo da sola, per evitare una
 * seconda chiamata di rete ridondante in ogni punto in cui compare. Nessun testo finché il
 * conteggio non è arrivato — niente "0" lampeggiante ad ogni apertura.
 *
 * `refreshKey` (opzionale): cambia il valore per far ricontrollare il conteggio — serve nel modal
 * Assistente regole, che non si smonta mai tra una domanda e l'altra (vedi il commento su
 * AiAssistantModal): senza questo, il numero mostrato resterebbe quello di quando il modal è
 * stato aperto la prima volta, sempre indietro di almeno una domanda per l'intera sessione. */
export function AiUsageHint({ className = "", refreshKey }: { className?: string; refreshKey?: unknown }) {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGeminiUsageToday()
      .then((usage) => {
        if (!cancelled) setTotal(usage.total);
      })
      .catch(() => {
        if (!cancelled) setTotal(null);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (total === null) return null;

  return (
    <p className={`text-[10px] text-muted ${className}`}>
      ~{total} richiest{total === 1 ? "a" : "e"} IA usat{total === 1 ? "a" : "e"} oggi da QuestZip
      (stima nostra, non la quota ufficiale di Google).
    </p>
  );
}
