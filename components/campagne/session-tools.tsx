"use client";

import { useEffect, useState } from "react";
import { IntField } from "@/components/int-field";
import { isAiAvailable } from "@/app/actions/ai";
import { generateHandoutDraft } from "@/app/actions/ai-content-draft";
import {
  getMyCampaignFriendsPicker,
  inviteFriendToCampaign,
  setJukeboxTrack,
  stopJukebox,
} from "@/app/actions/campaigns";
import {
  createHandout,
  deleteHandout,
  getHandoutsForCampaign,
  toggleHandoutVisible,
  updateHandout,
} from "@/app/actions/handouts";
import {
  createRollTable,
  deleteRollTable,
  getRollTablesForCampaign,
  updateRollTable,
} from "@/app/actions/roll-tables";
import type { RollTableEntry } from "@/lib/db/schema";
import { microphoneErrorMessage } from "@/lib/microphone-error";
import { useVoiceChat, type VoiceParticipant } from "@/lib/use-voice-chat";
import { usePartyRoom } from "@/lib/use-party-room";
import { useSpeaking } from "@/lib/use-speaking";
import type { CampaignDetail } from "./types";

function getYouTubeEmbedUrl(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/,
  );
  return match ? `https://www.youtube.com/embed/${match[1]}?autoplay=1` : null;
}

