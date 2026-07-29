"use client";

import { useEffect, useState } from "react";

/**
 * Traduzione automatica via l'endpoint pubblico non ufficiale di Google Translate
 * (nessuna chiave, nessun costo). Qualità non garantita sulla terminologia D&D,
 * ma è l'unica opzione gratuita per tradurre l'intero compendio al volo.
 */
const CACHE_KEY = "questzip:translate-cache";
const CACHE_LIMIT = 1000;

// Google Translate legge questi come parole comuni ("rogue" = "briccone"), non come nomi
// ufficiali di classe D&D — corretti a mano prima ancora di guardare la cache, così un valore
// sbagliato già salvato in una sessione precedente non resta appiccicato per sempre. Elenco
// piccolo e fisso (le classi base + Artefice), stesso principio già usato altrove nel progetto
// per correggere singoli termini noti invece di affidarsi solo al traduttore automatico.
const KNOWN_EN_TO_IT: Record<string, string> = {
  barbarian: "Barbaro",
  bard: "Bardo",
  cleric: "Chierico",
  druid: "Druido",
  fighter: "Guerriero",
  rogue: "Ladro",
  wizard: "Mago",
  monk: "Monaco",
  paladin: "Paladino",
  ranger: "Ranger",
  sorcerer: "Stregone",
  warlock: "Warlock",
  artificer: "Artefice",
};

// Direzione IT->EN dello stesso elenco fisso sopra — serve per la ricerca nell'autocompletamento
// quando l'utente digita il nome della classe in italiano (es. "ladro" cerca "rogue"): Google
// Translate da solo può sbagliare termine (es. "ladro" -> "thief" invece di "rogue").
const KNOWN_IT_TO_EN: Record<string, string> = Object.fromEntries(
  Object.entries(KNOWN_EN_TO_IT).map(([en, it]) => [it.toLowerCase(), en]),
);

// Correzioni aggiuntive SOLO per la ricerca IT->EN nell'autocompletamento di Personaggi (armi,
// oggetti, incantesimi, background, talenti) — verificate una per una contro il catalogo reale
// 5etools (script throwaway, non nel repo) prima di aggiungerle, non indovinate. Coprono due tipi
// di errore di Google Translate: termini omografi in inglese (es. "spada"->"spade", il seme delle
// carte, invece di "sword") e terminologia D&D non letterale (es. "ragnatela"->"spiderweb" invece
// di "web", il nome ufficiale dell'incantesimo). Elenco piccolo e mirato ai termini più comuni,
// non un dizionario esaustivo per l'intero compendio (centinaia di incantesimi/oggetti restano
// sulla sola traduzione automatica — stessa scelta già presa altrove in questo progetto quando il
// costo di un dizionario a mano non è proporzionato alla cardinalità del set).
const KNOWN_IT_TO_EN_EXTRA: Record<string, string> = {
  // armi
  spada: "sword",
  spadone: "sword",
  accetta: "axe",
  maglio: "maul",
  roncone: "glaive",
  stiletto: "dagger",
  fioretto: "rapier",
  "arco lungo": "longbow",
  "arco corto": "shortbow",
  "piccone da guerra": "pick",
  // oggetti
  otre: "waterskin",
  scala: "ladder",
  manette: "manacles",
  grimaldello: "thieves",
  "pozione di guarigione": "potion of healing",
  // incantesimi
  "dardo di fuoco": "fire bolt",
  "cura ferite": "cure wounds",
  velocità: "haste",
  "tocco gelido": "chill touch",
  "individuazione del magico": "detect magic",
  "parola di guarigione": "healing word",
  "armatura magica": "mage armor",
  ragnatela: "web",
  "immobilizzare persone": "hold person",
  "passo velato": "misty step",
  "contro incantesimo": "counterspell",
  "porta dimensionale": "dimension door",
  "nube mefitica": "stinking cloud",
  // background
  "eroe del popolo": "folk hero",
  forestiero: "outlander",
  saggio: "sage",
  "artigiano di gilda": "guild artisan",
  monello: "urchin",
  // talenti
  atletico: "athlete",
  duro: "tough",
  "tiratore scelto": "sharpshooter",
  schermitore: "duelist",
  guardiano: "sentinel",
};

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

  if (source === "en" && target === "it") {
    const known = KNOWN_EN_TO_IT[trimmed.toLowerCase()];
    if (known) return known;
  }
  if (source === "it" && target === "en") {
    const known = KNOWN_IT_TO_EN[trimmed.toLowerCase()] ?? KNOWN_IT_TO_EN_EXTRA[trimmed.toLowerCase()];
    if (known) return known;
  }

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
