"use client";

import { useEffect, useState } from "react";
import { bestItalianName, useItalianSearchIndex } from "@/lib/fivetools/compendio-detail";
import { type CompendiumKind } from "@/lib/fivetools/data";
import { translateText, useTranslatedText } from "@/lib/fivetools/translate";

// Esportata per essere testabile in isolamento (vedi autocomplete.test.ts) senza dover montare
// l'intero componente (che tira in useItalianSearchIndex/next-auth). 0 = corrispondenza esatta,
// 1 = "inizia con", 2 = "contiene" — un nome comune come "Dagger" deve sempre battere una variante
// più lunga come "Dagger of Venom" quando entrambe combaciano con la stessa query.
export function matchScore(name: string, needle: string): number {
  const lower = name.toLowerCase();
  if (lower === needle) return 0;
  if (lower.startsWith(needle)) return 1;
  return 2;
}

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

  // Punteggio di rilevanza (0 = migliore): senza, un nome comune come "Dagger"/"Pugnale" resta
  // sempre fuori dagli 8 suggerimenti quando esistono decine di varianti magiche che lo contengono
  // come sottostringa (es. "Dagger of Venom", "Bracer of Flying Daggers") — bug reale segnalato
  // dall'utente ("se scrivo dagger/pugnale non mi trova il pugnale semplice"), identico sia in
  // italiano sia in inglese: non è la traduzione a fallire, è il taglio ai primi 8 risultati che
  // arriva PRIMA di raggiungere la voce comune nell'ordine grezzo del catalogo (oggetti magici
  // elencati per primi, oggetti comuni dopo, vedi loadInventoryItems). Corrispondenza esatta e
  // "inizia con" hanno sempre priorità su "contiene", a prescindere da quale campo (nome inglese,
  // query tradotta, nome italiano) ha prodotto il match.
  // null = nessuna corrispondenza su nessuno dei tre campi (nome inglese, query tradotta, nome
  // italiano) — l'opzione va scartata, non solo ordinata in fondo.
  function bestMatchScore(o: T): number | null {
    const italianName = bestItalianName(italianIndex, o.name, o.source);
    const scores = [
      o.name.toLowerCase().includes(query) ? matchScore(o.name, query) : null,
      translatedQuery && o.name.toLowerCase().includes(translatedQuery)
        ? matchScore(o.name, translatedQuery)
        : null,
      italianName && italianName.toLowerCase().includes(query) ? matchScore(italianName, query) : null,
    ].filter((s): s is number => s !== null);
    return scores.length > 0 ? Math.min(...scores) : null;
  }

  const suggestions =
    options && query.length >= 2
      ? Array.from(new Map(options.map((o) => [o.name, o])).values())
          .map((option) => ({ option, score: bestMatchScore(option) }))
          .filter((entry): entry is { option: T; score: number } => entry.score !== null)
          .sort((a, b) => a.score - b.score)
          .slice(0, 8)
          .map((entry) => entry.option)
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
  // Bug reale trovato dall'utente ("le scelte di classe funzionano solo in inglese"): per un
  // Autocomplete SENZA kind (infusioni dell'Artefice, scelte di classe — non sono una categoria a
  // sé del Compendio, vedi ClassChoicesSection) "translated" restava sempre null anche se
  // liveTranslated (che NON dipende da kind, vedi useTranslatedText sopra) aveva già una traduzione
  // dal vivo pronta — scartata inutilmente dal guard "kind ?" invece di essere usata come riserva.
  // bestItalianName tollera già un indice vuoto (kind assente = enabled=false su
  // useItalianSearchIndex, ritorna semplicemente null), nessun bisogno di quel guard.
  const translated = bestItalianName(italianIndex, option.name, option.source) ?? liveTranslated;
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

