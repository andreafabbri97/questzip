import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { newCharacter, spellAttackBonus, weaponAbilityModifier, weaponAttackBonus, type Character } from "@/lib/dnd";
import { SpellListSection, WeaponsSection } from "./weapons-spells";
import type { DiceRollerPreset } from "@/components/dice-roller-modal";

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
// bottoni dado dell'elenco incantesimi. Sostituiti con stub minimi controllati.
vi.mock("@/components/personaggi/autocomplete", () => ({
  Autocomplete: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  }) => <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />,
}));

vi.mock("@/components/personaggi/compendio-info-button", () => ({
  CompendioInfoButton: () => null,
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

  it("🎲 Danno usa il dado danno dell'arma e il mod. di caratteristica (non il bonus di competenza)", async () => {
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

    const expectedMod = weaponAbilityModifier("forza", character.caratteristiche);
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

  it("🎲 Attacco usa il bonus d'attacco da incantatore della classe primaria", async () => {
    const user = userEvent.setup();
    const character = baseCharacter({
      classi: [{ nome: "Mago", livello: 5 }],
      incantesimi: [
        { id: "s1", nome: "Dardo Incantato", livello: 1, preparato: true, dadoDanno: "1d4" },
      ],
    });
    render(<SpellListSection character={character} onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Tira per colpire con Dardo Incantato" }));

    const expectedBonus = spellAttackBonus(5, character.caratteristiche.intelligenza);
    expect(screen.getByTestId("dice-label")).toHaveTextContent("Dardo Incantato — Attacco");
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
    expect(screen.getByRole("button", { name: "Tira per colpire con Luce" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tira danno con Luce" })).not.toBeInTheDocument();
  });
});
