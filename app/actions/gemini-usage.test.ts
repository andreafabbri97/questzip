import { describe, expect, it, vi } from "vitest";

const whereMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: whereMock,
      })),
    })),
  },
}));

let geminiEnabledResult = true;
vi.mock("@/lib/gemini", () => ({
  geminiEnabled: () => geminiEnabledResult,
}));

const { getGeminiUsageToday } = await import("./gemini-usage");

describe("getGeminiUsageToday", () => {
  it("ritorna zero senza interrogare il DB se l'IA non è configurata", async () => {
    geminiEnabledResult = false;

    const result = await getGeminiUsageToday();

    expect(result).toEqual({ total: 0, byModel: [] });
    expect(whereMock).not.toHaveBeenCalled();
  });

  it("somma le richieste di oggi su tutti i modelli", async () => {
    geminiEnabledResult = true;
    whereMock.mockResolvedValueOnce([
      { model: "gemini-flash-lite-latest", count: 12 },
      { model: "gemini-2.5-flash-lite", count: 3 },
    ]);

    const result = await getGeminiUsageToday();

    expect(result.total).toBe(15);
    expect(result.byModel).toEqual([
      { model: "gemini-flash-lite-latest", count: 12 },
      { model: "gemini-2.5-flash-lite", count: 3 },
    ]);
  });

  it("ritorna zero invece di propagare un errore se la query fallisce", async () => {
    geminiEnabledResult = true;
    whereMock.mockRejectedValueOnce(new Error("DB non raggiungibile"));

    const result = await getGeminiUsageToday();

    expect(result).toEqual({ total: 0, byModel: [] });
  });
});
