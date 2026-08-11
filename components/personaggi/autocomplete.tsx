"use client";

import { useEffect, useState } from "react";
import { bestItalianName, useItalianSearchIndex } from "@/lib/fivetools/compendio-detail";
import { type CompendiumKind } from "@/lib/fivetools/data";
import { translateText, useTranslatedText } from "@/lib/fivetools/translate";

export function Autocomplete<T extends { name: string; source: string }>({
  value,
  onChange,
  onSelect,
  loader,
  placeholder,
  inputClassName,
  kind,
}: {
  value: string;
  onChange: (value: string) => void;
  // Chiamata SOLO quando l'utente sceglie un suggerimento dalla lista (non ad ogni tasto premuto
  // digitando a mano) — dà accesso alla voce intera del Compendio, non solo al nome, per chi
  // vuole derivarne altri campi in automatico (es. il dado danno di un incantesimo). Riceve anche
  // "nomeScelto": lo stesso testo (italiano se disponibile, altrimenti inglese) passato a
  // onChange nello STESSO click — se il chiamante deve impostare il nome anche dentro onSelect
  // (es. per farlo nello stesso aggiornamento di stato di un altro campo derivato, come il dado
  // danno), va sempre usato "nomeScelto" e MAI "option.name" (quello resta sempre inglese, la
  // chiave stabile del Compendio, non ciò che l'utente deve vedere in un campo dell'app). Nota
  // architetturale: onChange(nomeScelto) e onSelect(option, nomeScelto) vengono chiamati IN
  // SEQUENZA SINCRONA nello stesso click — se il chiamante aggiorna uno stato con un "map" che
  // parte dalla stessa istantanea (non un updater funzionale), la seconda chiamata sovrascrive
  // per intero il risultato della prima: bug reale trovato e corretto negli incantesimi
  // (weapons-spells.tsx), il campo restava bloccato sul testo digitato invece del nome scelto.
  onSelect?: (option: T, nomeScelto: string) => void;
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
                const italianName = bestItalianName(italianIndex, o.name, o.source);
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
              <SuggestionButton
                option={option}
                kind={kind}
                onChange={onChange}
                onSelect={onSelect}
                onPicked={() => setOpen(false)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// L'italiano è la lingua predefinita di TUTTA l'app (non solo del Compendio, non solo la
// visualizzazione): il testo che finisce nel campo alla selezione è l'ITALIANO quando disponibile
// (ufficiale > cache IA > traduzione dal vivo), l'inglese solo come riserva — non più il
// contrario. Segnalato esplicitamente dall'utente ("quando clicco l'autocompletamento mi mette
// gli oggetti in inglese"): una scelta precedente teneva di proposito l'inglese come valore
// salvato (chiave stabile per il resto della ricerca/abbinamento) — l'utente ha chiarito di
// volere comunque l'italiano nel campo, e il resto dell'app (Verifica, menzioni, precompilazione
// dado danno) risolve già i nomi digitati in ENTRAMBE le lingue tramite ricerca fuzzy
// (findCompendioMatch/bestItalianName), quindi il campo può mostrare l'italiano senza rompere
// nient'altro. Un solo componente (non più uno split fra bottone-contenitore e label interna)
// così il nome MOSTRATO e quello effettivamente SCELTO sono garantiti identici per costruzione.
function SuggestionButton<T extends { name: string; source: string }>({
  option,
  kind,
  onChange,
  onSelect,
  onPicked,
}: {
  option: T;
  kind: CompendiumKind | undefined;
  onChange: (value: string) => void;
  onSelect?: (option: T, nomeScelto: string) => void;
  onPicked: () => void;
}) {
  const italianIndex = useItalianSearchIndex(kind ?? "incantesimi", !!kind);
  const liveTranslated = useTranslatedText(option.name, "en", "it");
  const translated = kind ? (bestItalianName(italianIndex, option.name, option.source) ?? liveTranslated) : null;
  const hasItalian = !!translated && translated.toLowerCase() !== option.name.toLowerCase();
  const primaryName = hasItalian ? translated! : option.name;

  return (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        onChange(primaryName);
        onSelect?.(option, primaryName);
        onPicked();
      }}
      className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface transition-colors"
    >
      {primaryName}
      {hasItalian && (
        <>
          {" "}
          <span className="text-xs text-muted">({option.name})</span>
        </>
      )}
    </button>
  );
}

