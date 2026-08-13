// Punteggio di rilevanza per un nome rispetto a una query di ricerca (0 = migliore). Senza questo,
// un nome comune come "Dagger"/"Pugnale" resta sempre fuori da un elenco di risultati con un tetto
// fisso quando esistono decine di varianti più lunghe che lo contengono come sottostringa (es.
// "Dagger of Venom", "Bracer of Flying Daggers") — bug reale segnalato dall'utente per la ricerca
// armi nella scheda Personaggio (components/personaggi/autocomplete.tsx), stesso principio riusato
// qui per le menzioni "#Nome" in chat e l'assistente IA regole (lib/fivetools/mention-search.ts),
// che avevano lo stesso identico taglio ai primi N risultati senza alcun ordinamento.
export function matchScore(name: string, needle: string): number {
  const lower = name.toLowerCase();
  if (lower === needle) return 0;
  if (lower.startsWith(needle)) return 1;
  return 2;
}
