import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  applyLongRest,
  applyShortRest,
  newCharacter,
  savingThrowModifier,
  skillModifier,
  spellAttackBonus,
  spellSaveDC,
  totalLevel,
  type Character,
} from "@/lib/dnd";
import { RestSection, SavingThrowsAndSkills, SpellSlotsSection } from "./abilities-and-meta";
import type { DiceRollerPreset } from "@/components/dice-roller-modal";

// DiceRollerModal monta il vero DiceRoller (dadi 3D BabylonJS, server actions per la cronologia
// tiri) — inutilizzabile/pesante sotto jsdom. Qui interessa solo VERIFICARE CON CHE PRESET viene
// aperto (stesso principio già richiesto dall'utente per le armi), non il componente in sé.
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

// abilities-and-meta.tsx importa staticamente Autocomplete (usato da AttunedItemsSection, non dai
// componenti testati qui) che a sua volta importa le server action del Compendio — non
// caricabili sotto Vitest/jsdom (dipendono da next-auth). Mock minimo solo per rompere quella
// catena di import, nessun test qui la esercita davvero.
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

// Stesso motivo: CompendioInfoButton importa mention-search.ts, che importa a sua volta le server
// action del Compendio.
vi.mock("@/components/personaggi/compendio-info-button", () => ({
  CompendioInfoButton: () => null,
}));

// SimpleEntryModal (usato da LocalInfoButton per i privilegi a usi limitati) importa EntriesBlock
// da lib/fivetools/compendio-detail, stessa catena verso next-auth -> next/server di cui sopra.
vi.mock("@/components/personaggi/simple-entry-modal", () => ({
  SimpleEntryModal: () => null,
}));

function baseCharacter(overrides: Partial<Character> = {}): Character {
  return {
    ...newCharacter(),
    nome: "Test",
    classi: [{ nome: "Guerriero", livello: 5 }],
    caratteristiche: {
      forza: 14,
      destrezza: 16,
      costituzione: 14,
      intelligenza: 10,
      saggezza: 12,
      carisma: 8,
    },
    ...overrides,
  };
}

describe("SavingThrowsAndSkills", () => {
  it("il bottone 🎲 apre il modal dei dadi già preimpostato, come per le armi", async () => {
    const user = userEvent.setup();
    const character = baseCharacter({ trsCompetenti: ["costituzione"] });
    render(<SavingThrowsAndSkills character={character} onChange={() => {}} />);

    expect(screen.queryByTestId("dice-modal")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tira salvezza su Costituzione" }));

    const expectedMod = savingThrowModifier(14, true, totalLevel(character.classi));
    expect(screen.getByTestId("dice-label")).toHaveTextContent("Costituzione");
    expect(screen.getByTestId("dice-modifier")).toHaveTextContent(String(expectedMod));
    expect(screen.getByTestId("dice-groups")).toHaveTextContent(
      JSON.stringify([{ die: 20, quantity: 1 }]),
    );
  });

  it("il bonus extra su un tiro salvezza si somma al modificatore RAW ed è modificabile", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [character, setCharacter] = useState(
        baseCharacter({ trsCompetenti: ["costituzione"] }),
      );
      return <SavingThrowsAndSkills character={character} onChange={setCharacter} />;
    }
    render(<Harness />);

    const raw = savingThrowModifier(14, true, 5);
    // Il bottone di alternanza competenza non ha aria-label (a differenza del 🎲, che invece ce
    // l'ha ed è quindi raggiungibile per nome accessibile) — lo si individua dal testo "Costituzione".
    const button = screen.getByText("Costituzione").closest("button")!;
    expect(button).toHaveTextContent(raw >= 0 ? `+${raw}` : String(raw));

    const bonusField = screen.getByLabelText("Bonus extra al tiro salvezza su Costituzione");
    await user.clear(bonusField);
    await user.type(bonusField, "3");
    bonusField.blur();

    expect(await screen.findByText(`+${raw + 3}`)).toBeInTheDocument();
  });

  it("il bottone 🎲 di un'abilità usa il modificatore giusto (competenza inclusa)", async () => {
    const user = userEvent.setup();
    const character = baseCharacter({ abilitaCompetenti: ["Acrobazia"] });
    render(<SavingThrowsAndSkills character={character} onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: "Tira Acrobazia" }));

    const expectedMod = skillModifier(16, true, false, totalLevel(character.classi));
    expect(screen.getByTestId("dice-label")).toHaveTextContent("Acrobazia");
    expect(screen.getByTestId("dice-modifier")).toHaveTextContent(String(expectedMod));
  });
});

