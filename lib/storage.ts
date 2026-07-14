"use client";

import { useEffect, useState } from "react";
import { z } from "zod";

/**
 * Persistenza locale (localStorage) con validazione Zod.
 * I dati vivono sul dispositivo: niente account, niente server (per ora).
 */
export function useLocalCollection<T>(key: string, schema: z.ZodType<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = z.array(schema).safeParse(JSON.parse(raw));
        if (parsed.success) {
          setItems(parsed.data);
        }
      }
    } catch {
      // dati corrotti: si riparte da lista vuota senza bloccare l'app
    }
    setLoaded(true);
  }, [key, schema]);

  const persist = (next: T[]) => {
    setItems(next);
    window.localStorage.setItem(key, JSON.stringify(next));
  };

  return { items, persist, loaded };
}
