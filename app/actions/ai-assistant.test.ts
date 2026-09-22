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
// Il lookup del testo ufficiale parla col database: qui interessa solo che l'assistente ricada
// sui dati inglesi quando la voce ufficiale non c'e', quindi si finge sempre "non trovata".
const haTestoUfficialeMock = vi.fn().mockReturnValue(false);
const cercaVoceUfficialeMock = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/compendio-ita-lookup", () => ({
  haTestoUfficiale: (...a: unknown[]) => haTestoUfficialeMock(...a),
  cercaVoceUfficiale: (...a: unknown[]) => cercaVoceUfficialeMock(...a),
}));

const searchMentionCandidatesMock = vi.fn().mockResolvedValue([]);
vi.mock("@/lib/fivetools/mention-search", () => ({
  searchMentionCandidates: (...a: unknown[]) => searchMentionCandidatesMock(...a),
  MENTION_KIND_LABELS: { incantesimi: "Incantesimo" },
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

  it("manda al massimo gli ultimi 5 scambi anche se la cronologia è più lunga", async () => {
    askGeminiMock.mockResolvedValue("Risposta.");
    await askRulesAssistant(
      "Domanda attuale",
      [1, 2, 3, 4, 5, 6].map((n) => ({ question: `Domanda ${n}`, answer: `Risposta ${n}` })),
    );

    const prompt = askGeminiMock.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain("Domanda 1");
    for (const n of [2, 3, 4, 5, 6]) expect(prompt).toContain(`Domanda ${n}`);
  });

  // La cronologia la manda il browser: chi la gonfiasse a mano non deve poter spedire al modello
  // un prompt enorme a ogni domanda.
  it("taglia domande e risposte precedenti troppo lunghe", async () => {
    askGeminiMock.mockResolvedValue("Risposta.");
    await askRulesAssistant("Domanda attuale", [
      { question: "D".repeat(5000), answer: "R".repeat(50000) },
    ]);

    const prompt = askGeminiMock.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("D".repeat(500));
    expect(prompt).not.toContain("D".repeat(501));
    expect(prompt).toContain("R".repeat(1500));
    expect(prompt).not.toContain("R".repeat(1501));
  });
});

// L'assistente si ancorava ai soli dati inglesi di 5etools: rispondeva quindi con una traduzione
// improvvisata di termini che nell'app compaiono gia' con la resa ufficiale del manuale. Adesso,
// quando la voce esiste nei manuali italiani estratti, e' quel testo ad arrivare al modello.
describe("askRulesAssistant: ancoraggio al testo ufficiale italiano", () => {
  beforeEach(() => {
    askGeminiMock.mockClear();
    haTestoUfficialeMock.mockReturnValue(false);
    cercaVoceUfficialeMock.mockResolvedValue(null);
    searchMentionCandidatesMock.mockResolvedValue([]);
  });

  it("passa al modello il testo del manuale italiano quando la voce c'e'", async () => {
    searchMentionCandidatesMock.mockResolvedValue([
      { kind: "incantesimi", name: "Acid Splash", source: "PHB", nameIta: null },
    ]);
    haTestoUfficialeMock.mockReturnValue(true);
    cercaVoceUfficialeMock.mockResolvedValue({
      nome: "Fiotto Acido",
      livello: 0,
      scuola: "Invocazione",
      tempoDiLancio: "1 azione",
      gittata: "18 metri",
      componenti: "V, S",
      durata: "Istantanea",
      descrizione: "Il personaggio scaglia una bolla di acido.",
      fonteInglese: "PHB",
    });
    askGeminiMock.mockResolvedValue("Risposta.");

    await askRulesAssistant("Come funziona Acid Splash?");

    const prompt = askGeminiMock.mock.calls[0][0].prompt as string;
    expect(prompt).toContain("Fiotto Acido");
    expect(prompt).toContain("testo ufficiale dal manuale italiano");
    expect(prompt).toContain("Il personaggio scaglia una bolla di acido.");
  });

  it("ricade sui dati inglesi se la voce non e' nei manuali italiani estratti", async () => {
    searchMentionCandidatesMock.mockResolvedValue([
      { kind: "incantesimi", name: "Acid Splash", source: "PHB", nameIta: null },
    ]);
    haTestoUfficialeMock.mockReturnValue(true);
    cercaVoceUfficialeMock.mockResolvedValue(null);
    askGeminiMock.mockResolvedValue("Risposta.");

    await askRulesAssistant("Come funziona Acid Splash?");

    const prompt = askGeminiMock.mock.calls[0][0].prompt as string;
    expect(prompt).not.toContain("testo ufficiale dal manuale italiano");
  });
});
