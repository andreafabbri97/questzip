"use client";

import { useEffect, useState } from "react";
import { IntField } from "@/components/int-field";
import {
  ABILITIES,
  ABILITY_LABELS,
  abilityModifier,
  canonicalClassName,
  feetToMeters,
  formatModifier,
  levelForXp,
  totalLevel,
  xpForNextLevel,
  type Ability,
  type Character,
  type ClassEntry,
} from "@/lib/dnd";
import {
  loadBackgrounds,
  loadClassData,
  loadFeats,
  loadRaces,
  resolveClassFeatures,
  resolveSubclassFeatures,
  type RawBackground,
  type RawRace,
  type RawSubclass,
} from "@/lib/fivetools/data";
import {
  bestItalianName,
  DualName,
  EntriesBlock,
  findUfficiale,
  loadRazzeIta,
  parseIaClassText,
  parseIaRaceText,
  useItalianSearchIndex,
  useTraduzioneIa,
} from "@/lib/fivetools/compendio-detail";
import type { FiveEntry } from "@/lib/fivetools/entries";
import { formatSubclassTitle } from "@/lib/fivetools/format";
import { Autocomplete } from "./autocomplete";
import { loadClassNames, rollDie } from "./helpers";
import { SimpleEntryModal, type SimpleEntryData } from "./simple-entry-modal";

export function ClassRow({
  entry,
  isPrimary,
  onChange,
  onRemove,
  canRemove,
}: {
  entry: ClassEntry;
  isPrimary: boolean;
  onChange: (entry: ClassEntry) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const rowInputClass =
    "input-focus mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground";

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <span className="text-[10px] uppercase tracking-widest text-muted">
            {isPrimary ? "Classe di origine" : "Classe"}
          </span>
          <Autocomplete
            value={entry.nome}
            onChange={(nome) => onChange({ ...entry, nome, sottoclasse: undefined })}
            loader={loadClassNames}
            placeholder="Fighter, Wizard…"
            inputClassName={rowInputClass}
            kind="classi"
          />
          <ClassNameWarning name={entry.nome} />
        </div>
        <label className="block w-16 shrink-0">
          <span className="text-[10px] uppercase tracking-widest text-muted">Livello</span>
          <IntField
            min={1}
            max={20}
            value={entry.livello}
            onChange={(livello) => onChange({ ...entry, livello })}
            className={`${rowInputClass} text-center`}
          />
        </label>
        {canRemove && (
          <button
            onClick={onRemove}
            className="text-muted hover:text-danger text-lg pb-1.5 shrink-0"
            aria-label="Rimuovi classe"
          >
            ×
          </button>
        )}
      </div>

      {entry.nome.trim() && (
        <ClassSubclassPicker
          key={entry.nome.trim().toLowerCase()}
          className={entry.nome}
          value={entry.sottoclasse}
          onChange={(sottoclasse) => onChange({ ...entry, sottoclasse })}
          inputClassName={rowInputClass}
        />
      )}

      {entry.sottoclasse && (
        <SubclassFeaturesToggle
          key={entry.sottoclasse}
          subclassName={entry.sottoclasse}
          className={entry.nome}
        />
      )}
    </div>
  );
}

