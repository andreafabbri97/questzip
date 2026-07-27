"use client";

// Componenti di dettaglio del Compendio, estratti da app/compendio/page.tsx perché servono
// anche fuori da quella pagina: le menzioni "#Nome" in chat aprono un modal che renderizza
// esattamente questi stessi componenti (stesso testo ufficiale italiano quando disponibile),
// senza duplicare la logica e senza dover navigare via da /compendio per vederli.

import { useEffect, useMemo, useState } from "react";
import type { BookMeta, Edition } from "@/lib/fivetools/books";
import {
  loadClassData,
  resolveClassFeatures,
  resolveSubclassFeatures,
  type ClassData,
  type RawBackground,
  type RawClass,
  type RawCondition,
  type RawCreature,
  type RawFeat,
  type RawItem,
  type RawRace,
  type RawSpell,
  type RawSubclass,
} from "@/lib/fivetools/data";
import { flattenEntries, RenderEntries, type FiveEntry } from "@/lib/fivetools/entries";
import { translateBatch, useTranslatedText } from "@/lib/fivetools/translate";
import { stripTags } from "@/lib/fivetools/tags";
import {
  formatAC,
  formatAbilityIncrease,
  formatAlignment,
  formatChallengeRating,
  formatComponents,
  formatCreatureType,
  formatDuration,
  formatFeet,
  formatHP,
  formatHitDie,
  formatMaterial,
  formatPrerequisite,
  formatProficiencyList,
  formatRaceSpeed,
  formatRange,
  formatSchool,
  formatSize,
  formatSpeed,
  formatTableCell,
  formatTime,
} from "@/lib/fivetools/format";
import { abilityModifier, formatModifier, proficiencyBonus } from "@/lib/dnd";
import {
  getClassiIta,
  getIncantesimiIta,
  getMostriIta,
  getOggettiIta,
  getRazzeIta,
  getTalentiIta,
} from "@/app/actions/compendio-ita";
import type { CompendiumKind } from "@/lib/fivetools/data";

export type Language = "en" | "it";

export type Entry =
  | RawSpell
  | RawCreature
  | RawItem
  | RawRace
  | RawFeat
  | RawBackground
  | RawCondition
  | RawClass;

// cache in memoria per la durata della sessione: gli elenchi sono piccoli, non serve rifetcharli
// ogni volta che si apre un'altra scheda o un altro modal di menzione
let itaSpellsPromise: ReturnType<typeof getIncantesimiIta> | null = null;
function loadIncantesimiIta() {
  if (!itaSpellsPromise) itaSpellsPromise = getIncantesimiIta();
  return itaSpellsPromise;
}
let itaMostriPromise: ReturnType<typeof getMostriIta> | null = null;
function loadMostriIta() {
  if (!itaMostriPromise) itaMostriPromise = getMostriIta();
  return itaMostriPromise;
}
let itaRazzePromise: ReturnType<typeof getRazzeIta> | null = null;
function loadRazzeIta() {
  if (!itaRazzePromise) itaRazzePromise = getRazzeIta();
  return itaRazzePromise;
}
let itaClassiPromise: ReturnType<typeof getClassiIta> | null = null;
function loadClassiIta() {
  if (!itaClassiPromise) itaClassiPromise = getClassiIta();
  return itaClassiPromise;
}
let itaOggettiPromise: ReturnType<typeof getOggettiIta> | null = null;
function loadOggettiIta() {
  if (!itaOggettiPromise) itaOggettiPromise = getOggettiIta();
  return itaOggettiPromise;
}
let itaTalentiPromise: ReturnType<typeof getTalentiIta> | null = null;
function loadTalentiIta() {
  if (!itaTalentiPromise) itaTalentiPromise = getTalentiIta();
  return itaTalentiPromise;
}

// confronta i nomi ignorando maiuscole/accenti/punteggiatura, per far combaciare il nome
// italiano ufficiale con la traduzione automatica del nome inglese di 5etools
function normalizeItaName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Nomi (a differenza delle descrizioni) sono corti: mostrarli in entrambe le lingue insieme
 * non confonde, anzi aiuta a riconoscere il termine — a differenza dei paragrafi lunghi,
 * dove inglese e italiano mischiati diventano illeggibili (da cui lo switch su EntriesBlock).
 */
