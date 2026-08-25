import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVisualViewport } from "./use-visual-viewport";

// jsdom non implementa window.visualViewport: lo sostituiamo con un EventTarget minimo per
// simulare l'apertura/chiusura della tastiera (che riduce l'altezza visibile su Android e sposta
// l'origine su iOS), senza dover riprodurre un vero browser mobile in questo ambiente.
function installFakeVisualViewport(initialHeight: number, initialOffsetTop = 0) {
  const target = new EventTarget();
  const fake = Object.assign(target, { height: initialHeight, offsetTop: initialOffsetTop });
  Object.defineProperty(window, "visualViewport", { value: fake, configurable: true, writable: true });
  return {
    resizeTo(height: number) {
      fake.height = height;
      fake.dispatchEvent(new Event("resize"));
    },
    scrollTo(offsetTop: number) {
      fake.offsetTop = offsetTop;
      fake.dispatchEvent(new Event("scroll"));
    },
  };
}

describe("useVisualViewport", () => {
  afterEach(() => {
    // @ts-expect-error ripristina lo stato "non supportato" tra un test e l'altro
    delete window.visualViewport;
    vi.restoreAllMocks();
  });

  it("ritorna null se window.visualViewport non è supportato (fallback alle unità CSS dvh)", () => {
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toBeNull();
  });

  it("ritorna il riquadro iniziale quando l'API è disponibile", () => {
    installFakeVisualViewport(800);
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current).toEqual({ height: 800, offsetTop: 0 });
  });

  it("si aggiorna quando la tastiera si apre e riduce l'altezza visibile", () => {
    const viewport = installFakeVisualViewport(800);
    const { result } = renderHook(() => useVisualViewport());

    act(() => viewport.resizeTo(420)); // tastiera aperta: viewport visibile molto più basso
    expect(result.current?.height).toBe(420);

    act(() => viewport.resizeTo(800)); // tastiera chiusa: torna al valore originale
    expect(result.current?.height).toBe(800);
  });

  // Su iOS la tastiera sposta il viewport visibile invece di accorciarlo: senza ascoltare anche
  // "scroll" il modal resterebbe ancorato al viewport di layout, cioè fuori dallo schermo.
  it("segue lo spostamento del viewport visibile (evento scroll)", () => {
    const viewport = installFakeVisualViewport(800);
    const { result } = renderHook(() => useVisualViewport());
    expect(result.current?.offsetTop).toBe(0);

    act(() => viewport.scrollTo(120));
    expect(result.current?.offsetTop).toBe(120);
  });

  it("smette di ascoltare dopo lo smontaggio (niente aggiornamenti su un componente smontato)", () => {
    const viewport = installFakeVisualViewport(800);
    const { result, unmount } = renderHook(() => useVisualViewport());
    unmount();
    act(() => viewport.resizeTo(420));
    expect(result.current?.height).toBe(800); // non aggiornato: il listener è stato rimosso
  });
});
