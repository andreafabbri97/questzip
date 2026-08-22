"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IntField } from "@/components/int-field";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";
import {
  ABILITIES,
  ABILITY_CODE_TO_KEY,
  ABILITY_LABELS,
  POINT_BUY_BUDGET,
  RECUPERO_LABELS,
  RECUPERO_OPTIONS,
  SKILLS,
  STANDARD_ARRAY,
  abilityModifier,
  applyLongRest,
  applyShortRest,
  calculateMulticlassHitPoints,
  canonicalClassName,
  formatModifier,
  hitDiceRecoveredOnLongRest,
  multiclassCasterLevel,
  pactMagicForLevel,
  pointBuyCost,
  primaryCastingAbility,
  roll4d6DropLowest,
  savingThrowModifier,
  skillModifier,
  spellAttackBonus,
  spellSaveDC,
  spellSlotsForCasterLevel,
  totalLevel,
  warlockLevel,
  type Ability,
  type Character,
  type LimitedFeature,
  type MagicItem,
} from "@/lib/dnd";
import { loadClassData, loadItems, resolveClassFeatures, resolveSubclassFeatures } from "@/lib/fivetools/data";
import { DiceRollerModal, type DiceRollerPreset } from "@/components/dice-roller-modal";
import { Autocomplete } from "./autocomplete";
import { CompendioInfoButton } from "./compendio-info-button";
import { LocalInfoButton } from "./local-info-button";
import type { SimpleEntryData } from "./simple-entry-modal";

export function DeathSaves({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const toggle = (key: "tiriMorteSuccessi" | "tiriMorteFallimenti", index: number) => {
    const current = character[key];
    // clic sul pallino già attivo più a destra = lo toglie, altrimenti riempie fino a quel punto
    const next = index < current ? index : index + 1;
    onChange({ ...character, [key]: next });
  };

  return (
    <div className="mb-5 rounded-lg border border-danger/40 bg-danger/5 p-3 space-y-2">
      <p className="text-xs font-bold text-danger">
        ☠️ 0 PF — tiri salvezza contro la morte
      </p>
      <DeathSaveRow
        label="Successi"
        value={character.tiriMorteSuccessi}
        color="border-accent-strong bg-accent-strong"
        onToggle={(i) => toggle("tiriMorteSuccessi", i)}
      />
      <DeathSaveRow
        label="Fallimenti"
        value={character.tiriMorteFallimenti}
        color="border-danger bg-danger"
        onToggle={(i) => toggle("tiriMorteFallimenti", i)}
      />
      {(character.tiriMorteSuccessi >= 3 || character.tiriMorteFallimenti >= 3) && (
        <p className="text-xs font-bold text-foreground">
          {character.tiriMorteSuccessi >= 3 ? "✓ Stabilizzato" : "✝ Morto"}
        </p>
      )}
    </div>
  );
}

function DeathSaveRow({
  label,
  value,
  color,
  onToggle,
}: {
  label: string;
  value: number;
  color: string;
  onToggle: (index: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted w-20">{label}</span>
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          onClick={() => onToggle(i)}
          aria-label={`${label} ${i + 1}`}
          className={`size-5 rounded-full border-2 transition-colors ${
            i < value ? color : "border-edge bg-transparent"
          }`}
        />
      ))}
    </div>
  );
}

export function HitPointCalculator({
  character,
  onApply,
}: {
  character: Character;
  onApply: (hpMax: number) => void;
}) {
  const [hitDice, setHitDice] = useState<number[]>([]);

  // hitDice è indicizzato per POSIZIONE nell'array (ClassEntry non ha un id stabile) — se una
  // classe viene rimossa o riordinata nella sezione "Classi" qui sopra mentre questo calcolatore
  // ha già dei dadi scelti, le posizioni si disallineano: il dado scelto per la classe rimossa
  // finirebbe silenziosamente attribuito a quella successiva. Si azzera la selezione ogni volta
  // che cambia l'elenco dei nomi di classe, invece di tenere scelte ormai riferite a posizioni
  // che non corrispondono più alle stesse classi.
  const classSignature = character.classi.map((c) => c.nome).join("|");
  const [loadedSignature, setLoadedSignature] = useState(classSignature);
  if (classSignature !== loadedSignature) {
    setLoadedSignature(classSignature);
    setHitDice([]);
  }

  const conModifier = abilityModifier(character.caratteristiche.costituzione);

  const suggested = calculateMulticlassHitPoints(
    character.classi.map((entry, index) => ({
      hitDieFaces: hitDice[index] ?? 8,
      livello: entry.livello,
    })),
    conModifier,
  );

  return (
    <div className="mt-4 pt-4 border-t border-edge space-y-3">
      <p className="text-[10px] uppercase tracking-widest text-muted">Calcolatore PF</p>
      {character.classi.map((entry, index) => (
        <div key={index} className="flex items-center gap-3 text-sm">
          <span className="text-muted w-40 truncate">
            {entry.nome || `Classe ${index + 1}`} {entry.livello}
            {index === 0 && " (origine)"}
          </span>
          <select
            value={hitDice[index] ?? 8}
            onChange={(event) =>
              setHitDice((prev) => {
                const next = [...prev];
                while (next.length <= index) next.push(8);
                next[index] = Number(event.target.value);
                return next;
              })
            }
            className="rounded-md border border-edge bg-surface-raised px-2 py-1 text-sm text-foreground"
          >
            {[6, 8, 10, 12].map((faces) => (
              <option key={faces} value={faces}>
                d{faces}
              </option>
            ))}
          </select>
        </div>
      ))}
      <p className="text-sm text-muted">
        Con mod. COS {formatModifier(conModifier)} (1° livello della classe di origine
        massimizzato, il resto in media):{" "}
        <span className="font-bold text-accent-strong">{suggested} PF</span>
      </p>
      <button
        onClick={() => onApply(suggested)}
        className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-sm text-foreground hover:border-accent transition-colors"
      >
        Applica a PF max
      </button>
    </div>
  );
}