export function DualName({ text, inline = false }: { text: string; inline?: boolean }) {
  const translated = useTranslatedText(text, "en", "it");
  if (!translated || translated.toLowerCase() === text.toLowerCase()) return <>{text}</>;
  if (inline) {
    return (
      <>
        {text} <span className="text-muted font-normal">({translated})</span>
      </>
    );
  }
  return (
    <>
      <span className="block truncate">{text}</span>
      <span className="block truncate text-xs font-normal text-muted">{translated}</span>
    </>
  );
}

/** Corpo del testo (entries) nella lingua scelta: inglese formattato ricco, oppure italiano tradotto in blocchi semplici. */
export function EntriesBlock({
  entries,
  language,
}: {
  entries: FiveEntry[] | undefined;
  language: Language;
}) {
  const blocks = useMemo(() => flattenEntries(entries), [entries]);
  const [translated, setTranslated] = useState<string[] | null>(null);

  useEffect(() => {
    if (language !== "it" || blocks.length === 0) return;
    let cancelled = false;
    translateBatch(blocks, "en", "it").then((result) => {
      if (cancelled) return;
      setTranslated(result.map((text, index) => text ?? blocks[index]));
    });
    return () => {
      cancelled = true;
    };
  }, [blocks, language]);

  if (!entries || entries.length === 0) return null;

  if (language === "en") {
    return <RenderEntries entries={entries} />;
  }

  return (
    <div className="space-y-2">
      {translated ? (
        translated.map((text, index) => (
          <p key={index} className="text-sm text-foreground leading-relaxed">
            {text}
          </p>
        ))
      ) : (
        <p className="text-sm text-muted">Traduzione in corso…</p>
      )}
    </div>
  );
}

export function SourceBadge({ source, books }: { source: string; books: Map<string, BookMeta> | null }) {
  const meta = books?.get(source);
  const edition: Edition = meta?.edition ?? "2014";
  return (
    <span
      className={`text-[10px] font-bold rounded-full px-2 py-0.5 border ${
        edition === "2024" ? "border-accent text-accent-strong" : "border-edge text-muted"
      }`}
      title={meta?.name ?? source}
    >
      {source}
    </span>
  );
}

