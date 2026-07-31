"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useRef } from "react";

export type Dice3DStatus = "loading" | "ready" | "unavailable";

export interface Dice3DHandle {
  /** notation tipo "3d20" — restituisce il valore di ciascun dado nell'ordine in cui dice-box
   * li riporta (per vantaggio/svantaggio non importa l'ordine, si scelgono max/min comunque). */
  roll: (notation: string) => Promise<number[]>;
}

// La libreria non pubblica tipi TypeScript (pacchetto JS puro) — qui basta la forma che usiamo
// davvero, non l'intera API di @3d-dice/dice-box.
interface DiceBoxInstance {
  init: () => Promise<unknown>;
  roll: (notation: string) => Promise<{ value: number }[]>;
}
interface DiceBoxConstructor {
  new (config: Record<string, unknown>): DiceBoxInstance;
}

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

/** Dadi fisici veri (BabylonJS + fisica Ammo via Web Worker, libreria @3d-dice/dice-box) al
 * posto del numero che tumbla finto. Componente "muto" di proposito: non decide da solo quando
 * tirare, espone solo roll() via ref — chi lo usa (DiceRoller) resta l'unica fonte di verità su
 * quanti dadi, che tipo, modificatore, vantaggio/svantaggio eccetera, qui arriva solo la
 * notazione già decisa.
 *
 * Comincia a caricare la scena 3D (Web Worker + WASM fisico + texture tema) appena viene
 * montato — la decisione di QUANDO montarlo (mai di default, solo dopo il primo tiro) spetta al
 * genitore, vedi DiceRoller: niente peso extra per chi apre il modal dadi e non tira mai. */
export const Dice3D = forwardRef<
  Dice3DHandle,
  { onStatusChange: (status: Dice3DStatus) => void; className?: string }
>(function Dice3D({ onStatusChange, className }, ref) {
  // Id univoco per istanza: dice-box vuole un selettore CSS che esista già nel DOM, non un nodo
  // passato direttamente — se mai ci fosse più di un'istanza in pagina (non succede oggi, un
  // solo DiceModal globale) non si scontrerebbero comunque.
  const rawId = useId();
  const containerId = `dice-3d-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const outerRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<DiceBoxInstance | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Nessuno stato locale: lo stato "di verità" vive nel genitore (DiceRoller), qui si limita a
    // notificarlo — questo componente non ha bisogno di sapere lo status per renderizzare nulla
    // di suo, il div del canvas è identico in ogni stato.
    const update = (next: Dice3DStatus) => {
      if (cancelled) return;
      onStatusChange(next);
    };

    if (!hasWebGL()) {
      update("unavailable");
      return;
    }

    // dice-box dimensiona il canvas leggendo clientWidth/clientHeight del container e
    // mandandoli COSÌ COME SONO al Web Worker che fa il rendering, senza moltiplicarli per
    // devicePixelRatio — verificato leggendo il sorgente della libreria (dice-box.es.js,
    // postMessage({action:"init", width: canvas.clientWidth, ...})). Il pattern corretto per un
    // canvas offscreen (documentato dagli stessi sviluppatori di BabylonJS: leggi la dimensione
    // CSS, MOLTIPLICA per devicePixelRatio, poi manda quella al worker) qui manca — risultato,
    // il canvas renderizza a densità 1x anche su schermi ad alta densità, sgranato rispetto al
    // resto della pagina (che invece la rispetta automaticamente, essendo DOM/CSS normale).
    //
    // Aggirato dall'esterno senza toccare la libreria: il contenitore interno (quello passato a
    // dice-box come "container") viene reso fisicamente più grande — moltiplicato per
    // devicePixelRatio — PRIMA che dice-box lo misuri, poi scalato indietro via CSS transform
    // per occupare visivamente lo stesso spazio di sempre. dice-box legge le dimensioni
    // maggiorate (quindi crea un canvas a risoluzione più alta), il transform lo fa apparire
    // delle dimensioni corrette sullo schermo — stesso principio di un canvas "retina" fatto a
    // mano. Il contenitore ESTERNO (con overflow:hidden) è quello che riceve className/occupa
    // davvero spazio nel layout, il transform sul contenitore interno non lo altera.
    const outer = outerRef.current;
    const inner = document.getElementById(containerId);
    const dpr = window.devicePixelRatio || 1;
    if (outer && inner && dpr > 1) {
      const rect = outer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        inner.style.width = `${rect.width * dpr}px`;
        inner.style.height = `${rect.height * dpr}px`;
        inner.style.transform = `scale(${1 / dpr})`;
        inner.style.transformOrigin = "top left";
      }
    }

    import("@3d-dice/dice-box")
      .then((mod) => {
        if (cancelled) return null;
        const DiceBox = mod.default as unknown as DiceBoxConstructor;
        const box = new DiceBox({
          container: `#${containerId}`,
          // Gli asset (fisica Ammo + texture tema) sono stati copiati qui da
          // "npm install" (postinstall di @3d-dice/dice-box), non nel percorso di default
          // della libreria — vedi public/assets/.
          assetPath: "/assets/",
          // NON #e0a83e (--accent): la libreria sceglie da sola numeri neri o bianchi in base
          // alla luminosità di questo colore (soglia 175/255, formula 0.299r+0.587g+0.114b —
          // vedi dice-box.es.js) — #e0a83e ha luminosità 172.6, APPENA sotto soglia: numeri
          // bianchi su un dado giallo chiaro, illeggibili. --accent-strong sta comodamente sopra
          // soglia (194.5): numeri neri, contrasto vero. Stessa tonalità oro dell'app, non un
          // colore a caso.
          themeColor: "#f2c14e",
          // Al massimo consentito dalla libreria (range 2-9).
          scale: 9,
        });
        boxRef.current = box;
        return box.init();
      })
      .then((result) => {
        if (result === null || cancelled) return;
        update("ready");
      })
      .catch(() => update("unavailable"));

    return () => {
      cancelled = true;
    };
    // Solo al primo mount: containerId è stabile per tutta la vita del componente, e
    // onStatusChange cambierebbe identità ad ogni render del genitore (ri-triggerebbe
    // inutilmente l'init) — stesso pattern già in uso altrove in questo progetto per gli effetti
    // "una tantum".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    roll: async (notation: string) => {
      const box = boxRef.current;
      if (!box) return [];
      const results = await box.roll(notation);
      return results.map((entry) => entry.value);
    },
  }));

  return (
    <div ref={outerRef} className={className} style={{ overflow: "hidden" }}>
      <div id={containerId} />
    </div>
  );
});
