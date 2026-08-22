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

const { generateCampaignDraft } = await import("./ai-content-draft");

describe("generateCampaignDraft", () => {
  beforeEach(() => {
    askGeminiMock.mockClear();
  });

  it("ritorna null senza chiamare l'IA se il nome della campagna è vuoto", async () => {
    const result = await generateCampaignDraft("   ", "");
    expect(result).toBeNull();
    expect(askGeminiMock).not.toHaveBeenCalled();
  });

  it("include il nome della campagna e le indicazioni aggiuntive nel prompt", async () => {
    askGeminiMock.mockResolvedValue("Una bozza di ambientazione.");
    const result = await generateCampaignDraft("La Maledizione di Strahd", "tono gotico-horror");

    expect(result).toBe("Una bozza di ambientazione.");
    const prompt = askGeminiMock.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("La Maledizione di Strahd");
    expect(prompt).toContain("tono gotico-horror");
  });
});