export function EntryDetail({
  kind,
  entry,
  books,
  language,
  onBack,
}: {
  kind: CompendiumKind;
  entry: Entry;
  books: Map<string, BookMeta> | null;
  language: Language;
  onBack: () => void;
}) {
  const meta = books?.get(entry.source);
  return (
    // "@container": le griglie a più colonne qui sotto si adattano alla larghezza REALE di
    // questo box (container query, Tailwind v4) invece che a quella dello schermo — senza
    // questo, dentro un contenitore stretto (es. il modal delle menzioni in chat) su un monitor
    // largo scatterebbero comunque i breakpoint pensati per la pagina Compendio a schermo
    // intero, sfondando il box (bug segnalato dall'utente con screenshot).
    <div className="@container rounded-xl border border-edge bg-surface p-5 space-y-4">
      <button onClick={onBack} className="text-sm text-muted hover:text-foreground lg:hidden">
        ← Risultati
      </button>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-2xl font-display font-bold text-accent-strong">
          <DualName text={entry.name} />
        </h2>
        <SourceBadge source={entry.source} books={books} />
      </div>
      {meta && <p className="text-xs text-muted -mt-2">{meta.name}</p>}

      {kind === "incantesimi" && <SpellDetail spell={entry as RawSpell} language={language} />}
      {kind === "mostri" && <CreatureDetail creature={entry as RawCreature} language={language} />}
      {kind === "oggetti" && <ItemDetail item={entry as RawItem} language={language} />}
      {kind === "razze" && <RaceDetail race={entry as RawRace} language={language} />}
      {kind === "talenti" && <FeatDetail feat={entry as RawFeat} language={language} />}
      {(kind === "background" || kind === "condizioni") && (
        <EntriesBlock
          entries={(entry as RawBackground | RawCondition).entries}
          language={language}
        />
      )}
      {kind === "classi" && <ClassDetail cls={entry as RawClass} language={language} />}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string | number | undefined | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="rounded-lg border border-edge bg-surface-raised px-3 py-2">
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

const ITA_SOURCE_NAMES: Record<string, string> = {
  phb: "Manuale del Giocatore",
  mm: "Manuale dei Mostri",
  oggetti_magici: "Manuale del DM (OCR)",
};

function SpellDetail({ spell, language }: { spell: RawSpell; language: Language }) {
  const material = formatMaterial(spell.components);
  const translatedName = useTranslatedText(spell.name, "en", "it");
  const [itaSpells, setItaSpells] = useState<Awaited<ReturnType<typeof getIncantesimiIta>> | null>(
    null,
  );

  useEffect(() => {
    if (language !== "it") return;
    let cancelled = false;
    loadIncantesimiIta().then((data) => {
      if (!cancelled) setItaSpells(data);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const ufficiale = useMemo(() => {
    if (language !== "it" || !itaSpells || !translatedName) return null;
    const target = normalizeItaName(translatedName);
    return itaSpells.find((s) => normalizeItaName(s.nome) === target) ?? null;
  }, [language, itaSpells, translatedName]);

  if (ufficiale) {
    return (
      <>
        <p className="text-xs font-bold text-accent-strong">
          📖 Testo ufficiale · {ITA_SOURCE_NAMES[ufficiale.fonte] ?? ufficiale.fonte}
        </p>
        <div className="grid grid-cols-2 @sm:grid-cols-3 @2xl:grid-cols-6 gap-3">
          <Stat label="Scuola" value={ufficiale.scuola} />
          <Stat label="Livello" value={ufficiale.livello === 0 ? "Trucchetto" : ufficiale.livello} />
          <Stat label="Tempo di lancio" value={ufficiale.tempoDiLancio} />
          <Stat label="Gittata" value={ufficiale.gittata} />
          <Stat label="Componenti" value={ufficiale.componenti} />
          <Stat label="Durata" value={ufficiale.durata} />
        </div>
        <div className="border-t border-edge pt-3 space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted">Descrizione</p>
          {ufficiale.descrizione.split("\n\n").map((paragrafo, index) => (
            <p key={index} className="text-sm text-foreground leading-relaxed">
              {paragrafo}
            </p>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 @sm:grid-cols-3 @2xl:grid-cols-6 gap-3">
        <Stat label="Scuola" value={formatSchool(spell.school)} />
        <Stat label="Livello" value={spell.level === 0 ? "Trucchetto" : spell.level} />
        <Stat label="Tempo di lancio" value={formatTime(spell.time)} />
        <Stat label="Gittata" value={formatRange(spell.range, language)} />
        <Stat label="Componenti" value={formatComponents(spell.components)} />
        <Stat label="Durata" value={formatDuration(spell.duration)} />
      </div>
      {material && <p className="text-sm text-muted italic">Materiali: {material}</p>}
      <div className="border-t border-edge pt-3 space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted">Descrizione</p>
        <EntriesBlock entries={spell.entries} language={language} />
      </div>
      {spell.entriesHigherLevel && (
        <div>
          <p className="text-xs uppercase tracking-widest text-muted mb-1.5">A livelli superiori</p>
          <EntriesBlock entries={spell.entriesHigherLevel} language={language} />
        </div>
      )}
    </>
  );
}

const ACTION_GROUPS: { key: keyof RawCreature; label: string }[] = [
  { key: "trait", label: "Tratti" },
  { key: "action", label: "Azioni" },
  { key: "bonus", label: "Azioni bonus" },
  { key: "reaction", label: "Reazioni" },
  { key: "legendary", label: "Azioni leggendarie" },
];

const ITA_MONSTER_SECTIONS: { key: "tratti" | "azioni" | "azioniLeggendarie" | "reazioni"; label: string }[] = [
  { key: "tratti", label: "Tratti" },
  { key: "azioni", label: "Azioni" },
  { key: "azioniLeggendarie", label: "Azioni leggendarie" },
  { key: "reazioni", label: "Reazioni" },
];

function CreatureDetail({ creature, language }: { creature: RawCreature; language: Language }) {
  const abilities: [string, number][] = [
    ["FOR", creature.str],
    ["DES", creature.dex],
    ["COS", creature.con],
    ["INT", creature.int],
    ["SAG", creature.wis],
    ["CAR", creature.cha],
  ];

  const translatedName = useTranslatedText(creature.name, "en", "it");
  const [itaMostri, setItaMostri] = useState<Awaited<ReturnType<typeof getMostriIta>> | null>(null);

  useEffect(() => {
    if (language !== "it") return;
    let cancelled = false;
    loadMostriIta().then((data) => {
      if (!cancelled) setItaMostri(data);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const ufficiale = useMemo(() => {
    if (language !== "it" || !itaMostri || !translatedName) return null;
    const target = normalizeItaName(translatedName);
    return itaMostri.find((m) => normalizeItaName(m.nome) === target) ?? null;
  }, [language, itaMostri, translatedName]);

  if (ufficiale) {
    const itaAbilities: [string, { score: number; mod: string } | null][] = [
      ["FOR", ufficiale.caratteristiche?.FOR ?? null],
      ["DES", ufficiale.caratteristiche?.DES ?? null],
      ["COS", ufficiale.caratteristiche?.COS ?? null],
      ["INT", ufficiale.caratteristiche?.INT ?? null],
      ["SAG", ufficiale.caratteristiche?.SAG ?? null],
      ["CAR", ufficiale.caratteristiche?.CAR ?? null],
    ];
    return (
      <>
        <p className="text-xs font-bold text-accent-strong">
          📖 Testo ufficiale · {ITA_SOURCE_NAMES[ufficiale.fonte] ?? ufficiale.fonte}
        </p>
        {ufficiale.numericSuspect && (
          <p className="text-xs text-danger">
            ⚠️ Alcuni valori numerici di questa scheda potrebbero contenere refusi di estrazione dal PDF.
          </p>
        )}
        <p className="text-sm text-muted italic">
          {[ufficiale.taglia, ufficiale.tipo].filter(Boolean).join(" ")}
          {ufficiale.allineamento ? `, ${ufficiale.allineamento}` : ""}
        </p>
        <div className="grid grid-cols-2 @sm:grid-cols-4 @2xl:grid-cols-8 gap-3">
          <Stat label="CA" value={ufficiale.classeArmatura} />
          <Stat label="PF" value={ufficiale.puntiFerita} />
          <Stat label="Velocità" value={ufficiale.velocita} />
          <Stat label="Sfida" value={ufficiale.sfida ? `${ufficiale.sfida} (${ufficiale.pe} PE)` : null} />
        </div>
        <div className="grid grid-cols-6 gap-2 text-center">
          {itaAbilities.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-edge bg-surface-raised py-2">
              <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
              <p className="text-sm font-bold text-foreground">
                {value ? `${value.score} (${value.mod})` : "—"}
              </p>
            </div>
          ))}
        </div>
        <Stat label="Tiri salvezza" value={ufficiale.tiriSalvezza} />
        <Stat label="Abilità" value={ufficiale.abilita} />
        <Stat label="Vulnerabilità ai danni" value={ufficiale.vulnerabilitaDanni} />
        <Stat label="Resistenza ai danni" value={ufficiale.resistenzaDanni} />
        <Stat label="Immunità ai danni" value={ufficiale.immunitaDanni} />
        <Stat label="Immunità alle condizioni" value={ufficiale.immunitaCondizioni} />
        <Stat label="Sensi" value={ufficiale.sensi} />
        <Stat label="Linguaggi" value={ufficiale.linguaggi} />

        {ITA_MONSTER_SECTIONS.map((section) => {
          const text = ufficiale[section.key];
          if (!text) return null;
          return (
            <div key={section.key} className="space-y-2">
              <p className="text-xs uppercase tracking-widest text-muted">{section.label}</p>
              {text.split("\n\n").map((paragrafo, index) => (
                <div key={index} className="rounded-lg border border-edge bg-surface-raised p-3">
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">
                    {paragrafo}
                  </p>
                </div>
              ))}
            </div>
          );
        })}
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-muted italic">
        {formatSize(creature.size)} {formatCreatureType(creature.type)} ·{" "}
        {formatAlignment(creature.alignment)}
      </p>
      <div className="grid grid-cols-2 @sm:grid-cols-4 @2xl:grid-cols-8 gap-3">
        <Stat label="CA" value={formatAC(creature.ac)} />
        <Stat label="PF" value={formatHP(creature.hp)} />
        <Stat label="Velocità" value={formatSpeed(creature.speed, language)} />
        <Stat label="Grado sfida" value={formatChallengeRating(creature.cr)} />
      </div>
      <div className="grid grid-cols-6 gap-2 text-center">
        {abilities.map(([label, score]) => (
          <div key={label} className="rounded-lg border border-edge bg-surface-raised py-2">
            <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
            <p className="text-sm font-bold text-foreground">
              {score} ({formatModifier(abilityModifier(score))})
            </p>
          </div>
        ))}
      </div>
      <Stat label="Percezione passiva" value={creature.passive} />
      <Stat label="Sensi" value={creature.senses?.join(", ")} />
      <Stat label="Linguaggi" value={creature.languages?.join(", ")} />

      {ACTION_GROUPS.map((group) => {
        const list = creature[group.key] as
          | { name: string; entries: FiveEntry[] }[]
          | undefined;
        if (!list || list.length === 0) return null;
        return (
          <div key={group.key} className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted">{group.label}</p>
            {list.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className="rounded-lg border border-edge bg-surface-raised p-3"
              >
                <p className="text-sm font-bold text-foreground mb-1.5">
                  <DualName text={item.name} inline />
                </p>
                <EntriesBlock entries={item.entries} language={language} />
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

const ITEM_TYPE_NAMES: Record<string, string> = {
  RG: "Anello",
  WD: "Bacchetta",
  RD: "Verga",
  P: "Pozione",
  SC: "Pergamena",
  A: "Munizioni",
  M: "Arma da mischia",
  R: "Arma a distanza",
  LA: "Armatura leggera",
  MA: "Armatura media",
  HA: "Armatura pesante",
  S: "Scudo",
  INS: "Strumento",
};

function ItemDetail({ item, language }: { item: RawItem; language: Language }) {
  const typeName =
    (item.type && ITEM_TYPE_NAMES[item.type]) || (item.wondrous ? "Oggetto meraviglioso" : item.type);
  const attunement =
    item.reqAttune === true
      ? "richiede sintonia"
      : typeof item.reqAttune === "string"
        ? `richiede sintonia (${item.reqAttune})`
        : null;

  const translatedName = useTranslatedText(item.name, "en", "it");
  const [itaOggetti, setItaOggetti] = useState<Awaited<ReturnType<typeof getOggettiIta>> | null>(
    null,
  );

  useEffect(() => {
    if (language !== "it") return;
    let cancelled = false;
    loadOggettiIta().then((data) => {
      if (!cancelled) setItaOggetti(data);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const ufficiale = useMemo(() => {
    if (language !== "it" || !itaOggetti || !translatedName) return null;
    const target = normalizeItaName(translatedName);
    return itaOggetti.find((o) => normalizeItaName(o.nome) === target) ?? null;
  }, [language, itaOggetti, translatedName]);

  if (ufficiale) {
    return (
      <>
        <p className="text-xs font-bold text-accent-strong">
          📖 Testo ufficiale · {ITA_SOURCE_NAMES[ufficiale.fonte] ?? ufficiale.fonte}
        </p>
        <p className="text-sm text-muted italic capitalize">
          {[ufficiale.categoria, ufficiale.rarita, ufficiale.sintonia ? "richiede sintonia" : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {ufficiale.descrizione}
        </p>
        <p className="text-[10px] text-muted">
          ⚠️ testo estratto via OCR da un PDF privato di qualità bassa (screenshot, non
          scansione): può contenere errori di riconoscimento.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="text-sm text-muted italic capitalize">
        {[typeName, item.rarity, attunement].filter(Boolean).join(" · ")}
      </p>
      <EntriesBlock entries={item.entries} language={language} />
    </>
  );
}

function RaceDetail({ race, language }: { race: RawRace; language: Language }) {
  const translatedName = useTranslatedText(race.name, "en", "it");
  const [itaRazze, setItaRazze] = useState<Awaited<ReturnType<typeof getRazzeIta>> | null>(null);

  useEffect(() => {
    if (language !== "it") return;
    let cancelled = false;
    loadRazzeIta().then((data) => {
      if (!cancelled) setItaRazze(data);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const ufficiale = useMemo(() => {
    if (language !== "it" || !itaRazze || !translatedName) return null;
    const target = normalizeItaName(translatedName);
    return itaRazze.find((r) => normalizeItaName(r.nome) === target) ?? null;
  }, [language, itaRazze, translatedName]);

  if (ufficiale) {
    return (
      <>
        <p className="text-xs font-bold text-accent-strong">
          📖 Testo ufficiale · {ITA_SOURCE_NAMES[ufficiale.fonte] ?? ufficiale.fonte}
        </p>
        {ufficiale.introduzione && (
          <p className="text-sm text-muted italic">{ufficiale.introduzione}</p>
        )}
        <div className="space-y-2">
          {ufficiale.tratti.map((tratto, index) => (
            <div key={index} className="rounded-lg border border-edge bg-surface-raised p-3">
              <p className="text-sm font-bold text-foreground mb-1">{tratto.nome}</p>
              <p className="text-sm text-foreground leading-relaxed">{tratto.testo}</p>
            </div>
          ))}
        </div>
        {ufficiale.sottorazze.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-widest text-muted">Sottorazze</p>
            {ufficiale.sottorazze.map((sottorazza, sIndex) => (
              <div key={sIndex} className="rounded-lg border border-edge bg-surface p-3 space-y-2">
                <p className="text-sm font-bold text-accent-strong">{sottorazza.nome}</p>
                {sottorazza.tratti.map((tratto, tIndex) => (
                  <div key={tIndex} className="rounded-lg border border-edge bg-surface-raised p-3">
                    <p className="text-sm font-bold text-foreground mb-1">{tratto.nome}</p>
                    <p className="text-sm text-foreground leading-relaxed">{tratto.testo}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 @sm:grid-cols-4 @2xl:grid-cols-8 gap-3">
        <Stat label="Taglia" value={formatSize(race.size)} />
        <Stat label="Velocità" value={formatRaceSpeed(race.speed, language)} />
        <Stat label="Aumento caratteristiche" value={formatAbilityIncrease(race.ability)} />
        <Stat
          label="Scurovisione"
          value={race.darkvision ? formatFeet(race.darkvision, language) : undefined}
        />
      </div>
      <div className="border-t border-edge pt-3">
        <EntriesBlock entries={race.entries} language={language} />
      </div>
    </>
  );
}

function FeatDetail({ feat, language }: { feat: RawFeat; language: Language }) {
  const prerequisite = formatPrerequisite(feat.prerequisite);

  const translatedName = useTranslatedText(feat.name, "en", "it");
  const [itaTalenti, setItaTalenti] = useState<Awaited<ReturnType<typeof getTalentiIta>> | null>(
    null,
  );

  useEffect(() => {
    if (language !== "it") return;
    let cancelled = false;
    loadTalentiIta().then((data) => {
      if (!cancelled) setItaTalenti(data);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const ufficiale = useMemo(() => {
    if (language !== "it" || !itaTalenti || !translatedName) return null;
    const target = normalizeItaName(translatedName);
    return itaTalenti.find((t) => normalizeItaName(t.nome) === target) ?? null;
  }, [language, itaTalenti, translatedName]);

  if (ufficiale) {
    return (
      <>
        <p className="text-xs font-bold text-accent-strong">
          📖 Testo ufficiale · {ITA_SOURCE_NAMES[ufficiale.fonte] ?? ufficiale.fonte}
        </p>
        {ufficiale.prerequisito && <Stat label="Prerequisiti" value={ufficiale.prerequisito} />}
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {ufficiale.descrizione}
        </p>
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {prerequisite && <Stat label="Prerequisiti" value={prerequisite} />}
        {feat.ability && <Stat label="Aumento caratteristiche" value={formatAbilityIncrease(feat.ability)} />}
      </div>
      <div className="border-t border-edge pt-3">
        <EntriesBlock entries={feat.entries} language={language} />
      </div>
    </>
  );
}

const CLASS_ABILITY_NAMES: Record<string, string> = {
  str: "Forza",
  dex: "Destrezza",
  con: "Costituzione",
  int: "Intelligenza",
  wis: "Saggezza",
  cha: "Carisma",
};

function buildTableColumns(cls: RawClass) {
  const groups = cls.classTableGroups ?? [];
  const labels = groups.flatMap((g) => g.colLabels.map((label) => stripTags(label)));
  const getCells = (levelIndex: number) =>
    groups.flatMap((g) => (g.rows ?? g.rowsSpellProgression ?? [])[levelIndex] ?? []);
  return { labels, getCells };
}

function ClassDetail({ cls, language }: { cls: RawClass; language: Language }) {
  const [classData, setClassData] = useState<ClassData | null>(null);
  const translatedName = useTranslatedText(cls.name, "en", "it");
  const [itaClassi, setItaClassi] = useState<Awaited<ReturnType<typeof getClassiIta>> | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    loadClassData().then((data) => {
      if (!cancelled) setClassData(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (language !== "it") return;
    let cancelled = false;
    loadClassiIta().then((data) => {
      if (!cancelled) setItaClassi(data);
    });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const ufficiale = useMemo(() => {
    if (language !== "it" || !itaClassi || !translatedName) return null;
    const target = normalizeItaName(translatedName);
    const match = itaClassi.find((c) => normalizeItaName(c.nome) === target);
    if (!match || Object.keys(match.tabellaLivelli).length === 0) return null;
    return match;
  }, [language, itaClassi, translatedName]);

  const subclasses = useMemo(() => {
    if (!classData) return [];
    const names = new Set<string>();
    return classData.subclasses
      .filter((sub) => sub.className === cls.name && sub.classSource === cls.source)
      .filter((sub) => (names.has(sub.name) ? false : (names.add(sub.name), true)));
  }, [classData, cls]);

  const subclassesBlock = classData && subclasses.length > 0 && (
    <div className="space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted">
        {cls.subclassTitle ?? "Sottoclassi"}
      </p>
      {subclasses.map((sub) => (
        <SubclassAccordion key={sub.name} subclass={sub} classData={classData} language={language} />
      ))}
    </div>
  );

  if (ufficiale) {
    const livelli = Object.entries(ufficiale.tabellaLivelli)
      .map(([livello, dati]) => ({ livello: Number(livello), ...dati }))
      .sort((a, b) => a.livello - b.livello);
    return (
      <>
        <p className="text-xs font-bold text-accent-strong">
          📖 Testo ufficiale · {ITA_SOURCE_NAMES[ufficiale.fonte] ?? ufficiale.fonte}
        </p>
        <div className="grid grid-cols-2 @sm:grid-cols-3 @2xl:grid-cols-6 gap-3">
          <Stat label="Dado vita" value={ufficiale.dadoVita} />
          <Stat label="Armature" value={ufficiale.armature} />
          <Stat label="Armi" value={ufficiale.armi} />
          <Stat label="Strumenti" value={ufficiale.strumenti} />
          <Stat label="Tiri salvezza" value={ufficiale.tiriSalvezza} />
          <Stat label="Abilità" value={ufficiale.abilita} />
        </div>
        {ufficiale.equipaggiamento && (
          <p className="text-sm text-muted">{ufficiale.equipaggiamento}</p>
        )}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted">Progressione</p>
          <p className="text-xs text-muted">
            Tabella ricostruita dal PDF: alcuni livelli senza nuovi privilegi non sono mostrati.
          </p>
          <div className="space-y-1.5">
            {livelli
              .filter((l) => l.privilegi.length > 0)
              .map((l) => (
                <div
                  key={l.livello}
                  className="flex items-start gap-3 rounded-lg border border-edge bg-surface-raised px-3 py-2"
                >
                  <span className="text-sm font-bold text-accent-strong shrink-0 w-16">
                    Liv. {l.livello}
                  </span>
                  <span className="text-sm text-foreground">{l.privilegi.join(", ")}</span>
                </div>
              ))}
          </div>
        </div>
        {subclassesBlock}
      </>
    );
  }

  if (!classData) {
    return <p className="text-sm text-muted">Caricamento…</p>;
  }

  const classFeatures = resolveClassFeatures(classData, cls);
  const featuresByLevel = new Map<number, string[]>();
  for (const feature of classFeatures) {
    const list = featuresByLevel.get(feature.level) ?? [];
    list.push(feature.name);
    featuresByLevel.set(feature.level, list);
  }
  const columns = buildTableColumns(cls);

  return (
    <>
      <div className="grid grid-cols-2 @sm:grid-cols-3 @2xl:grid-cols-6 gap-3">
        <Stat label="Dado vita" value={formatHitDie(cls.hd)} />
        <Stat
          label="Caratteristica incantatore"
          value={cls.spellcastingAbility ? CLASS_ABILITY_NAMES[cls.spellcastingAbility] : undefined}
        />
        <Stat
          label="Tiri salvezza"
          value={cls.proficiency?.map((code) => CLASS_ABILITY_NAMES[code] ?? code).join(", ")}
        />
        <Stat label="Armature" value={formatProficiencyList(cls.startingProficiencies?.armor)} />
        <Stat label="Armi" value={formatProficiencyList(cls.startingProficiencies?.weapons)} />
      </div>

      {classFeatures.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted">Progressione</p>
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="w-full text-sm @2xl:text-xs">
              <thead>
                <tr className="bg-surface-raised">
                  <th className="px-3 py-2 @2xl:px-2 @2xl:py-1.5 text-left text-[10px] uppercase tracking-widest text-muted">
                    Liv.
                  </th>
                  <th className="px-3 py-2 @2xl:px-2 @2xl:py-1.5 text-left text-[10px] uppercase tracking-widest text-muted whitespace-nowrap">
                    Bonus comp.
                  </th>
                  {columns.labels.map((label, index) => (
                    <th
                      key={`${label}-${index}`}
                      className="px-3 py-2 @2xl:px-2 @2xl:py-1.5 text-left text-[10px] uppercase tracking-widest text-muted whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}
                  <th className="px-3 py-2 @2xl:px-2 @2xl:py-1.5 text-left text-[10px] uppercase tracking-widest text-muted">
                    Caratteristiche
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 20 }, (_, index) => index + 1).map((level) => (
                  <tr
                    key={level}
                    className={level % 2 === 0 ? "bg-surface" : "bg-surface-raised/40"}
                  >
                    <td className="px-3 py-2 @2xl:px-2 @2xl:py-1.5 font-bold text-foreground">{level}</td>
                    <td className="px-3 py-2 @2xl:px-2 @2xl:py-1.5 text-muted">
                      {formatModifier(proficiencyBonus(level))}
                    </td>
                    {columns.getCells(level - 1).map((cell, index) => (
                      <td key={index} className="px-3 py-2 @2xl:px-2 @2xl:py-1.5 text-foreground whitespace-nowrap">
                        {formatTableCell(cell)}
                      </td>
                    ))}
                    <td className="px-3 py-2 @2xl:px-2 @2xl:py-1.5 text-foreground">
                      {(featuresByLevel.get(level) ?? []).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {classFeatures.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted">Caratteristiche di classe</p>
          {classFeatures.map((feature) => (
            <div
              key={`${feature.name}-${feature.level}`}
              className="rounded-lg border border-edge bg-surface-raised p-3"
            >
              <p className="text-sm font-bold text-foreground mb-1.5">
                <span className="text-accent-strong">Liv. {feature.level}</span> ·{" "}
                <DualName text={feature.name} inline />
              </p>
              <EntriesBlock entries={feature.entries} language={language} />
            </div>
          ))}
        </div>
      )}

      {subclassesBlock}
    </>
  );
}

function SubclassAccordion({
  subclass,
  classData,
  language,
}: {
  subclass: RawSubclass;
  classData: ClassData;
  language: Language;
}) {
  const [open, setOpen] = useState(false);
  const features = useMemo(
    () => resolveSubclassFeatures(classData, subclass),
    [classData, subclass],
  );

  return (
    <div className="rounded-lg border border-edge bg-surface-raised overflow-hidden">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-surface transition-colors"
      >
        <span className="text-sm font-bold text-foreground">
          <DualName text={subclass.name} inline />
        </span>
        <span className="text-muted text-xs shrink-0">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-edge pt-3">
          {features.length === 0 && (
            <p className="text-sm text-muted">Nessuna caratteristica trovata.</p>
          )}
          {features.map((feature) => (
            <div key={`${feature.name}-${feature.level}`}>
              <p className="text-sm font-bold text-foreground mb-1.5">
                <span className="text-accent-strong">Liv. {feature.level}</span> ·{" "}
                <DualName text={feature.name} inline />
              </p>
              <EntriesBlock entries={feature.entries} language={language} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
