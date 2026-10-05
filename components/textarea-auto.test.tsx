import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TextareaAuto } from "./textarea-auto";

// I campi di testo libero della scheda (personalità, aspetto, note) avevano un'altezza fissa e di
// una descrizione lunga si leggevano le prime righe, il resto tagliato — su telefono peggio, con
// la colonna stretta (segnalato dall'utente su desktop e mobile).
describe("TextareaAuto", () => {
  it("mostra tutto il testo che ha dentro e lo restituisce intero a chi la usa", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TextareaAuto value="prima riga" onChange={onChange} />);

    const campo = screen.getByRole("textbox");
    expect(campo).toHaveValue("prima riga");

    await user.type(campo, "!");
    expect(onChange).toHaveBeenCalledWith("prima riga!");
  });

  it("parte dall'altezza minima richiesta", () => {
    render(<TextareaAuto value="" onChange={() => {}} minRows={5} />);

    expect(screen.getByRole("textbox")).toHaveAttribute("rows", "5");
  });

  // jsdom non calcola il layout, quindi scrollHeight è sempre 0: la misura vera non è verificabile
  // qui. Quello che si può verificare è che in quel caso il campo NON venga schiacciato a zero,
  // che è il modo in cui questo componente potrebbe rompere una pagina.
  it("senza un layout da misurare non si schiaccia a zero", () => {
    render(<TextareaAuto value={"riga\nriga\nriga\nriga"} onChange={() => {}} />);

    expect(screen.getByRole("textbox").style.height).not.toBe("0px");
  });

  it("cresce quando il contenuto lo richiede e si rimpicciolisce quando viene cancellato", () => {
    // Si finge un layout: scrollHeight proporzionale alle righe del contenuto.
    const spia = vi
      .spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get")
      .mockImplementation(function (this: HTMLTextAreaElement) {
        return this.value.split("\n").length * 20;
      });

    const { rerender } = render(<TextareaAuto value={"una\ndue\ntre"} onChange={() => {}} />);
    expect(screen.getByRole("textbox").style.height).toBe("60px");

    rerender(<TextareaAuto value="una" onChange={() => {}} />);
    expect(screen.getByRole("textbox").style.height).toBe("20px");

    spia.mockRestore();
  });

  it("oltre il tetto massimo smette di crescere e scorre al suo interno", () => {
    const spia = vi
      .spyOn(HTMLTextAreaElement.prototype, "scrollHeight", "get")
      .mockReturnValue(5000);

    render(<TextareaAuto value="testo lunghissimo" onChange={() => {}} maxHeight={300} />);

    const campo = screen.getByRole("textbox");
    expect(campo.style.height).toBe("300px");
    expect(campo.style.overflowY).toBe("auto");

    spia.mockRestore();
  });
});
