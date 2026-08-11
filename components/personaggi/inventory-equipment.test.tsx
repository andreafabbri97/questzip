import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { newCharacter, type Character } from "@/lib/dnd";
import { InventorySection } from "./inventory-equipment";

// loadInventoryItems reale farebbe una richiesta di rete vera — mockato a vuoto, non chiamato
// davvero perché Autocomplete è sostituito con lo stub sotto (stesso principio di
// weapons-spells.test.tsx).
vi.mock("@/lib/fivetools/data", () => ({
  loadInventoryItems: vi.fn().mockResolvedValue([]),
  loadFeats: vi.fn().mockResolvedValue([]),
}));

// Stub minimo che simula la scelta di un suggerimento reale (a differenza di scrivere a mano),
// per testare onSelect (usato qui per precompilare il peso). "Fulmine"/opzione fissa e diversa
// dal testo digitato, stesso principio di weapons-spells.test.tsx: un vero Autocomplete non
// restituisce mai lo stesso testo battuto come nome scelto.
vi.mock("@/components/personaggi/autocomplete", () => ({
  Autocomplete: ({
    value,
    onChange,
    onSelect,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    onSelect?: (option: { name: string; source: string; weight?: number }, nomeScelto: string) => void;
    placeholder: string;
  }) => (
    <>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      {onSelect && (
        <button
          type="button"
          onClick={() =>
            onSelect({ name: "Longsword", source: "PHB", weight: 3 }, "Spada Lunga")
          }
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

// DualName/findCompendioMatch sono usati da TalentiSection nello stesso file, non da
// InventorySection — ma essendo import a livello di modulo vanno comunque mockati per evitare la
// catena verso next-auth (stesso motivo di weapons-spells.test.tsx).
vi.mock("@/lib/fivetools/compendio-detail", () => ({
  DualName: () => null,
}));
vi.mock("@/lib/fivetools/mention-search", () => ({
  findCompendioMatch: vi.fn().mockResolvedValue(null),
}));

function baseCharacter(overrides: Partial<Character> = {}): Character {
  return {
    ...newCharacter(),
    nome: "Test",
    classi: [{ nome: "Guerriero", livello: 3 }],
    caratteristiche: {
      forza: 14,
      destrezza: 12,
      costituzione: 14,
      intelligenza: 10,
      saggezza: 10,
      carisma: 10,
    },
    ...overrides,
  };
}

describe("InventorySection", () => {
  it("scegliendo un oggetto dal Compendio precompila il peso (convertito in kg) se ancora a zero", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [character, setCharacter] = useState(
        baseCharacter({
          inventario: [{ id: "i1", nome: "", quantita: 1, note: "", peso: 0 }],
        }),
      );
      return <InventorySection character={character} onChange={setCharacter} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Scegli dal Compendio" }));

    // Il nome mostrato deve essere quello SCELTO ("Spada Lunga"), non l'inglese grezzo
    // dell'opzione ("Longsword") — stesso principio del fix generale di Autocomplete.
    expect(screen.getByDisplayValue("Spada Lunga")).toBeInTheDocument();
    // 3 libbre * 0,45 kg/libbra, arrotondato a un decimale = 1,4 kg. Match non esatto: la <label>
    // include anche lo span "kg" successivo nel testo accessibile ("Peso unitario" + "kg").
    const pesoInput = screen.getByLabelText(/Peso unitario/) as HTMLInputElement;
    expect(pesoInput.value).toBe("1.4");
  });

  it("non sovrascrive un peso già impostato a mano scegliendo un altro oggetto", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [character, setCharacter] = useState(
        baseCharacter({
          inventario: [{ id: "i1", nome: "Corda", quantita: 1, note: "", peso: 5 }],
        }),
      );
      return <InventorySection character={character} onChange={setCharacter} />;
    }
    render(<Harness />);

    await user.click(screen.getByRole("button", { name: "Scegli dal Compendio" }));

    const pesoInput = screen.getByLabelText(/Peso unitario/) as HTMLInputElement;
    expect(pesoInput.value).toBe("5");
  });
});
