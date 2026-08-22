import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { newCharacter, spellAttackBonus, weaponDamageModifier, weaponAttackBonus, type Character } from "@/lib/dnd";
import { ClassChoicesSection, SpellListSection, WeaponsSection } from "./weapons-spells";
import type { DiceRollerPreset } from "@/components/dice-roller-modal";
import { loadSpells } from "@/lib/fivetools/data";
import { findCompendioMatch } from "@/lib/fivetools/mention-search";

// loadSpells reale farebbe una richiesta di rete vera (dati 5etools) — troppo lento/instabile per
// un test unitario. Mockato qui invece che a vuoto come le altre funzioni dello stesso modulo
// (loadInventoryItems/loadInfusions, mai chiamate davvero perché Autocomplete è sostituito con lo
// stub sotto) perché SpellListSection la chiama direttamente, non solo tramite Autocomplete, per
// precompilare il dado danno degli incantesimi già in elenco (vedi test dedicato più sotto).
// importOriginal invece di un factory "a vuoto": CLASS_OPTIONAL_FEATURE_TYPES (usata da
// ClassChoicesSection per decidere se mostrarsi affatto, in modo sincrono) deve restare la mappa
// VERA, solo le funzioni che fanno fetch di rete vanno mockate.
vi.mock("@/lib/fivetools/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fivetools/data")>();
  return {
    ...actual,
    loadSpells: vi.fn().mockResolvedValue([]),
    loadInventoryItems: vi.fn().mockResolvedValue([]),
    loadInfusions: vi.fn().mockResolvedValue([]),
    loadOptionalFeaturesByTypes: vi.fn().mockResolvedValue([]),
  };
});

vi.mock("@/components/dice-roller-modal", () => ({
  DiceRollerModal: ({ preset }: { preset: DiceRollerPreset | null }) =>
    preset ? (
      <div data-testid="dice-modal">
        <span data-testid="dice-label">{preset.label}</span>
        <span data-testid="dice-modifier">{preset.modifier}</span>
        <span data-testid="dice-groups">{JSON.stringify(preset.groups)}</span>
      </div>
    ) : null,
}));

// Autocomplete/CompendioInfoButton fanno fetch veri (catalogo 5etools, DB per la cache IA) via
// useEffect al mount — inutili e pesanti da simulare qui, dove interessa solo il comportamento dei
// bottoni dado dell'elenco incantesimi. Sostituiti con stub minimi controllati — il bottone
// "Scegli dal Compendio" simula il click su un suggerimento reale (a differenza di scrivere a
// mano), per testare onSelect (usato per precompilare il dado danno). Il nome dell'opzione scelta
// è FISSO ("Fulmine") e VOLUTAMENTE diverso da qualunque testo digitato/preesistente nel campo —
// un vero Autocomplete si comporta esattamente così (si digita "full" e si sceglie "Fulmine",
// mai lo stesso testo battuto) — così i test possono verificare che il nome mostrato dopo il click
// sia davvero quello scelto, non quello rimasto scritto prima. Con `name: value` (versione
// precedente di questo mock, IDENTICI) un bug reale — onSelect sovrascriveva il nome aggiornato da
// onChange nello stesso click, lasciando il campo bloccato sul testo digitato — sarebbe rimasto
// invisibile a questa suite, perché digitato e scelto avrebbero sempre coinciso per costruzione.
vi.mock("@/components/personaggi/autocomplete", () => ({
  Autocomplete: ({
    value,
    onChange,
    onSelect,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSelect?: (
      option: { name: string; source: string; entries: unknown[] },
      nomeScelto: string,
    ) => void;
    placeholder: string;
  }) => (
    <>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {onSelect && (
        <button
          type="button"
          onClick={() => {
            // "Fulmine" simula il nome ITALIANO scelto dal menu (quello che l'utente vede e che
            // ora finisce nel campo, non più l'inglese) — option.name resta "Lightning Bolt"
            // (la chiave inglese vera, usata da altrove per l'abbinamento col Compendio) per
            // verificare che i consumer usino "nomeScelto" e non "option.name" per il campo.
            onChange("Fulmine");
            onSelect(
              {
                name: "Lightning Bolt",
                source: "PHB",
                entries: ["Un raggio di energia sfreccia, infligge {@damage 8d6} danni da fuoco."],
              },
              "Fulmine",
            );
          }}
        >
          Scegli dal Compendio
        </button>
      )}
    </>
  ),
}));