function ClassNameWarning({ name }: { name: string }) {
  const [names, setNames] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadClassNames().then((classes) => {
      if (!cancelled) setNames(classes.map((c) => c.name));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = name.trim();
  if (!trimmed || !names) return null;
  const canonical = canonicalClassName(trimmed).toLowerCase();
  if (names.some((n) => n.toLowerCase() === canonical)) return null;

  return (
    <p className="text-[10px] text-accent mt-1">
      ⚠️ Classe non riconosciuta dal Compendio: scegli un nome dai suggerimenti per avere slot
      incantesimi, privilegi e calcoli automatici collegati.
    </p>
  );
}

function ClassSubclassPicker({
  className,
  value,
  onChange,
  inputClassName,
}: {
  className: string;
  value: string | undefined;
  onChange: (subclass: string | undefined) => void;
  inputClassName: string;
}) {
  const [subclasses, setSubclasses] = useState<RawSubclass[] | null>(null);
  const [title, setTitle] = useState("Sottoclasse");
  // <option> non può contenere componenti come DualName (solo testo semplice) — l'indice va
  // quindi caricato qui e interrogato a mano per ciascuna voce, stesso principio "italiano prima,
  // inglese tra parentesi" del resto dell'app. Prima le opzioni mostravano SOLO il nome inglese
  // ("The Archfey"), mai una parola in italiano — segnalato dall'utente.
  const italianIndex = useItalianSearchIndex("classi", true);

  useEffect(() => {
    const name = canonicalClassName(className).toLowerCase();
    if (!name) return;
    let cancelled = false;
    loadClassData().then((data) => {
      if (cancelled) return;
      const cls = data.classes.find((c) => c.name.toLowerCase() === name);
      if (!cls) return;
      setTitle(formatSubclassTitle(cls.subclassTitle));
      const names = new Set<string>();
      const matches = data.subclasses.filter(
        (s) => s.className === cls.name && s.classSource === cls.source,
      );
      setSubclasses(matches.filter((s) => (names.has(s.name) ? false : (names.add(s.name), true))));
    });
    return () => {
      cancelled = true;
    };
  }, [className]);

  if (!subclasses || subclasses.length === 0) return null;

  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-muted">{title}</span>
      <select
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={inputClassName}
      >
        <option value="">— nessuna —</option>
        {subclasses.map((s) => {
          const italiano = bestItalianName(italianIndex, s.name, s.source);
          return (
            <option key={s.name} value={s.name}>
              {italiano && italiano.toLowerCase() !== s.name.toLowerCase()
                ? `${italiano} (${s.name})`
                : s.name}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function SubclassFeaturesToggle({
  subclassName,
  className,
}: {
  subclassName: string;
  className: string;
}) {
  const [showFeatures, setShowFeatures] = useState(false);
  const [subclassSource, setSubclassSource] = useState<string | null>(null);
  const [features, setFeatures] = useState<
    { name: string; level: number; entries: import("@/lib/fivetools/entries").FiveEntry[] }[] | null
  >(null);
  const ia = useTraduzioneIa("classi", subclassName, subclassSource ?? "", !!subclassSource);
  const iaFeatures = ia?.descrizioneIta ? parseIaClassText(ia.descrizioneIta) : null;

  useEffect(() => {
    let cancelled = false;
    loadClassData().then((data) => {
      if (cancelled) return;
      const subclass = data.subclasses.find(
        (s) => s.name === subclassName && s.className.toLowerCase() === canonicalClassName(className).toLowerCase(),
      );
      if (!subclass) return;
      setFeatures(resolveSubclassFeatures(data, subclass));
      setSubclassSource(subclass.source);
    });
    return () => {
      cancelled = true;
    };
  }, [subclassName, className]);

  return (
    <div>
      <button
        onClick={() => setShowFeatures((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {/* kind+source qui abilita la priorità sulla cache IA (vedi DualName); ricade sulla
            traduzione live se la sottoclasse non è ancora stata tradotta. */}
        {showFeatures ? "Nascondi" : "Come funziona"}{" "}
        {subclassSource ? (
          <DualName text={subclassName} kind="classi" source={subclassSource} inline />
        ) : (
          subclassName
        )}
      </button>
      {showFeatures && (
        <div className="mt-2 space-y-3 border-t border-edge pt-3">
          {!features && <p className="text-sm text-muted">Caricamento…</p>}
          {iaFeatures
            ? iaFeatures.map((feature, index) => (
                <div
                  key={`${feature.name}-${feature.level}-${index}`}
                  className="rounded-lg border border-edge bg-surface p-3"
                >
                  <p className="text-sm font-bold text-foreground mb-1.5">
                    {feature.name}{" "}
                    <span className="text-xs font-normal text-muted">(liv. {feature.level})</span>
                  </p>
                  <p className="text-sm text-foreground leading-relaxed">{feature.text}</p>
                </div>
              ))
            : features?.map((feature) => (
                <div
                  key={`${feature.name}-${feature.level}`}
                  className="rounded-lg border border-edge bg-surface p-3"
                >
                  <p className="text-sm font-bold text-foreground mb-1.5">
                    <DualName text={feature.name} inline />{" "}
                    <span className="text-xs font-normal text-muted">(liv. {feature.level})</span>
                  </p>
                  <EntriesBlock entries={feature.entries} language="it" />
                </div>
              ))}
        </div>
      )}
    </div>
  );
}

export function ClassFeaturesSection({ character }: { character: Character }) {
  if (character.classi.length === 0) return null;
  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <h2 className="text-sm uppercase tracking-widest text-muted">Privilegi di classe</h2>
      {character.classi.map((entry, index) => (
        <ClassFeaturesToggle key={`${entry.nome}-${index}`} classEntry={entry} />
      ))}
    </section>
  );
}

type LeveledFeature = {
  name: string;
  level: number;
  entries: import("@/lib/fivetools/entries").FiveEntry[];
  // Fonte della classe o della sottoclasse a cui appartiene: serve a cercare il nome ufficiale/IA
  // corretto (DualName) per QUESTA specifica feature, non solo per la classe nel suo insieme.
  source: string;
  // Se la feature viene dalla classe base o dalla sottoclasse — serve ad abbinare il testo IA
  // giusto (vedi sotto): mischiare le due code in un solo elenco per livello faceva sì che una
  // feature di sottoclasse "rubasse" la traduzione destinata a una feature della classe base
  // (o viceversa) quando i conteggi per livello delle due fonti non coincidevano — osservato con
  // "Draconic Bloodline" dello Stregone, che compare (per un motivo dei dati 5etools) sia come
  // feature di sottoclasse al 1° livello sia di nuovo al 3°, senza una riga IA corrispondente.
  origin: "class" | "subclass";
};

function ClassFeaturesToggle({ classEntry }: { classEntry: ClassEntry }) {
  const [showFeatures, setShowFeatures] = useState(false);
  const [selected, setSelected] = useState<SimpleEntryData | null>(null);
  const [classSource, setClassSource] = useState<string | null>(null);
  const [subclassSource, setSubclassSource] = useState<string | null>(null);
  const [features, setFeatures] = useState<LeveledFeature[] | null>(null);

  // Testo ufficiale/IA per classe e sottoclasse (priorità sulla traduzione dal vivo, stesso
  // principio di ClassDetail in compendio-detail.tsx). Il nome nel testo IA è già in ITALIANO
  // (es. "Ispirazione Bardica"), quindi non si può far combaciare con quello inglese di
  // resolveClassFeatures per nome — si abbina per livello, prendendo le righe IA di quel livello
  // nello stesso ordine in cui compaiono le feature inglesi a quel livello. Due code SEPARATE
  // (classe/sottoclasse, mai mescolate): la classe base e la sottoclasse hanno ciascuna il proprio
  // testo IA generato indipendentemente, quindi solo l'ordine ALL'INTERNO della stessa fonte è
  // garantito coerente — mischiarle in un solo elenco per livello ha causato un abbinamento
  // sbagliato reale (vedi nota su LeveledFeature.origin).
  const classIa = useTraduzioneIa("classi", classEntry.nome, classSource ?? "", !!classSource);
  const subclassIa = useTraduzioneIa(
    "classi",
    classEntry.sottoclasse ?? "",
    subclassSource ?? "",
    !!(classEntry.sottoclasse && subclassSource),
  );
  const buildQueueByLevel = (text: string | null | undefined) => {
    const map = new Map<number, { name: string; text: string }[]>();
    for (const f of text ? parseIaClassText(text) : []) {
      const items = map.get(f.level) ?? [];
      items.push({ name: f.name, text: f.text });
      map.set(f.level, items);
    }
    return map;
  };
  const classIaByLevel = buildQueueByLevel(classIa?.descrizioneIta);
  const subclassIaByLevel = buildQueueByLevel(subclassIa?.descrizioneIta);

  useEffect(() => {
    let cancelled = false;
    loadClassData().then((data) => {
      if (cancelled) return;
      const cls = data.classes.find(
        (c) => c.name.toLowerCase() === canonicalClassName(classEntry.nome).toLowerCase(),
      );
      if (!cls) return;
      setClassSource(cls.source);
      // Solo i privilegi FINO al livello attuale del personaggio in questa classe — prima
      // mostrava sempre l'intera classe (1-20), un semplice copia-incolla del Compendio senza
      // rapporto col personaggio reale (segnalato dall'utente).
      const classFeatures: LeveledFeature[] = resolveClassFeatures(data, cls)
        .filter((f) => f.level <= classEntry.livello)
        .map((f) => ({ name: f.name, level: f.level, entries: f.entries, source: f.classSource, origin: "class" }));

      let subclassFeatures: LeveledFeature[] = [];
      const subclassName = classEntry.sottoclasse?.trim();
      if (subclassName) {
        const subclass = data.subclasses.find(
          (s) => s.name === subclassName && s.className.toLowerCase() === canonicalClassName(classEntry.nome).toLowerCase(),
        );
        if (subclass) {
          setSubclassSource(subclass.source);
          subclassFeatures = resolveSubclassFeatures(data, subclass)
            .filter((f) => f.level <= classEntry.livello)
            .map((f) => ({ name: f.name, level: f.level, entries: f.entries, source: f.subclassSource, origin: "subclass" }));
        }
      }

      setFeatures([...classFeatures, ...subclassFeatures].sort((a, b) => a.level - b.level));
    });
    return () => {
      cancelled = true;
    };
  }, [classEntry.nome, classEntry.sottoclasse, classEntry.livello]);

  return (
    <div>
      <button
        onClick={() => setShowFeatures((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {/* Le 12 classi base del Manuale del Giocatore hanno un nome ufficiale in
            compendio_traduzione_ia/compendio_ita_classe — kind+source qui abilita quella
            priorità (vedi DualName); le altre classi ricadono comunque sulla traduzione live. */}
        {showFeatures ? "Nascondi" : "Come funziona"}{" "}
        {classSource ? <DualName text={classEntry.nome} kind="classi" source={classSource} inline /> : classEntry.nome}
        {classEntry.sottoclasse && ` (${classEntry.sottoclasse})`}
      </button>
      {showFeatures && (
        <div className="mt-2 space-y-1 border-t border-edge pt-2">
          {!features && <p className="text-sm text-muted">Caricamento…</p>}
          {features?.length === 0 && (
            <p className="text-sm text-muted">Nessun privilegio ancora a questo livello.</p>
          )}
          {/* Elenco compatto, come gli incantesimi conosciuti: una riga per privilegio invece del
              testo intero sempre visibile — il dettaglio si apre in un modal al click. */}
          {features?.map((feature, index) => {
            const queueByLevel = feature.origin === "class" ? classIaByLevel : subclassIaByLevel;
            const ia = queueByLevel.get(feature.level)?.shift();
            return (
              <button
                key={`${feature.name}-${feature.level}-${index}`}
                onClick={() =>
                  setSelected({
                    title: feature.name,
                    meta: `Liv. ${feature.level}`,
                    entries: feature.entries,
                    textIt: ia ? [ia.text] : undefined,
                  })
                }
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-left text-sm hover:border-accent/50 transition-colors"
              >
                <span className="text-foreground truncate">
                  <DualName text={feature.name} kind="classi" source={feature.source} inline />
                </span>
                <span className="text-xs text-muted shrink-0">Liv. {feature.level}</span>
              </button>
            );
          })}
        </div>
      )}
      <SimpleEntryModal data={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

// Visione al buio, per la luce dinamica "realistica" della mappa dungeon (vedi Fase D/E in
// Campagne). Un solo numero (in metri, suggerito dalla scurovisione della razza nel Compendio,
// RawRace.darkvision in piedi — convertito come "Velocità" — ma sempre modificabile a mano) più
// due spunte indipendenti: "Scurovisione" decide se quel numero si applica davvero al buio
// (spento di default: avere il dato compilato non basta, per poterlo tenere pronto anche su un
// personaggio che per qualche motivo non ce l'ha), "Vede in oscurità magica" per chi la vede
// anche dove la scurovisione normale non arriva (es. Vista Infernale del Warlock) — oggi solo un
// dato di scheda, la mappa non modella ancora zone di oscurità magica a sé.
export function VisionField({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const [race, setRace] = useState<RawRace | null | undefined>(undefined);
  // Reset durante il render (non nell'effetto sotto) quando cambia la razza — stesso pattern già
  // consolidato in questo progetto per evitare un giro di setState sincrono dentro un effetto.
  const [loadedFor, setLoadedFor] = useState(character.razza);
  if (character.razza !== loadedFor) {
    setLoadedFor(character.razza);
    setRace(undefined);
  }

  useEffect(() => {
    const name = character.razza.trim();
    if (!name) return;
    let cancelled = false;
    loadRaces().then((races) => {
      if (!cancelled) setRace(races.find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [character.razza]);

  const suggested = race?.darkvision ? feetToMeters(race.darkvision) : null;

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <label className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-muted whitespace-nowrap">
            Visione (m)
          </span>
          <IntField
            min={0}
            value={character.visioneRadius}
            onChange={(value) => onChange({ ...character, visioneRadius: value })}
            className="w-16 rounded-md border border-edge bg-surface-raised px-2 py-1 text-sm text-foreground text-center"
          />
        </label>
        {suggested !== null && suggested !== character.visioneRadius && (
          <button
            onClick={() => onChange({ ...character, visioneRadius: suggested })}
            className="text-xs font-bold text-accent-strong hover:underline"
          >
            Suggerisci da razza ({suggested} m)
          </button>
        )}
      </div>
      <div className="flex items-center gap-4 text-sm text-foreground">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={character.scurovisione}
            onChange={(event) => onChange({ ...character, scurovisione: event.target.checked })}
          />
          Scurovisione
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={character.vedeOscuritaMagica}
            onChange={(event) => onChange({ ...character, vedeOscuritaMagica: event.target.checked })}
          />
          Vede in oscurità magica
        </label>
      </div>
    </div>
  );
}

type NamedTrait = { name: string; textIt?: string[]; entries: FiveEntry[] };

export function RaceTraits({ razza }: { razza: string }) {
  const [showTraits, setShowTraits] = useState(false);
  const [selected, setSelected] = useState<SimpleEntryData | null>(null);
  const [race, setRace] = useState<RawRace | null | undefined>(undefined);
  const [itaRazze, setItaRazze] = useState<Awaited<ReturnType<typeof loadRazzeIta>> | null>(null);

  useEffect(() => {
    const raw = razza.trim();
    if (!raw) return;
    // Un'annotazione personale tra parentesi (es. "Rinato (ex umano)", per ricordarsi la razza di
    // partenza prima di un lignaggio come Rinato/Sangue Strigo) non fa parte del nome della razza
    // — va staccata prima di cercare un match, altrimenti nessuna razza reale combacia mai.
    // Segnalato dall'utente: "Rinato" è un lignaggio VERO (Van Richten's Guide to Ravenloft),
    // non homebrew — "ex umano" era solo la sua nota personale sulla razza di partenza.
    const cleaned = raw.replace(/\s*\([^)]*\)\s*$/, "").trim() || raw;
    let cancelled = false;
    Promise.all([loadRaces(), loadRazzeIta()]).then(([races, itaRazze]) => {
      if (cancelled) return;
      const byEnglishName = (name: string) =>
        races.filter((r) => r.name.toLowerCase() === name.toLowerCase());
      // Alcune fonti (es. "LFL") ridefiniscono una razza già esistente altrove via "_copy" senza
      // portare con sé i tratti veri (entries mancante) — .find() da solo può pescare quella
      // invece della fonte "piena", mostrando zero privilegi per una razza che invece ne ha. E
      // quando PIÙ fonti hanno entrambe contenuto reale (es. "Reborn" esiste sia come VRGR sia
      // come ristampa RHW), va preferita quella per cui esiste testo ufficiale italiano collegato
      // — altrimenti si rischia di agganciare la fonte "gemella" senza traduzione invece di
      // quella con la traduzione vera già pronta (visto proprio con Reborn/VRGR vs Reborn/RHW).
      const bestOf = (matches: RawRace[]) => {
        const withEntries = matches.filter((r) => Array.isArray(r.entries) && r.entries.length > 0);
        const withUfficiale = withEntries.find((r) =>
          itaRazze.some((u) => u.nomeInglese === r.name && u.fonteInglese === r.source),
        );
        return withUfficiale ?? withEntries[0] ?? matches[0] ?? null;
      };

      let matches = byEnglishName(raw);
      if (matches.length === 0) matches = byEnglishName(cleaned);
      if (matches.length === 0) {
        // Il testo scritto potrebbe essere il nome ufficiale ITALIANO (es. "Rinato") invece di
        // quello inglese usato dall'autocompletamento (es. "Reborn") — risali alla voce inglese
        // tramite il collegamento nomeInglese della riga ufficiale.
        const officialMatch = itaRazze.find(
          (r) => r.nomeInglese && r.nome.toLowerCase() === cleaned.toLowerCase(),
        );
        if (officialMatch?.nomeInglese) matches = byEnglishName(officialMatch.nomeInglese);
      }
      setRace(bestOf(matches));
    });
    return () => {
      cancelled = true;
    };
  }, [razza]);

  useEffect(() => {
    let cancelled = false;
    loadRazzeIta().then((data) => {
      if (!cancelled) setItaRazze(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ia = useTraduzioneIa("razze", race?.name ?? "", race?.source ?? "", !!race);

  if (!razza.trim()) return null;

  if (race === null) {
    return (
      <section className="card-elevated rounded-xl border border-edge bg-surface p-5">
        <h2 className="text-sm uppercase tracking-widest text-muted mb-1">Privilegi di razza</h2>
        <p className="text-sm text-muted">
          &ldquo;{razza}&rdquo; non è stata trovata nel Compendio (razza personalizzata o non
          ancora tradotta): nessun privilegio automatico da mostrare qui, aggiungili a mano tra i
          Talenti se vuoi tenerne traccia.
        </p>
      </section>
    );
  }

  const ufficiale =
    itaRazze && race ? findUfficiale(itaRazze, ia?.nomeIta ?? null, race.name, race.source) : null;

  const traits: NamedTrait[] = [];
  if (ufficiale) {
    for (const tratto of ufficiale.tratti) {
      traits.push({ name: tratto.nome, textIt: [tratto.testo], entries: [] });
    }
    for (const sottorazza of ufficiale.sottorazze) {
      for (const tratto of sottorazza.tratti) {
        traits.push({ name: `${tratto.nome} (${sottorazza.nome})`, textIt: [tratto.testo], entries: [] });
      }
    }
  } else if (ia?.descrizioneIta) {
    for (const tratto of parseIaRaceText(ia.descrizioneIta)) {
      traits.push({ name: tratto.name, textIt: [tratto.text], entries: [] });
    }
  } else if (race) {
    // "entries" è dichiarato non-opzionale nel tipo RawRace ma i dati grezzi di 5etools non sono
    // validati a runtime: alcune razze (specie sottorazze/varianti) arrivano davvero senza questo
    // campo — scoperto proprio su "Elf"/PHB durante un render transitorio (prima che testo
    // ufficiale/IA finissero di caricare), mandava in crash l'intero componente.
    for (const entry of race.entries ?? []) {
      if (typeof entry !== "string" && entry.name) {
        const inner = entry.entries ?? (entry.entry ? [entry.entry] : []);
        traits.push({ name: entry.name, entries: inner });
      }
    }
  }

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5">
      <button
        onClick={() => setShowTraits((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {showTraits ? "Nascondi" : "Come funziona"}{" "}
        {race ? <DualName text={race.name} kind="razze" source={race.source} inline /> : razza}
      </button>
      {showTraits && (
        <div className="mt-3 space-y-1 border-t border-edge pt-3">
          {!race && <p className="text-sm text-muted">Caricamento…</p>}
          {race && traits.length === 0 && (
            <p className="text-sm text-muted">Nessun privilegio disponibile.</p>
          )}
          {traits.map((trait, index) => (
            <button
              key={`${trait.name}-${index}`}
              onClick={() => setSelected({ title: trait.name, entries: trait.entries, textIt: trait.textIt })}
              className="flex w-full items-center gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-left text-sm hover:border-accent/50 transition-colors"
            >
              <span className="text-foreground truncate">{trait.name}</span>
            </button>
          ))}
        </div>
      )}
      <SimpleEntryModal data={selected} onClose={() => setSelected(null)} />
    </section>
  );
}

export function BackgroundTraits({ background }: { background: string }) {
  const [showTraits, setShowTraits] = useState(false);
  const [data, setData] = useState<RawBackground | null | undefined>(undefined);

  useEffect(() => {
    const name = background.trim();
    if (!name) return;
    let cancelled = false;
    loadBackgrounds().then((backgrounds) => {
      if (cancelled) return;
      setData(backgrounds.find((b) => b.name.toLowerCase() === name.toLowerCase()) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [background]);

  // I background non hanno testo ufficiale estratto dai manuali (nessuna tabella compendio_ita_*
  // per questa categoria) — solo cache IA o traduzione dal vivo, stessa priorità del resto del file.
  const ia = useTraduzioneIa("background", data?.name ?? "", data?.source ?? "", !!data);

  if (!background.trim() || data === null) return null;

  return (
    <div>
      <button
        onClick={() => setShowTraits((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {showTraits ? "Nascondi" : "Come funziona"}{" "}
        {data ? <DualName text={data.name} kind="background" source={data.source} inline /> : background}
      </button>
      {showTraits && (
        <div className="mt-2 space-y-2 border-t border-edge pt-3">
          {!data && <p className="text-sm text-muted">Caricamento…</p>}
          {data &&
            (ia?.descrizioneIta ? (
              ia.descrizioneIta
                .split("\n")
                .filter((line) => line.trim())
                .map((line, index) => (
                  <p key={index} className="text-sm text-foreground leading-relaxed">
                    {line}
                  </p>
                ))
            ) : (
              <EntriesBlock entries={data.entries} language="it" />
            ))}
        </div>
      )}
    </div>
  );
}

export function XpTracker({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const level = totalLevel(character.classi);
  const next = xpForNextLevel(level);
  const derivedLevel = levelForXp(character.esperienza);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <label className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted">XP</span>
        <IntField
          min={0}
          max={999999}
          value={character.esperienza}
          onChange={(esperienza) => onChange({ ...character, esperienza })}
          className="w-24 rounded-md border border-edge bg-surface px-2 py-1 text-sm text-foreground"
        />
      </label>
      <p className="text-xs text-muted">
        {next === null
          ? "Livello massimo raggiunto."
          : `Prossimo livello a ${next.toLocaleString("it-IT")} XP.`}
      </p>
      {derivedLevel !== level && (
        <p className="text-xs font-bold text-accent-strong">
          ⚠️ Gli XP corrispondono al livello {derivedLevel}, le classi sommano al livello {level} —
          aggiorna il livello di classe quando sali.
        </p>
      )}
    </div>
  );
}

const ASI_LEVELS = [4, 8, 12, 16, 19];

export function LevelUpWizard({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const [open, setOpen] = useState(false);
  const [classIndex, setClassIndex] = useState(0);
  const [features, setFeatures] = useState<
    { name: string; level: number; entries: import("@/lib/fivetools/entries").FiveEntry[] }[] | null
  >(null);
  const [classSource, setClassSource] = useState<string | null>(null);
  const [hitDieFaces, setHitDieFaces] = useState<number | null>(null);
  const [hpGain, setHpGain] = useState<number | null>(null);
  const [asiMode, setAsiMode] = useState<"plus2" | "plus1x2" | "talento">("plus2");
  const [asiAbilities, setAsiAbilities] = useState<Ability[]>([]);
  const [asiFeat, setAsiFeat] = useState("");

  const level = totalLevel(character.classi);
  const derivedLevel = levelForXp(character.esperienza);
  const canLevelUp = derivedLevel > level;

  const targetClass = character.classi[classIndex];
  const newLevel = targetClass ? targetClass.livello + 1 : 1;
  const isAsiLevel = ASI_LEVELS.includes(newLevel);
  const conModifier = abilityModifier(character.caratteristiche.costituzione);
  const averageHp = hitDieFaces ? Math.max(1, Math.floor(hitDieFaces / 2) + 1 + conModifier) : null;
  const displayedHpGain = hpGain ?? averageHp ?? 0;
  const ia = useTraduzioneIa("classi", targetClass?.nome ?? "", classSource ?? "", !!classSource);
  const iaFeatures = ia?.descrizioneIta
    ? parseIaClassText(ia.descrizioneIta).filter((f) => f.level === newLevel)
    : null;

  // il dado vita dipende dalla classe scelta nel dropdown (multiclasse): se il PG cambia classe
  // a metà wizard un tiro già fatto per il dado vita precedente (es. d8) resterebbe appiccicato
  // e verrebbe applicato come se fosse un tiro valido sul dado nuovo (es. d6).
  const [hpGainClassIndex, setHpGainClassIndex] = useState(classIndex);
  if (classIndex !== hpGainClassIndex) {
    setHpGainClassIndex(classIndex);
    setHpGain(null);
  }

  useEffect(() => {
    if (!open || !targetClass) return;
    let cancelled = false;
    loadClassData().then((data) => {
      if (cancelled) return;
      const cls = data.classes.find((c) => c.name.toLowerCase() === canonicalClassName(targetClass.nome).toLowerCase());
      if (!cls) {
        setFeatures([]);
        setHitDieFaces(null);
        setClassSource(null);
        return;
      }
      setFeatures(resolveClassFeatures(data, cls).filter((f) => f.level === newLevel));
      setHitDieFaces(cls.hd?.faces ?? null);
      setClassSource(cls.source);
    });
    return () => {
      cancelled = true;
    };
  }, [open, targetClass, newLevel]);

  if (!canLevelUp && !open) return null;

  const chooseAsiMode = (mode: typeof asiMode) => {
    setAsiMode(mode);
    setAsiAbilities([]);
  };

  const toggleAsiAbility = (ability: Ability) => {
    setAsiAbilities((prev) => {
      if (prev.includes(ability)) return prev.filter((a) => a !== ability);
      if (asiMode === "plus1x2") return prev.length >= 2 ? [...prev.slice(1), ability] : [...prev, ability];
      return [ability];
    });
  };

  const rollHitDie = () => {
    if (!hitDieFaces) return;
    setHpGain(Math.max(1, rollDie(hitDieFaces) + conModifier));
  };

  const confirm = () => {
    if (!targetClass) return;
    let caratteristiche = character.caratteristiche;
    let talenti = character.talenti;
    if (isAsiLevel) {
      if (asiMode === "talento" && asiFeat.trim()) {
        talenti = [...talenti, { id: crypto.randomUUID(), nome: asiFeat.trim() }];
      } else if (asiMode !== "talento" && asiAbilities.length > 0) {
        const bump = asiMode === "plus2" ? 2 : 1;
        caratteristiche = { ...caratteristiche };
        for (const ability of asiAbilities) {
          caratteristiche[ability] = Math.min(20, caratteristiche[ability] + bump);
        }
      }
    }
    onChange({
      ...character,
      classi: character.classi.map((c, i) => (i === classIndex ? { ...c, livello: newLevel } : c)),
      hpMax: character.hpMax + displayedHpGain,
      hpAttuali: character.hpAttuali + displayedHpGain,
      caratteristiche,
      talenti,
    });
    setOpen(false);
    setFeatures(null);
    setHitDieFaces(null);
    setHpGain(null);
    setAsiAbilities([]);
    setAsiFeat("");
  };

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          🎉 Sali di livello!
        </button>
      ) : (
        <div className="mt-2 space-y-3 rounded-lg border border-accent-strong bg-surface-raised p-3">
          <p className="text-sm font-bold text-foreground">Sali di livello!</p>
          {character.classi.length > 1 && (
            <label className="block">
              <span className="text-[10px] uppercase tracking-widest text-muted">Classe che sale</span>
              <select
                value={classIndex}
                onChange={(event) => setClassIndex(Number(event.target.value))}
                className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
              >
                {character.classi.map((c, i) => (
                  <option key={i} value={i}>
                    {c.nome || `Classe ${i + 1}`} (liv. {c.livello} → {c.livello + 1})
                  </option>
                ))}
              </select>
            </label>
          )}
          {targetClass && (
            <p className="text-sm text-muted">
              {targetClass.nome || "Questa classe"} passa da livello {targetClass.livello} a{" "}
              <span className="font-bold text-accent-strong">{newLevel}</span>.
            </p>
          )}
          <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted">Punti ferita guadagnati</p>
            {hitDieFaces ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={rollHitDie}
                    className="rounded-lg border border-edge px-2.5 py-1 text-xs font-bold text-foreground hover:border-accent transition-colors"
                  >
                    🎲 Tira (d{hitDieFaces}{formatModifier(conModifier)})
                  </button>
                  <button
                    onClick={() => setHpGain(averageHp)}
                    className="rounded-lg border border-edge px-2.5 py-1 text-xs font-bold text-foreground hover:border-accent transition-colors"
                  >
                    📊 Media ({averageHp})
                  </button>
                  <IntField
                    min={1}
                    max={100}
                    value={displayedHpGain}
                    onChange={setHpGain}
                    aria-label="Punti ferita guadagnati"
                    className="w-16 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
                  />
                </div>
                <p className="text-xs text-muted">Aggiunti sia a PF max che a PF attuali quando confermi.</p>
              </>
            ) : (
              <p className="text-xs text-muted">
                Dado vita non trovato per questa classe — aggiorna i PF max a mano dopo aver confermato.
              </p>
            )}
          </div>
          {isAsiLevel && (
            <div className="rounded-lg border border-accent/40 bg-surface p-3 space-y-2">
              <p className="text-xs font-bold text-accent-strong">
                ⭐ A questo livello ottieni un Aumento di Caratteristica (o un talento).
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { mode: "plus2" as const, label: "+2 a una caratteristica" },
                    { mode: "plus1x2" as const, label: "+1 a due caratteristiche" },
                    { mode: "talento" as const, label: "Talento" },
                  ] satisfies { mode: typeof asiMode; label: string }[]
                ).map((option) => (
                  <button
                    key={option.mode}
                    onClick={() => chooseAsiMode(option.mode)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-bold transition-colors ${
                      asiMode === option.mode
                        ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                        : "border-edge text-muted hover:text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              {asiMode === "talento" ? (
                <Autocomplete
                  value={asiFeat}
                  onChange={setAsiFeat}
                  loader={loadFeats}
                  placeholder="Es. Allerta, Fortunato, Robusto…"
                  inputClassName="w-full rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
                  kind="talenti"
                />
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {ABILITIES.map((ability) => (
                    <button
                      key={ability}
                      onClick={() => toggleAsiAbility(ability)}
                      className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                        asiAbilities.includes(ability)
                          ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                          : "border-edge text-muted hover:text-foreground"
                      }`}
                    >
                      {ABILITY_LABELS[ability]} {character.caratteristiche[ability]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div>
            <p className="text-xs uppercase tracking-widest text-muted mb-1">Nuovi privilegi</p>
            {!features && <p className="text-sm text-muted">Caricamento…</p>}
            {features?.length === 0 && (
              <p className="text-sm text-muted">Nessun privilegio nuovo a questo livello.</p>
            )}
            {iaFeatures && iaFeatures.length > 0
              ? iaFeatures.map((feature, index) => (
                  <div
                    key={`${feature.name}-${index}`}
                    className="rounded-lg border border-edge bg-surface p-3 mt-1.5"
                  >
                    <p className="text-sm font-bold text-foreground mb-1.5">{feature.name}</p>
                    <p className="text-sm text-foreground leading-relaxed">{feature.text}</p>
                  </div>
                ))
              : features?.map((feature) => (
                  <div
                    key={feature.name}
                    className="rounded-lg border border-edge bg-surface p-3 mt-1.5"
                  >
                    <p className="text-sm font-bold text-foreground mb-1.5">
                      <DualName text={feature.name} inline />
                    </p>
                    <EntriesBlock entries={feature.entries} language="it" />
                  </div>
                ))}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={confirm}
              className="rounded-md bg-accent-strong px-3 py-1.5 text-sm font-bold text-white hover:opacity-90"
            >
              Conferma livello {newLevel}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setFeatures(null);
                setHitDieFaces(null);
                setHpGain(null);
                setAsiAbilities([]);
                setAsiFeat("");
              }}
              className="text-sm text-muted hover:underline"
            >
              Annulla
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

