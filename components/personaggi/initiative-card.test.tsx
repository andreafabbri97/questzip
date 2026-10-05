import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InitiativeCard } from "./initiative-card";

// L'iniziativa si tira a ogni scontro ed era l'unico numero della scheda senza il suo dado: tiri
// salvezza, abilità, armi e incantesimi ce l'avevano già (richiesta dell'utente).
describe("InitiativeCard", () => {
  it("tira un d20 col modificatore d'iniziativa", async () => {
    const user = userEvent.setup();
    const onRoll = vi.fn();
    render(
      <InitiativeCard modificatore={4} bonusExtra={0} onBonusExtraChange={() => {}} onRoll={onRoll} />,
    );

    await user.click(screen.getByRole("button", { name: "Tira iniziativa" }));

    expect(onRoll).toHaveBeenCalledWith({
      label: "Iniziativa",
      groups: [{ die: 20, quantity: 1 }],
      modifier: 4,
    });
  });

  // Il bonus extra (Allerta, oggetti magici) è già sommato nel modificatore mostrato: il dado deve
  // partire con QUEL numero, non col solo modificatore di Destrezza.
  it("tira col numero mostrato, bonus extra compreso", async () => {
    const user = userEvent.setup();
    const onRoll = vi.fn();
    render(
      <InitiativeCard modificatore={9} bonusExtra={5} onBonusExtraChange={() => {}} onRoll={onRoll} />,
    );

    expect(screen.getByText("+9")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tira iniziativa" }));

    expect(onRoll.mock.calls[0][0].modifier).toBe(9);
  });

  it("un modificatore negativo resta negativo", () => {
    render(
      <InitiativeCard modificatore={-1} bonusExtra={0} onBonusExtraChange={() => {}} onRoll={() => {}} />,
    );

    expect(screen.getByText("-1")).toBeInTheDocument();
  });
});
