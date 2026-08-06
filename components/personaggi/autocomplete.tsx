"use client";

import { useEffect, useState } from "react";
import { useItalianSearchIndex, useTraduzioneIa } from "@/lib/fivetools/compendio-detail";
import { type CompendiumKind } from "@/lib/fivetools/data";
import { translateText, useTranslatedText } from "@/lib/fivetools/translate";

export function Autocomplete<T extends { name: string; source: string }>({
  value,
  onChange,
  loader,
  placeholder,
  inputClassName,
  kind,
}: {
  value: string;
  onChange: (value: string) => void;
  loader: () => Promise<T[]>;
  placeholder: string;
  inputClassName: string;
  // Assente per elenchi che non sono una categoria del Compendio a sé (es. le infusioni
  // dell'Artefice, vedi InfusionsSection) — in quel caso niente suggerimento in italiano, dato
  // che non esiste una mappa di traduzione ufficiale/IA da interrogare per quella categoria.
  kind?: CompendiumKind;
}) {
  const [options, setOptions] = useState<T[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    loader().then(setOptions);
  }, [loader]);

  const query = value.trim().toLowerCase();

  // Il catalogo (5etools) ha solo nomi inglesi — cercare "elfo"/"ladro" contro "elf"/"rogue" non
  // trova nulla. Traduciamo la query IT->EN (debounced, con cache su translateText) e la usiamo
  // come filtro aggiuntivo, così l'autocompletamento funziona anche digitando in italiano senza
  // dover tradurre centinaia di opzioni ad ogni tasto.
  const [itQuery, setItQuery] = useState<{ query: string; en: string } | null>(null);
  useEffect(() => {
    if (query.length < 2) return;
    const timer = setTimeout(() => {
      translateText(query, "it", "en").then((result) => {
        if (result) setItQuery({ query, en: result.trim().toLowerCase() });
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const translatedQuery = itQuery && itQuery.query === query && itQuery.en !== query ? itQuery.en : null;

  // Nome italiano reale (ufficiale o cache IA) per ciascuna opzione, quando disponibile — stesso
  // principio di app/compendio/page.tsx: la traduzione al volo della query sopra non sempre
  // combacia col nome ufficiale del manuale, quindi confrontiamo anche direttamente contro i
  // nomi italiani veri, non solo contro la resa live.
  const italianIndex = useItalianSearchIndex(kind ?? "incantesimi", !!kind);

  const suggestions =
    options && query.length >= 2
      ? Array.from(
          new Map(
            options
              .filter((o) => {
                if (o.name.toLowerCase().includes(query)) return true;
                if (translatedQuery && o.name.toLowerCase().includes(translatedQuery)) return true;
                const italianName = italianIndex.get(`${o.name}|${o.source}`);
                return !!italianName && italianName.toLowerCase().includes(query);
              })
              .map((o) => [o.name, o]),
          ).values(),
        ).slice(0, 8)
      : [];

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={inputClassName}
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-edge bg-surface-raised shadow-lg">
          {suggestions.map((option) => (
            <li key={`${option.source}-${option.name}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.name);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface transition-colors"
              >
                {option.name}
                {kind && <ItalianHint text={option.name} kind={kind} source={option.source} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ItalianHint({ text, kind, source }: { text: string; kind: CompendiumKind; source: string }) {
  const ia = useTraduzioneIa(kind, text, source, true);
  const liveTranslated = useTranslatedText(text, "en", "it");
  const translated = ia?.nomeIta ?? liveTranslated;
  if (!translated || translated.toLowerCase() === text.toLowerCase()) return null;
  return <span className="ml-2 text-xs text-muted">({translated})</span>;
}