vi.mock("@/components/personaggi/compendio-info-button", () => ({
  CompendioInfoButton: () => null,
}));

// SimpleEntryModal (usato da LocalInfoButton, a sua volta usato da chi renderizza privilegi a
// usi limitati) importa EntriesBlock da lib/fivetools/compendio-detail, che risale fino a
// next-auth -> next/server — non risolvibile sotto Vitest/jsdom, stesso motivo dei due mock sopra.
vi.mock("@/components/personaggi/simple-entry-modal", () => ({
  SimpleEntryModal: () => null,
}));

// findCompendioMatch (usato da SpellListSection per precompilare il dado danno degli incantesimi
// già in elenco, non solo quelli appena scelti dal menu) importa le stesse server action, stessa
// catena verso next-auth. Nessun match di default: i test che non riguardano esplicitamente il
// riempimento retroattivo non devono dipendere da una ricerca vera.
vi.mock("@/lib/fivetools/mention-search", () => ({
  findCompendioMatch: vi.fn().mockResolvedValue(null),
}));

function baseCharacter(overrides: Partial<Character> = {}): Character {
  return {
    ...newCharacter(),
    nome: "Test",
    classi: [{ nome: "Guerriero", livello: 5 }],
    caratteristiche: {
      forza: 16,
      destrezza: 12,
      costituzione: 14,
      intelligenza: 16,
      saggezza: 10,
      carisma: 8,
    },
    ...overrides,
  };
}

describe("WeaponsSection", () => {
  it("🎲 Attacco apre il modal con il bonus d'attacco dell'arma", async () => {
    const user = userEvent.setup();
    const character = baseCharacter({
      armi: [
        {
          id: "w1",
          nome: "Spada lunga",
          caratteristica: "forza",
          competente: true,
          bonusExtra: 1,
          dadoDanno: "1d8",
          tipoDanno: "tagliente",
          aDistanza: false,
        },
      ],
    });
    render(<WeaponsSection character={character} onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Tira per colpire con Spada lunga" }));

    const expectedBonus = weaponAttackBonus("forza", character.caratteristiche, true, 5, 1);
    expect(screen.getByTestId("dice-label")).toHaveTextContent("Spada lunga — Attacco");
    expect(screen.getByTestId("dice-modifier")).toHaveTextContent(String(expectedBonus));
    expect(screen.getByTestId("dice-groups")).toHaveTextContent(
      JSON.stringify([{ die: 20, quantity: 1 }]),
    );
  });

  it("🎲 Danno usa dado + mod. caratteristica + bonus arma (mai il bonus di competenza)", async () => {
    const user = userEvent.setup();
    const character = baseCharacter({
      armi: [
        {
          id: "w1",
          nome: "Spada lunga",
          caratteristica: "forza",
          competente: true,
          bonusExtra: 1,
          dadoDanno: "1d8",
          tipoDanno: "tagliente",
          aDistanza: false,
        },
      ],
    });
    render(<WeaponsSection character={character} onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Tira danno con Spada lunga" }));

    // weaponDamageModifier e non weaponDamageModifier: il bonus fisso dell'arma (campo "Bonus
    // arma") vale per il tiro per colpire E per i danni — un'arma +1 in 5e dà +1 a entrambi, e
    // prima veniva sommato solo all'attacco.
    const expectedMod = weaponDamageModifier("forza", character.caratteristiche, 1);
    expect(screen.getByTestId("dice-label")).toHaveTextContent("Spada lunga — Danno");
    expect(screen.getByTestId("dice-modifier")).toHaveTextContent(String(expectedMod));
    expect(screen.getByTestId("dice-groups")).toHaveTextContent(
      JSON.stringify([{ die: 8, quantity: 1 }]),
    );
  });

  it("senza un dado danno in formato 'NdM' il bottone Danno non compare", () => {
    const character = baseCharacter({
      armi: [
        {
          id: "w1",
          nome: "Arma strana",
          caratteristica: "forza",
          competente: true,
          bonusExtra: 0,
          dadoDanno: "",
          tipoDanno: "",
          aDistanza: false,
        },
      ],
    });
    render(<WeaponsSection character={character} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: "Tira danno con Arma strana" })).not.toBeInTheDocument();
  });
});

