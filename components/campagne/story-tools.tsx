"use client";

import { useEffect, useState } from "react";
import { isAiAvailable } from "@/app/actions/ai";
import { generateNpcDraft, generateQuestDraft } from "@/app/actions/ai-content-draft";
import { createNpc, deleteNpc, getNpcsForCampaign, updateNpc } from "@/app/actions/npcs";
import { createQuest, deleteQuest, getQuestsForCampaign, updateQuest } from "@/app/actions/quests";
import {
  addPrepItem,
  deletePrepItem,
  getPrepItemsForCampaign,
  togglePrepItem,
} from "@/app/actions/session-prep";

// Le tre sezioni sotto sono SOLO per il master (mai mostrate ai giocatori, nemmeno come sezione
// vuota) — vedi il commento su schema.ts per il perché. Da qui in giù "isDm" non è solo
// un'opzione di visualizzazione come in HandoutsSection: senza, le server action sottostanti
// lancerebbero comunque un errore ("Solo il master può farlo"), quindi si evita perfino di
// chiamarle.

const NPC_STATUS_LABELS: Record<string, string> = {
  vivo: "Vivo",
  morto: "Morto",
  scomparso: "Scomparso",
  sconosciuto: "Sconosciuto",
};
const NPC_STATUS_CLASSES: Record<string, string> = {
  vivo: "border-accent/40 bg-accent/10 text-accent-strong",
  morto: "border-danger/40 bg-danger/10 text-danger",
  scomparso: "border-edge bg-surface-raised text-muted",
  sconosciuto: "border-edge bg-surface-raised text-muted",
};

type Npc = Awaited<ReturnType<typeof getNpcsForCampaign>>[number];

