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
import { loadCreatures, type RawCreature } from "@/lib/fivetools/data";
import { abilityModifier, formatModifier, totalLevel, type Ability } from "@/lib/dnd";

type CampaignSummary = Awaited<ReturnType<typeof getMyCampaigns>>[number];
type CampaignDetail = Awaited<ReturnType<typeof getCampaign>>;

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
    <div className="space-y-6 max-w-2xl mx-auto">
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
        <ul className="space-y-3">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <button
                onClick={() => setOpenId(campaign.id)}
                className="w-full text-left rounded-xl border border-edge bg-surface p-4 hover:border-accent/50 hover:bg-surface-raised transition-colors"
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
      <div className="max-w-2xl mx-auto space-y-4">
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
    <div className="space-y-6 max-w-2xl mx-auto">
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

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
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

      <EncounterTracker campaignId={campaignId} isDm={isDm} />

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

function EncounterTracker({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getActiveEncounter>>>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    getActiveEncounter(campaignId)
      .then(setData)
      .catch((err) => setError(err.message));
  };

  useEffect(refresh, [campaignId]);

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
              className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                index === encounter.currentTurn
                  ? "border-accent bg-accent/10"
                  : "border-edge bg-surface-raised"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-bold text-muted w-6 shrink-0">{c.iniziativa}</span>
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
                    className="size-6 rounded border border-edge text-danger text-xs"
                    aria-label="Togli un punto ferita"
                  >
                    −
                  </button>
                  <span className="text-xs text-foreground w-14 text-center">
                    {c.hpAttuali}/{c.hpMax}
                  </span>
                  <button
                    onClick={async () => {
                      await updateCombatant(c.id, {
                        hpAttuali: Math.min(c.hpMax, c.hpAttuali + 1),
                      });
                      refresh();
                    }}
                    className="size-6 rounded border border-edge text-accent-strong text-xs"
                    aria-label="Aggiungi un punto ferita"
                  >
                    +
                  </button>
                  <button
                    onClick={async () => {
                      await removeCombatant(c.id);
                      refresh();
                    }}
                    className="text-muted hover:text-danger text-xs ml-1"
                    aria-label={`Rimuovi ${c.nome}`}
                  >
                    ×
                  </button>
                </div>
              ) : (
                <span className="text-xs text-muted shrink-0">
                  {c.hpAttuali}/{c.hpMax} PF
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {isDm && (
        <EncounterDmControls encounter={encounter} campaignId={campaignId} onChange={refresh} />
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
    </section>
  );
}

function EncounterDmControls({
  encounter,
  campaignId,
  onChange,
}: {
  encounter: { id: string };
  campaignId: string;
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
    <div className="border-t border-edge pt-3 space-y-2">
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
