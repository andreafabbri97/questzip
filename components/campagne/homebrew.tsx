"use client";

import { useEffect, useState } from "react";
import { MonsterCompendiumPicker } from "./generators";
import { descrizioneCreatura } from "@/lib/fivetools/creature-testo";
import { XP_BY_CR } from "@/lib/dnd-tables";
import { IntField } from "@/components/int-field";
import {
  createHomebrewEntry,
  deleteHomebrewEntry,
  getHomebrewForCampaign,
  toggleHomebrewVisible,
  updateHomebrewEntry,
} from "@/app/actions/homebrew";
import { TestoStrutturato } from "@/lib/fivetools/compendio-detail";

type HomebrewEntry = Awaited<ReturnType<typeof getHomebrewForCampaign>>[number];
type Tipo = HomebrewEntry["tipo"];

const TIPO_LABELS: Record<Tipo, string> = {
  mostro: "🐉 Mostro",
  oggetto: "💍 Oggetto",
  incantesimo: "✨ Incantesimo",
};

// Compendio "in proprio" della campagna: un mostro/oggetto/incantesimo che il Compendio
// ufficiale non ha perché non esiste nei manuali — richiesto esplicitamente dall'utente. A
// differenza di Rubrica NPC/Trame (sempre e solo per il master), una voce RIVELATA è visibile a
// tutto il party, esattamente come una voce vera del Compendio: il filtro "solo rivelate ai
// giocatori" è già applicato server-side da getHomebrewForCampaign (stessa regola di Handout).
export function HomebrewSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [entries, setEntries] = useState<HomebrewEntry[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<Tipo | "tutti">("tutti");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = () => {
    // Il .catch non è opzionale: entries === null fa restituire null all'intera sezione, quindi un
    // caricamento fallito la farebbe sparire dalla pagina senza spiegazione invece di mostrarla vuota.
    getHomebrewForCampaign(campaignId)
      .then(setEntries)
      .catch(() => setEntries([]));
  };
  useEffect(refresh, [campaignId]);

  if (entries === null) return null;
  if (entries.length === 0 && !isDm) return null;

  const filtered = filter === "tutti" ? entries : entries.filter((e) => e.tipo === filter);
  const selected = filtered.find((e) => e.id === selectedId) ?? null;

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm uppercase tracking-widest text-muted">📚 Compendio homebrew</h2>
        {isDm && (
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="text-xs font-bold text-accent-strong hover:underline"
          >
            {showForm ? "Annulla" : "+ Nuova voce"}
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted -mt-2">
        Mostri, oggetti e incantesimi inventati per questa campagna. Il master li prepara e li
        rivela quando serve: i giocatori vedono solo le voci già rivelate.
      </p>

      {showForm && isDm && (
        <NewHomebrewForm
          campaignId={campaignId}
          onCreated={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      {entries.length === 0 ? (
        <p className="text-sm text-muted">Nessuna voce ancora.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {(["tutti", "mostro", "oggetto", "incantesimo"] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
                  filter === value
                    ? "border-accent bg-accent/15 text-accent-strong"
                    : "border-edge text-muted hover:text-foreground"
                }`}
              >
                {value === "tutti" ? "Tutti" : TIPO_LABELS[value]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {filtered.map((entry) => (
              <button
                key={entry.id}
                onClick={() => setSelectedId(selectedId === entry.id ? null : entry.id)}
                className={`card-elevated-hover rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                  selectedId === entry.id
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface-raised text-muted hover:text-foreground"
                } ${isDm && !entry.visibile ? "opacity-60" : ""}`}
              >
                {entry.nome}
                {isDm && !entry.visibile && " · nascosto"}
              </button>
            ))}
          </div>
        </>
      )}

      {selected && (
        <HomebrewDetail
          key={selected.id}
          entry={selected}
          isDm={isDm}
          onChanged={refresh}
          onDeleted={() => {
            setSelectedId(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function StatFields({
  hpMax,
  setHpMax,
  classeArmatura,
  setClasseArmatura,
  xp,
  setXp,
}: {
  hpMax: number;
  setHpMax: (v: number) => void;
  classeArmatura: number;
  setClasseArmatura: (v: number) => void;
  xp: number;
  setXp: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-1 text-xs text-muted">
        PF
        <IntField
          min={0}
          value={hpMax}
          onChange={setHpMax}
          className="w-14 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-muted">
        CA
        <IntField
          min={0}
          value={classeArmatura}
          onChange={setClasseArmatura}
          className="w-14 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-muted">
        XP
        <IntField
          min={0}
          value={xp}
          onChange={setXp}
          className="w-16 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
        />
      </label>
    </div>
  );
}

/** PF medi della creatura: 5etools li scrive come numero o come { average, formula }. */
function hpDaCreatura(creature: Parameters<typeof descrizioneCreatura>[0]): number {
  if (typeof creature.hp === "number") return creature.hp;
  return creature.hp?.average ?? 10;
}

/** CA: puo' essere un numero secco o un oggetto con la provenienza ("armatura naturale"). */
function caDaCreatura(creature: Parameters<typeof descrizioneCreatura>[0]): number {
  const primo = creature.ac?.[0];
  if (primo === undefined) return 10;
  return typeof primo === "number" ? primo : primo.ac;
}

function NewHomebrewForm({ campaignId, onCreated }: { campaignId: string; onCreated: () => void }) {
  const [tipo, setTipo] = useState<Tipo>("mostro");
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [hpMax, setHpMax] = useState(10);
  const [classeArmatura, setClasseArmatura] = useState(10);
  const [xp, setXp] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!nome.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await createHomebrewEntry(campaignId, tipo, nome, descrizione, { hpMax, classeArmatura, xp });
      setNome("");
      setDescrizione("");
      onCreated();
    } catch (err) {
      // Stessa classe di silenzio già corretta per i form NPC/Trame: senza, il bottone smette solo
      // di girare e il master crede di aver salvato una voce che sul server non esiste.
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(["mostro", "oggetto", "incantesimo"] as const).map((value) => (
          <button
            key={value}
            onClick={() => setTipo(value)}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
              tipo === value
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-edge text-muted hover:text-foreground"
            }`}
          >
            {TIPO_LABELS[value]}
          </button>
        ))}
      </div>
      {tipo === "mostro" && (
        <>
          <MonsterCompendiumPicker
            onPick={(creature) => {
              // Precompilato, non salvato: il master rivede tutto e poi conferma. È il senso
              // dell'homebrew — si parte da un mostro vero e lo si cambia (più punti ferita, un
              // attacco in più) invece di ricopiarlo a mano dal Compendio.
              setNome(creature.name);
              setHpMax(hpDaCreatura(creature));
              setClasseArmatura(caDaCreatura(creature));
              setXp(XP_BY_CR[typeof creature.cr === "string" ? creature.cr : (creature.cr?.cr ?? "")] ?? 0);
              setDescrizione(descrizioneCreatura(creature));
            }}
          />
          <p className="text-[11px] text-muted">
            Oppure scrivi tutto da zero qui sotto.
          </p>
        </>
      )}
      <input
        value={nome}
        onChange={(event) => setNome(event.target.value)}
        placeholder="Nome (es. Bestia dell'abisso, Lama del Corvo)"
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      {tipo === "mostro" && (
        <StatFields
          hpMax={hpMax}
          setHpMax={setHpMax}
          classeArmatura={classeArmatura}
          setClasseArmatura={setClasseArmatura}
          xp={xp}
          setXp={setXp}
        />
      )}
      <textarea
        value={descrizione}
        onChange={(event) => setDescrizione(event.target.value)}
        placeholder="Descrizione, tratti, effetti…"
        rows={4}
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <button
        onClick={create}
        disabled={creating || !nome.trim()}
        className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
      >
        {creating ? "Creo…" : "Crea"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function HomebrewDetail({
  entry,
  isDm,
  onChanged,
  onDeleted,
}: {
  entry: HomebrewEntry;
  isDm: boolean;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState(entry.nome);
  const [descrizione, setDescrizione] = useState(entry.descrizione);
  const [hpMax, setHpMax] = useState(entry.hpMax ?? 10);
  const [classeArmatura, setClasseArmatura] = useState(entry.classeArmatura ?? 10);
  const [xp, setXp] = useState(entry.xp ?? 0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateHomebrewEntry(entry.id, { nome, descrizione, hpMax, classeArmatura, xp });
      setEditing(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // "Annulla" ripristina i campi ai valori salvati, non chiude soltanto: stesso motivo di
  // NpcDetail/QuestDetail, dove lasciare la bozza nello stato locale poteva farla risalire a galla.
  const annulla = () => {
    setNome(entry.nome);
    setDescrizione(entry.descrizione);
    setHpMax(entry.hpMax ?? 10);
    setClasseArmatura(entry.classeArmatura ?? 10);
    setXp(entry.xp ?? 0);
    setError(null);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-accent/40 bg-surface-raised p-3 space-y-2">
        <input
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm font-bold text-foreground"
        />
        {entry.tipo === "mostro" && (
          <StatFields
            hpMax={hpMax}
            setHpMax={setHpMax}
            classeArmatura={classeArmatura}
            setClasseArmatura={setClasseArmatura}
            xp={xp}
            setXp={setXp}
          />
        )}
        <textarea
          value={descrizione}
          onChange={(event) => setDescrizione(event.target.value)}
          rows={5}
          className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
          >
            {saving ? "…" : "Salva"}
          </button>
          <button onClick={annulla} className="text-xs text-muted hover:underline">
            Annulla
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-accent/40 bg-surface-raised p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-bold text-foreground">
            {TIPO_LABELS[entry.tipo]} · {entry.nome}
          </p>
          {entry.tipo === "mostro" && (
            <p className="text-xs text-muted">
              {entry.hpMax != null && `PF ${entry.hpMax}`}
              {entry.classeArmatura != null && ` · CA ${entry.classeArmatura}`}
              {entry.xp != null && entry.xp > 0 && ` · ${entry.xp} XP`}
            </p>
          )}
        </div>
        {isDm && (
          <div className="flex items-center gap-2 text-xs shrink-0">
            <button
              onClick={async () => {
                setError(null);
                try {
                  await toggleHomebrewVisible(entry.id);
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  onChanged();
                }
              }}
              className={entry.visibile ? "text-accent-strong hover:underline" : "text-muted hover:text-foreground"}
            >
              {entry.visibile ? "👁️ Rivelato" : "🙈 Nascosto"}
            </button>
            <button onClick={() => setEditing(true)} className="text-muted hover:text-foreground">
              Modifica
            </button>
            <button
              onClick={async () => {
                if (!window.confirm(`Eliminare "${entry.nome}"?`)) return;
                setError(null);
                try {
                  await deleteHomebrewEntry(entry.id);
                  onDeleted();
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
              className="text-danger hover:underline"
            >
              Elimina
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {entry.descrizione && <TestoStrutturato testo={entry.descrizione} />}
    </div>
  );
}
