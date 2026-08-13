import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVisualViewportHeight } from "./use-visual-viewport-height";

// jsdom non implementa window.visualViewport: lo sostituiamo con un EventTarget minimo per
// simulare l'apertura/chiusura della tastiera (resize del viewport visibile), senza dover
// riprodurre un vero browser mobile in questo ambiente.
function installFakeVisualViewport(initialHeight: number) {
  const target = new EventTarget();
  const fake = Object.assign(target, { height: initialHeight });
  Object.defineProperty(window, "visualViewport", { value: fake, configurable: true, writable: true });
  return {
    resizeTo(height: number) {
      fake.height = height;
      fake.dispatchEvent(new Event("resize"));
    },
  };
}

describe("useVisualViewportHeight", () => {
  afterEach(() => {
    // @ts-expect-error ripristina lo stato "non supportato" tra un test e l'altro
    delete window.visualViewport;
    vi.restoreAllMocks();
  });

  it("ritorna null se window.visualViewport non è supportato (fallback alla classe CSS dvh)", () => {
    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBeNull();
  });

  it("ritorna l'altezza iniziale quando l'API è disponibile", () => {
    installFakeVisualViewport(800);
    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBe(800);
  });

  it("si aggiorna quando la tastiera si apre e riduce l'altezza visibile", () => {
    const viewport = installFakeVisualViewport(800);
    const { result } = renderHook(() => useVisualViewportHeight());
    expect(result.current).toBe(800);

    act(() => viewport.resizeTo(420)); // tastiera aperta: viewport visibile molto più basso
    expect(result.current).toBe(420);

    act(() => viewport.resizeTo(800)); // tastiera chiusa: torna al valore originale
    expect(result.current).toBe(800);
  });

  it("smette di ascoltare dopo lo smontaggio (niente aggiornamenti su un componente smontato)", () => {
    const viewport = installFakeVisualViewport(800);
    const { result, unmount } = renderHook(() => useVisualViewportHeight());
    unmount();
    act(() => viewport.resizeTo(420));
    expect(result.current).toBe(800); // non aggiornato: il listener è stato rimosso
  });
});