describe("SpellSlotsSection", () => {
  // Personaggio incantatore: baseCharacter() di default è un Guerriero (non lancia incantesimi),
  // serve una classe con caratteristica da incantatore per far comparire CD/Bonus attacco.
  function caster(overrides: Partial<Character> = {}) {
    return baseCharacter({ classi: [{ nome: "Mago", livello: 5 }], ...overrides });
  }

  it("CD tiro salvezza e Bonus attacco degli incantesimi sono editabili e si sommano al calcolo RAW", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [character, setCharacter] = useState(caster());
      return <SpellSlotsSection character={character} onChange={setCharacter} />;
    }
    render(<Harness />);

    const rawCd = spellSaveDC(5, 10); // intelligenza 10 di baseCharacter()
    const rawAttack = spellAttackBonus(5, 10);
    expect(screen.getByText(String(rawCd))).toBeInTheDocument();

    const cdField = screen.getByLabelText("Bonus extra alla CD tiro salvezza degli incantesimi");
    await user.clear(cdField);
    await user.type(cdField, "2");
    cdField.blur();
    expect(await screen.findByText(String(rawCd + 2))).toBeInTheDocument();

    const attackField = screen.getByLabelText("Bonus extra al bonus di attacco degli incantesimi");
    await user.clear(attackField);
    await user.type(attackField, "1");
    attackField.blur();
    const expectedAttack = rawAttack + 1;
    expect(
      await screen.findByText(expectedAttack >= 0 ? `+${expectedAttack}` : String(expectedAttack)),
    ).toBeInTheDocument();
  });
});

describe("RestSection", () => {
  it("mostra solo 'Riposo lungo' per un personaggio non Warlock", () => {
    const character = baseCharacter();
    render(<RestSection character={character} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: /Riposo lungo/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Riposo breve/ })).not.toBeInTheDocument();
  });

  it("riposo lungo: riepiloga le modifiche e, confermato, applica applyLongRest", async () => {
    const user = userEvent.setup();
    const character = baseCharacter({
      hpMax: 30,
      hpAttuali: 10,
      dadiVitaUsati: 3,
      tiriMorteSuccessi: 1,
      privilegiLimitati: [
        { id: "1", nome: "Rabbia", usiMax: 3, usiUsati: 2, recupero: "riposoLungo" },
      ],
    });
    const onChange = vi.fn();
    render(<RestSection character={character} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Riposo lungo/ }));

    expect(screen.getByText("Punti ferita ripristinati al massimo (30).")).toBeInTheDocument();
    expect(
      screen.getByText("3 dado/i vita recuperato/i (metà del totale, arrotondato per eccesso)."),
    ).toBeInTheDocument();
    expect(screen.getByText("Tiri salvezza contro la morte azzerati.")).toBeInTheDocument();
    expect(screen.getByText("Privilegi a usi limitati ripristinati: Rabbia.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Conferma" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(applyLongRest(character));
  });

  it("annullare il riposo non modifica il personaggio", async () => {
    const user = userEvent.setup();
    const character = baseCharacter({ hpAttuali: 10, hpMax: 30 });
    const onChange = vi.fn();
    render(<RestSection character={character} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Riposo lungo/ }));
    await user.click(screen.getByRole("button", { name: "Annulla" }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Conferma" })).not.toBeInTheDocument();
  });

  it("riposo breve: ripristina solo il Patto Magico e i privilegi con recupero 'riposoBreve'", async () => {
    const user = userEvent.setup();
    const character = baseCharacter({
      classi: [{ nome: "Warlock", livello: 3 }],
      slotPattoUsati: 2,
      privilegiLimitati: [
        { id: "1", nome: "Invocazione occulta", usiMax: 1, usiUsati: 1, recupero: "riposoBreve" },
      ],
    });
    const onChange = vi.fn();
    render(<RestSection character={character} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Riposo breve/ }));
    expect(
      screen.getByText("Slot Patto Magico ripristinati (si recuperano solo con un riposo breve)."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Privilegi a usi limitati ripristinati: Invocazione occulta."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Conferma" }));

    expect(onChange).toHaveBeenCalledWith(applyShortRest(character));
  });
});