export function NpcSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [npcs, setNpcs] = useState<Npc[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = () => {
    if (!isDm) return;
    getNpcsForCampaign(campaignId).then(setNpcs);
  };
  useEffect(refresh, [campaignId, isDm]);

  if (!isDm || npcs === null) return null;

  const selected = npcs.find((n) => n.id === selectedId) ?? null;

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">🧑‍🤝‍🧑 Rubrica NPC</h2>
        <button
          onClick={() => setShowForm((prev) => !prev)}
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          {showForm ? "Annulla" : "+ Nuovo NPC"}
        </button>
      </div>
      <p className="text-[10px] text-muted -mt-2">
        Solo il master la vede — non compare in nessuna forma per i giocatori.
      </p>

      {showForm && (
        <NewNpcForm
          campaignId={campaignId}
          onCreated={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      {npcs.length === 0 ? (
        <p className="text-sm text-muted">Nessun NPC ancora.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {npcs.map((npc) => (
            <button
              key={npc.id}
              onClick={() => setSelectedId(selectedId === npc.id ? null : npc.id)}
              className={`card-elevated-hover rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                selectedId === npc.id
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                  : "border-edge bg-surface-raised text-muted hover:text-foreground"
              }`}
            >
              {npc.nome}
              {npc.stato !== "vivo" && ` · ${NPC_STATUS_LABELS[npc.stato]}`}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <NpcDetail
          key={selected.id}
          npc={selected}
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

function NewNpcForm({ campaignId, onCreated }: { campaignId: string; onCreated: () => void }) {
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [posizione, setPosizione] = useState("");
  const [creating, setCreating] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    isAiAvailable().then(setAiAvailable).catch(() => setAiAvailable(false));
  }, []);

  const create = async () => {
    if (!nome.trim()) return;
    setCreating(true);
    try {
      await createNpc(campaignId, nome, descrizione, posizione);
      setNome("");
      setDescrizione("");
      setPosizione("");
      onCreated();
    } finally {
      setCreating(false);
    }
  };

  const generateDraft = async () => {
    if (!nome.trim() || generating) return;
    setGenerating(true);
    try {
      const draft = await generateNpcDraft(nome, descrizione);
      if (draft) setDescrizione(draft);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <input
        value={nome}
        onChange={(event) => setNome(event.target.value)}
        placeholder="Nome (es. Sindaco Alric Corvo)"
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <input
        value={posizione}
        onChange={(event) => setPosizione(event.target.value)}
        placeholder="Dove si trova (opzionale, es. Locanda del Cervo Bianco)"
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <textarea
        value={descrizione}
        onChange={(event) => setDescrizione(event.target.value)}
        placeholder="Aspetto, personalità, motivazioni, segreti…"
        rows={3}
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      {aiAvailable && (
        <button
          onClick={generateDraft}
          disabled={!nome.trim() || generating}
          title="Scrive una bozza di scheda in base al nome — la rivedi e modifichi prima di salvare"
          className="text-xs font-bold text-accent-strong hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
        >
          {generating ? "Scrivo…" : "✨ Genera bozza"}
        </button>
      )}
      <button
        onClick={create}
        disabled={creating || !nome.trim()}
        className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
      >
        {creating ? "Creo…" : "Crea"}
      </button>
    </div>
  );
}

function NpcDetail({
  npc,
  onChanged,
  onDeleted,
}: {
  npc: Npc;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState(npc.nome);
  const [descrizione, setDescrizione] = useState(npc.descrizione);
  const [posizione, setPosizione] = useState(npc.posizione);
  const [stato, setStato] = useState(npc.stato);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateNpc(npc.id, { nome, descrizione, posizione, stato });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  // Cambiare stato è un'azione comune abbastanza da meritare un salvataggio immediato, senza
  // dover entrare in modalità modifica solo per quello (es. l'NPC muore durante il combattimento).
  const changeStatoNow = async (next: typeof stato) => {
    setStato(next);
    await updateNpc(npc.id, { nome, descrizione, posizione, stato: next });
    onChanged();
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-accent/40 bg-surface-raised p-3 space-y-2">
        <input
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm font-bold text-foreground"
        />
        <input
          value={posizione}
          onChange={(event) => setPosizione(event.target.value)}
          placeholder="Dove si trova"
          className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
        <textarea
          value={descrizione}
          onChange={(event) => setDescrizione(event.target.value)}
          rows={4}
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
          <button onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
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
          <p className="text-sm font-bold text-foreground">{npc.nome}</p>
          {npc.posizione && <p className="text-xs text-muted">📍 {npc.posizione}</p>}
        </div>
        <div className="flex items-center gap-2 text-xs shrink-0">
          <button onClick={() => setEditing(true)} className="text-muted hover:text-foreground">
            Modifica
          </button>
          <button
            onClick={async () => {
              if (!window.confirm(`Eliminare "${npc.nome}"?`)) return;
              await deleteNpc(npc.id);
              onDeleted();
            }}
            className="text-danger hover:underline"
          >
            Elimina
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(NPC_STATUS_LABELS) as (typeof stato)[]).map((value) => (
          <button
            key={value}
            onClick={() => changeStatoNow(value)}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
              stato === value ? NPC_STATUS_CLASSES[value] : "border-edge text-muted hover:text-foreground"
            }`}
          >
            {NPC_STATUS_LABELS[value]}
          </button>
        ))}
      </div>
      {npc.descrizione && (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{npc.descrizione}</p>
      )}
    </div>
  );
}

const QUEST_STATUS_LABELS: Record<string, string> = {
  attiva: "Attiva",
  completata: "Completata",
  fallita: "Fallita",
  in_pausa: "In pausa",
};
const QUEST_STATUS_CLASSES: Record<string, string> = {
  attiva: "border-accent/40 bg-accent/10 text-accent-strong",
  completata: "border-edge bg-surface-raised text-muted",
  fallita: "border-danger/40 bg-danger/10 text-danger",
  in_pausa: "border-edge bg-surface-raised text-muted",
};

type Quest = Awaited<ReturnType<typeof getQuestsForCampaign>>[number];

export function QuestSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = () => {
    if (!isDm) return;
    getQuestsForCampaign(campaignId).then(setQuests);
  };
  useEffect(refresh, [campaignId, isDm]);

  if (!isDm || quests === null) return null;

  const selected = quests.find((q) => q.id === selectedId) ?? null;
  // Le trame attive vanno considerate prima di quelle chiuse — sono quelle a cui il master
  // torna più spesso durante la preparazione, non ha senso doverle cercare tra le concluse.
  const sorted = [...quests].sort((a, b) => (a.stato === "attiva" ? -1 : b.stato === "attiva" ? 1 : 0));

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">📖 Trame e missioni</h2>
        <button
          onClick={() => setShowForm((prev) => !prev)}
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          {showForm ? "Annulla" : "+ Nuova trama"}
        </button>
      </div>
      <p className="text-[10px] text-muted -mt-2">
        Solo il master la vede — non compare in nessuna forma per i giocatori.
      </p>

      {showForm && (
        <NewQuestForm
          campaignId={campaignId}
          onCreated={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      {quests.length === 0 ? (
        <p className="text-sm text-muted">Nessuna trama ancora.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {sorted.map((quest) => (
            <button
              key={quest.id}
              onClick={() => setSelectedId(selectedId === quest.id ? null : quest.id)}
              className={`card-elevated-hover rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                selectedId === quest.id
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                  : "border-edge bg-surface-raised text-muted hover:text-foreground"
              } ${quest.stato !== "attiva" ? "opacity-70" : ""}`}
            >
              {quest.titolo} · {QUEST_STATUS_LABELS[quest.stato]}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <QuestDetail
          key={selected.id}
          quest={selected}
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

function NewQuestForm({ campaignId, onCreated }: { campaignId: string; onCreated: () => void }) {
  const [titolo, setTitolo] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [creating, setCreating] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    isAiAvailable().then(setAiAvailable).catch(() => setAiAvailable(false));
  }, []);

  const create = async () => {
    if (!titolo.trim()) return;
    setCreating(true);
    try {
      await createQuest(campaignId, titolo, descrizione);
      setTitolo("");
      setDescrizione("");
      onCreated();
    } finally {
      setCreating(false);
    }
  };

  const generateDraft = async () => {
    if (!titolo.trim() || generating) return;
    setGenerating(true);
    try {
      const draft = await generateQuestDraft(titolo, descrizione);
      if (draft) setDescrizione(draft);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <input
        value={titolo}
        onChange={(event) => setTitolo(event.target.value)}
        placeholder="Titolo (es. Il culto sotto la locanda)"
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <textarea
        value={descrizione}
        onChange={(event) => setDescrizione(event.target.value)}
        placeholder="Obiettivo, chi la muove, possibili svolte…"
        rows={3}
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      {aiAvailable && (
        <button
          onClick={generateDraft}
          disabled={!titolo.trim() || generating}
          title="Scrive una bozza in base al titolo — la rivedi e modifichi prima di salvare"
          className="text-xs font-bold text-accent-strong hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
        >
          {generating ? "Scrivo…" : "✨ Genera bozza"}
        </button>
      )}
      <button
        onClick={create}
        disabled={creating || !titolo.trim()}
        className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
      >
        {creating ? "Creo…" : "Crea"}
      </button>
    </div>
  );
}

function QuestDetail({
  quest,
  onChanged,
  onDeleted,
}: {
  quest: Quest;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [titolo, setTitolo] = useState(quest.titolo);
  const [descrizione, setDescrizione] = useState(quest.descrizione);
  const [stato, setStato] = useState(quest.stato);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateQuest(quest.id, { titolo, descrizione, stato });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const changeStatoNow = async (next: typeof stato) => {
    setStato(next);
    await updateQuest(quest.id, { titolo, descrizione, stato: next });
    onChanged();
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-accent/40 bg-surface-raised p-3 space-y-2">
        <input
          value={titolo}
          onChange={(event) => setTitolo(event.target.value)}
          className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm font-bold text-foreground"
        />
        <textarea
          value={descrizione}
          onChange={(event) => setDescrizione(event.target.value)}
          rows={4}
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
          <button onClick={() => setEditing(false)} className="text-xs text-muted hover:underline">
            Annulla
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-accent/40 bg-surface-raised p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-sm font-bold text-foreground">{quest.titolo}</p>
        <div className="flex items-center gap-2 text-xs shrink-0">
          <button onClick={() => setEditing(true)} className="text-muted hover:text-foreground">
            Modifica
          </button>
          <button
            onClick={async () => {
              if (!window.confirm(`Eliminare "${quest.titolo}"?`)) return;
              await deleteQuest(quest.id);
              onDeleted();
            }}
            className="text-danger hover:underline"
          >
            Elimina
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(QUEST_STATUS_LABELS) as (typeof stato)[]).map((value) => (
          <button
            key={value}
            onClick={() => changeStatoNow(value)}
            className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition-colors ${
              stato === value ? QUEST_STATUS_CLASSES[value] : "border-edge text-muted hover:text-foreground"
            }`}
          >
            {QUEST_STATUS_LABELS[value]}
          </button>
        ))}
      </div>
      {quest.descrizione && (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{quest.descrizione}</p>
      )}
    </div>
  );
}

type PrepItem = Awaited<ReturnType<typeof getPrepItemsForCampaign>>[number];

// Checklist libera per la PROSSIMA sessione — deliberatamente senza bozza IA (a differenza di NPC/
// Trame): sono voci corte tipo "promemoria", non prosa da abbozzare.
export function SessionPrepSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [items, setItems] = useState<PrepItem[] | null>(null);
  const [testo, setTesto] = useState("");
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    if (!isDm) return;
    getPrepItemsForCampaign(campaignId).then(setItems);
  };
  useEffect(refresh, [campaignId, isDm]);

  if (!isDm || items === null) return null;

  const add = async () => {
    if (!testo.trim()) return;
    setAdding(true);
    try {
      await addPrepItem(campaignId, testo);
      setTesto("");
      refresh();
    } finally {
      setAdding(false);
    }
  };

  const pending = items.filter((i) => !i.fatto);
  const done = items.filter((i) => i.fatto);

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <h2 className="text-sm uppercase tracking-widest text-muted">✅ Preparazione prossima sessione</h2>
      <p className="text-[10px] text-muted -mt-2">
        Solo il master la vede — a differenza del Diario, guarda avanti invece che indietro.
      </p>
      <div className="flex items-center gap-2">
        <input
          value={testo}
          onChange={(event) => setTesto(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
          placeholder="Es. Preparare l'incontro con la banda di orchi"
          className="input-focus flex-1 rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
        />
        <button
          onClick={add}
          disabled={adding || !testo.trim()}
          className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50 shrink-0"
        >
          + Aggiungi
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted">Nessun appunto ancora — via libera prima della prossima sessione.</p>
      ) : (
        <ul className="space-y-1">
          {[...pending, ...done].map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={item.fatto}
                onChange={async () => {
                  await togglePrepItem(item.id);
                  refresh();
                }}
                className="shrink-0"
              />
              <span className={`flex-1 min-w-0 ${item.fatto ? "text-muted line-through" : "text-foreground"}`}>
                {item.testo}
              </span>
              <button
                onClick={async () => {
                  await deletePrepItem(item.id);
                  refresh();
                }}
                aria-label="Elimina questo appunto"
                title="Elimina"
                className="text-muted/50 hover:text-danger transition-colors text-xs px-1 shrink-0"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
