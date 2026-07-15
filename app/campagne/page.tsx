"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import {
  addSessionNote,
  createCampaign,
  createInvite,
  deleteCampaign,
  deleteSessionNote,
  getCampaign,
  getMyCampaigns,
  leaveCampaign,
  redeemInvite,
  removeMember,
  setMemberRole,
} from "@/app/actions/campaigns";
import { getPartyForCampaign } from "@/app/actions/characters";
import {
  addCombatant,
  addPartyToEncounter,
  endEncounter,
  getActiveEncounter,
  nextTurn,
  removeCombatant,
  startEncounter,
  updateCombatant,
} from "@/app/actions/encounters";
import {
  addMarker,
  createBlankDungeon,
  createDungeon,
  deleteDungeon,
  deleteMarker,
  getDungeon,
  getDungeonsForCampaign,
  getDungeonTokens,
  removeMyToken,
  updateDungeonCells,
  updateRoomNotes,
  upsertMyToken,
} from "@/app/actions/dungeons";
import type { CellType, DungeonConfig, RoomShape } from "@/lib/dungeon";
import { loadCreatures, type RawCreature } from "@/lib/fivetools/data";
import { usePartyRoom } from "@/lib/use-party-room";
import {
  abilityModifier,
  adjustedEncounterXp,
  DIFFICULTY_LABELS,
  encounterMultiplier,
  formatModifier,
  totalLevel,
  xpBudget,
  XP_BY_CR,
  type Ability,
  type EncounterDifficulty,
} from "@/lib/dnd";

type CampaignSummary = Awaited<ReturnType<typeof getMyCampaigns>>[number];
type CampaignDetail = Awaited<ReturnType<typeof getCampaign>>;
type DungeonListItem = Awaited<ReturnType<typeof getDungeonsForCampaign>>[number];
type DungeonFull = Awaited<ReturnType<typeof getDungeon>>;

export default function CampaignsPage() {
  return (
    <Suspense fallback={<p className="text-muted">Caricamento…</p>}>
      <CampaignsPageInner />
    </Suspense>
  );
}

