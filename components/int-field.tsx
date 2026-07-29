"use client";

import { useState, type InputHTMLAttributes } from "react";

type IntFieldProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  // Per i pochi campi dove ha senso un peso frazionario (es. kg di un oggetto d'inventario) —
  // di default il campo resta intero per tutti gli altri ~30 usi nel sito (PF, CA, livelli...).
  decimal?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max">;

/**
 * Sostituto di <input type="number">: quello nativo ricalcola e clampa il valore ad ogni
 * tasto, quindi cancellare una cifra per scriverne un'altra (es. "1" -> "8" da mobile) è
 * impossibile, il valore torna al minimo prima ancora di riuscire a digitare quella nuova.
 * Qui il testo digitato resta libero mentre scrivi (anche vuoto o temporaneamente fuori
 * range, segnalato in rosso) e viene clampato solo alla conferma (blur/invio); se non è un
 * numero valido alla conferma, torna all'ultimo valore valido.
 */
export function IntField({
  value,
  onChange,
  min,
  max,
  decimal = false,
  className = "",
  ...rest
}: IntFieldProps) {
  const [text, setText] = useState(String(value));
  const [dirty, setDirty] = useState(false);

  if (!dirty && Number(text) !== value) {
    setText(String(value));
  }

  const isValidNumber = (n: number) => (decimal ? Number.isFinite(n) : Number.isInteger(n));
  const pattern = decimal ? /^-?\d*\.?\d*$/ : /^-?\d*$/;

  const parsed = text.trim() === "" ? NaN : Number(text);
  const isValid =
    !Number.isNaN(parsed) &&
    isValidNumber(parsed) &&
    (min === undefined || parsed >= min) &&
    (max === undefined || parsed <= max);

  const commit = () => {
    setDirty(false);
    if (Number.isNaN(parsed) || !isValidNumber(parsed)) {
      setText(String(value));
      return;
    }
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    if (clamped !== value) onChange(clamped);
    setText(String(clamped));
  };

  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : min !== undefined && min >= 0 ? "numeric" : "text"}
      value={text}
      onChange={(event) => {
        const next = event.target.value;
        if (!pattern.test(next)) return;
        setDirty(true);
        setText(next);
        const n = Number(next);
        if (
          next.trim() !== "" &&
          isValidNumber(n) &&
          (min === undefined || n >= min) &&
          (max === undefined || n <= max)
        ) {
          onChange(n);
        }
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") (event.target as HTMLInputElement).blur();
      }}
      className={`input-focus ${className} ${!isValid ? "border-danger! text-danger!" : ""}`}
      {...rest}
    />
  );
}
