import { describe, expect, it } from "vitest";
import { inizialeUtente } from "@/lib/iniziale-utente";

// Senza foto sull'account Google il collegamento al profilo restava un elemento vuoto: l'immagine
// non c'era e il nome accanto e' nascosto sotto i 1024px, quindi da telefono il proprio profilo
// era irraggiungibile. Questo segnaposto e' l'unica cosa che si vede in quel caso, quindi un
// valore deve uscirne sempre.
describe("inizialeUtente", () => {
  it("usa la prima lettera del nome, maiuscola", () => {
    expect(inizialeUtente("Riccardo Matteini Palmerini", "rickpalme@gmail.com")).toBe("R");
    expect(inizialeUtente("andrea", "a@b.it")).toBe("A");
  });

  it("senza nome ripiega sull'email", () => {
    expect(inizialeUtente(null, "zelda@example.com")).toBe("Z");
    expect(inizialeUtente("   ", "mario@example.com")).toBe("M");
  });

  it("senza nulla restituisce comunque qualcosa: il cerchio deve esserci", () => {
    expect(inizialeUtente(null, null)).toBe("?");
    expect(inizialeUtente("", "")).toBe("?");
  });
});
