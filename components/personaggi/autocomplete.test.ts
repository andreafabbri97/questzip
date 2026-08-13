import { describe, expect, it, vi } from "vitest";

// autocomplete.tsx importa staticamente lib/fivetools/compendio-detail (per useItalianSearchIndex),
// che trascina la catena next-auth non risolvibile sotto Vitest/jsdom — stesso problema documentato
// per gli altri componenti che usano Autocomplete, mockato qui solo per rompere l'import, dato che
// questo test esercita esclusivamente matchScore (una funzione pura, non il componente).
vi.mock("@/lib/fivetools/compendio-detail", () => ({
  bestItalianName: () => null,
  useItalianSearchIndex: () => ({ official: new Map(), officialAny: new Map(), ia: new Map() }),
}));

const { matchScore } = await import("./autocomplete");

describe("matchScore", () => {
  it("dà il punteggio migliore a una corrispondenza esatta", () => {
    expect(matchScore("Dagger", "dagger")).toBe(0);
  });

  it("premia 'inizia con' più di 'contiene'", () => {
    expect(matchScore("Dagger of Venom", "dagger")).toBe(1);
    expect(matchScore("Bracer of Flying Daggers", "dagger")).toBe(2);
  });

  it("il nome comune batte sempre una variante più lunga con lo stesso punteggio migliore possibile", () => {
    // Bug reale: "Dagger" (arma comune) restava fuori dagli 8 suggerimenti perché il catalogo
    // elenca prima decine di oggetti magici che contengono "dagger" come sottostringa — qui si
    // verifica solo il punteggio, l'ordinamento vero avviene nel componente sommando i punteggi
    // migliori su nome inglese/query tradotta/nome italiano e ordinando per punteggio crescente.
    const names = ["Bracer of Flying Daggers", "Dagger of Venom", "Dagger", "Dragontooth Dagger"];
    const sorted = [...names].sort((a, b) => matchScore(a, "dagger") - matchScore(b, "dagger"));
    expect(sorted[0]).toBe("Dagger");
  });

  it("è case-insensitive", () => {
    expect(matchScore("DAGGER", "dagger")).toBe(0);
  });
});
