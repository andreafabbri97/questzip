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

export const loadClassNames = () => loadClassData().then((data) => data.classes);
