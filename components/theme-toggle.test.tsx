import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const impostaTemaMock = vi.fn().mockResolvedValue("chiaro");
vi.mock("@/app/actions/tema", () => ({
  impostaTema: (...a: unknown[]) => impostaTemaMock(...a),
}));

const { ThemeToggle } = await import("./theme-toggle");

describe("ThemeToggle", () => {
  beforeEach(() => {
    impostaTemaMock.mockReset().mockResolvedValue("chiaro");
    document.documentElement.dataset.theme = "scuro";
  });

  it("parte dal tema che il server ha scritto sull'html", async () => {
    render(<ThemeToggle />);
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /scuro/i })).toHaveAttribute("aria-checked", "true"),
    );
    expect(screen.getByRole("radio", { name: /chiaro/i })).toHaveAttribute("aria-checked", "false");
  });

  // Il colore deve cambiare nell'istante del click: aspettare la risposta del server lascerebbe
  // la pagina del tema vecchio per tutta la durata della chiamata.
  it("applica il tema all'istante e lo salva sull'account", async () => {
    render(<ThemeToggle />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /scuro/i })).toBeEnabled());

    await userEvent.click(screen.getByRole("radio", { name: /chiaro/i }));

    expect(document.documentElement.dataset.theme).toBe("chiaro");
    await waitFor(() => expect(impostaTemaMock).toHaveBeenCalledWith("chiaro"));
  });

  // Senza il ripristino l'utente resterebbe convinto di aver scelto il tema chiaro, salvo
  // ritrovarsi quello scuro al caricamento successivo.
  it("se il salvataggio fallisce torna al tema precedente e lo dice", async () => {
    impostaTemaMock.mockRejectedValue(new Error("rete"));
    render(<ThemeToggle />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /scuro/i })).toBeEnabled());

    await userEvent.click(screen.getByRole("radio", { name: /chiaro/i }));

    await waitFor(() => expect(screen.getByText(/non è stato possibile salvare/i)).toBeVisible());
    expect(document.documentElement.dataset.theme).toBe("scuro");
    expect(screen.getByRole("radio", { name: /scuro/i })).toHaveAttribute("aria-checked", "true");
  });

  it("non richiama il server se si ripreme il tema gia' attivo", async () => {
    render(<ThemeToggle />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /scuro/i })).toBeEnabled());

    await userEvent.click(screen.getByRole("radio", { name: /scuro/i }));

    expect(impostaTemaMock).not.toHaveBeenCalled();
  });
});
