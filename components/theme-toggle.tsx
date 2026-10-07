"use client";

import { useEffect, useState } from "react";
import { impostaTema } from "@/app/actions/tema";
import { temaDalDocumento, type Tema } from "@/lib/tema";

const SCELTE: { valore: Tema; etichetta: string; icona: string }[] = [
  { valore: "scuro", etichetta: "Scuro", icona: "🌙" },
  { valore: "chiaro", etichetta: "Chiaro", icona: "☀️" },
];

/**
 * Sceglie il tema dell'interfaccia. La preferenza vive sull'ACCOUNT (users.tema), non nel
 * browser, quindi segue l'utente su ogni dispositivo.
 *
 * Il cambio si vede subito perché si scrive data-theme sull'<html> senza aspettare il server: le
 * variabili CSS si riapplicano da sole e l'intera pagina cambia colore nello stesso istante del
 * click. Il salvataggio parte in parallelo e serve solo a far trovare il tema giusto ai
 * caricamenti successivi (dove è il server a scrivere l'attributo, vedi app/layout.tsx).
 */
export function ThemeToggle() {
  const [tema, setTema] = useState<Tema | null>(null);
  const [errore, setErrore] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Lo stato iniziale si legge dall'attributo che il server ha già scritto, non da una seconda
  // chiamata al database. setState mai sincrona nel corpo dell'effetto: stesso accorgimento di
  // PushToggle per via del lint del React Compiler.
  useEffect(() => {
    let annullato = false;
    Promise.resolve()
      .then<Tema>(() => temaDalDocumento(document.documentElement))
      .then((iniziale) => {
        if (!annullato) setTema(iniziale);
      });
    return () => {
      annullato = true;
    };
  }, []);

  // L'<html> si aggiorna QUI e non dentro il gestore del click: scrivere nel DOM dal corpo del
  // componente è vietato dal React Compiler (react-hooks/immutability), e passare dallo stato
  // rende il ripristino dopo un errore automatico — basta rimettere indietro `tema`.
  useEffect(() => {
    if (tema) document.documentElement.dataset.theme = tema;
  }, [tema]);

  const scegli = async (prossimo: Tema) => {
    if (prossimo === tema || salvando) return;
    const precedente = tema;
    setErrore("");
    setSalvando(true);
    setTema(prossimo);
    try {
      await impostaTema(prossimo);
    } catch {
      // Si torna indietro invece di lasciare l'utente convinto che la scelta sia stata
      // registrata: al prossimo caricamento ritroverebbe il tema di prima.
      setTema(precedente);
      setErrore("Non è stato possibile salvare la scelta. Riprova.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Tema dell'interfaccia" className="flex gap-2">
        {SCELTE.map((scelta) => {
          const attivo = tema === scelta.valore;
          return (
            <button
              key={scelta.valore}
              type="button"
              role="radio"
              aria-checked={attivo}
              disabled={tema === null || salvando}
              onClick={() => scegli(scelta.valore)}
              className={`card-elevated-hover flex-1 rounded-lg border px-4 py-3 text-sm font-bold transition-colors disabled:opacity-60 ${
                attivo
                  ? "border-accent bg-surface-raised text-accent-strong glow-accent"
                  : "border-edge bg-surface text-muted hover:text-foreground"
              }`}
            >
              <span aria-hidden="true" className="mr-2">
                {scelta.icona}
              </span>
              {scelta.etichetta}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted">
        {tema === null
          ? "Caricamento…"
          : "La scelta è salvata sul tuo account e ti segue su ogni dispositivo."}
      </p>
      {errore ? <p className="text-xs text-danger">{errore}</p> : null}
    </div>
  );
}
