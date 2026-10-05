// Piccoli helper puri condivisi fra app/personaggi/page.tsx e i componenti estratti in questa
// cartella — centralizzati qui (invece che importati da page.tsx, che Next.js tratta come file
// speciale e non è pensato per essere importato da altri moduli) per tenere page.tsx sotto le
// 800 righe senza duplicare codice.
import type { ClassEntry } from "@/lib/dnd";
import { loadClassData } from "@/lib/fivetools/data";

export function formatClassSummary(classi: ClassEntry[]): string {
  return classi
    .filter((entry) => entry.nome.trim())
    .map((entry) => `${entry.nome} ${entry.livello}`)
    .join(" / ");
}

export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Quale scheda è aperta, secondo l'indirizzo della pagina.
 *
 * La scheda aperta era solo uno stato in memoria: ricaricando la pagina — il gesto più normale del
 * mondo, e al tavolo capita di continuo — si tornava all'elenco dei personaggi (segnalato
 * dall'utente). Scritta nell'indirizzo, invece, sopravvive al ricaricamento, funziona col tasto
 * Indietro e rende il link alla propria scheda condivisibile fra i propri dispositivi.
 */
export function idSchedaDaRicerca(search: string): string | null {
  const id = new URLSearchParams(search).get("id")?.trim();
  return id ? id : null;
}

/** L'indirizzo che corrisponde a una scheda aperta, o all'elenco se non ce n'è nessuna. */
export function indirizzoScheda(pathname: string, id: string | null): string {
  return id ? `${pathname}?id=${encodeURIComponent(id)}` : pathname;
}

export const loadClassNames = () => loadClassData().then((data) => data.classes);
