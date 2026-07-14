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
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");

  const refresh = () => {
    getCampaign(campaignId)
      .then(setDetail)
      .catch((err) => setError(err.message));
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
