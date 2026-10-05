"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Casella di testo che cresce fino a mostrare tutto quello che contiene.
 *
 * I campi di testo libero della scheda (tratti, legami, ideali, difetti, nemici, note, aspetto)
 * avevano un'altezza fissa di poche righe: aperta la scheda, di una descrizione lunga si leggevano
 * le prime righe e il resto era tagliato, da raggiungere scorrendo dentro un riquadro alto tre
 * righe. Su telefono era peggio, perché la colonna è stretta e lo stesso testo occupa molte più
 * righe (segnalato dall'utente su entrambi, "su mobile è ancora più accentuato").
 *
 * L'altezza si adatta al montaggio — non solo mentre si scrive — perché il caso che conta è
 * proprio aprire una scheda già compilata.
 */
const ALTEZZA_MASSIMA_PREDEFINITA = 600;

export function TextareaAuto({
  value,
  onChange,
  minRows = 2,
  maxHeight = ALTEZZA_MASSIMA_PREDEFINITA,
  className,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Altezza minima in righe: sotto questa non si restringe, anche se il campo è vuoto. */
  minRows?: number;
  /** Oltre questa altezza (px) smette di crescere e scorre al suo interno. */
  maxHeight?: number;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // "auto" prima di misurare: scrollHeight non scende mai sotto l'altezza già impostata, quindi
    // senza azzerarla il campo potrebbe solo crescere e mai tornare basso dopo una cancellazione.
    el.style.height = "auto";
    const serve = el.scrollHeight;
    // In un ambiente senza layout (jsdom nei test, cattura di anteprime) scrollHeight è 0: meglio
    // lasciare l'altezza di default che schiacciare il campo a zero.
    if (serve <= 0) return;
    el.style.height = `${Math.min(serve, maxHeight)}px`;
    el.style.overflowY = serve > maxHeight ? "auto" : "hidden";
  }, [value, maxHeight]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value),
    [onChange],
  );

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={handleChange}
      rows={minRows}
      placeholder={placeholder}
      className={className}
    />
  );
}