describe("SpellListSection", () => {
  it("non renderizza nulla per un personaggio senza livelli da incantatore", () => {
    const character = baseCharacter({ classi: [{ nome: "Guerriero", livello: 5 }] });
    const { container } = render(<SpellListSection character={character} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("scegliendo un incantesimo dal Compendio precompila da sola il dado danno se vuoto", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [character, setCharacter] = useState(
        baseCharacter({
          classi: [{ nome: "Mago", livello: 5 }],
          incantesimi: [
            { id: "s1", nome: "Palla di Fuoco", livello: 3, preparato: true, dadoDanno: "" },
          ],
        }),
      );
      return <SpellListSection character={character} onChange={setCharacter} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Scegli dal Compendio" }));

    expect(screen.getByLabelText("Dado danno di Fulmine")).toHaveValue("8d6");
  });

  it("scegliere un incantesimo dal Compendio aggiorna anche il NOME, non solo il dado danno (bug reale: la seconda scrittura sincrona sovrascriveva la prima)", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [character, setCharacter] = useState(
        baseCharacter({
          classi: [{ nome: "Mago", livello: 5 }],
          // Nome digitato a mano, DIVERSO da quello che verrà scelto dal menu (come nella realtà:
          // si digita "full" e si sceglie "Fulmine", non lo stesso testo battuto).
          incantesimi: [
            { id: "s1", nome: "digitato a mano", livello: 3, preparato: true, dadoDanno: "" },
          ],
        }),
      );
      return <SpellListSection character={character} onChange={setCharacter} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Scegli dal Compendio" }));

    // Il campo nome deve mostrare "Fulmine" (scelto dal menu), non essere rimasto bloccato su
    // "digitato a mano" — e il dado danno deve comunque essersi precompilato nello stesso click.
    expect(screen.getByDisplayValue("Fulmine")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("digitato a mano")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Dado danno di Fulmine")).toHaveValue("8d6");
  });

  it("scegliere di nuovo un incantesimo dal Compendio non sovrascrive un dado danno già compilato", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [character, setCharacter] = useState(
        baseCharacter({
          classi: [{ nome: "Mago", livello: 5 }],
          incantesimi: [
            { id: "s1", nome: "Palla di Fuoco", livello: 3, preparato: true, dadoDanno: "2d10" },
          ],
        }),
      );
      return <SpellListSection character={character} onChange={setCharacter} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Scegli dal Compendio" }));

    expect(screen.getByLabelText("Dado danno di Fulmine")).toHaveValue("2d10");
  });

  it("🎲 Attacco usa il bonus d'attacco da incantatore della classe primaria", async () => {
    const user = userEvent.setup();
    const character = baseCharacter({
      classi: [{ nome: "Mago", livello: 5 }],
      incantesimi: [
        { id: "s1", nome: "Dardo Incantato", livello: 1, preparato: true, dadoDanno: "1d4" },
      ],
    });
    render(<SpellListSection character={character} onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Lancia Dardo Incantato come incantesimo" }));

    const expectedBonus = spellAttackBonus(5, character.caratteristiche.intelligenza);
    expect(screen.getByTestId("dice-label")).toHaveTextContent("Dardo Incantato — Lancia Incantesimo");
    expect(screen.getByTestId("dice-modifier")).toHaveTextContent(String(expectedBonus));
  });

  it("🎲 Danno legge il dado danno compilato a mano per quell'incantesimo", async () => {
    const user = userEvent.setup();
    const character = baseCharacter({
      classi: [{ nome: "Mago", livello: 5 }],
      incantesimi: [
        { id: "s1", nome: "Palla di Fuoco", livello: 3, preparato: true, dadoDanno: "8d6" },
      ],
    });
    render(<SpellListSection character={character} onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Tira danno con Palla di Fuoco" }));

    expect(screen.getByTestId("dice-label")).toHaveTextContent("Palla di Fuoco — Danno");
    expect(screen.getByTestId("dice-modifier")).toHaveTextContent("0");
    expect(screen.getByTestId("dice-groups")).toHaveTextContent(
      JSON.stringify([{ die: 6, quantity: 8 }]),
    );
  });

  it("senza dado danno compilato il bottone Danno non compare, ma Attacco sì", () => {
    const character = baseCharacter({
      classi: [{ nome: "Mago", livello: 5 }],
      incantesimi: [{ id: "s1", nome: "Luce", livello: 0, preparato: true, dadoDanno: "" }],
    });
    render(<SpellListSection character={character} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Lancia Luce come incantesimo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tira danno con Luce" })).not.toBeInTheDocument();
  });

  it("precompila da solo il dado danno di un incantesimo già in elenco (non scelto ora dal menu)", async () => {
    vi.mocked(findCompendioMatch).mockResolvedValueOnce({ name: "Fire Bolt", source: "PHB" });
    vi.mocked(loadSpells).mockResolvedValueOnce([
      {
        name: "Fire Bolt",
        source: "PHB",
        level: 0,
        entries: ["Infliggi {@damage 1d10} danni da fuoco."],
      },
    ] as never);

    function Harness() {
      const [character, setCharacter] = useState(
        baseCharacter({
          classi: [{ nome: "Mago", livello: 5 }],
          incantesimi: [{ id: "s1", nome: "Fire Bolt", livello: 0, preparato: true, dadoDanno: "" }],
        }),
      );
      return <SpellListSection character={character} onChange={setCharacter} />;
    }
    render(<Harness />);

    await waitFor(() =>
      expect(screen.getByLabelText("Dado danno di Fire Bolt")).toHaveValue("1d10"),
    );
  });

  it("non sovrascrive un dado danno già compilato a mano per un incantesimo esistente", async () => {
    vi.mocked(findCompendioMatch).mockResolvedValueOnce({ name: "Fire Bolt", source: "PHB" });
    vi.mocked(loadSpells).mockResolvedValueOnce([
      { name: "Fire Bolt", source: "PHB", level: 0, entries: ["{@damage 1d10} danni da fuoco."] },
    ] as never);

    const character = baseCharacter({
      classi: [{ nome: "Mago", livello: 5 }],
      incantesimi: [{ id: "s1", nome: "Fire Bolt", livello: 0, preparato: true, dadoDanno: "9d9" }],
    });
    render(<SpellListSection character={character} onChange={() => {}} />);

    // Dà tempo a un eventuale (indesiderato) riempimento automatico di scattare, poi verifica che
    // il valore scelto dal giocatore sia rimasto intatto.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByLabelText("Dado danno di Fire Bolt")).toHaveValue("9d9");
  });
});

describe("ClassChoicesSection", () => {
  it("non si mostra per una classe senza scelte opzionali mappate (es. Ladro)", () => {
    const character = baseCharacter({ classi: [{ nome: "Ladro", livello: 5 }] });
    render(<ClassChoicesSection character={character} onChange={() => {}} />);
    expect(screen.queryByText("Scelte di classe")).not.toBeInTheDocument();
  });

  it("mostra le suppliche occulte e il voto del patto per un Warlock", () => {
    const character = baseCharacter({ classi: [{ nome: "Warlock", livello: 5 }] });
    render(<ClassChoicesSection character={character} onChange={() => {}} />);
    expect(screen.getByText("Scelte di classe")).toBeInTheDocument();
    expect(screen.getByText("Suppliche occulte e Voto del Patto")).toBeInTheDocument();
  });

  it("un personaggio multiclasse Warlock/Guerriero vede entrambe le etichette insieme", () => {
    const character = baseCharacter({
      classi: [
        { nome: "Warlock", livello: 3 },
        { nome: "Guerriero", livello: 2 },
      ],
    });
    render(<ClassChoicesSection character={character} onChange={() => {}} />);
    expect(screen.getByText(/Suppliche occulte e Voto del Patto/)).toBeInTheDocument();
    expect(screen.getByText(/Stile di combattimento/)).toBeInTheDocument();
  });

  it("aggiungere una scelta chiama onChange con una nuova voce vuota in scelteClasse", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const character = baseCharacter({ classi: [{ nome: "Warlock", livello: 5 }] });
    render(<ClassChoicesSection character={character} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Aggiungi" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as Character;
    expect(next.scelteClasse).toHaveLength(1);
    expect(next.scelteClasse[0].nome).toBe("");
  });
});
