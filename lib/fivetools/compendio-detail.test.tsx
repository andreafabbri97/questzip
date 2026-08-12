import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TestoStrutturato } from "./compendio-detail";

// compendio-detail.tsx importa staticamente @/app/actions/compendio-ita, che trascina next-auth
// e rompe la risoluzione moduli sotto Vitest/jsdom — va sempre mockato anche solo per rompere la
// catena di import, stesso principio già in uso in weapons-spells.test.tsx/inventory-equipment.test.tsx
// (vedi questzip-test-suite.md in memoria).
vi.mock("@/app/actions/compendio-ita", () => ({
  getClassiIta: vi.fn().mockResolvedValue([]),
  getIncantesimiIta: vi.fn().mockResolvedValue([]),
  getMostriIta: vi.fn().mockResolvedValue([]),
  getOggettiIta: vi.fn().mockResolvedValue([]),
  getRazzeIta: vi.fn().mockResolvedValue([]),
  getTalentiIta: vi.fn().mockResolvedValue([]),
  getTraduzioniIa: vi.fn().mockResolvedValue({}),
}));

// Regressione (11/08/2026): il testo lungo del Compendio (regole trascritte a mano, oggetti
// magici OCR, talenti) veniva mostrato come un unico blocco whitespace-pre-wrap — "sembra copia
// incolla su un blocco note" (feedback esplicito dell'utente, esteso poi a "tutto il compendio
// dove puoi"). TestoStrutturato inferisce paragrafi/tabelle/elenchi/sottotitoli da pattern
// semplici già presenti nel testo, senza richiedere markup salvato nel DB.
describe("TestoStrutturato", () => {
  it("blocchi separati da riga vuota diventano paragrafi distinti", () => {
    render(<TestoStrutturato testo={"Primo paragrafo.\n\nSecondo paragrafo."} />);
    const paragraphs = screen.getAllByText(/paragrafo/);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].tagName).toBe("P");
    expect(paragraphs[1].tagName).toBe("P");
  });

  it("un blocco che inizia con 'Tabella' diventa una card con etichetta in grassetto", () => {
    render(
      <TestoStrutturato
        testo={"Tabella — Prove di Caratteristica:\nForza — Atletica\nDestrezza — Furtività"}
      />,
    );
    expect(screen.getByText("Prove di Caratteristica")).toBeInTheDocument();
    const forza = screen.getByText("Forza");
    expect(forza.tagName).toBe("SPAN");
    expect(forza.className).toContain("font-bold");
    expect(screen.getByText(/Atletica/)).toBeInTheDocument();
  });

  it("righe che iniziano con '- ' diventano un elenco puntato vero", () => {
    render(<TestoStrutturato testo={"- Prima voce\n- Seconda voce\n- Terza voce"} />);
    const list = screen.getByRole("list");
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(list.tagName).toBe("UL");
    expect(items[0]).toHaveTextContent("Prima voce");
  });

  it("un elenco con un SOLO punto elenco diventa comunque una lista vera, non testo con '- ' visibile", () => {
    // Regressione trovata verificando dal vivo il talento "Allerta" (un solo beneficio): la
    // condizione richiedeva più di un punto elenco per riconoscere il blocco come lista, quindi un
    // blocco con un unico "- " restava un paragrafo semplice con il trattino visibile alla lettera.
    render(
      <TestoStrutturato
        testo={"Frase introduttiva.\n\n- Unico beneficio del talento, in una singola frase."}
      />,
    );
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Unico beneficio del talento");
    expect(screen.queryByText(/^- Unico beneficio/)).not.toBeInTheDocument();
  });

  it("una riga singola e corta senza punteggiatura finale diventa un sottotitolo", () => {
    render(<TestoStrutturato testo={"Il Ruolo dei Dadi"} />);
    const heading = screen.getByText("Il Ruolo dei Dadi");
    expect(heading.tagName).toBe("H4");
  });

  it("un paragrafo lungo che termina con punteggiatura resta un paragrafo semplice", () => {
    render(<TestoStrutturato testo={"Questa è una frase completa che finisce con un punto."} />);
    const p = screen.getByText(/Questa è una frase completa/);
    expect(p.tagName).toBe("P");
  });

  it("contenuto OCR senza righe vuote (una sola pagina) resta un blocco unico, nessuna regressione", () => {
    const testoOcr = "PASSO DI VIAGGIO — Veloce: 120 m/minuto\nTERRENO DIFFICILE — costa il doppio";
    render(<TestoStrutturato testo={testoOcr} />);
    expect(screen.getByText(/PASSO DI VIAGGIO/)).toBeInTheDocument();
  });
});