export function InviteFriendPicker({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<Awaited<ReturnType<typeof getMyCampaignFriendsPicker>> | null>(
    null,
  );
  const [invited, setInvited] = useState<string[]>([]);

  const load = () => {
    setOpen((prev) => !prev);
    if (!friends) getMyCampaignFriendsPicker(campaignId).then(setFriends);
  };

  const invite = async (friendUserId: string) => {
    await inviteFriendToCampaign(campaignId, friendUserId);
    setInvited((prev) => [...prev, friendUserId]);
  };

  return (
    <div>
      <button onClick={load} className="text-xs font-bold text-accent-strong hover:underline">
        {open ? "Nascondi" : "+ Invita un amico"}
      </button>
      {open && (
        <div className="mt-2 rounded-lg border border-edge bg-surface-raised p-2 space-y-1.5">
          {!friends ? (
            <p className="text-xs text-muted">Caricamento…</p>
          ) : friends.length === 0 ? (
            <p className="text-xs text-muted">
              Nessun amico disponibile — cercali dalla tab Amici in Chat.
            </p>
          ) : (
            friends.map((friend) => (
              <div key={friend.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-foreground truncate">{friend.name ?? "Utente"}</span>
                {invited.includes(friend.id) ? (
                  <span className="text-xs text-muted shrink-0">✓ Invitato</span>
                ) : (
                  <button
                    onClick={() => invite(friend.id)}
                    className="text-xs font-bold text-accent-strong hover:underline shrink-0"
                  >
                    Invita
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function JukeboxPlayer({
  campaignId,
  isDm,
  campaign,
  onChanged,
}: {
  campaignId: string;
  isDm: boolean;
  campaign: { jukeboxUrl: string | null; jukeboxTitolo: string | null };
  onChanged: () => void;
}) {
  const [url, setUrl] = useState("");
  const [titolo, setTitolo] = useState("");
  const [playing, setPlaying] = useState(false);
  const [showForm, setShowForm] = useState(false);

  usePartyRoom({ kind: "combat", campaignId }, (message) => {
    if ((message as { type?: string } | null)?.type === "jukebox-changed") {
      setPlaying(false);
      onChanged();
    }
  });

  if (!campaign.jukeboxUrl && !isDm) return null;

  const embedUrl = campaign.jukeboxUrl ? getYouTubeEmbedUrl(campaign.jukeboxUrl) : null;

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs uppercase tracking-widest text-muted">🎵 Jukebox</span>
        {isDm && (
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="text-xs font-bold text-accent-strong hover:underline"
          >
            {showForm ? "Annulla" : campaign.jukeboxUrl ? "Cambia brano" : "+ Imposta brano"}
          </button>
        )}
      </div>

      {showForm && isDm && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="URL YouTube o file audio diretto"
            className="flex-1 min-w-[200px] rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
          />
          <input
            value={titolo}
            onChange={(event) => setTitolo(event.target.value)}
            placeholder="Nome (es. Taverna)"
            className="w-40 rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
          />
          <button
            onClick={async () => {
              if (!url.trim()) return;
              await setJukeboxTrack(campaignId, url.trim(), titolo.trim());
              setShowForm(false);
              setUrl("");
              setTitolo("");
              onChanged();
            }}
            className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97]"
          >
            Imposta
          </button>
        </div>
      )}

      {campaign.jukeboxUrl ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm text-foreground">
              In riproduzione: <span className="font-bold">{campaign.jukeboxTitolo || "brano"}</span>
            </p>
            <div className="flex items-center gap-2">
              {!playing && (
                <button
                  onClick={() => setPlaying(true)}
                  className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97]"
                >
                  ▶ Riproduci per me
                </button>
              )}
              {playing && (
                <button
                  onClick={() => setPlaying(false)}
                  className="rounded-lg border border-edge px-3 py-1.5 text-xs text-foreground hover:border-accent transition-colors"
                >
                  ⏸ Ferma per me
                </button>
              )}
              {isDm && (
                <button
                  onClick={async () => {
                    await stopJukebox(campaignId);
                    onChanged();
                  }}
                  className="text-xs text-danger hover:underline"
                >
                  Rimuovi per tutti
                </button>
              )}
            </div>
          </div>
          <p className="text-[10px] text-muted">
            Ognuno deve premere &ldquo;Riproduci&rdquo; sul proprio dispositivo — i browser
            bloccano l&apos;avvio automatico dell&apos;audio.
          </p>
          {playing && embedUrl && (
            <iframe
              src={embedUrl}
              className="w-full h-20 rounded-lg border border-edge"
              allow="autoplay"
              title="Jukebox"
            />
          )}
          {playing && !embedUrl && (
            <audio src={campaign.jukeboxUrl} controls autoPlay loop className="w-full" />
          )}
        </div>
      ) : (
        isDm && <p className="text-sm text-muted">Nessun brano impostato.</p>
      )}
    </section>
  );
}

// Anello colorato pulsante quando lo stream sta producendo voce sopra soglia (useSpeaking) —
// stesso trattamento visivo sia per sé stessi sia per ogni partecipante, così l'occhio impara un
// solo pattern invece di due diversi.
function SpeakingRing({ stream, muted }: { stream: MediaStream | null; muted?: boolean }) {
  const speaking = useSpeaking(muted ? null : stream);
  return (
    <span
      className={`inline-block size-2 rounded-full shrink-0 transition-colors ${
        speaking ? "bg-accent-strong shadow-[0_0_6px_2px_var(--color-accent)]" : "bg-muted/40"
      }`}
      aria-hidden="true"
    />
  );
}

function ParticipantRow({
  participant,
  name,
}: {
  participant: VoiceParticipant;
  name: string;
}) {
  return (
    <li className="flex items-center gap-2 text-sm text-foreground">
      <SpeakingRing stream={participant.stream} />
      <span className="truncate">{name}</span>
    </li>
  );
}

export function VoiceChatPanel({
  campaignId,
  myUserId,
  members,
}: {
  campaignId: string;
  myUserId: string | null;
  members: CampaignDetail["members"];
}) {
  const { inCall, muted, participants, localStream, reconnecting, join, leave, toggleMute } =
    useVoiceChat(campaignId, myUserId);
  const [error, setError] = useState<string | null>(null);

  const nameFor = (userId: string) =>
    members.find((m) => m.userId === userId)?.name ?? "Qualcuno";
  const myName = members.find((m) => m.userId === myUserId)?.name ?? "Tu";

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-4 space-y-2">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs uppercase tracking-widest text-muted">🎙️ Chat vocale</span>
        {inCall ? (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMute}
              className="rounded-lg border border-edge px-3 py-1.5 text-xs text-foreground hover:border-accent transition-colors"
            >
              {muted ? "🔇 Riattiva mic" : "🎤 Silenzia"}
            </button>
            <button
              onClick={leave}
              className="rounded-lg border border-danger/40 px-3 py-1.5 text-xs font-bold text-danger hover:border-danger hover:bg-danger/10 transition-colors"
            >
              Esci
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setError(null);
              join().catch((err) => {
                setError(microphoneErrorMessage(err));
              });
            }}
            className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97]"
          >
            Entra
          </button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {inCall && reconnecting && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-accent-strong">
          <span className="inline-block size-1.5 rounded-full bg-accent-strong animate-pulse" />
          Connessione persa, riprovo…
        </p>
      )}
      {inCall && (
        <ul className="space-y-1">
          <ParticipantRow
            participant={{ userId: myUserId ?? "me", stream: muted ? null : localStream }}
            name={`${myName} (tu)${muted ? " · silenziato" : ""}`}
          />
          {Array.from(participants.entries()).map(([userId, participant]) => (
            <ParticipantRow key={userId} participant={participant} name={nameFor(userId)} />
          ))}
        </ul>
      )}
      {inCall && participants.size === 0 && (
        <p className="text-xs text-muted">Sei solo per ora — aspetta che qualcun altro entri.</p>
      )}
      <p className="text-[10px] text-muted">
        Audio diretto tra browser (nessun server in mezzo) — funziona meglio se siete già tutti
        nella pagina della campagna.
      </p>
      {Array.from(participants.values()).map(
        (participant) =>
          participant.stream && (
            <audio
              key={participant.userId}
              autoPlay
              className="hidden"
              ref={(el) => {
                if (el) el.srcObject = participant.stream;
              }}
            />
          ),
      )}
    </section>
  );
}

type Handout = Awaited<ReturnType<typeof getHandoutsForCampaign>>[number];

export function HandoutsSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [handouts, setHandouts] = useState<Handout[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  // Solo l'id, non uno snapshot dell'intero handout — derivato di nuovo da "handouts" ad ogni
  // render (subito sotto), così dopo un salvataggio/toggle visibilità che richiama refresh() il
  // pannello di dettaglio mostra i dati appena aggiornati invece di restare bloccato sulla
  // versione di quando è stato aperto (stesso pattern già usato correttamente in
  // DungeonSection/RegionalMapSection, che ri-fetchano l'oggetto attivo per id).
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const refresh = () => {
    getHandoutsForCampaign(campaignId).then(setHandouts);
  };
  useEffect(refresh, [campaignId]);

  if (handouts === null) return null;
  if (handouts.length === 0 && !isDm) return null;

  const selected = handouts.find((h) => h.id === selectedId) ?? null;

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">📜 Handout</h2>
        {isDm && (
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="text-xs font-bold text-accent-strong hover:underline"
          >
            {showForm ? "Annulla" : "+ Nuovo handout"}
          </button>
        )}
      </div>

      {showForm && isDm && (
        <NewHandoutForm
          campaignId={campaignId}
          onCreated={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}

      {handouts.length === 0 ? (
        <p className="text-sm text-muted">Nessun handout ancora.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {handouts.map((h) => (
            <button
              key={h.id}
              onClick={() => setSelectedId(selectedId === h.id ? null : h.id)}
              className={`card-elevated-hover rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                selectedId === h.id
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                  : "border-edge bg-surface-raised text-muted hover:text-foreground"
              } ${isDm && !h.visibile ? "opacity-60" : ""}`}
            >
              {h.titolo}
              {isDm && !h.visibile && " (nascosto)"}
            </button>
          ))}
        </div>
      )}

      {selected && (
        <HandoutDetail
          key={selected.id}
          handout={selected}
          isDm={isDm}
          onChanged={() => {
            refresh();
          }}
          onDeleted={() => {
            setSelectedId(null);
            refresh();
          }}
        />
      )}
    </section>
  );
}

function NewHandoutForm({
  campaignId,
  onCreated,
}: {
  campaignId: string;
  onCreated: () => void;
}) {
  const [titolo, setTitolo] = useState("");
  const [testo, setTesto] = useState("");
  const [immagineUrl, setImmagineUrl] = useState("");
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
      await createHandout(campaignId, titolo, testo, immagineUrl);
      setTitolo("");
      setTesto("");
      setImmagineUrl("");
      onCreated();
    } finally {
      setCreating(false);
    }
  };

  // Precompila SOLO il campo testo, non salva mai da sola — usa il titolo (e il testo già
  // scritto, se c'è, come indicazione in più) per proporre una bozza che il master rivede prima
  // di salvare, stesso principio del riassunto sessioni sopra.
  const generateDraft = async () => {
    if (!titolo.trim() || generating) return;
    setGenerating(true);
    try {
      const draft = await generateHandoutDraft(titolo, testo);
      if (draft) setTesto(draft);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <input
        value={titolo}
        onChange={(event) => setTitolo(event.target.value)}
        placeholder="Titolo (es. Lettera del Re)"
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <textarea
        value={testo}
        onChange={(event) => setTesto(event.target.value)}
        placeholder="Testo…"
        rows={3}
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      {aiAvailable && (
        <button
          onClick={generateDraft}
          disabled={!titolo.trim() || generating}
          title="Scrive una bozza di testo in base al titolo — la rivedi e modifichi prima di salvare"
          className="text-xs font-bold text-accent-strong hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
        >
          {generating ? "Scrivo…" : "✨ Genera bozza"}
        </button>
      )}
      <input
        value={immagineUrl}
        onChange={(event) => setImmagineUrl(event.target.value)}
        placeholder="URL immagine (opzionale)"
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <button
        onClick={create}
        disabled={creating || !titolo.trim()}
        className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
      >
        {creating ? "Creo…" : "Crea (nascosto ai giocatori)"}
      </button>
    </div>
  );
}

function HandoutDetail({
  handout,
  isDm,
  onChanged,
  onDeleted,
}: {
  handout: Handout;
  isDm: boolean;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [titolo, setTitolo] = useState(handout.titolo);
  const [testo, setTesto] = useState(handout.testo);
  const [immagineUrl, setImmagineUrl] = useState(handout.immagineUrl ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateHandout(handout.id, { titolo, testo, immagineUrl });
      setEditing(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="rounded-lg border border-accent/40 bg-surface-raised p-3 space-y-2">
        <input
          value={titolo}
          onChange={(event) => setTitolo(event.target.value)}
          className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
        <textarea
          value={testo}
          onChange={(event) => setTesto(event.target.value)}
          rows={4}
          className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
        <input
          value={immagineUrl}
          onChange={(event) => setImmagineUrl(event.target.value)}
          placeholder="URL immagine"
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
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-foreground">{handout.titolo}</p>
        {isDm && (
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={async () => {
                await toggleHandoutVisible(handout.id);
                onChanged();
              }}
              className="font-bold text-accent-strong hover:underline"
            >
              {handout.visibile ? "👁️ Nascondi" : "👁️ Rivela ai giocatori"}
            </button>
            <button onClick={() => setEditing(true)} className="text-muted hover:text-foreground">
              Modifica
            </button>
            <button
              onClick={async () => {
                if (!window.confirm(`Eliminare "${handout.titolo}"?`)) return;
                await deleteHandout(handout.id);
                onDeleted();
              }}
              className="text-danger hover:underline"
            >
              Elimina
            </button>
          </div>
        )}
      </div>
      {handout.immagineUrl && (
        // URL arbitrario fornito dal master, non un asset locale ottimizzabile da next/image
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={handout.immagineUrl}
          alt={handout.titolo}
          className="max-w-full rounded-lg border border-edge"
        />
      )}
      {handout.testo && (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{handout.testo}</p>
      )}
    </div>
  );
}

type RollTable = Awaited<ReturnType<typeof getRollTablesForCampaign>>[number];

function rollWeighted(voci: RollTableEntry[]): RollTableEntry | null {
  const validVoci = voci.filter((v) => v.peso > 0);
  if (validVoci.length === 0) return null;
  const total = validVoci.reduce((sum, v) => sum + v.peso, 0);
  let roll = Math.random() * total;
  for (const voce of validVoci) {
    if (roll < voce.peso) return voce;
    roll -= voce.peso;
  }
  return validVoci[validVoci.length - 1];
}

export function RollTablesSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [tables, setTables] = useState<RollTable[] | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = () => {
    getRollTablesForCampaign(campaignId).then(setTables);
  };
  useEffect(refresh, [campaignId]);

  if (tables === null) return null;
  if (tables.length === 0 && !isDm) return null;

  const roll = (table: RollTable) => {
    const result = rollWeighted(table.voci);
    setResults((prev) => ({ ...prev, [table.id]: result?.testo ?? "Tabella vuota." }));
  };

  return (
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">🎲 Tabelle personalizzate</h2>
        {isDm && (
          <button
            onClick={async () => {
              const nome = window.prompt("Nome della tabella", "Bottino minore");
              if (nome === null) return;
              const table = await createRollTable(campaignId, nome);
              refresh();
              setEditingId(table.id);
            }}
            className="text-xs font-bold text-accent-strong hover:underline"
          >
            + Nuova tabella
          </button>
        )}
      </div>

      {tables.length === 0 ? (
        <p className="text-sm text-muted">Nessuna tabella ancora.</p>
      ) : (
        <div className="space-y-2">
          {tables.map((table) =>
            editingId === table.id ? (
              <RollTableEditor
                key={table.id}
                table={table}
                onSaved={() => {
                  setEditingId(null);
                  refresh();
                }}
                onCancel={() => setEditingId(null)}
                onDeleted={() => {
                  setEditingId(null);
                  refresh();
                }}
              />
            ) : (
              <div
                key={table.id}
                className="rounded-lg border border-edge bg-surface-raised p-3 space-y-1.5"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-sm font-bold text-foreground">
                    {table.nome} <span className="text-xs text-muted">({table.voci.length} voci)</span>
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => roll(table)}
                      disabled={table.voci.length === 0}
                      className="rounded-md bg-accent text-background font-bold px-2.5 py-1 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
                    >
                      🎲 Tira
                    </button>
                    {isDm && (
                      <button
                        onClick={() => setEditingId(table.id)}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        Modifica
                      </button>
                    )}
                  </div>
                </div>
                {results[table.id] && (
                  <p className="text-sm text-accent-strong font-bold">→ {results[table.id]}</p>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function RollTableEditor({
  table,
  onSaved,
  onCancel,
  onDeleted,
}: {
  table: RollTable;
  onSaved: () => void;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [nome, setNome] = useState(table.nome);
  const [voci, setVoci] = useState<RollTableEntry[]>(table.voci);
  const [saving, setSaving] = useState(false);

  const addRow = () => setVoci((prev) => [...prev, { testo: "", peso: 1 }]);
  const updateRow = (index: number, patch: Partial<RollTableEntry>) =>
    setVoci((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  const removeRow = (index: number) => setVoci((prev) => prev.filter((_, i) => i !== index));

  const save = async () => {
    setSaving(true);
    try {
      await updateRollTable(
        table.id,
        nome,
        voci.filter((v) => v.testo.trim()),
      );
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-accent/40 bg-surface-raised p-3 space-y-2">
      <input
        value={nome}
        onChange={(event) => setNome(event.target.value)}
        className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm font-bold text-foreground"
      />
      <div className="space-y-1.5">
        {voci.map((voce, index) => (
          <div key={index} className="flex items-center gap-1.5">
            <input
              value={voce.testo}
              onChange={(event) => updateRow(index, { testo: event.target.value })}
              placeholder="Es. Pozione di cura"
              className="flex-1 min-w-0 rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
            />
            <IntField
              min={1}
              value={voce.peso}
              onChange={(value) => updateRow(index, { peso: value })}
              title="Peso (probabilità relativa)"
              className="w-14 rounded-md border border-edge bg-surface px-1.5 py-1.5 text-sm text-foreground text-center"
            />
            <button
              onClick={() => removeRow(index)}
              className="text-muted hover:text-danger text-sm shrink-0"
              aria-label="Rimuovi voce"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={addRow} className="text-xs font-bold text-accent-strong hover:underline">
          + Voce
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
        >
          {saving ? "…" : "Salva"}
        </button>
        <button onClick={onCancel} className="text-xs text-muted hover:underline">
          Annulla
        </button>
        <button
          onClick={async () => {
            if (!window.confirm(`Eliminare "${table.nome}"?`)) return;
            await deleteRollTable(table.id);
            onDeleted();
          }}
          className="text-xs text-danger hover:underline ml-auto"
        >
          Elimina tabella
        </button>
      </div>
    </div>
  );
}

