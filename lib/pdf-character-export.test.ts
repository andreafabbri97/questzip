import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { characterSchema, newCharacter, type Character } from "@/lib/dnd";
import { exportCharacterToPdf, pdfFileName } from "@/lib/pdf-character-export";

function build(overrides: Partial<Character> = {}): Character {
  return characterSchema.parse({ ...newCharacter(), nome: "Prova", ...overrides });
}

async function numeroPagine(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes as unknown as ArrayBuffer);
  return pdf.getPageCount();
}

describe("exportCharacterToPdf", () => {
  it("genera un PDF valido e non vuoto", async () => {
    const bytes = await exportCharacterToPdf(build());
    expect(bytes.length).toBeGreaterThan(1000);
    // Firma di un file PDF: se cambiasse il generatore, un file non-PDF fallirebbe qui.
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("salta la pagina incantesimi per un personaggio senza magia", async () => {
    const guerriero = build({ classi: [{ nome: "Guerriero", livello: 5 }] });
    expect(await numeroPagine(await exportCharacterToPdf(guerriero))).toBe(2);
  });

  it("include la pagina incantesimi per un incantatore", async () => {
    const mago = build({ classi: [{ nome: "Mago", livello: 5 }] });
    expect(await numeroPagine(await exportCharacterToPdf(mago))).toBe(3);
  });

  it("include la pagina incantesimi anche se la magia arriva solo dagli incantesimi conosciuti", async () => {
    // Cavaliere Mistico/Mistificatore Arcano: la classe non risulta incantatrice dalle tabelle, ma il
    // personaggio ha comunque incantesimi in scheda — senza questo caso resterebbero fuori dal PDF.
    const cavaliere = build({
      classi: [{ nome: "Guerriero", livello: 5 }],
      incantesimi: [{ id: "s1", nome: "Scudo", livello: 1, preparato: true, dadoDanno: "" }],
    });
    expect(await numeroPagine(await exportCharacterToPdf(cavaliere))).toBe(3);
  });

  it("non esplode su caratteri fuori da Latin-1 (emoji, cirillico, trattini tipografici)", async () => {
    // Helvetica standard copre solo WinAnsi: senza la sanificazione in safe(), pdf-lib lancia
    // un'eccezione e l'intero export fallisce per un singolo carattere in un campo libero.
    const strano = build({
      nome: "Zörb 🐉 — “il Rosso”",
      note: "Привет 你好 🔥 … – —",
      talenti: [{ id: "t1", nome: "Fortunato 🍀" }],
    });
    const bytes = await exportCharacterToPdf(strano);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("regge liste molto lunghe senza errori", async () => {
    const affollato = build({
      classi: [{ nome: "Mago", livello: 20 }],
      incantesimi: Array.from({ length: 80 }, (_, i) => ({
        id: `s${i}`,
        nome: `Incantesimo ${i}`,
        livello: i % 10,
        preparato: i % 2 === 0,
        dadoDanno: "",
      })),
      inventario: Array.from({ length: 40 }, (_, i) => ({
        id: `i${i}`,
        nome: `Oggetto ${i}`,
        quantita: 1,
        note: "",
        peso: 1,
      })),
    });
    const bytes = await exportCharacterToPdf(affollato);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("pdfFileName", () => {
  it("costruisce un nome file leggibile", () => {
    expect(pdfFileName(build({ nome: "Thorin Scudodiquercia" }))).toBe("Thorin-Scudodiquercia-questzip.pdf");
  });

  it("toglie i caratteri che i filesystem rifiutano", () => {
    expect(pdfFileName(build({ nome: 'Zorb/il "Rosso"?' }))).toBe("Zorbil-Rosso-questzip.pdf");
  });

  it("ricade su un nome generico se non resta nulla di utilizzabile", () => {
    expect(pdfFileName(build({ nome: "🐉🔥" }))).toBe("personaggio-questzip.pdf");
  });
});
