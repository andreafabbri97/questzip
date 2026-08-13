import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContentMock = vi.fn();

class FakeApiError extends Error {
  status: number;
  constructor(status: number, message = "errore simulato") {
    super(message);
    this.status = status;
  }
}

// Classe vera (non vi.fn().mockImplementation con arrow function): "new GoogleGenAI(...)" nel
// codice reale richiede un vero costruttore, e un'arrow function non può mai essere invocata con
// "new" — usarla come mockImplementation fa fallire ogni test con "is not a constructor".
class FakeGoogleGenAI {
  models = { generateContent: generateContentMock };
}

vi.mock("@google/genai", () => ({
  GoogleGenAI: FakeGoogleGenAI,
  ApiError: FakeApiError,
  createPartFromBase64: vi.fn((data: string, mimeType: string) => ({ inlineData: { data, mimeType } })),
  createUserContent: vi.fn((parts: unknown) => ({ role: "user", parts: Array.isArray(parts) ? parts : [parts] })),
}));

// getClient() in lib/gemini.ts cache il client Gemini in una variabile di modulo — per testare
// scenari con GEMINI_API_KEY/GEMINI_MODEL diversi serve un'istanza FRESCA del modulo per ogni
// test (vi.resetModules() + import dinamico), altrimenti il secondo test riuserebbe silenziosamente
// il client/la config del primo.
async function importGemini() {
  vi.resetModules();
  return import("./gemini");
}

describe("askGemini", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    generateContentMock.mockReset();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("ritorna null senza chiamare l'IA se GEMINI_API_KEY non è configurata", async () => {
    delete process.env.GEMINI_API_KEY;
    const { askGemini } = await importGemini();

    const result = await askGemini({ prompt: "ciao" });

    expect(result).toBeNull();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it("usa il primo modello della catena e ritorna la risposta se va a buon fine", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContentMock.mockResolvedValueOnce({ text: "risposta ok" });
    const { askGemini } = await importGemini();

    const result = await askGemini({ prompt: "ciao" });

    expect(result).toBe("risposta ok");
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock.mock.calls[0][0].model).toBe("gemini-flash-lite-latest");
  });

  it("passa al modello successivo della catena se il primo esaurisce la quota (429)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContentMock
      .mockRejectedValueOnce(new FakeApiError(429))
      .mockResolvedValueOnce({ text: "risposta dal secondo modello" });
    const { askGemini } = await importGemini();

    const result = await askGemini({ prompt: "ciao" });

    expect(result).toBe("risposta dal secondo modello");
    expect(generateContentMock).toHaveBeenCalledTimes(2);
    expect(generateContentMock.mock.calls[1][0].model).toBe("gemini-2.5-flash-lite");
  });

  it("ritorna null senza provare altri modelli su un errore diverso da 429", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContentMock.mockRejectedValueOnce(new Error("rete assente"));
    const { askGemini } = await importGemini();

    const result = await askGemini({ prompt: "ciao" });

    expect(result).toBeNull();
    expect(generateContentMock).toHaveBeenCalledTimes(1);
  });

  it("ritorna null se anche l'ultimo modello della catena esaurisce la quota", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    generateContentMock.mockRejectedValue(new FakeApiError(429));
    const { askGemini } = await importGemini();

    const result = await askGemini({ prompt: "ciao" });

    expect(result).toBeNull();
    expect(generateContentMock).toHaveBeenCalledTimes(5);
  });

  it("GEMINI_MODEL forza un solo modello, niente fallback automatico anche su 429", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.GEMINI_MODEL = "gemini-2.5-pro";
    generateContentMock.mockRejectedValueOnce(new FakeApiError(429));
    const { askGemini } = await importGemini();

    const result = await askGemini({ prompt: "ciao" });

    expect(result).toBeNull();
    expect(generateContentMock).toHaveBeenCalledTimes(1);
    expect(generateContentMock.mock.calls[0][0].model).toBe("gemini-2.5-pro");
  });
});

describe("geminiEnabled", () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("riflette la presenza di GEMINI_API_KEY", async () => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.GEMINI_API_KEY;
    const modSenzaChiave = await importGemini();
    expect(modSenzaChiave.geminiEnabled()).toBe(false);

    process.env = { ...ORIGINAL_ENV, GEMINI_API_KEY: "test-key" };
    const modConChiave = await importGemini();
    expect(modConChiave.geminiEnabled()).toBe(true);
  });
});
