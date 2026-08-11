"use client";

import { useEffect, useState } from "react";
import { IntField } from "@/components/int-field";
import {
  CONDIZIONI_5E,
  DAMAGE_TYPES,
  LANGUAGES,
  carryingCapacityKg,
  type Character,
  type InventoryItem,
  type KnownFeat,
} from "@/lib/dnd";
import { loadFeats, loadInventoryItems, type RawItem } from "@/lib/fivetools/data";
import { DualName } from "@/lib/fivetools/compendio-detail";
import { weightLbToKg } from "@/lib/fivetools/format";
import { findCompendioMatch } from "@/lib/fivetools/mention-search";
import { Autocomplete } from "./autocomplete";
import { CompendioInfoButton } from "./compendio-info-button";

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
                    onSelect={(option: RawItem, nomeScelto: string) =>
                      setInventario(
                        character.inventario.map((i) =>
                          i.id === item.id
                            ? {
                                ...i,
                                nome: nomeScelto,
                                // Precompila il peso da quello VERO dell'oggetto nel Compendio,
                                // SOLO se ancora a zero — non sovrascrivere un valore che il
                                // giocatore ha già eventualmente corretto a mano (stesso
                                // principio del dado danno degli incantesimi). Segnalato
                                // dall'utente: "deve aggiornarsi automaticamente il peso in base
                                // agli oggetti che ho".
                                peso:
                                  i.peso === 0 && option.weight !== undefined
                                    ? weightLbToKg(option.weight)
                                    : i.peso,
                              }
                            : i,
                        ),
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
              <CompendioInfoButton kind="oggetti" nome={item.nome} />
            </div>
          ))}
        </div>
      )}
    </section>
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

// Il talento è salvato come nome libero (in inglese, quello scelto dall'Autocomplete), senza
// fonte — a differenza del bottone "📖 Verifica" (CompendioInfoButton), che risolve il match e
// mostra il nome ufficiale/IA dentro al modal, l'elenco stesso non mostrava alcuna traduzione:
// stesso identico talento appariva in inglese qui e in italiano nel modal, segnalato dall'utente
// come incoerenza ("sono la stessa cosa ma sono tradotti diversi"). Risolve il match una seconda
// volta (stessa funzione di CompendioInfoButton, cache condivisa) per avere anche qui il source
// esatto e quindi la stessa priorità ufficiale/IA usata ovunque nel Compendio, non solo la
// traduzione live generica di DualName senza source.
function TalentoNameHint({ nome }: { nome: string }) {
  const [match, setMatch] = useState<{ name: string; source: string } | null>(null);
  const trimmed = nome.trim();

  useEffect(() => {
    if (!trimmed) return;
    let cancelled = false;
    findCompendioMatch("talenti", trimmed).then((found) => {
      if (!cancelled) setMatch(found);
    });
    return () => {
      cancelled = true;
    };
  }, [trimmed]);

  if (!trimmed || !match) return null;

  return (
    <p className="px-0.5 text-xs text-muted">
      <DualName text={match.name} kind="talenti" source={match.source} inline />
    </p>
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
            <TalentoNameHint nome={talento.nome} />
            <CompendioInfoButton kind="talenti" nome={talento.nome} />
          </div>
        ))}
      </div>
    </section>
  );
}

