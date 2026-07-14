"use client";

import { useEffect, useState } from "react";

/**
 * Traduzione automatica via l'endpoint pubblico non ufficiale di Google Translate
 * (nessuna chiave, nessun costo). Qualità non garantita sulla terminologia D&D,
 * ma è l'unica opzione gratuita per tradurre l'intero compendio al volo.
 */
const CACHE_KEY = "questzip:translate-cache";
const CACHE_LIMIT = 1000;

let cache: Record<string, string> | null = null;

function loadCache(): Record<string, string> {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    cache = raw ? JSON.parse(raw) : {};
  } catch {
    cache = {};
  }
  return cache!;
}

function persistCache() {
  if (!cache || Object.keys(cache).length > CACHE_LIMIT) return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // localStorage pieno o non disponibile: la cache resta solo in memoria
  }
}

export async function translateText(
  text: string,
  source: "en" | "it",
  target: "en" | "it",
): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const store = loadCache();
  const key = `${source}>${target}:${trimmed}`;
  if (store[key]) return store[key];

  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(trimmed)}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    const segments: [string, string][] = data[0] ?? [];
    const translated = segments.map((segment) => segment[0]).join("");
    if (translated) {
      store[key] = translated;
      persistCache();
    }
    return translated || null;
  } catch {
    return null;
  }
}

export async function translateBatch(
  texts: string[],
  source: "en" | "it",
  target: "en" | "it",
): Promise<(string | null)[]> {
  return Promise.all(texts.map((text) => translateText(text, source, target)));
}

/** Traduce un singolo testo breve (es. un nome) e lo mantiene aggiornato al variare dell'input. */
export function useTranslatedText(
  text: string | undefined,
  source: "en" | "it" = "en",
  target: "en" | "it" = "it",
): string | null {
  const [translated, setTranslated] = useState<string | null>(null);

  useEffect(() => {
    if (!text) return;
    let cancelled = false;
    translateText(text, source, target).then((result) => {
      if (!cancelled) setTranslated(result);
    });
    return () => {
      cancelled = true;
    };
  }, [text, source, target]);

  return translated;
}
