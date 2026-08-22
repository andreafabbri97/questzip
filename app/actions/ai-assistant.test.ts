import { beforeEach, describe, expect, it, vi } from "vitest";

const askGeminiMock = vi.fn();
vi.mock("@/lib/campaign-auth", () => ({
  // Le azioni IA ora richiedono un utente autenticato (la pagina /campagne è raggiungibile senza
  // login, quindi senza questo controllo la quota Gemini era spendibile da chiunque): qui basta
  // che non lanci, il comportamento sotto test è il prompt, non l'autenticazione.
  requireUserId: async () => "utente-di-prova",
}));
vi.mock("@/lib/gemini", () => ({
  askGemini: (...args: unknown[]) => askGeminiMock(...args),
}));

// Nessun candidato del Compendio: isola il test dalla logica di grounding (già esistente, non
// toccata da questo cambiamento) per verificare solo il nuovo comportamento, la cronologia.
vi.mock("@/lib/fivetools/mention-search", () => ({
  searchMentionCandidates: vi.fn().mockResolvedValue([]),
  MENTION_KIND_LABELS: {},
}));

const { askRulesAssistant } = await import("./ai-assistant");

describe("askRulesAssistant", () => {
  beforeEach(() => {
    askGeminiMock.mockClear();
  });

  it("ritorna null senza chiamare l'IA per una domanda vuota", async () => {
    const result = await askRulesAssistant("   ");
    expect(result).toBeNull();
    expect(askGeminiMock).not.toHaveBeenCalled();
  });

  it("include gli scambi precedenti nel prompt, per interpretare domande di seguito", async () => {
    askGeminiMock.mockResolvedValue("Risposta.");
    await askRulesAssistant("E a un livello più alto?", [
      { question: "Quanto danno fa Palla di Fuoco?", answer: "8d6 danni da fuoco." },
    ]);

    const prompt = askGeminiMock.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("Quanto danno fa Palla di Fuoco?");
    expect(prompt).toContain("8d6 danni da fuoco.");
  });

  it("non include il blocco degli scambi precedenti quando non ce ne sono", async () => {
    askGeminiMock.mockResolvedValue("Risposta.");
    await askRulesAssistant("Quanto danno fa Palla di Fuoco?");

    const prompt = askGeminiMock.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain("Scambi precedenti");
  });

  it("manda al massimo gli ultimi 3 scambi anche se la cronologia è più lunga", async () => {
    askGeminiMock.mockResolvedValue("Risposta.");
    await askRulesAssistant("Domanda attuale", [
      { question: "Domanda 1", answer: "Risposta 1" },
      { question: "Domanda 2", answer: "Risposta 2" },
      { question: "Domanda 3", answer: "Risposta 3" },
      { question: "Domanda 4", answer: "Risposta 4" },
    ]);

    const prompt = askGeminiMock.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain("Domanda 1");
    expect(prompt).toContain("Domanda 2");
    expect(prompt).toContain("Domanda 4");
  });
});
