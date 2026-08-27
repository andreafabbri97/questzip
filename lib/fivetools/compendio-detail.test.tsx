import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { findUfficiale, TestoStrutturato } from "./compendio-detail";

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

// Il testo ufficiale italiano è stato estratto dai manuali del 2014 (PHB/MM/DMG), ma il compendio
// elenca anche l'edizione 2024 (XPHB/XMM/XDMG). Senza l'aggancio fra edizioni sorelle, aprire una
// voce del 2024 mostrava la traduzione automatica pur avendo il testo del manuale già nel
// database — segnalato dall'utente come "le traduzioni di XPHB fanno schifo in confronto a PHB".
describe("findUfficiale: edizioni sorelle 2014/2024", () => {
  const elenco = [
    { nome: "Fiotto Acido", nomeInglese: "Acid Splash", fonteInglese: "PHB" },
    { nome: "Palla di Fuoco", nomeInglese: "Fireball", fonteInglese: "PHB" },
  ];

  it("aggancia una voce XPHB al testo ufficiale PHB con lo stesso nome inglese", () => {
    expect(findUfficiale(elenco, null, "Acid Splash", "XPHB")?.nome).toBe("Fiotto Acido");
  });

  it("preferisce comunque la corrispondenza esatta di fonte", () => {
    expect(findUfficiale(elenco, null, "Acid Splash", "PHB")?.nome).toBe("Fiotto Acido");
  });

  it("non aggancia fonti che non sono edizioni della stessa opera", () => {
    expect(findUfficiale(elenco, null, "Acid Splash", "XGE")).toBeNull();
  });

  it("non accosta voci con nome inglese diverso", () => {
    expect(findUfficiale(elenco, null, "Acid Arrow", "XPHB")).toBeNull();
  });
});

// I manuali italiani danno una scheda sola per famiglia, 5etools la espande per variante: senza il
// ripiego sulla scheda madre queste voci mostravano la traduzione automatica pur avendo già il testo
// del Manuale del DM nel database.
describe("findUfficiale: varianti agganciate alla scheda madre", () => {
  const oggetti = [
    { nome: "Cintura della Forza dei Giganti", nomeInglese: "Belt of Giant Strength", fonteInglese: "DMG" },
    { nome: "Corazza di Scaglie di Drago", nomeInglese: "Dragon Scale Mail", fonteInglese: "DMG" },
    { nome: "Pozione di Resistenza", nomeInglese: "Potion of Resistance", fonteInglese: "DMG" },
    { nome: "Pozione di Guarigione", nomeInglese: "Potion of Healing", fonteInglese: "DMG" },
    { nome: "Pergamena di Protezione", nomeInglese: "Scroll of Protection", fonteInglese: "DMG" },
    { nome: "Tappeto Volante", nomeInglese: "Carpet of Flying", fonteInglese: "DMG" },
    { nome: "Arma +1, +2 o +3", nomeInglese: "+1 Weapon", fonteInglese: "DMG" },
    { nome: "Anello di Protezione", nomeInglese: "Ring of Protection", fonteInglese: "DMG" },
  ];

  it.each([
    ["Belt of Fire Giant Strength", "Cintura della Forza dei Giganti"],
    ["Blue Dragon Scale Mail", "Corazza di Scaglie di Drago"],
    ["Potion of Fire Resistance", "Pozione di Resistenza"],
    ["Potion of Supreme Healing", "Pozione di Guarigione"],
    ["Scroll of Protection from Undead", "Pergamena di Protezione"],
    ["Carpet of Flying, 6 ft. × 9 ft.", "Tappeto Volante"],
    ["+3 Weapon", "Arma +1, +2 o +3"],
  ])("%s trova la scheda madre %s", (variante, atteso) => {
    expect(findUfficiale(oggetti, null, variante, "DMG", { varianti: true })?.nome).toBe(atteso);
  });

  it("non tocca gli incantesimi: senza l'opzione il ripiego non parte", () => {
    // "Cure Wounds" è contenuto in "Mass Cure Wounds", ma sono due incantesimi diversi
    const incantesimi = [{ nome: "Cura Ferite", nomeInglese: "Cure Wounds", fonteInglese: "PHB" }];
    expect(findUfficiale(incantesimi, null, "Mass Cure Wounds", "PHB")).toBeNull();
  });

  it("non accosta due schede diverse che condividono solo qualche parola", () => {
    // "Ring of Spell Turning" ha in comune "Ring of" con "Ring of Protection", ma non tutte le
    // parole: la sottosequenza non torna e la voce resta senza testo ufficiale, com'è giusto
    expect(findUfficiale(oggetti, null, "Ring of Spell Turning", "DMG", { varianti: true })).toBeNull();
  });

  it("non aggancia nulla a un nome di una sola parola", () => {
    const corte = [{ nome: "Onda", nomeInglese: "Wave", fonteInglese: "DMG" }];
    expect(findUfficiale(corte, null, "Wave of Fire", "DMG", { varianti: true })).toBeNull();
  });
});