export function InspirationToggle({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  return (
    <button
      onClick={() => onChange({ ...character, ispirazione: !character.ispirazione })}
      className={`card-elevated-hover flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold transition-colors ${
        character.ispirazione
          ? "glow-accent border-accent bg-accent/15 text-accent-strong"
          : "border-edge bg-surface-raised text-muted hover:text-foreground"
      }`}
    >
      <span className="text-lg leading-none">{character.ispirazione ? "⭐" : "☆"}</span>
      Ispirazione
    </button>
  );
}

export function HitDiceTracker({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  // Il TOTALE dei dadi vita coincide sempre col livello totale (regola RAW), a prescindere dal
  // mix di classi — solo il TIPO di dado differisce per classe, qui non tracciato perché servirebbe
  // salvarlo per ogni riga di classe (oggi assente da ClassEntry) solo per questo scopo.
  const totale = totalLevel(character.classi);
  const usati = Math.min(character.dadiVitaUsati, totale);
  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-2 text-center">
      <p className="text-[10px] uppercase tracking-widest text-muted">Dadi Vita</p>
      <div className="flex items-center justify-center gap-1 mt-1">
        <button
          onClick={() => onChange({ ...character, dadiVitaUsati: usati + 1 })}
          disabled={usati >= totale}
          className="size-6 rounded-full border border-edge text-danger disabled:opacity-30"
          aria-label="Spendi un dado vita (riposo breve)"
        >
          −
        </button>
        <span className="w-14 text-sm font-bold text-foreground">
          {totale - usati}/{totale}
        </span>
        <button
          onClick={() =>
            onChange({
              ...character,
              dadiVitaUsati: Math.max(0, usati - hitDiceRecoveredOnLongRest(totale)),
            })
          }
          disabled={usati <= 0}
          className="rounded-full border border-edge px-2 text-[10px] font-bold text-accent-strong disabled:opacity-30"
          aria-label="Riposo lungo: recupera metà dei dadi vita"
        >
          riposo lungo
        </button>
      </div>
    </div>
  );
}

/**
 * Riposo breve/lungo: prima viveva solo nella scheda Incantesimi e sistemava solo gli slot
 * (applyLongRest/applyShortRest in lib/dnd.ts ora coprono anche PF, dadi vita, tiri contro la
 * morte e privilegi a usi limitati) — spostato in ⚔️ Combattimento perché riguarda tutto il
 * personaggio, non solo chi lancia incantesimi. Chiede sempre conferma spiegando cosa cambierà,
 * prima di applicare qualcosa di potenzialmente irreversibile per la sessione di gioco in corso.
 */
export function RestSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const [pending, setPending] = useState<"breve" | "lungo" | null>(null);
  const wlLevel = warlockLevel(character.classi);
  const casterLevel = multiclassCasterLevel(character.classi);
  const totale = totalLevel(character.classi);

  const buildSummary = (type: "breve" | "lungo"): string[] => {
    const lines: string[] = [];
    if (type === "lungo") {
      if (character.hpAttuali < character.hpMax) {
        lines.push(`Punti ferita ripristinati al massimo (${character.hpMax}).`);
      }
      // Dichiarati esplicitamente: sono due effetti RAW che il riposo lungo applica davvero (vedi
      // applyLongRest) ma che il riepilogo non nominava — l'utente li avrebbe visti cambiare senza
      // averli mai visti annunciare.
      if (character.hpTemporanei > 0) {
        lines.push(`Punti ferita temporanei scaduti (erano ${character.hpTemporanei}).`);
      }
      if (character.affaticamento > 0) {
        lines.push(
          `Affaticamento ridotto di 1 livello (da ${character.affaticamento} a ${character.affaticamento - 1}).`,
        );
      }
      const dadiRecuperati = Math.min(character.dadiVitaUsati, hitDiceRecoveredOnLongRest(totale));
      if (dadiRecuperati > 0) {
        lines.push(
          `${dadiRecuperati} dado/i vita recuperato/i (metà del totale, arrotondato per difetto, minimo 1).`,
        );
      }
      const slotUsatiTotali = character.slotUsati.reduce((sum, v) => sum + v, 0);
      if (casterLevel > 0 && slotUsatiTotali > 0) lines.push("Tutti gli slot incantesimo ripristinati.");
      if (wlLevel > 0 && character.slotPattoUsati > 0) lines.push("Slot Patto Magico ripristinati.");
      if (character.tiriMorteSuccessi > 0 || character.tiriMorteFallimenti > 0) {
        lines.push("Tiri salvezza contro la morte azzerati.");
      }
      const privilegi = character.privilegiLimitati.filter(
        (f) =>
          f.usiUsati > 0 &&
          (f.recupero === "riposoBreve" || f.recupero === "riposoLungo" || f.recupero === "alba"),
      );
      if (privilegi.length > 0) {
        lines.push(
          `Privilegi a usi limitati ripristinati: ${privilegi.map((f) => f.nome || "senza nome").join(", ")}.`,
        );
      }
    } else {
      if (wlLevel > 0 && character.slotPattoUsati > 0) {
        lines.push("Slot Patto Magico ripristinati (si recuperano solo con un riposo breve).");
      }
      const privilegi = character.privilegiLimitati.filter(
        (f) => f.usiUsati > 0 && f.recupero === "riposoBreve",
      );
      if (privilegi.length > 0) {
        lines.push(
          `Privilegi a usi limitati ripristinati: ${privilegi.map((f) => f.nome || "senza nome").join(", ")}.`,
        );
      }
      lines.push("I punti ferita non si ripristinano da soli: spendi Dadi Vita qui sopra per curarti.");
    }
    if (lines.length === 0) lines.push("Non c'è nulla da ripristinare al momento.");
    return lines;
  };

  const confirm = () => {
    if (pending === "lungo") onChange(applyLongRest(character));
    else if (pending === "breve") onChange(applyShortRest(character));
    setPending(null);
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Prima il riposo breve compariva SOLO per i Warlock (gli unici a recuperare slot così), ma
          il recupero "riposo breve" è selezionabile su qualunque privilegio a usi limitati di
          qualunque classe (Punti Ki del Monaco, Recuperare Energie del Guerriero, Canalizzare
          Divinità del Chierico...): senza il bottone quei personaggi potevano impostare il
          recupero ma non applicarlo mai. Ora è sempre disponibile — il riepilogo di conferma
          spiega comunque caso per caso cosa cambierà davvero. */}
      <button
        onClick={() => setPending("breve")}
        className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-xs font-bold text-accent-strong hover:border-accent transition-colors"
      >
        😴 Riposo breve
      </button>
      <button
        onClick={() => setPending("lungo")}
        className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-xs font-bold text-accent-strong hover:border-accent transition-colors"
      >
        🌙 Riposo lungo
      </button>
      {pending && (
        <RestConfirmModal
          title={pending === "lungo" ? "Riposo lungo" : "Riposo breve"}
          lines={buildSummary(pending)}
          onConfirm={confirm}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function RestConfirmModal({
  title,
  lines,
  onConfirm,
  onCancel,
}: {
  title: string;
  lines: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useBodyScrollLock(true);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return createPortal(
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-overlay-in"
      onClick={onCancel}
    >
      <div
        className="card-elevated w-full max-w-sm rounded-xl border border-edge bg-background p-5 space-y-4 animate-modal-in"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-display font-bold text-accent-strong">{title}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <button
            onClick={onConfirm}
            className="glow-accent rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97]"
          >
            Conferma
          </button>
          <button
            onClick={onCancel}
            className="rounded-lg border border-edge px-4 py-2 text-sm text-muted hover:text-foreground transition-colors"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function AttunedItemsSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const items = character.oggettiMagici;
  const setItems = (next: MagicItem[]) => onChange({ ...character, oggettiMagici: next });
  const updateItem = (id: string, patch: Partial<MagicItem>) =>
    setItems(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  // 3 è il tetto RAW di base per l'armonizzazione, ma solo un promemoria: alcune classi/oggetti
  // (es. Fabbro da Battaglia, Anello di Sintonia Spirituale) lo alzano legittimamente, quindi non
  // blocca più l'aggiunta di nuove spunte oltre quel numero.
  const armonizzatiCount = items.filter((item) => item.armonizzato).length;

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted">Oggetti magici</span>
        <span className={`text-xs ${armonizzatiCount > 3 ? "text-accent-strong font-bold" : "text-muted"}`}>
          {armonizzatiCount}/3 armonizzati
        </span>
      </div>
      {items.map((item) => (
        <div key={item.id} className="space-y-1">
          <div className="flex items-center gap-2">
            <label className="flex items-center shrink-0" title="Armonizzato">
              <input
                type="checkbox"
                checked={item.armonizzato}
                onChange={(event) => updateItem(item.id, { armonizzato: event.target.checked })}
                aria-label={`${item.nome || "Oggetto"} armonizzato`}
              />
            </label>
            <div className="flex-1 min-w-0">
              <Autocomplete
                value={item.nome}
                onChange={(nome) => updateItem(item.id, { nome })}
                loader={loadItems}
                placeholder="Nome oggetto magico"
                inputClassName="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1 text-sm text-foreground"
                kind="oggetti"
              />
            </div>
            <button
              onClick={() => setItems(items.filter((i) => i.id !== item.id))}
              className="text-muted hover:text-danger text-sm shrink-0"
              aria-label={`Rimuovi ${item.nome || "oggetto magico"}`}
            >
              ×
            </button>
          </div>
          <CompendioInfoButton kind="oggetti" nome={item.nome} />
        </div>
      ))}
      <button
        onClick={() => setItems([...items, { id: crypto.randomUUID(), nome: "", armonizzato: true }])}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        + Aggiungi
      </button>
    </div>
  );
}

export function LimitedFeaturesSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const features = character.privilegiLimitati;
  const setFeatures = (next: LimitedFeature[]) =>
    onChange({ ...character, privilegiLimitati: next });
  const updateFeature = (id: string, patch: Partial<LimitedFeature>) =>
    setFeatures(features.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  // I privilegi a usi limitati non sono una categoria del Compendio a sé (vivono dentro i dati
  // delle classi/sottoclassi) — la ricerca si limita a QUELLE del personaggio invece che a tutte
  // le classi esistenti, dato che un privilegio come "Rabbia" ha senso solo lì.
  const loadFeatureCandidates = useCallback(async (): Promise<SimpleEntryData[]> => {
    const data = await loadClassData();
    const results: SimpleEntryData[] = [];
    for (const entry of character.classi) {
      const canonical = canonicalClassName(entry.nome).toLowerCase();
      if (!canonical) continue;
      const cls = data.classes.find((c) => c.name.toLowerCase() === canonical);
      if (cls) {
        for (const feature of resolveClassFeatures(data, cls)) {
          results.push({
            title: feature.name,
            meta: `${cls.name} — liv. ${feature.level}`,
            entries: feature.entries,
          });
        }
      }
      if (entry.sottoclasse) {
        const subclass = data.subclasses.find(
          (s) => s.name === entry.sottoclasse && s.className.toLowerCase() === canonical,
        );
        if (subclass) {
          for (const feature of resolveSubclassFeatures(data, subclass)) {
            results.push({
              title: feature.name,
              meta: `${subclass.name} — liv. ${feature.level}`,
              entries: feature.entries,
            });
          }
        }
      }
    }
    return results;
  }, [character.classi]);

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          ⚡ Privilegi a usi limitati
        </h2>
        <button
          onClick={() =>
            setFeatures([
              ...features,
              { id: crypto.randomUUID(), nome: "", usiMax: 1, usiUsati: 0, recupero: "riposoLungo" },
            ])
          }
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          + Aggiungi
        </button>
      </div>
      {features.length === 0 ? (
        <p className="text-sm text-muted">
          Nessuno — es. Rabbia, Canalizzare Divinità, Punti Ki, Ispirazione Bardica…
        </p>
      ) : (
        <ul className="space-y-2">
          {features.map((f) => (
            <li key={f.id} className="rounded-lg border border-edge bg-surface-raised p-3 space-y-1.5">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={f.nome}
                  onChange={(event) => updateFeature(f.id, { nome: event.target.value })}
                  placeholder="Nome (es. Rabbia)"
                  className="input-focus flex-1 min-w-[140px] rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
                />
                <label className="flex items-center gap-1.5 text-xs text-muted shrink-0">
                  Max
                  <IntField
                    min={1}
                    max={99}
                    value={f.usiMax}
                    onChange={(value) =>
                      updateFeature(f.id, { usiMax: value, usiUsati: Math.min(f.usiUsati, value) })
                    }
                    className="w-12 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
                  />
                </label>
                <select
                  value={f.recupero}
                  onChange={(event) =>
                    updateFeature(f.id, {
                      recupero: event.target.value as LimitedFeature["recupero"],
                    })
                  }
                  className="shrink-0 rounded-md border border-edge bg-surface px-1.5 py-1 text-xs text-foreground"
                >
                  {RECUPERO_OPTIONS.map((r) => (
                    <option key={r} value={r}>
                      {RECUPERO_LABELS[r]}
                    </option>
                  ))}
                </select>
                <SlotCounter
                  label="Usi"
                  max={f.usiMax}
                  used={f.usiUsati}
                  onChange={(used) => updateFeature(f.id, { usiUsati: used })}
                />
                <button
                  onClick={() => setFeatures(features.filter((x) => x.id !== f.id))}
                  className="text-muted hover:text-danger text-sm shrink-0"
                  aria-label={`Rimuovi ${f.nome || "privilegio"}`}
                >
                  ×
                </button>
              </div>
              <LocalInfoButton nome={f.nome} loadCandidates={loadFeatureCandidates} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PhysicalDescriptionSection({
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
    "input-focus mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground";

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5">
      <button
        onClick={() => setExpanded((prev) => !prev)}
        className="text-sm uppercase tracking-widest text-muted hover:text-foreground transition-colors"
      >
        Aspetto {expanded ? "▲" : "▼"}
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-edge pt-3">
          {character.ritrattoUrl && (
            // URL arbitrario fornito dal giocatore, non un asset locale ottimizzabile da next/image
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={character.ritrattoUrl}
              alt={character.nome}
              className="max-h-64 rounded-lg border border-edge mx-auto"
            />
          )}
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-muted">
              URL ritratto (opzionale)
            </span>
            <input
              value={character.ritrattoUrl}
              onChange={(event) => set("ritrattoUrl", event.target.value)}
              placeholder="https://…"
              className={fieldClass}
            />
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(
              [
                ["eta", "Età"],
                ["altezza", "Altezza"],
                ["peso", "Peso"],
                ["occhi", "Occhi"],
                ["carnagione", "Carnagione"],
                ["capelli", "Capelli"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                <span className="text-[10px] uppercase tracking-widest text-muted">{label}</span>
                <input
                  value={character[key]}
                  onChange={(event) => set(key, event.target.value)}
                  className={fieldClass}
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

type GenMode = "manuale" | "array" | "punti" | "dadi";
const GEN_MODE_LABELS: Record<GenMode, string> = {
  manuale: "Manuale",
  array: "Array standard",
  punti: "Acquisto punti",
  dadi: "Tira i dadi",
};

export function AbilityScoreSection({
  character,
  onChange,
  setAbility,
}: {
  character: Character;
  onChange: (character: Character) => void;
  setAbility: (ability: Ability, value: number) => void;
}) {
  const [mode, setMode] = useState<GenMode>("manuale");
  const [pool, setPool] = useState<number[]>([...STANDARD_ARRAY]);
  const [assignment, setAssignment] = useState<Partial<Record<Ability, number>>>({});

  const switchMode = (next: GenMode) => {
    if (next === "punti" && mode !== "punti") {
      const hasScores = Object.values(character.caratteristiche).some((v) => v !== 8);
      if (
        hasScores &&
        !window.confirm(
          "Passando ad Acquisto punti le caratteristiche attuali verranno azzerate a 8. Continuare?",
        )
      ) {
        return;
      }
    }
    setMode(next);
    setAssignment({});
    if (next === "array") setPool([...STANDARD_ARRAY]);
    if (next === "punti") {
      onChange({
        ...character,
        caratteristiche: {
          forza: 8,
          destrezza: 8,
          costituzione: 8,
          intelligenza: 8,
          saggezza: 8,
          carisma: 8,
        },
      });
    }
  };

  const reroll = () => {
    setPool(Array.from({ length: 6 }, () => roll4d6DropLowest()).sort((a, b) => b - a));
    setAssignment({});
  };

  const assignFromPool = (ability: Ability, index: number) => {
    setAssignment((prev) => ({ ...prev, [ability]: index }));
    setAbility(ability, pool[index]);
  };

  const spent = pointBuyCost(character.caratteristiche);
  const usedIndexes = new Set(Object.values(assignment));

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-muted">Caratteristiche</h2>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(GEN_MODE_LABELS) as GenMode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`rounded-full border px-3 py-1 text-xs font-bold transition-colors ${
                mode === m
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                  : "border-edge text-muted hover:text-foreground"
              }`}
            >
              {GEN_MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {mode === "punti" && (
        <p
          className={`text-sm font-bold ${spent > POINT_BUY_BUDGET ? "text-danger" : "text-accent-strong"}`}
        >
          Punti spesi: {spent} / {POINT_BUY_BUDGET}
        </p>
      )}

      {mode === "dadi" && (
        <button
          onClick={reroll}
          className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-sm text-foreground hover:border-accent transition-colors"
        >
          🎲 Tira i 6 dadi (4d6, scarta il minore)
        </button>
      )}

      {(mode === "array" || mode === "dadi") && (
        <p className="text-xs text-muted">
          Valori disponibili: {pool.join(", ")} — assegnali qui sotto.
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {ABILITIES.map((ability) => {
          const score = character.caratteristiche[ability];
          return (
            <div
              key={ability}
              className="rounded-lg border border-edge bg-surface-raised p-3 text-center"
            >
              <p className="text-[10px] uppercase tracking-widest text-muted">
                {ABILITY_LABELS[ability]}
              </p>
              <p className="text-2xl font-display font-bold text-accent-strong">
                {formatModifier(abilityModifier(score))}
              </p>

              {mode === "manuale" && (
                <IntField
                  min={1}
                  max={30}
                  value={score}
                  onChange={(value) => setAbility(ability, value)}
                  className="mt-1 w-16 mx-auto block rounded-md border border-edge bg-surface px-2 py-1 text-center text-sm text-foreground"
                />
              )}

              {mode === "punti" && (
                <div className="flex items-center justify-center gap-2 mt-1">
                  <button
                    onClick={() => setAbility(ability, Math.max(8, score - 1))}
                    disabled={score <= 8}
                    className="size-7 rounded-full border border-edge text-foreground disabled:opacity-30"
                  >
                    −
                  </button>
                  <span className="w-6 text-sm font-bold text-foreground">{score}</span>
                  <button
                    onClick={() => setAbility(ability, Math.min(15, score + 1))}
                    disabled={score >= 15}
                    className="size-7 rounded-full border border-edge text-foreground disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              )}

              {(mode === "array" || mode === "dadi") && (
                <select
                  value={assignment[ability] ?? ""}
                  onChange={(event) => assignFromPool(ability, Number(event.target.value))}
                  className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1 text-center text-sm text-foreground"
                >
                  <option value="" disabled>
                    —
                  </option>
                  {pool.map((value, index) =>
                    !usedIndexes.has(index) || assignment[ability] === index ? (
                      <option key={index} value={index}>
                        {value}
                      </option>
                    ) : null,
                  )}
                </select>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SavingThrowsAndSkills({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const level = totalLevel(character.classi);

  const toggleSave = (ability: Ability) => {
    const has = character.trsCompetenti.includes(ability);
    onChange({
      ...character,
      trsCompetenti: has
        ? character.trsCompetenti.filter((a) => a !== ability)
        : [...character.trsCompetenti, ability],
    });
  };

  const cycleSkill = (skill: string) => {
    const competente = character.abilitaCompetenti.includes(skill);
    const esperto = character.abilitaEsperte.includes(skill);
    if (!competente && !esperto) {
      onChange({ ...character, abilitaCompetenti: [...character.abilitaCompetenti, skill] });
    } else if (competente && !esperto) {
      onChange({ ...character, abilitaEsperte: [...character.abilitaEsperte, skill] });
    } else {
      onChange({
        ...character,
        abilitaCompetenti: character.abilitaCompetenti.filter((s) => s !== skill),
        abilitaEsperte: character.abilitaEsperte.filter((s) => s !== skill),
      });
    }
  };

  const suggestFromClass = async () => {
    const primary = character.classi[0];
    if (!primary?.nome.trim()) return;
    const data = await loadClassData();
    const cls = data.classes.find(
      (c) => c.name.toLowerCase() === canonicalClassName(primary.nome).toLowerCase(),
    );
    const abilities = (cls?.proficiency ?? [])
      .map((code) => ABILITY_CODE_TO_KEY[code])
      .filter((a): a is Ability => Boolean(a));
    if (abilities.length > 0) onChange({ ...character, trsCompetenti: abilities });
  };

  // Stesso modal dadi (3D fisico incluso) usato per le armi (vedi WeaponsSection in
  // weapons-spells.tsx), al posto del tiro istantaneo "invisibile" di prima.
  const [dicePreset, setDicePreset] = useState<DiceRollerPreset | null>(null);
  const rollCheck = (label: string, mod: number) => {
    setDicePreset({ label, groups: [{ die: 20, quantity: 1 }], modifier: mod });
  };

  // Bonus extra per tiro salvezza/abilità (es. Manto della Protezione: +1 a tutti i TS) — il
  // calcolo RAW sotto (savingThrowModifier/skillModifier) resta sempre corretto da solo, questo si
  // somma sopra. Chiave assente = 0, la rimuoviamo invece di scrivere uno 0 esplicito per tenere
  // l'oggetto piccolo nel caso comune "nessun bonus".
  const setTrsBonus = (ability: Ability, value: number) => {
    const next = { ...character.trsBonus };
    if (value === 0) delete next[ability];
    else next[ability] = value;
    onChange({ ...character, trsBonus: next });
  };
  const setAbilitaBonus = (skill: string, value: number) => {
    const next = { ...character.abilitaBonus };
    if (value === 0) delete next[skill];
    else next[skill] = value;
    onChange({ ...character, abilitaBonus: next });
  };

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-4">
      <DiceRollerModal preset={dicePreset} onClose={() => setDicePreset(null)} />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-muted">Tiri salvezza</h2>
        <button
          onClick={suggestFromClass}
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          Suggerisci dalla classe di origine
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {ABILITIES.map((ability) => {
          const proficient = character.trsCompetenti.includes(ability);
          const bonus = character.trsBonus[ability] ?? 0;
          const mod =
            savingThrowModifier(character.caratteristiche[ability], proficient, level) + bonus;
          return (
            <div key={ability} className="flex items-stretch gap-1">
              <button
                onClick={() => toggleSave(ability)}
                className={`flex flex-1 min-w-0 items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                  proficient
                    ? "border-accent bg-accent/10 text-accent-strong"
                    : "border-edge bg-surface-raised text-muted hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className={`size-2 rounded-full shrink-0 ${proficient ? "bg-accent" : "bg-edge"}`} />
                  <span className="truncate">{ABILITY_LABELS[ability]}</span>
                </span>
                <span className="font-bold shrink-0">{formatModifier(mod)}</span>
              </button>
              <IntField
                value={bonus}
                onChange={(value) => setTrsBonus(ability, value)}
                aria-label={`Bonus extra al tiro salvezza su ${ABILITY_LABELS[ability]}`}
                placeholder="+0"
                title="Bonus extra (oggetti magici, talenti…)"
                className="w-10 shrink-0 rounded-lg border border-edge bg-surface-raised px-1 text-center text-xs text-foreground"
              />
              <button
                onClick={() => rollCheck(ABILITY_LABELS[ability], mod)}
                aria-label={`Tira salvezza su ${ABILITY_LABELS[ability]}`}
                className="shrink-0 rounded-lg border border-edge px-2 text-muted hover:text-accent-strong hover:border-accent transition-colors"
              >
                🎲
              </button>
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="text-sm uppercase tracking-widest text-muted">Abilità</h2>
        <p className="text-xs text-muted mt-0.5">
          Click per alternare: nessuna → competente → esperto (bonus raddoppiato) → nessuna.
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-1.5">
        {SKILLS.map((skill) => {
          const competente = character.abilitaCompetenti.includes(skill.nome);
          const esperto = character.abilitaEsperte.includes(skill.nome);
          const bonus = character.abilitaBonus[skill.nome] ?? 0;
          const mod =
            skillModifier(character.caratteristiche[skill.abilita], competente, esperto, level) +
            bonus;
          return (
            <div key={skill.nome} className="flex items-stretch gap-1">
              <button
                onClick={() => cycleSkill(skill.nome)}
                className={`flex flex-1 min-w-0 items-center justify-between rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  esperto
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                    : competente
                      ? "border-accent/50 bg-accent/5 text-foreground"
                      : "border-edge bg-surface-raised text-muted hover:text-foreground"
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className={`size-2 rounded-full shrink-0 ${
                      esperto ? "bg-accent" : competente ? "bg-accent/60" : "bg-edge"
                    }`}
                  />
                  <span className="truncate">{skill.nome}</span>
                  <span className="text-[10px] text-muted shrink-0">
                    ({ABILITY_LABELS[skill.abilita].slice(0, 3)})
                  </span>
                </span>
                <span className="font-bold shrink-0">{formatModifier(mod)}</span>
              </button>
              <IntField
                value={bonus}
                onChange={(value) => setAbilitaBonus(skill.nome, value)}
                aria-label={`Bonus extra a ${skill.nome}`}
                placeholder="+0"
                title="Bonus extra (oggetti magici, talenti…)"
                className="w-10 shrink-0 rounded-lg border border-edge bg-surface-raised px-1 text-center text-xs text-foreground"
              />
              <button
                onClick={() => rollCheck(skill.nome, mod)}
                aria-label={`Tira ${skill.nome}`}
                className="shrink-0 rounded-lg border border-edge px-2 text-muted hover:text-accent-strong hover:border-accent transition-colors"
              >
                🎲
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SlotCounter({
  label,
  max,
  used,
  onChange,
}: {
  label: string;
  max: number;
  used: number;
  onChange: (used: number) => void;
}) {
  const available = max - used;
  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-2 text-center">
      <p className="text-[10px] uppercase tracking-widest text-muted">{label}</p>
      <div className="flex items-center justify-center gap-1 mt-1">
        <button
          onClick={() => onChange(used + 1)}
          disabled={available <= 0}
          className="size-6 rounded-full border border-edge text-danger disabled:opacity-30"
          aria-label="Usa slot"
        >
          −
        </button>
        <span className="w-10 text-sm font-bold text-foreground">
          {available}/{max}
        </span>
        <button
          onClick={() => onChange(used - 1)}
          disabled={used <= 0}
          className="size-6 rounded-full border border-edge text-accent-strong disabled:opacity-30"
          aria-label="Recupera slot"
        >
          +
        </button>
      </div>
    </div>
  );
}

export function SpellSlotsSection({
  character,
  onChange,
}: {
  character: Character;
  onChange: (character: Character) => void;
}) {
  const casterLevel = multiclassCasterLevel(character.classi);
  const wlLevel = warlockLevel(character.classi);
  const maxSlots = spellSlotsForCasterLevel(casterLevel);
  const pact = pactMagicForLevel(wlLevel);

  if (casterLevel === 0 && wlLevel === 0) return null;

  const castingAbility = primaryCastingAbility(character.classi);
  const level = totalLevel(character.classi);

  const setUsed = (index: number, used: number) => {
    const max = maxSlots[index];
    const next = Math.min(max, Math.max(0, used));
    onChange({
      ...character,
      slotUsati: character.slotUsati.map((v, i) => (i === index ? next : v)),
    });
  };

  const setPactUsed = (used: number) => {
    onChange({ ...character, slotPattoUsati: Math.min(pact.slots, Math.max(0, used)) });
  };

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm uppercase tracking-widest text-muted">Slot incantesimi</h2>
        <p className="text-xs text-muted">
          Il riposo si gestisce dalla scheda ⚔️ Combattimento (ripristina tutto, non solo gli slot).
        </p>
      </div>

      {castingAbility && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-edge bg-surface-raised px-3 py-2 text-center">
            <span className="text-[10px] uppercase tracking-widest text-muted">CD tiro salvezza</span>
            <p className="text-lg font-bold text-foreground">
              {spellSaveDC(level, character.caratteristiche[castingAbility]) + character.cdIncantesimiBonus}
            </p>
            <IntField
              value={character.cdIncantesimiBonus}
              onChange={(value) => onChange({ ...character, cdIncantesimiBonus: value })}
              className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1 text-center text-xs text-foreground"
              placeholder="bonus"
              aria-label="Bonus extra alla CD tiro salvezza degli incantesimi"
            />
          </div>
          <div className="rounded-lg border border-edge bg-surface-raised px-3 py-2 text-center">
            <span className="text-[10px] uppercase tracking-widest text-muted">Bonus attacco</span>
            <p className="text-lg font-bold text-foreground">
              {formatModifier(
                spellAttackBonus(level, character.caratteristiche[castingAbility]) +
                  character.attaccoIncantesimiBonus,
              )}
            </p>
            <IntField
              value={character.attaccoIncantesimiBonus}
              onChange={(value) => onChange({ ...character, attaccoIncantesimiBonus: value })}
              className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1 text-center text-xs text-foreground"
              placeholder="bonus"
              aria-label="Bonus extra al bonus di attacco degli incantesimi"
            />
          </div>
        </div>
      )}

      {casterLevel > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {maxSlots.map((max, index) =>
            max > 0 ? (
              <SlotCounter
                key={index}
                label={`Liv. ${index + 1}`}
                max={max}
                used={character.slotUsati[index] ?? 0}
                onChange={(used) => setUsed(index, used)}
              />
            ) : null,
          )}
        </div>
      )}

      {wlLevel > 0 && (
        <div className="pt-2 border-t border-edge space-y-2">
          <p className="text-xs text-muted">
            Patto Magico (Warlock, liv. {wlLevel}) — recupera con un riposo breve
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            <SlotCounter
              label={`Liv. ${pact.slotLevel}`}
              max={pact.slots}
              used={character.slotPattoUsati}
              onChange={setPactUsed}
            />
          </div>
        </div>
      )}
    </section>
  );
}