function CampaignsPageInner() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite");

  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasJoinedRef = useRef(false);

  const refresh = () => {
    getMyCampaigns()
      .then(setCampaigns)
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    if (status === "authenticated") refresh();
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || !inviteCode || hasJoinedRef.current) return;
    hasJoinedRef.current = true;
    redeemInvite(inviteCode)
      .then((campaignId) => {
        refresh();
        setOpenId(campaignId);
      })
      .catch((err) => setError(err.message));
  }, [status, inviteCode]);

  if (status === "loading") {
    return <p className="text-muted">Caricamento…</p>;
  }

  if (status !== "authenticated") {
    return (
      <div className="max-w-md mx-auto text-center space-y-4 pt-10">
        <p className="text-4xl">🗺️</p>
        <h1 className="text-2xl font-bold text-accent-strong">Campagne</h1>
        <p className="text-sm text-muted">
          Accedi per creare campagne condivise, invitare i tuoi amici e decidere chi fa il master.
        </p>
        <button
          onClick={() => signIn("google")}
          className="rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors"
        >
          Accedi con Google
        </button>
      </div>
    );
  }

  if (openId) {
    return (
      <CampaignDetailView
        campaignId={openId}
        userId={session!.user!.id!}
        onBack={() => {
          setOpenId(null);
          refresh();
        }}
        onDeleted={() => {
          setOpenId(null);
          refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-2xl lg:max-w-3xl mx-auto">
      <h1 className="text-3xl font-bold text-accent-strong">Campagne</h1>

      {error && <p className="text-sm text-danger">{error}</p>}

      <CreateOrJoin
        onCreated={(id) => {
          refresh();
          setOpenId(id);
        }}
        onJoined={(id) => {
          refresh();
          setOpenId(id);
        }}
        onError={setError}
      />

      {campaigns === null ? (
        <p className="text-muted">Caricamento…</p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge bg-surface/50 p-10 text-center text-muted">
          <p className="text-4xl mb-3">🗺️</p>
          <p>Nessuna campagna ancora. L&apos;avventura ti aspetta!</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <button
                onClick={() => setOpenId(campaign.id)}
                className="w-full h-full text-left rounded-xl border border-edge bg-surface p-4 hover:border-accent/50 hover:bg-surface-raised transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">{campaign.nome}</span>
                  <span className="text-[10px] font-bold uppercase tracking-widest rounded-full border border-edge px-2 py-0.5 text-muted">
                    {campaign.role === "dm" ? "Master" : "Giocatore"}
                  </span>
                </div>
                <p className="text-sm text-muted mt-0.5 line-clamp-1">
                  {campaign.descrizione || "—"}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateOrJoin({
  onCreated,
  onJoined,
  onError,
}: {
  onCreated: (id: string) => void;
  onJoined: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [nome, setNome] = useState("");
  const [descrizione, setDescrizione] = useState("");
  const [code, setCode] = useState("");

  const create = async () => {
    if (!nome.trim()) return;
    try {
      const campaign = await createCampaign(nome.trim(), descrizione.trim());
      setNome("");
      setDescrizione("");
      onCreated(campaign.id);
    } catch (err) {
      onError((err as Error).message);
    }
  };

  const join = async () => {
    if (!code.trim()) return;
    try {
      const campaignId = await redeemInvite(code.trim());
      setCode("");
      onJoined(campaignId);
    } catch (err) {
      onError((err as Error).message);
    }
  };

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <section className="rounded-xl border border-edge bg-surface p-4 space-y-2">
        <h2 className="text-xs uppercase tracking-widest text-muted">Nuova campagna</h2>
        <input
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          placeholder="Es. La Maledizione di Strahd"
          className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground"
        />
        <textarea
          value={descrizione}
          onChange={(event) => setDescrizione(event.target.value)}
          placeholder="Ambientazione, trama, tono…"
          rows={2}
          className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground"
        />
        <button
          onClick={create}
          className="w-full rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors"
        >
          Crea (diventi il master)
        </button>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-4 space-y-2">
        <h2 className="text-xs uppercase tracking-widest text-muted">Unisciti con un invito</h2>
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Incolla il codice invito"
          className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-sm text-foreground"
        />
        <button
          onClick={join}
          className="w-full rounded-lg border border-edge bg-surface-raised px-4 py-2 text-sm text-foreground hover:border-accent transition-colors"
        >
          Entra come giocatore
        </button>
      </section>
    </div>
  );
}

function CampaignDetailView({
  campaignId,
  userId,
  onBack,
  onDeleted,
}: {
  campaignId: string;
  userId: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [party, setParty] = useState<Awaited<ReturnType<typeof getPartyForCampaign>> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");

  const refresh = () => {
    getCampaign(campaignId)
      .then(setDetail)
      .catch((err) => setError(err.message));
    getPartyForCampaign(campaignId).then(setParty);
  };

  useEffect(refresh, [campaignId]);

  if (error) {
    return (
      <div className="max-w-2xl lg:max-w-3xl mx-auto space-y-4">
        <button onClick={onBack} className="text-sm text-muted hover:text-foreground">
          ← Campagne
        </button>
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (!detail) return <p className="text-muted">Caricamento…</p>;

  const isDm = detail.myRole === "dm";
  const isOwner = detail.campaign.ownerId === userId;

  const generateInvite = async () => {
    const code = await createInvite(campaignId);
    setInviteLink(`${window.location.origin}/campagne?invite=${code}`);
  };

  const addNote = async () => {
    if (!noteTitle.trim() && !noteText.trim()) return;
    await addSessionNote(
      campaignId,
      noteTitle.trim() || `Sessione ${detail.sessionNotes.length + 1}`,
      noteText.trim(),
    );
    setNoteTitle("");
    setNoteText("");
    refresh();
  };

  return (
    <div className="space-y-6 max-w-2xl lg:max-w-5xl 2xl:max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-muted hover:text-foreground">
          ← Campagne
        </button>
        {isOwner ? (
          <button
            onClick={async () => {
              if (window.confirm(`Eliminare ${detail.campaign.nome}? Non si può annullare.`)) {
                await deleteCampaign(campaignId);
                onDeleted();
              }
            }}
            className="text-sm text-danger hover:underline"
          >
            Elimina campagna
          </button>
        ) : (
          <button
            onClick={async () => {
              if (window.confirm("Abbandonare questa campagna?")) {
                await leaveCampaign(campaignId);
                onDeleted();
              }
            }}
            className="text-sm text-danger hover:underline"
          >
            Abbandona
          </button>
        )}
      </div>

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-2">
        <h2 className="text-2xl font-display font-bold text-accent-strong">
          {detail.campaign.nome}
        </h2>
        {detail.campaign.descrizione && (
          <p className="text-sm text-muted">{detail.campaign.descrizione}</p>
        )}
      </section>

      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
      <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm uppercase tracking-widest text-muted">Membri</h2>
          {isDm && (
            <button
              onClick={generateInvite}
              className="text-xs font-bold text-accent-strong hover:underline"
            >
              Genera invito
            </button>
          )}
        </div>
        {inviteLink && (
          <div className="rounded-lg border border-edge bg-surface-raised p-2 text-xs text-muted break-all">
            {inviteLink}
          </div>
        )}
        <ul className="space-y-2">
          {detail.members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
            >
              <span className="text-sm text-foreground truncate">
                {member.name ?? member.email}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {isDm && member.userId !== userId ? (
                  <>
                    <select
                      value={member.role}
                      onChange={async (event) => {
                        await setMemberRole(campaignId, member.userId, event.target.value as "dm" | "player");
                        refresh();
                      }}
                      className="rounded-md border border-edge bg-surface px-2 py-1 text-xs text-foreground"
                    >
                      <option value="player">Giocatore</option>
                      <option value="dm">Master</option>
                    </select>
                    <button
                      onClick={async () => {
                        await removeMember(campaignId, member.userId);
                        refresh();
                      }}
                      className="text-muted hover:text-danger text-sm"
                      aria-label={`Rimuovi ${member.name}`}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted">
                    {member.role === "dm" ? "Master" : "Giocatore"}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-3 mt-6 lg:mt-0">
        <h2 className="text-sm uppercase tracking-widest text-muted">Party</h2>
        {!party || party.length === 0 ? (
          <p className="text-sm text-muted">
            Nessun personaggio ancora — portane uno qui da Personaggi.
          </p>
        ) : (
          <ul className="space-y-2">
            {party.map((pc) => {
              const abilities = pc.caratteristiche;
              const classSummary = pc.classi
                .map((c) => `${c.nome} ${c.livello}`)
                .join(" / ");
              return (
                <li
                  key={pc.userId}
                  className="rounded-lg border border-edge bg-surface-raised p-3"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-bold text-foreground">{pc.nome}</p>
                      <p className="text-xs text-muted">
                        {[pc.razza, classSummary].filter(Boolean).join(" · ")} · giocato da{" "}
                        {pc.playerName}
                      </p>
                    </div>
                    <span className="text-xs text-muted shrink-0">
                      PF {pc.hpAttuali}/{pc.hpMax} · CA {pc.classeArmatura} · Liv.{" "}
                      {totalLevel(pc.classi)}
                    </span>
                  </div>
                  <div className="grid grid-cols-6 gap-1.5 mt-2">
                    {(["forza", "destrezza", "costituzione", "intelligenza", "saggezza", "carisma"] as Ability[]).map(
                      (ability) => (
                        <div key={ability} className="text-center">
                          <p className="text-[9px] uppercase tracking-widest text-muted">
                            {ability.slice(0, 3)}
                          </p>
                          <p className="text-xs font-bold text-foreground">
                            {formatModifier(abilityModifier(abilities[ability]))}
                          </p>
                        </div>
                      ),
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>

      <EncounterTracker
        campaignId={campaignId}
        isDm={isDm}
        partyLevels={(party ?? []).map((pc) => totalLevel(pc.classi))}
      />

      <DungeonSection campaignId={campaignId} isDm={isDm} />

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-4">
        <h2 className="text-sm uppercase tracking-widest text-muted">Diario delle sessioni</h2>
        <div className="space-y-2">
          <input
            value={noteTitle}
            onChange={(event) => setNoteTitle(event.target.value)}
            placeholder="Titolo (es. Sessione 3 — La cripta)"
            className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
          />
          <textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="Cosa è successo in questa sessione?"
            rows={3}
            className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
          />
          <button
            onClick={addNote}
            className="rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors"
          >
            Aggiungi al diario
          </button>
        </div>

        {detail.sessionNotes.length > 0 && (
          <ul className="space-y-3 pt-2">
            {detail.sessionNotes.map((note) => (
              <li key={note.id} className="rounded-lg border border-edge bg-surface-raised p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-foreground">{note.titolo}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted">
                      {new Date(note.createdAt).toLocaleDateString("it-IT")}
                    </span>
                    <button
                      onClick={async () => {
                        await deleteSessionNote(note.id);
                        refresh();
                      }}
                      className="text-muted hover:text-danger text-sm"
                      aria-label={`Elimina ${note.titolo}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {note.testo && (
                  <p className="text-sm text-muted mt-1 whitespace-pre-wrap">{note.testo}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// Un breve lampo di colore quando i PF cambiano (danno/cura), sia da un click locale che da un
// aggiornamento realtime in arrivo da un altro dispositivo — stesso segnale visivo in entrambi i
// casi, perché entrambi passano dallo stesso stato React, non serve distinguerli.
function HpValue({
  hpAttuali,
  hpMax,
  suffix = "",
}: {
  hpAttuali: number;
  hpMax: number;
  suffix?: string;
}) {
  const [flash, setFlash] = useState<"su" | "giu" | null>(null);
  const prevRef = useRef(hpAttuali);

  useEffect(() => {
    if (prevRef.current === hpAttuali) return;
    setFlash(hpAttuali > prevRef.current ? "su" : "giu");
    prevRef.current = hpAttuali;
    const timeout = setTimeout(() => setFlash(null), 600);
    return () => clearTimeout(timeout);
  }, [hpAttuali]);

  return (
    <span
      className={`inline-block w-16 rounded text-center text-xs transition-colors duration-500 ${
        flash === "giu"
          ? "bg-danger/25 text-danger"
          : flash === "su"
            ? "bg-accent/25 text-accent-strong"
            : "text-foreground"
      }`}
    >
      {hpAttuali}/{hpMax}
      {suffix}
    </span>
  );
}

const CONDIZIONI_5E = [
  "Affascinato",
  "Afferrato",
  "Accecato",
  "Assordato",
  "Avvelenato",
  "Incapacitato",
  "Indebolito",
  "Invisibile",
  "Paralizzato",
  "Pietrificato",
  "Prono",
  "Spaventato",
  "Stordito",
  "Trattenuto",
];

type Combatant = NonNullable<Awaited<ReturnType<typeof getActiveEncounter>>>["combatants"][number];

function CombatantConditions({
  combatant,
  isDm,
  onChange,
}: {
  combatant: Combatant;
  isDm: boolean;
  onChange: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const condizioni = combatant.condizioni;

  if (condizioni.length === 0 && !isDm) return null;

  const remove = async (condizione: string) => {
    await updateCombatant(combatant.id, { condizioni: condizioni.filter((c) => c !== condizione) });
    onChange();
  };

  const add = async (condizione: string) => {
    setAdding(false);
    if (!condizione || condizioni.includes(condizione)) return;
    await updateCombatant(combatant.id, { condizioni: [...condizioni, condizione] });
    onChange();
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {condizioni.map((condizione) => (
        <span
          key={condizione}
          className="flex items-center gap-1 rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] font-bold text-danger"
        >
          {condizione}
          {isDm && (
            <button
              onClick={() => remove(condizione)}
              aria-label={`Rimuovi condizione ${condizione}`}
              className="hover:text-foreground"
            >
              ×
            </button>
          )}
        </span>
      ))}
      {isDm &&
        (adding ? (
          <select
            autoFocus
            defaultValue=""
            onChange={(event) => add(event.target.value)}
            onBlur={() => setAdding(false)}
            className="rounded-full border border-edge bg-surface px-2 py-0.5 text-[10px] text-foreground"
          >
            <option value="" disabled>
              Scegli…
            </option>
            {CONDIZIONI_5E.filter((c) => !condizioni.includes(c)).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-edge px-2 py-0.5 text-[10px] text-muted hover:text-foreground transition-colors"
          >
            + Condizione
          </button>
        ))}
    </div>
  );
}

function CombatantDeathSaves({
  combatant,
  isDm,
  onChange,
}: {
  combatant: Combatant;
  isDm: boolean;
  onChange: () => void;
}) {
  const toggle = async (key: "tiriMorteSuccessi" | "tiriMorteFallimenti", index: number) => {
    if (!isDm) return;
    const current = combatant[key];
    const next = index < current ? index : index + 1;
    await updateCombatant(combatant.id, { [key]: next });
    onChange();
  };

  const dots = (value: number, key: "tiriMorteSuccessi" | "tiriMorteFallimenti", color: string) =>
    [0, 1, 2].map((i) => (
      <button
        key={i}
        disabled={!isDm}
        onClick={() => toggle(key, i)}
        aria-label={`${key} ${i + 1}`}
        className={`size-3.5 rounded-full border-2 transition-colors ${
          i < value ? color : "border-edge bg-transparent"
        }`}
      />
    ));

  return (
    <div className="flex items-center gap-3 text-[10px] text-muted">
      <span className="font-bold text-danger">☠️ Tiri salvezza contro la morte</span>
      <span className="flex items-center gap-1">
        {dots(combatant.tiriMorteSuccessi, "tiriMorteSuccessi", "border-accent-strong bg-accent-strong")}
      </span>
      <span className="flex items-center gap-1">
        {dots(combatant.tiriMorteFallimenti, "tiriMorteFallimenti", "border-danger bg-danger")}
      </span>
      {(combatant.tiriMorteSuccessi >= 3 || combatant.tiriMorteFallimenti >= 3) && (
        <span className="font-bold text-foreground">
          {combatant.tiriMorteSuccessi >= 3 ? "✓ Stabilizzato" : "✝ Morto"}
        </span>
      )}
    </div>
  );
}

function EncounterTracker({
  campaignId,
  isDm,
  partyLevels,
}: {
  campaignId: string;
  isDm: boolean;
  partyLevels: number[];
}) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getActiveEncounter>>>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getActiveEncounter(campaignId)
      .then(setData)
      .catch((err) => setError(err.message));
  };

  useEffect(refresh, [campaignId]);

  usePartyRoom({ kind: "combat", campaignId }, (message) => {
    if ((message as { type?: string } | null)?.type === "encounter-changed") refresh();
  });

  if (!data) {
    if (!isDm) return null;
    return (
      <section className="rounded-xl border border-dashed border-edge bg-surface/50 p-4">
        <button
          onClick={async () => {
            await startEncounter(campaignId);
            refresh();
          }}
          className="text-sm font-bold text-accent-strong hover:underline"
        >
          ⚔️ Inizia combattimento
        </button>
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </section>
    );
  }

  const { encounter, combatants } = data;

  return (
    <section className="rounded-xl border border-accent/40 bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-accent-strong">
          ⚔️ Combattimento — Round {encounter.round}
        </h2>
        {isDm && (
          <div className="flex gap-2">
            <button
              onClick={async () => {
                await nextTurn(encounter.id);
                refresh();
              }}
              className="text-xs font-bold rounded-lg border border-edge px-2 py-1 text-foreground hover:border-accent transition-colors"
            >
              Prossimo turno →
            </button>
            <button
              onClick={async () => {
                if (window.confirm("Terminare il combattimento?")) {
                  await endEncounter(campaignId);
                  refresh();
                }
              }}
              className="text-xs text-danger hover:underline"
            >
              Termina
            </button>
          </div>
        )}
      </div>

      {combatants.length === 0 ? (
        <p className="text-sm text-muted">Nessun combattente ancora.</p>
      ) : (
        <ul className="space-y-1.5">
          {combatants.map((c, index) => (
            <li
              key={c.id}
              className={`rounded-lg border px-3 py-2 space-y-1.5 transition-colors duration-300 ${
                index === encounter.currentTurn
                  ? "border-accent bg-accent/10"
                  : "border-edge bg-surface-raised"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isDm ? (
                    <input
                      type="number"
                      value={c.iniziativa}
                      onChange={async (event) => {
                        const value = Number(event.target.value);
                        if (Number.isNaN(value)) return;
                        await updateCombatant(c.id, { iniziativa: value });
                        refresh();
                      }}
                      aria-label={`Iniziativa di ${c.nome}`}
                      className="w-10 shrink-0 rounded border border-edge bg-surface px-1 py-0.5 text-center text-xs font-bold text-muted"
                    />
                  ) : (
                    <span className="text-xs font-bold text-muted w-6 shrink-0">{c.iniziativa}</span>
                  )}
                  <span
                    className={`text-sm truncate ${c.isPg ? "text-accent-strong font-bold" : "text-foreground"}`}
                  >
                    {c.nome}
                  </span>
                </div>
                {isDm ? (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={async () => {
                        await updateCombatant(c.id, { hpAttuali: Math.max(0, c.hpAttuali - 1) });
                        refresh();
                      }}
                      className="size-6 rounded border border-edge text-danger text-xs transition-transform active:scale-90"
                      aria-label="Togli un punto ferita"
                    >
                      −
                    </button>
                    <HpValue hpAttuali={c.hpAttuali} hpMax={c.hpMax} />
                    <button
                      onClick={async () => {
                        const hpAttuali = Math.min(c.hpMax, c.hpAttuali + 1);
                        await updateCombatant(c.id, {
                          hpAttuali,
                          // recuperare anche un solo PF azzera i tiri salvezza contro la morte (regola RAW)
                          ...(c.hpAttuali <= 0 && hpAttuali > 0
                            ? { tiriMorteSuccessi: 0, tiriMorteFallimenti: 0 }
                            : {}),
                        });
                        refresh();
                      }}
                      className="size-6 rounded border border-edge text-accent-strong text-xs transition-transform active:scale-90"
                      aria-label="Aggiungi un punto ferita"
                    >
                      +
                    </button>
                    <button
                      onClick={async () => {
                        await removeCombatant(c.id);
                        refresh();
                      }}
                      className="text-muted hover:text-danger text-xs ml-1 transition-colors"
                      aria-label={`Rimuovi ${c.nome}`}
                    >
                      ×
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-muted shrink-0">
                    <HpValue hpAttuali={c.hpAttuali} hpMax={c.hpMax} suffix=" PF" />
                  </span>
                )}
              </div>

              <CombatantConditions combatant={c} isDm={isDm} onChange={refresh} />

              {c.isPg && c.hpAttuali <= 0 && (
                <CombatantDeathSaves combatant={c} isDm={isDm} onChange={refresh} />
              )}
            </li>
          ))}
        </ul>
      )}

      {isDm && (
        <EncounterDmControls
          encounter={encounter}
          campaignId={campaignId}
          partyLevels={partyLevels}
          onChange={refresh}
        />
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}

function EncounterDmControls({
  encounter,
  campaignId,
  partyLevels,
  onChange,
}: {
  encounter: { id: string };
  campaignId: string;
  partyLevels: number[];
  onChange: () => void;
}) {
  const [nome, setNome] = useState("");
  const [iniziativa, setIniziativa] = useState(10);
  const [hpMax, setHpMax] = useState(10);

  const add = async () => {
    if (!nome.trim() || hpMax < 1) return;
    await addCombatant(encounter.id, { nome: nome.trim(), iniziativa, hpMax });
    setNome("");
    onChange();
  };

  return (
    <div className="border-t border-edge pt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={async () => {
            await addPartyToEncounter(encounter.id, campaignId);
            onChange();
          }}
          className="text-xs font-bold rounded-lg border border-edge px-2 py-1.5 text-foreground hover:border-accent transition-colors"
        >
          + Aggiungi il party
        </button>
        <MonsterQuickAdd
          onPick={(name, hp) => {
            setNome(name);
            setHpMax(hp);
          }}
        />
      </div>

      {partyLevels.length > 0 && (
        <EncounterGenerator
          encounterId={encounter.id}
          partyLevels={partyLevels}
          onAdded={onChange}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={nome}
          onChange={(event) => setNome(event.target.value)}
          placeholder="Nome combattente"
          className="flex-1 min-w-[140px] rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
        />
        <label className="flex items-center gap-1 text-xs text-muted">
          Iniz.
          <input
            type="number"
            value={iniziativa}
            onChange={(event) => setIniziativa(Number(event.target.value) || 0)}
            className="w-14 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          PF
          <input
            type="number"
            min={1}
            value={hpMax}
            onChange={(event) => setHpMax(Math.max(1, Number(event.target.value) || 1))}
            className="w-14 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <button
          onClick={add}
          className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors"
        >
          Aggiungi
        </button>
      </div>
    </div>
  );
}

function EncounterGenerator({
  encounterId,
  partyLevels,
  onAdded,
}: {
  encounterId: string;
  partyLevels: number[];
  onAdded: () => void;
}) {
  const [difficulty, setDifficulty] = useState<EncounterDifficulty>("medio");
  const [creatures, setCreatures] = useState<RawCreature[] | null>(null);
  const [suggestion, setSuggestion] = useState<{
    creature: RawCreature;
    count: number;
    totalXp: number;
  } | null>(null);
  const [adding, setAdding] = useState(false);

  const budget = xpBudget(partyLevels, difficulty);

  const generate = async () => {
    const pool = creatures ?? (await loadCreatures());
    if (!creatures) setCreatures(pool);

    const withXp = pool
      .map((creature) => ({
        creature,
        xp: XP_BY_CR[typeof creature.cr === "string" ? creature.cr : (creature.cr?.cr ?? "")],
      }))
      .filter((entry): entry is { creature: RawCreature; xp: number } => Boolean(entry.xp));

    if (withXp.length === 0) return;

    const countOptions = [1, 1, 2, 2, 3, 4];
    const count = countOptions[Math.floor(Math.random() * countOptions.length)];
    const perMonsterTarget = budget / (count * encounterMultiplier(count));

    let candidates = withXp.filter(
      (entry) => entry.xp >= perMonsterTarget * 0.4 && entry.xp <= perMonsterTarget * 1.6,
    );
    if (candidates.length === 0) {
      candidates = [...withXp]
        .sort((a, b) => Math.abs(a.xp - perMonsterTarget) - Math.abs(b.xp - perMonsterTarget))
        .slice(0, 20);
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    setSuggestion({ creature: pick.creature, count, totalXp: adjustedEncounterXp(pick.xp, count) });
  };

  const addToEncounter = async () => {
    if (!suggestion) return;
    setAdding(true);
    const hp = combatantHp(suggestion.creature);
    for (let i = 0; i < suggestion.count; i++) {
      await addCombatant(encounterId, {
        nome:
          suggestion.count > 1 ? `${suggestion.creature.name} ${i + 1}` : suggestion.creature.name,
        iniziativa: 10,
        hpMax: hp,
      });
    }
    setAdding(false);
    setSuggestion(null);
    onAdded();
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted">Genera incontro casuale</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={difficulty}
          onChange={(event) => setDifficulty(event.target.value as EncounterDifficulty)}
          className="rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
        >
          {(Object.keys(DIFFICULTY_LABELS) as EncounterDifficulty[]).map((d) => (
            <option key={d} value={d}>
              {DIFFICULTY_LABELS[d]}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted">
          Budget: {budget} XP ({partyLevels.length} PG)
        </span>
        <button
          onClick={generate}
          className="text-xs font-bold rounded-lg border border-edge px-2 py-1.5 text-foreground hover:border-accent transition-colors"
        >
          🎲 Genera
        </button>
      </div>
      {suggestion && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-accent/40 bg-surface-raised px-3 py-2">
          <span className="text-sm text-foreground">
            {suggestion.count}× <span className="font-bold">{suggestion.creature.name}</span>{" "}
            <span className="text-xs text-muted">
              (CR{" "}
              {typeof suggestion.creature.cr === "string"
                ? suggestion.creature.cr
                : suggestion.creature.cr?.cr}{" "}
              · {suggestion.totalXp} XP)
            </span>
          </span>
          <button
            onClick={addToEncounter}
            disabled={adding}
            className="text-xs font-bold rounded-lg bg-accent text-background px-2 py-1.5 hover:bg-accent-strong transition-colors disabled:opacity-50"
          >
            {adding ? "…" : "+ Aggiungi al combattimento"}
          </button>
        </div>
      )}
    </div>
  );
}

function combatantHp(creature: RawCreature): number {
  if (!creature.hp) return 10;
  if (typeof creature.hp === "number") return creature.hp;
  return creature.hp.average ?? 10;
}

function MonsterQuickAdd({ onPick }: { onPick: (name: string, hp: number) => void }) {
  const [creatures, setCreatures] = useState<RawCreature[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || creatures) return;
    loadCreatures().then(setCreatures);
  }, [open, creatures]);

  const q = query.trim().toLowerCase();
  const suggestions =
    creatures && q.length >= 2
      ? creatures.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 6)
      : [];

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Cerca mostro dal Compendio…"
        className="rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-xs text-foreground w-52"
      />
      {open && creatures === null && (
        <div className="absolute z-10 mt-1 w-56 rounded-lg border border-edge bg-surface-raised px-3 py-2 text-xs text-muted shadow-lg">
          Caricamento bestiario…
        </div>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-56 max-h-48 overflow-auto rounded-lg border border-edge bg-surface-raised shadow-lg">
          {suggestions.map((c, index) => (
            <li key={`${c.source}-${c.name}-${index}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(c.name, combatantHp(c));
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-surface transition-colors"
              >
                {c.name} <span className="text-muted">({combatantHp(c)} PF)</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DungeonSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [dungeons, setDungeons] = useState<DungeonListItem[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<DungeonFull | null>(null);
  const [formMode, setFormMode] = useState<"none" | "generate" | "blank">("none");

  const refreshList = () => {
    getDungeonsForCampaign(campaignId).then(setDungeons);
  };
  useEffect(refreshList, [campaignId]);

  const openDungeon = (id: string) => {
    setActiveId(id);
    getDungeon(id).then(setActive);
  };

  const refreshActive = () => {
    if (activeId) getDungeon(activeId).then(setActive);
  };

  if (dungeons === null) return null;

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">🗺️ Dungeon</h2>
        {isDm && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => setFormMode((prev) => (prev === "generate" ? "none" : "generate"))}
              className="text-xs font-bold text-accent-strong hover:underline"
            >
              {formMode === "generate" ? "Annulla" : "+ Genera dungeon"}
            </button>
            <button
              onClick={() => setFormMode((prev) => (prev === "blank" ? "none" : "blank"))}
              className="text-xs font-bold text-accent-strong hover:underline"
            >
              {formMode === "blank" ? "Annulla" : "+ Disegna da zero"}
            </button>
          </div>
        )}
      </div>

      {formMode === "generate" && isDm && (
        <NewDungeonForm
          campaignId={campaignId}
          onCreated={(dungeon) => {
            setFormMode("none");
            refreshList();
            openDungeon(dungeon.id);
          }}
        />
      )}

      {formMode === "blank" && isDm && (
        <NewBlankDungeonForm
          campaignId={campaignId}
          onCreated={(dungeon) => {
            setFormMode("none");
            refreshList();
            openDungeon(dungeon.id);
          }}
        />
      )}

      {dungeons.length === 0 ? (
        <p className="text-sm text-muted">Nessun dungeon ancora.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {dungeons.map((d) => (
            <button
              key={d.id}
              onClick={() => openDungeon(d.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                activeId === d.id
                  ? "border-accent bg-accent/15 text-accent-strong"
                  : "border-edge bg-surface-raised text-muted hover:text-foreground"
              }`}
            >
              {d.nome}
            </button>
          ))}
        </div>
      )}

      {active && (
        <DungeonViewer
          key={active.id}
          dungeon={active}
          isDm={isDm}
          onDeleted={() => {
            setActiveId(null);
            setActive(null);
            refreshList();
          }}
          onRoomUpdated={refreshActive}
        />
      )}
    </section>
  );
}

const SHAPE_LABELS: Record<RoomShape, string> = {
  rectangular: "Rettangolari",
  organic: "Organiche",
  circular: "Circolari",
  polygonal: "Poligonali",
};

function NewDungeonForm({
  campaignId,
  onCreated,
}: {
  campaignId: string;
  onCreated: (dungeon: { id: string }) => void;
}) {
  const [nome, setNome] = useState("");
  const [minRooms, setMinRooms] = useState(5);
  const [maxRooms, setMaxRooms] = useState(10);
  const [shape, setShape] = useState<RoomShape>("rectangular");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (minRooms < 1 || maxRooms < minRooms) {
      setError("Numero di stanze non valido.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const config: DungeonConfig = { minRooms, maxRooms, shape };
      const dungeon = await createDungeon(campaignId, nome.trim(), config);
      setNome("");
      onCreated(dungeon);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <input
        value={nome}
        onChange={(event) => setNome(event.target.value)}
        placeholder="Nome (es. Cripta sotto la torre)"
        className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Stanze min
          <input
            type="number"
            min={1}
            max={40}
            value={minRooms}
            onChange={(event) => setMinRooms(Number(event.target.value) || 1)}
            className="w-14 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          max
          <input
            type="number"
            min={1}
            max={40}
            value={maxRooms}
            onChange={(event) => setMaxRooms(Number(event.target.value) || 1)}
            className="w-14 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(["rectangular", "organic", "circular", "polygonal"] as RoomShape[]).map((option) => (
            <button
              key={option}
              onClick={() => setShape(option)}
              className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                shape === option
                  ? "border-accent bg-accent/15 text-accent-strong"
                  : "border-edge bg-surface text-muted hover:text-foreground"
              }`}
            >
              {SHAPE_LABELS[option]}
            </button>
          ))}
        </div>
        <button
          onClick={generate}
          disabled={generating}
          className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors disabled:opacity-50"
        >
          {generating ? "Genero…" : "🎲 Genera"}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function NewBlankDungeonForm({
  campaignId,
  onCreated,
}: {
  campaignId: string;
  onCreated: (dungeon: { id: string }) => void;
}) {
  const [nome, setNome] = useState("");
  const [width, setWidth] = useState(30);
  const [height, setHeight] = useState(20);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const dungeon = await createBlankDungeon(campaignId, nome.trim(), width, height);
      setNome("");
      onCreated(dungeon);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <input
        value={nome}
        onChange={(event) => setNome(event.target.value)}
        placeholder="Nome (es. Cripta sotto la torre)"
        className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Larghezza
          <input
            type="number"
            min={8}
            max={60}
            value={width}
            onChange={(event) => setWidth(Number(event.target.value) || 8)}
            className="w-16 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Altezza
          <input
            type="number"
            min={8}
            max={60}
            value={height}
            onChange={(event) => setHeight(Number(event.target.value) || 8)}
            className="w-16 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <button
          onClick={create}
          disabled={creating}
          className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors disabled:opacity-50"
        >
          {creating ? "Creo…" : "✏️ Crea tela vuota"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Crea una griglia vuota da disegnare a mano (pennello muri/pavimento/porte + punti d&apos;interesse).
      </p>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

const BRUSH_LABELS: Record<CellType, string> = {
  floor: "Pavimento",
  wall: "Muro",
  door: "Porta",
  corridor: "Pavimento",
};

function DungeonViewer({
  dungeon,
  isDm,
  onDeleted,
  onRoomUpdated,
}: {
  dungeon: DungeonFull;
  isDm: boolean;
  onDeleted: () => void;
  onRoomUpdated: () => void;
}) {
  const { data: session } = useSession();
  const myUserId = session?.user?.id ?? null;

  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [brush, setBrush] = useState<CellType>("floor");
  const [markerMode, setMarkerMode] = useState(false);
  const [cells, setCells] = useState<CellType[][]>(dungeon.cells);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rawTokens, setRawTokens] = useState<
    { userId: string; x: number; y: number; name: string | null }[]
  >([]);
  const selectedRoom = dungeon.rooms.find((room) => room.id === selectedRoomId) ?? null;

  useEffect(() => {
    getDungeonTokens(dungeon.id).then(setRawTokens);
  }, [dungeon.id]);

  const fetchingNewTokenRef = useRef(false);
  const { send } = usePartyRoom({ kind: "dungeon", dungeonId: dungeon.id }, (message) => {
    const msg = message as { type?: string; userId?: string; x?: number; y?: number } | null;
    if (msg?.type !== "move" || !msg.userId || typeof msg.x !== "number" || typeof msg.y !== "number") return;
    setRawTokens((prev) => {
      if (!prev.some((t) => t.userId === msg.userId)) {
        // token di un giocatore che non avevamo ancora (l'ha appena piazzato per la prima
        // volta): non basta il movimento per costruirlo (manca nome/immagine), si ricarica
        // l'elenco intero per prenderlo con i dati giusti invece di ignorarlo in silenzio.
        if (!fetchingNewTokenRef.current) {
          fetchingNewTokenRef.current = true;
          getDungeonTokens(dungeon.id)
            .then(setRawTokens)
            .finally(() => {
              fetchingNewTokenRef.current = false;
            });
        }
        return prev;
      }
      return prev.map((t) => (t.userId === msg.userId ? { ...t, x: msg.x!, y: msg.y! } : t));
    });
  });

  const myToken = rawTokens.find((t) => t.userId === myUserId) ?? null;
  const tokens: DungeonToken[] = rawTokens.map((t) => ({
    userId: t.userId,
    x: t.x,
    y: t.y,
    label: tokenInitials(t.name),
    color: tokenColor(t.userId),
    isMe: t.userId === myUserId,
  }));

  const handleTokenDrag = (x: number, y: number) => {
    send({ type: "move", x, y });
  };

  const handleTokenDragEnd = async (x: number, y: number) => {
    setRawTokens((prev) =>
      myUserId && prev.some((t) => t.userId === myUserId)
        ? prev.map((t) => (t.userId === myUserId ? { ...t, x, y } : t))
        : prev,
    );
    send({ type: "move", x, y });
    await upsertMyToken(dungeon.id, x, y);
  };

  const placeMyToken = async () => {
    if (!myUserId) return;
    await upsertMyToken(dungeon.id, Math.floor(dungeon.width / 2), Math.floor(dungeon.height / 2));
    const fresh = await getDungeonTokens(dungeon.id);
    setRawTokens(fresh);
  };

  const removeMyTokenFromMap = async () => {
    await removeMyToken(dungeon.id);
    setRawTokens((prev) => prev.filter((t) => t.userId !== myUserId));
  };

  const paintCell = (x: number, y: number) => {
    setCells((prev) => {
      if (prev[y]?.[x] === undefined || prev[y][x] === brush) return prev;
      const next = prev.map((row) => [...row]);
      next[y][x] = brush;
      return next;
    });
    setDirty(true);
  };

  const saveCells = async () => {
    setSaving(true);
    try {
      await updateDungeonCells(dungeon.id, cells);
      setDirty(false);
      onRoomUpdated();
    } finally {
      setSaving(false);
    }
  };

  const placeMarker = async (x: number, y: number) => {
    const label = window.prompt("Nome del punto d'interesse", `Punto ${dungeon.rooms.length + 1}`);
    if (label === null) return;
    await addMarker(dungeon.id, x, y, label);
    onRoomUpdated();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {dungeon.rooms.length} stanze · {dungeon.width}×{dungeon.height}
        </p>
        {isDm && (
          <button
            onClick={async () => {
              if (window.confirm(`Eliminare "${dungeon.nome}"?`)) {
                await deleteDungeon(dungeon.id);
                onDeleted();
              }
            }}
            className="text-xs text-danger hover:underline"
          >
            Elimina
          </button>
        )}
      </div>

      {myUserId && (
        <div className="flex items-center gap-2 text-xs">
          {myToken ? (
            <button onClick={removeMyTokenFromMap} className="font-bold text-danger hover:underline">
              🧭 Rimuovi il mio token
            </button>
          ) : (
            <button onClick={placeMyToken} className="font-bold text-accent-strong hover:underline">
              🧭 Metti il mio token in mappa
            </button>
          )}
        </div>
      )}

      {isDm && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface-raised p-2">
          <button
            onClick={() => {
              setEditMode((prev) => !prev);
              setMarkerMode(false);
              setSelectedRoomId(null);
            }}
            className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
              editMode
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface text-muted hover:text-foreground"
            }`}
          >
            {editMode ? "Fine modifica" : "✏️ Modifica mappa"}
          </button>
          {editMode && (
            <>
              <div className="flex gap-1">
                {(["floor", "wall", "door"] as CellType[]).map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setBrush(option);
                      setMarkerMode(false);
                    }}
                    className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                      !markerMode && brush === option
                        ? "border-accent bg-accent/15 text-accent-strong"
                        : "border-edge bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    {BRUSH_LABELS[option]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setMarkerMode((prev) => !prev)}
                className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                  markerMode
                    ? "border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface text-muted hover:text-foreground"
                }`}
              >
                📍 Punto d&apos;interesse
              </button>
              <button
                onClick={saveCells}
                disabled={!dirty || saving}
                className="rounded-md bg-accent text-background font-bold px-2 py-1 text-xs hover:bg-accent-strong transition-colors disabled:opacity-50"
              >
                {saving ? "…" : dirty ? "💾 Salva mappa" : "Salvato"}
              </button>
            </>
          )}
        </div>
      )}

      <DungeonMap
        dungeon={{ ...dungeon, cells }}
        activeRoomId={selectedRoomId}
        onRoomClick={(id) => {
          if (editMode) return;
          setSelectedRoomId(id === selectedRoomId ? null : id);
        }}
        editable={editMode}
        markerMode={markerMode}
        onPaintCell={paintCell}
        onPlaceMarker={placeMarker}
        tokens={tokens}
        onTokenDrag={handleTokenDrag}
        onTokenDragEnd={handleTokenDragEnd}
      />
      {selectedRoom && isDm && !editMode && (
        <RoomNotesEditor
          key={selectedRoom.id}
          dungeonId={dungeon.id}
          room={selectedRoom}
          onSaved={onRoomUpdated}
          onDeleted={() => {
            setSelectedRoomId(null);
            onRoomUpdated();
          }}
        />
      )}
      {selectedRoom && !isDm && (
        <p className="text-sm text-muted">Stanza {selectedRoom.label}.</p>
      )}
    </div>
  );
}

function RoomNotesEditor({
  dungeonId,
  room,
  onSaved,
  onDeleted,
}: {
  dungeonId: string;
  room: DungeonFull["rooms"][number];
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [encounter, setEncounter] = useState(room.encounter);
  const [reward, setReward] = useState(room.reward);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    await updateRoomNotes(dungeonId, room.id, { encounter, reward });
    setSaving(false);
    onSaved();
  };

  const remove = async () => {
    if (!window.confirm(`Eliminare "${room.label}" dalla mappa?`)) return;
    await deleteMarker(dungeonId, room.id);
    onDeleted();
  };

  return (
    <div className="rounded-lg border border-accent/40 bg-surface-raised p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-muted">Stanza {room.label}</p>
        <button onClick={remove} className="text-xs text-danger hover:underline">
          Elimina
        </button>
      </div>
      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-muted">Incontro</span>
        <textarea
          value={encounter}
          onChange={(event) => setEncounter(event.target.value)}
          rows={2}
          placeholder="Es. 2 goblin in agguato dietro le casse"
          className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
      </label>
      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-muted">Ricompensa</span>
        <textarea
          value={reward}
          onChange={(event) => setReward(event.target.value)}
          rows={2}
          placeholder="Es. Pozione di cura, 20 mo"
          className="mt-1 w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
      </label>
      <button
        onClick={save}
        disabled={saving}
        className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors disabled:opacity-50"
      >
        {saving ? "…" : "Salva"}
      </button>
    </div>
  );
}

const CELL_FILL: Record<CellType, string | null> = {
  wall: null,
  floor: "#241f1a",
  corridor: "#2a241e",
  door: "#e0a83e",
};

interface DungeonToken {
  userId: string;
  x: number;
  y: number;
  label: string;
  color: string;
  isMe: boolean;
}

function tokenColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return `hsl(${hash % 360} 70% 55%)`;
}

function tokenInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0][0]}${parts[1][0]}`.toUpperCase() : name.slice(0, 2).toUpperCase();
}

function DungeonMap({
  dungeon,
  activeRoomId,
  onRoomClick,
  editable = false,
  markerMode = false,
  onPaintCell,
  onPlaceMarker,
  tokens,
  onTokenDrag,
  onTokenDragEnd,
}: {
  dungeon: { width: number; height: number; cells: CellType[][]; rooms: DungeonFull["rooms"] };
  activeRoomId: number | null;
  onRoomClick: (id: number) => void;
  editable?: boolean;
  markerMode?: boolean;
  onPaintCell?: (x: number, y: number) => void;
  onPlaceMarker?: (x: number, y: number) => void;
  tokens?: DungeonToken[];
  onTokenDrag?: (x: number, y: number) => void;
  onTokenDragEnd?: (x: number, y: number) => void;
}) {
  const cellSize = 14;
  const isPaintingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingTokenRef = useRef<string | null>(null);
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const lastSentRef = useRef(0);

  useEffect(() => {
    if (!editable) return;
    const stop = () => {
      isPaintingRef.current = false;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [editable]);

  useEffect(() => {
    if (!tokens) return;
    const clientToCell = (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = Math.min(dungeon.width - 1, Math.max(0, ((clientX - rect.left) / rect.width) * dungeon.width));
      const y = Math.min(dungeon.height - 1, Math.max(0, ((clientY - rect.top) / rect.height) * dungeon.height));
      return { x, y };
    };
    const move = (event: PointerEvent) => {
      if (!draggingTokenRef.current) return;
      const pos = clientToCell(event.clientX, event.clientY);
      if (!pos) return;
      setDragPos(pos);
      const now = Date.now();
      if (now - lastSentRef.current > 60) {
        lastSentRef.current = now;
        onTokenDrag?.(pos.x, pos.y);
      }
    };
    const up = () => {
      if (!draggingTokenRef.current) return;
      draggingTokenRef.current = null;
      setDraggingTokenId(null);
      setDragPos((pos) => {
        if (pos) onTokenDragEnd?.(Math.round(pos.x), Math.round(pos.y));
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [tokens, dungeon.width, dungeon.height, onTokenDrag, onTokenDragEnd]);

  const handleCellDown = (x: number, y: number) => {
    if (markerMode) {
      onPlaceMarker?.(x, y);
      return;
    }
    isPaintingRef.current = true;
    onPaintCell?.(x, y);
  };

  const handleCellEnter = (x: number, y: number) => {
    if (!editable || markerMode || !isPaintingRef.current) return;
    onPaintCell?.(x, y);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-edge bg-background p-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${dungeon.width * cellSize} ${dungeon.height * cellSize}`}
        width={dungeon.width * cellSize}
        height={dungeon.height * cellSize}
        className="max-w-full h-auto"
        shapeRendering="crispEdges"
      >
        {dungeon.cells.map((row, y) =>
          row.map((cell, x) => {
            const fill = CELL_FILL[cell];
            if (!fill) return null;
            return (
              <rect
                key={`${x}-${y}`}
                x={x * cellSize}
                y={y * cellSize}
                width={cellSize}
                height={cellSize}
                fill={fill}
              />
            );
          }),
        )}
        {dungeon.rooms.map((room) => {
          const fill = activeRoomId === room.id ? "#e0a83e33" : "#241f1a";
          const stroke = activeRoomId === room.id ? "#e0a83e" : "#3b322a";
          const label = (
            <text
              x={room.centerX * cellSize + cellSize / 2}
              y={room.centerY * cellSize + cellSize / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={cellSize * 0.75}
              fill="#ece5da"
              className="pointer-events-none select-none font-bold"
            >
              {room.label}
            </text>
          );

          if (room.vectorShape?.type === "circle") {
            const { cx, cy, r } = room.vectorShape;
            return (
              <g key={room.id} onClick={() => onRoomClick(room.id)} className="cursor-pointer">
                <circle
                  cx={cx * cellSize}
                  cy={cy * cellSize}
                  r={r * cellSize}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={1.5}
                />
                {label}
              </g>
            );
          }

          if (room.vectorShape?.type === "polygon") {
            const points = room.vectorShape.points
              .map(([x, y]) => `${x * cellSize},${y * cellSize}`)
              .join(" ");
            return (
              <g key={room.id} onClick={() => onRoomClick(room.id)} className="cursor-pointer">
                <polygon points={points} fill={fill} stroke={stroke} strokeWidth={1.5} />
                {label}
              </g>
            );
          }

          return (
            <g key={room.id} onClick={() => onRoomClick(room.id)} className="cursor-pointer">
              {room.cells.map(([x, y], index) => (
                <rect
                  key={index}
                  x={x * cellSize}
                  y={y * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={0.5}
                />
              ))}
              {label}
            </g>
          );
        })}
        {editable &&
          dungeon.cells.map((row, y) =>
            row.map((_cell, x) => (
              <rect
                key={`hit-${x}-${y}`}
                x={x * cellSize}
                y={y * cellSize}
                width={cellSize}
                height={cellSize}
                fill="transparent"
                stroke="#3b322a33"
                strokeWidth={0.5}
                className={markerMode ? "cursor-crosshair" : "cursor-pointer"}
                onPointerDown={() => handleCellDown(x, y)}
                onPointerEnter={() => handleCellEnter(x, y)}
              />
            )),
          )}
        {tokens?.map((token) => {
          const dragging = draggingTokenId === token.userId && dragPos;
          const cx = ((dragging ? dragPos!.x : token.x) + 0.5) * cellSize;
          const cy = ((dragging ? dragPos!.y : token.y) + 0.5) * cellSize;
          // Mentre lo trascini tu, il token deve seguire il puntatore 1:1 senza ritardo —
          // la transizione va disattivata solo per il TUO trascinamento attivo. In ogni altro
          // caso (un token altrui che arriva via realtime, o lo scatto finale sulla cella
          // dopo il rilascio) scivola dolcemente invece di teletrasportarsi.
          const glide = dragging ? "none" : "cx 0.15s ease-out, cy 0.15s ease-out";
          return (
            <g
              key={token.userId}
              onPointerDown={(event) => {
                if (!token.isMe) return;
                event.stopPropagation();
                draggingTokenRef.current = token.userId;
                setDraggingTokenId(token.userId);
                setDragPos({ x: token.x, y: token.y });
              }}
              className={token.isMe ? "cursor-grab" : undefined}
            >
              <circle
                cx={cx}
                cy={cy}
                r={cellSize * 0.42}
                fill={token.color}
                stroke={token.isMe ? "#ece5da" : "#0c0a09"}
                strokeWidth={1.5}
                style={{ transition: glide }}
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={cellSize * 0.5}
                fill="#0c0a09"
                className="pointer-events-none select-none font-bold"
                style={{ transition: glide }}
              >
                {token.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
