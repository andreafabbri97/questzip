"use client";

import { useEffect, useState } from "react";
import { IntField } from "@/components/int-field";
import { getOggettiIta, getTalentiIta } from "@/app/actions/compendio-ita";
import { useTraduzioneIa } from "@/lib/fivetools/compendio-detail";
import {
  CONDIZIONI_5E,
  DAMAGE_TYPES,
  LANGUAGES,
  carryingCapacityKg,
  type Character,
  type InventoryItem,
  type KnownFeat,
} from "@/lib/dnd";
import {
  loadFeats,
  loadInventoryItems,
  type RawFeat,
  type RawItem,
} from "@/lib/fivetools/data";
import { RenderEntries } from "@/lib/fivetools/entries";
import { useTranslatedText } from "@/lib/fivetools/translate";
import { Autocomplete } from "./autocomplete";

export function PersonalitySection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const set = <K extends keyof Character>(key: K, value: Character[K]) =>
    onChange({ ...character, [key]: value });
  const fieldClass =
    "mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground";

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="text-sm uppercase tracking-widest text-muted hover:text-foreground transition-colors"
      >
        Personalità {expanded ? "▲" : "▼"}
      </button>
      {expanded && (
        <div className="mt-3 grid sm:grid-cols-2 gap-3 border-t border-edge pt-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Tratti caratteriali</span>
            <textarea
              value={character.tratti}
              onChange={(event) => set("tratti", event.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Legami</span>
            <textarea
              value={character.legami}
              onChange={(event) => set("legami", event.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Ideali</span>
            <textarea
              value={character.ideali}
              onChange={(event) => set("ideali", event.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Difetti</span>
            <textarea
              value={character.difetti}
              onChange={(event) => set("difetti", event.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">Nemici</span>
            <textarea
              value={character.nemici}
              onChange={(event) => set("nemici", event.target.value)}
              rows={3}
              className={fieldClass}
            />
          </label>
        </div>
      )}
    </section>
  );
}

export function InventorySection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const setInventario = (inventario: InventoryItem[]) => onChange({ ...character, inventario });
  const setMonete = (monete: Character["monete"]) => onChange({ ...character, monete });
  const setPesoMassimo = (pesoMassimo: number) => onChange({ ...character, pesoMassimo });

  const addItem = () =>
    setInventario([
      ...character.inventario,
      { id: crypto.randomUUID(), nome: "", quantita: 1, note: "", peso: 0 },
    ]);

  const pesoTrasportato = character.inventario.reduce(
    (sum, item) => sum + item.peso * item.quantita,
    0,
  );
  const pesoSuggerito = carryingCapacityKg(character.caratteristiche.forza);
  const sovraccarico = character.pesoMassimo > 0 && pesoTrasportato > character.pesoMassimo;

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">Equipaggiamento</h2>
        <button onClick={addItem} className="text-xs font-bold text-accent-strong hover:underline">
          + Aggiungi oggetto
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["oro", "argento", "rame"] as const).map((moneta) => (
          <label key={moneta} className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted capitalize">{moneta}</span>
            <IntField
              min={0}
              value={character.monete[moneta]}
              onChange={(value) => setMonete({ ...character.monete, [moneta]: value })}
              className="mt-1 w-full rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
            />
          </label>
        ))}
      </div>

      <div className="rounded-lg border border-edge bg-surface-raised p-2.5 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted">Peso trasportato</span>
          <span className={`font-bold ${sovraccarico ? "text-danger" : "text-foreground"}`}>
            {pesoTrasportato} / {character.pesoMassimo || "—"} kg
          </span>
        </div>
        {sovraccarico && <p className="text-xs text-danger">Sovraccarico! Velocità ridotta.</p>}
        <div className="flex items-center gap-2">
          <label className="flex-1 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted whitespace-nowrap">
              Peso max
            </span>
            <IntField
              min={0}
              decimal
              value={character.pesoMassimo}
              onChange={setPesoMassimo}
              className="w-20 rounded-md border border-edge bg-surface px-2 py-1 text-sm text-foreground text-center"
            />
          </label>
          <button
            onClick={() => setPesoMassimo(pesoSuggerito)}
            className="text-xs font-bold text-accent-strong hover:underline whitespace-nowrap"
          >
            Suggerisci da Forza ({pesoSuggerito} kg)
          </button>
        </div>
      </div>

      {character.inventario.length > 0 && (
        <div className="space-y-2">
          {character.inventario.map((item) => (
            <div key={item.id} className="rounded-lg border border-edge bg-surface-raised p-2.5 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <Autocomplete
                    value={item.nome}
                    onChange={(nome) =>
                      setInventario(
                        character.inventario.map((i) => (i.id === item.id ? { ...i, nome } : i)),
                      )
                    }
                    loader={loadInventoryItems}
                    placeholder="Pozione di Guarigione, Spada +1, torcia…"
                    inputClassName="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                    kind="oggetti"
                  />
                </div>
                <IntField
                  min={1}
                  value={item.quantita}
                  onChange={(value) =>
                    setInventario(
                      character.inventario.map((i) =>
                        i.id === item.id ? { ...i, quantita: value } : i,
                      ),
                    )
                  }
                  className="w-16 rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground text-center"
                />
                <button
                  onClick={() => setInventario(character.inventario.filter((i) => i.id !== item.id))}
                  className="text-muted hover:text-danger text-sm shrink-0"
                  aria-label={`Rimuovi ${item.nome || "oggetto"}`}
                >
                  ×
                </button>
              </div>
              <label className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted whitespace-nowrap">
                  Peso unitario
                </span>
                <IntField
                  min={0}
                  decimal
                  value={item.peso}
                  onChange={(value) =>
                    setInventario(
                      character.inventario.map((i) => (i.id === item.id ? { ...i, peso: value } : i)),
                    )
                  }
                  className="w-16 rounded-md border border-edge bg-surface px-2 py-1 text-xs text-foreground text-center"
                />
                <span className="text-[10px] text-muted">kg</span>
              </label>
              <InventoryItemInfo nome={item.nome} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// confronta i nomi ignorando maiuscole/accenti/punteggiatura, stessa euristica usata nel
// Compendio (app/compendio/page.tsx) per far combaciare il nome italiano ufficiale con la
// traduzione automatica del nome inglese
function normalizeItaName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const ITEM_RARITY_LABELS: Record<string, string> = {
  common: "comune",
  uncommon: "non comune",
  rare: "raro",
  "very rare": "molto raro",
  legendary: "leggendario",
  artifact: "artefatto",
};

function InventoryItemInfo({ nome }: { nome: string }) {
  const [showInfo, setShowInfo] = useState(false);
  const [items, setItems] = useState<RawItem[] | null>(null);
  const [oggettiIta, setOggettiIta] = useState<Awaited<ReturnType<typeof getOggettiIta>> | null>(
    null,
  );

  useEffect(() => {
    loadInventoryItems().then(setItems);
  }, []);

  const match = items?.find((i) => i.name.toLowerCase() === nome.trim().toLowerCase()) ?? null;
  const ia = useTraduzioneIa("oggetti", match?.name ?? "", match?.source ?? "", !!match);
  const liveTranslatedName = useTranslatedText(match?.name, "en", "it");
  const translatedName = ia?.nomeIta ?? liveTranslatedName;

  useEffect(() => {
    if (!showInfo || !match) return;
    let cancelled = false;
    getOggettiIta().then((data) => {
      if (!cancelled) setOggettiIta(data);
    });
    return () => {
      cancelled = true;
    };
  }, [showInfo, match]);

  if (!match) return null;

  const rarity = match.rarity ? (ITEM_RARITY_LABELS[match.rarity] ?? match.rarity) : null;
  const attunement = match.reqAttune ? "richiede sintonia" : null;

  const ufficiale =
    oggettiIta && translatedName
      ? (oggettiIta.find((o) => normalizeItaName(o.nome) === normalizeItaName(translatedName)) ?? null)
      : null;

  return (
    <div className="pt-1 border-t border-edge/60">
      <button
        onClick={() => setShowInfo((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {[rarity, attunement].filter(Boolean).join(" · ") || "Dettagli"}
        {" — "}
        {showInfo ? "Nascondi" : "Come funziona"}
      </button>
      {showInfo && (
        <div className="mt-2">
          {ufficiale ? (
            <>
              <p className="text-[10px] font-bold text-accent-strong mb-1">📖 Testo ufficiale</p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {ufficiale.descrizione}
              </p>
            </>
          ) : ia?.descrizioneIta ? (
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {ia.descrizioneIta}
            </p>
          ) : match.entries ? (
            <RenderEntries entries={match.entries} />
          ) : (
            <p className="text-sm text-muted">Nessuna descrizione disponibile.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ChipToggle({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: readonly string[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      {label && <p className="text-[10px] uppercase tracking-widest text-muted mb-1.5">{label}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = selected.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => onToggle(opt)}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                  : "border-edge bg-surface-raised text-muted hover:text-foreground"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function LanguagesAndResistancesSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const toggle = (
    key: "linguaggi" | "resistenze" | "immunita" | "vulnerabilita",
    value: string,
  ) => {
    const current = character[key];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...character, [key]: next });
  };

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-4">
      <h2 className="text-sm uppercase tracking-widest text-muted">Lingue e resistenze</h2>
      <ChipToggle
        label="Lingue conosciute"
        options={LANGUAGES}
        selected={character.linguaggi}
        onToggle={(v) => toggle("linguaggi", v)}
      />
      <ChipToggle
        label="Resistenza ai danni"
        options={DAMAGE_TYPES}
        selected={character.resistenze}
        onToggle={(v) => toggle("resistenze", v)}
      />
      <ChipToggle
        label="Immunità ai danni"
        options={DAMAGE_TYPES}
        selected={character.immunita}
        onToggle={(v) => toggle("immunita", v)}
      />
      <ChipToggle
        label="Vulnerabilità ai danni"
        options={DAMAGE_TYPES}
        selected={character.vulnerabilita}
        onToggle={(v) => toggle("vulnerabilita", v)}
      />
    </section>
  );
}

export function ActiveConditionsSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const toggle = (value: string) => {
    const next = character.condizioniAttive.includes(value)
      ? character.condizioniAttive.filter((v) => v !== value)
      : [...character.condizioniAttive, value];
    onChange({ ...character, condizioniAttive: next });
  };

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-2">
      <h2 className="text-sm uppercase tracking-widest text-muted">Condizioni attive</h2>
      <p className="text-xs text-muted">
        Per condizioni che durano oltre un singolo combattimento (es. una maledizione). Durante un
        combattimento in Campagna si usa invece il tracker lì.
      </p>
      <ChipToggle
        label=""
        options={CONDIZIONI_5E}
        selected={character.condizioniAttive}
        onToggle={toggle}
      />
    </section>
  );
}

export function TalentiSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const setTalenti = (talenti: KnownFeat[]) => onChange({ ...character, talenti });

  const addTalento = () =>
    setTalenti([...character.talenti, { id: crypto.randomUUID(), nome: "" }]);

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">Talenti</h2>
        <button onClick={addTalento} className="text-xs font-bold text-accent-strong hover:underline">
          + Aggiungi talento
        </button>
      </div>
      {character.talenti.length === 0 && (
        <p className="text-sm text-muted">Nessun talento aggiunto ancora.</p>
      )}
      <div className="space-y-2">
        {character.talenti.map((talento) => (
          <div key={talento.id} className="rounded-lg border border-edge bg-surface-raised p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <Autocomplete
                  value={talento.nome}
                  onChange={(nome) =>
                    setTalenti(
                      character.talenti.map((t) => (t.id === talento.id ? { ...t, nome } : t)),
                    )
                  }
                  loader={loadFeats}
                  placeholder="Alert, Lucky, Tough…"
                  inputClassName="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                  kind="talenti"
                />
              </div>
              <button
                onClick={() => setTalenti(character.talenti.filter((t) => t.id !== talento.id))}
                className="text-muted hover:text-danger text-sm shrink-0"
                aria-label={`Rimuovi ${talento.nome || "talento"}`}
              >
                ×
              </button>
            </div>
            <FeatInfo nome={talento.nome} />
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatInfo({ nome }: { nome: string }) {
  const [showInfo, setShowInfo] = useState(false);
  const [feats, setFeats] = useState<RawFeat[] | null>(null);
  const [talentiIta, setTalentiIta] = useState<Awaited<ReturnType<typeof getTalentiIta>> | null>(
    null,
  );

  useEffect(() => {
    loadFeats().then(setFeats);
  }, []);

  const match = feats?.find((f) => f.name.toLowerCase() === nome.trim().toLowerCase()) ?? null;
  const ia = useTraduzioneIa("talenti", match?.name ?? "", match?.source ?? "", !!match);
  const liveTranslatedName = useTranslatedText(match?.name, "en", "it");
  const translatedName = ia?.nomeIta ?? liveTranslatedName;

  useEffect(() => {
    if (!showInfo || !match) return;
    let cancelled = false;
    getTalentiIta().then((data) => {
      if (!cancelled) setTalentiIta(data);
    });
    return () => {
      cancelled = true;
    };
  }, [showInfo, match]);

  if (!match) return null;

  const ufficiale =
    talentiIta && translatedName
      ? (talentiIta.find((t) => normalizeItaName(t.nome) === normalizeItaName(translatedName)) ?? null)
      : null;

  return (
    <div className="pt-1 border-t border-edge/60">
      <button
        onClick={() => setShowInfo((prev) => !prev)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        {showInfo ? "Nascondi" : "Come funziona"}
      </button>
      {showInfo && (
        <div className="mt-2">
          {ufficiale ? (
            <>
              <p className="text-[10px] font-bold text-accent-strong mb-1">📖 Testo ufficiale</p>
              {ufficiale.prerequisito && (
                <p className="text-xs text-muted mb-1">Prerequisiti: {ufficiale.prerequisito}</p>
              )}
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {ufficiale.descrizione}
              </p>
            </>
          ) : ia?.descrizioneIta ? (
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
              {ia.descrizioneIta}
            </p>
          ) : (
            <RenderEntries entries={match.entries} />
          )}
        </div>
      )}
    </div>
  );
}

