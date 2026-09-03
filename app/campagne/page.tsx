"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  revokeInvite,
  setMemberRole,
} from "@/app/actions/campaigns";
import { getPartyForCampaign } from "@/app/actions/characters";
import { AiUsageHint } from "@/components/ai-usage-hint";
import { isAiAvailable } from "@/app/actions/ai";
import { generateCampaignDraft } from "@/app/actions/ai-content-draft";
import { summarizeSession } from "@/app/actions/ai-session-summary";
import { abilityModifier, formatModifier, totalLevel, type Ability, type KnownFeat } from "@/lib/dnd";
import type { CampaignDetail, CampaignSummary } from "@/components/campagne/types";
import { EncounterTracker, GrantXpInline, PartySpellSlots } from "@/components/campagne/combat-tracker";
import { MiaSchedaOverlay } from "@/components/campagne/mia-scheda";
import { ModalitaSessione } from "@/components/campagne/modalita-sessione";
import { SchedaCondivisa, type VoceParty } from "@/components/campagne/scheda-condivisa";
import {
  HandoutsSection,
  InviteFriendPicker,
  JukeboxPlayer,
  RollTablesSection,
  VoiceChatPanel,
} from "@/components/campagne/session-tools";
import { DungeonSection } from "@/components/campagne/dungeon-editor";
import { RegionalMapSection } from "@/components/campagne/regional-map";
import { NpcSection, QuestSection, SessionPrepSection } from "@/components/campagne/story-tools";
import { HomebrewSection } from "@/components/campagne/homebrew";

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
          className="glow-accent rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97]"
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
    <div className="space-y-6 max-w-2xl lg:max-w-5xl 2xl:max-w-6xl [@media(min-width:2200px)]:max-w-[1600px] mx-auto">
      <h1 className="heading-ornate text-3xl font-bold text-accent-strong">Campagne</h1>

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
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [@media(min-width:2200px)]:grid-cols-4">
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <button
                onClick={() => setOpenId(campaign.id)}
                className="w-full h-full text-left card-elevated rounded-xl border border-edge bg-surface p-4 hover:border-accent/50 hover:bg-surface-raised transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">{campaign.nome}</span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-widest rounded-full border px-2 py-0.5 ${
                      campaign.role === "dm"
                        ? "border-accent/40 bg-accent/15 text-accent-strong"
                        : "border-edge text-muted"
                    }`}
                  >
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
  const [aiAvailable, setAiAvailable] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    isAiAvailable().then(setAiAvailable).catch(() => setAiAvailable(false));
  }, []);

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

  const generateDraft = async () => {
    if (!nome.trim() || generating) return;
    setGenerating(true);
    try {
      const draft = await generateCampaignDraft(nome, descrizione);
      if (draft) setDescrizione(draft);
    } finally {
      setGenerating(false);
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
      <section className="card-elevated rounded-xl border border-edge bg-surface p-4 space-y-2">
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
        {aiAvailable && (
          <button
            onClick={generateDraft}
            disabled={!nome.trim() || generating}
            title="Scrive una bozza di ambientazione/trama in base al nome — la rivedi e modifichi prima di creare la campagna"
            className="text-xs font-bold text-accent-strong hover:underline disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
          >
            {generating ? "Scrivo…" : "✨ Genera bozza"}
          </button>
        )}
        {aiAvailable && <AiUsageHint />}
        <button
          onClick={create}
          className="w-full glow-accent rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97]"
        >
          Crea (diventi il master)
        </button>
      </section>

      <section className="card-elevated rounded-xl border border-edge bg-surface p-4 space-y-2">
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

// Prima il master vedeva solo caratteristiche/PF/CA/slot di un personaggio in Party — non la
// build completa (talenti presi, infusioni dell'Artefice, scelte di classe come suppliche
// occulte/stile di combattimento), segnalato dall'utente. Sola lettura: queste liste arrivano già
// pronte da getPartyForCampaign (sync fatta dal giocatore stesso, mai modificabili da qui). Non
// mostra nulla se il personaggio non ha ancora nulla in nessuna delle tre liste, per non aggiungere
// un blocco vuoto ad ogni card del Party.
function PartyBuildDetails({
  talenti,
  infusioniConosciute,
  scelteClasse,
}: {
  talenti: KnownFeat[];
  infusioniConosciute: KnownFeat[];
  scelteClasse: KnownFeat[];
}) {
  const gruppi = [
    { label: "Talenti", voci: talenti },
    { label: "Infusioni", voci: infusioniConosciute },
    { label: "Scelte di classe", voci: scelteClasse },
  ].filter((g) => g.voci.length > 0);

  if (gruppi.length === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {gruppi.map((g) => (
        <p key={g.label} className="text-xs text-muted">
          <span className="font-semibold text-foreground">{g.label}:</span>{" "}
          {g.voci.map((v) => v.nome).join(", ")}
        </p>
      ))}
    </div>
  );
}

/** Salto rapido alle sezioni che servono durante una sessione dal vivo: la pagina campagna e'
 *  una colonna lunga, e al tavolo si passa di continuo fra le note del master, il combattimento
 *  e le schede del party. Resta agganciata sotto l'intestazione (h-14 in components/nav.tsx). */
function BarraSezioni({ isDm }: { isDm: boolean }) {
  const voci = [
    { id: "sez-handout", label: "📜 Handout" },
    { id: "sez-party", label: "👥 Party" },
    { id: "sez-combattimento", label: "⚔️ Combattimento" },
    ...(isDm
      ? [
          { id: "sez-png", label: "🎭 NPC" },
          { id: "sez-quest", label: "🎯 Trame" },
          { id: "sez-prep", label: "✅ Preparazione" },
        ]
      : []),
  ];
  return (
    <nav className="sticky top-14 z-10 flex gap-1.5 overflow-x-auto rounded-xl border border-edge bg-background/90 px-2 py-2 backdrop-blur">
      {voci.map((v) => (
        <a
          key={v.id}
          href={`#${v.id}`}
          className="shrink-0 rounded-lg border border-edge bg-surface-raised px-2.5 py-1 text-xs font-bold text-foreground hover:text-accent-strong transition-colors"
        >
          {v.label}
        </a>
      ))}
    </nav>
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
  // Scheda di un compagno aperta in sola lettura, e la PROPRIA aperta per intero (modificabile):
  // due cose diverse, perché del personaggio di un altro si vede solo ciò che lui condivide.
  const [schedaVista, setSchedaVista] = useState<VoceParty | null>(null);
  const [sessioneAperta, setSessioneAperta] = useState(false);
  const [schedaPropriaAperta, setSchedaPropriaAperta] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  // Stato a parte da "error" sopra: quello sostituisce l'intera pagina (fallita l'apertura della
  // campagna), questo è solo un avviso testuale accanto al bottone del riassunto.
  const [summaryError, setSummaryError] = useState<string | null>(null);
  // Stessa ragione di summaryError: cambiare ruolo o rimuovere un membro può essere RIFIUTATO dal
  // server ("non puoi togliere l'ultimo master"), ma è un rifiuto locale a quell'azione — scriverlo
  // in "error" sostituirebbe l'intera schermata della campagna con una riga rossa, senza nemmeno un
  // modo di tornare indietro (refresh() non azzera "error").
  const [memberError, setMemberError] = useState<string | null>(null);

  const refresh = () => {
    getCampaign(campaignId)
      .then(setDetail)
      .catch((err) => setError(err.message));
    // Il .catch NON è opzionale ora che party === null significa "sto caricando": senza, un fetch
    // fallito lascerebbe "Caricamento…" per sempre invece di mostrare la lista vuota.
    getPartyForCampaign(campaignId)
      .then(setParty)
      .catch(() => setParty([]));
  };

  useEffect(refresh, [campaignId]);
  useEffect(() => {
    isAiAvailable().then(setAiAvailable).catch(() => setAiAvailable(false));
  }, []);

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
    setInviteCode(code);
    setInviteLink(`${window.location.origin}/campagne?invite=${code}`);
  };

  const revokeCurrentInvite = async () => {
    if (!inviteCode) return;
    await revokeInvite(campaignId, inviteCode);
    setInviteCode(null);
    setInviteLink(null);
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

  // Precompila SOLO il form, non salva mai da sola — il master la rilegge/corregge come farebbe
  // con una bozza scritta da un giocatore, prima di confermare col bottone "Aggiungi al diario"
  // di sempre. Riassume la chat dall'ultima nota salvata in poi (l'intera cronologia se non ce
  // n'è ancora una), stesso concetto di "da dove eravamo rimasti" del diario stesso.
  const generateSummary = async () => {
    setSummarizing(true);
    setSummaryError(null);
    try {
      const lastNote = detail.sessionNotes[detail.sessionNotes.length - 1];
      const summary = await summarizeSession(
        campaignId,
        lastNote ? new Date(lastNote.createdAt).toISOString() : null,
      );
      if (summary) {
        setNoteTitle((prev) => prev || `Sessione ${detail.sessionNotes.length + 1}`);
        setNoteText(summary);
      } else {
        setSummaryError("Non ho trovato messaggi recenti da riassumere (o l'assistente IA non è disponibile).");
      }
    } finally {
      setSummarizing(false);
    }
  };

  // La propria scheda copre la campagna a tutto schermo (è un documento intero, non un riquadro):
  // si torna indietro senza aver perso lo stato della campagna, che resta montata sotto.
  if (schedaPropriaAperta !== null) {
    return (
      <MiaSchedaOverlay
        nomeInCampagna={schedaPropriaAperta}
        onChiudi={() => {
          setSchedaPropriaAperta(null);
          // Il party si rilegge: se durante il gioco sono cambiati PF o slot, la card del party
          // deve mostrarli aggiornati appena si torna indietro.
          getPartyForCampaign(campaignId).then(setParty).catch(() => {});
        }}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-2xl lg:max-w-5xl 2xl:max-w-6xl [@media(min-width:2200px)]:max-w-[1600px] mx-auto">
      {schedaVista && (
        <SchedaCondivisa pc={schedaVista} onChiudi={() => setSchedaVista(null)} />
      )}
      {sessioneAperta && (
        <ModalitaSessione campaignId={campaignId} onChiudi={() => setSessioneAperta(false)} />
      )}
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

      <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-display font-bold text-accent-strong">
            {detail.campaign.nome}
          </h2>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {isDm && (
              <button
                onClick={() => setSessioneAperta(true)}
                className="glow-accent rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-background transition-colors hover:bg-accent-strong active:scale-[0.97]"
              >
                ▶️ Modalità sessione
              </button>
            )}
            <Link
              href={`/chat?thread=campaign:${campaignId}`}
              className="text-xs font-bold text-accent-strong hover:underline"
            >
              💬 Apri chat →
            </Link>
          </div>
        </div>
        {detail.campaign.descrizione && (
          <p className="text-sm text-muted">{detail.campaign.descrizione}</p>
        )}
      </section>

      <BarraSezioni isDm={isDm} />

      <JukeboxPlayer campaignId={campaignId} isDm={isDm} campaign={detail.campaign} onChanged={refresh} />

      <VoiceChatPanel campaignId={campaignId} myUserId={userId} members={detail.members} />

      <div id="sez-handout" className="scroll-mt-32">
        <HandoutsSection campaignId={campaignId} isDm={isDm} />
      </div>

      <RollTablesSection campaignId={campaignId} isDm={isDm} />

      <HomebrewSection campaignId={campaignId} isDm={isDm} />

      <div className="md:grid md:grid-cols-2 md:gap-6 md:items-start">
      <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
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
          <div className="flex items-center gap-2 rounded-lg border border-edge bg-surface-raised p-2 text-xs text-muted">
            <span className="break-all flex-1">{inviteLink}</span>
            <button
              onClick={revokeCurrentInvite}
              className="shrink-0 font-bold text-danger hover:underline"
            >
              Revoca
            </button>
          </div>
        )}
        {isDm && <InviteFriendPicker campaignId={campaignId} />}
        {memberError && <p className="text-xs text-danger">{memberError}</p>}
        <ul className="space-y-2">
          {detail.members.map((member) => (
            <li
              key={member.userId}
              className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
            >
              {member.userId === userId ? (
                <span className="text-sm text-foreground truncate">
                  {member.name ?? member.email}
                </span>
              ) : (
                <Link
                  href={`/profilo/${member.userId}`}
                  className="text-sm text-foreground truncate hover:text-accent-strong transition-colors"
                >
                  {member.name ?? member.email}
                </Link>
              )}
              <div className="flex items-center gap-2 shrink-0">
                {isDm && member.userId !== userId ? (
                  <>
                    {/* Entrambe le azioni possono essere RIFIUTATE dal server (è vietato togliere o
                        retrocedere l'ultimo master, vedi app/actions/campaigns.ts): senza catch la
                        promise veniva rigettata in silenzio e la tendina restava sul ruolo nuovo
                        mentre sul server era ancora quello vecchio — la pagina mostrava uno stato
                        falso senza dire perché. Il refresh() nel finally rimette comunque la UI
                        in pari con il server, anche quando l'azione è fallita. */}
                    <select
                      value={member.role}
                      onChange={async (event) => {
                        setMemberError(null);
                        try {
                          await setMemberRole(campaignId, member.userId, event.target.value as "dm" | "player");
                        } catch (err) {
                          setMemberError((err as Error).message);
                        } finally {
                          refresh();
                        }
                      }}
                      className="rounded-md border border-edge bg-surface px-2 py-1 text-xs text-foreground"
                      aria-label={`Ruolo di ${member.name ?? member.email}`}
                    >
                      <option value="player">Giocatore</option>
                      <option value="dm">Master</option>
                    </select>
                    <button
                      onClick={async () => {
                        // Espellere qualcuno da una campagna è distruttivo quanto le altre azioni
                        // della pagina che la conferma ce l'hanno già (elimina campagna, abbandona,
                        // elimina nota) — e qui il bersaglio è una "×" minuscola accanto a una
                        // tendina, facilissima da centrare per sbaglio.
                        if (!window.confirm(`Rimuovere ${member.name ?? member.email} dalla campagna?`)) return;
                        setMemberError(null);
                        try {
                          await removeMember(campaignId, member.userId);
                        } catch (err) {
                          setMemberError((err as Error).message);
                        } finally {
                          refresh();
                        }
                      }}
                      className="text-muted hover:text-danger text-sm"
                      aria-label={`Rimuovi ${member.name ?? member.email}`}
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <span
                    className={`text-[10px] font-bold uppercase tracking-widest rounded-full border px-2 py-0.5 ${
                      member.role === "dm"
                        ? "border-accent/40 bg-accent/15 text-accent-strong"
                        : "border-edge text-muted"
                    }`}
                  >
                    {member.role === "dm" ? "Master" : "Giocatore"}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section id="sez-party" className="scroll-mt-32 card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3 mt-6 md:mt-0">
        <h2 className="text-sm uppercase tracking-widest text-muted">Party</h2>
        {/* party === null significa "fetch ancora in volo", non "vuoto": prima all'apertura della
            campagna si leggeva per un istante che il party era vuoto anche quando non lo era. */}
        {party === null ? (
          <p className="text-sm text-muted">Caricamento…</p>
        ) : party.length === 0 ? (
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
                  className="card-elevated rounded-lg border border-edge bg-surface-raised p-3"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-bold text-foreground">{pc.nome}</p>
                      <p className="text-xs text-muted">
                        {[pc.razza, classSummary].filter(Boolean).join(" · ")} · giocato da{" "}
                        {pc.playerName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted">
                        PF {pc.hpAttuali}/{pc.hpMax} · CA {pc.classeArmatura} · Liv.{" "}
                        {totalLevel(pc.classi)}
                      </span>
                      {/* Prima, per vedere qualcosa di più del riassunto, si doveva uscire dalla
                          campagna: il giocatore andava in Personaggi (perdendo di vista
                          combattimento e mappa) e il master non aveva proprio modo di vedere la
                          scheda di un compagno. */}
                      {pc.userId === userId ? (
                        <button
                          onClick={() => setSchedaPropriaAperta(pc.nome)}
                          className="rounded-lg border border-accent-strong px-2.5 py-1 text-xs font-bold text-accent-strong hover:bg-accent/10 transition-colors"
                        >
                          ✏️ La mia scheda
                        </button>
                      ) : (
                        <button
                          onClick={() => setSchedaVista(pc)}
                          className="rounded-lg border border-edge px-2.5 py-1 text-xs font-bold text-foreground hover:border-accent transition-colors"
                        >
                          📋 Scheda
                        </button>
                      )}
                    </div>
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
                  <PartySpellSlots classi={pc.classi} slotUsati={pc.slotUsati} slotPattoUsati={pc.slotPattoUsati} />
                  <PartyBuildDetails
                    talenti={pc.talenti}
                    infusioniConosciute={pc.infusioniConosciute}
                    scelteClasse={pc.scelteClasse}
                  />
                  <div className="mt-2 pt-2 border-t border-edge/60 flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-muted">
                      {pc.esperienza} XP
                      {pc.xpInSospeso > 0 && (
                        <span className="ml-1.5 text-accent-strong">
                          (+{pc.xpInSospeso} in attesa che {pc.playerName} li applichi)
                        </span>
                      )}
                    </p>
                    {isDm && (
                      <GrantXpInline
                        campaignId={campaignId}
                        targetUserId={pc.userId}
                        onGranted={refresh}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>

      <div id="sez-combattimento" className="scroll-mt-32">
        <EncounterTracker
          campaignId={campaignId}
          isDm={isDm}
          partyLevels={(party ?? []).map((pc) => totalLevel(pc.classi))}
          onXpGranted={refresh}
        />
      </div>

      <DungeonSection campaignId={campaignId} isDm={isDm} />

      <RegionalMapSection campaignId={campaignId} isDm={isDm} />

      {/* Strumenti per SCRIVERE la storia (NPC, trame) e PREPARARE la prossima sessione, subito
          prima del Diario (che invece guarda indietro) — richiesti esplicitamente dall'utente:
          "mi sembra che vengano gestite bene le sessioni della campagna, ma manca la scrittura
          della storia e la preparazione delle sessioni (momenti off session)". Tutti e tre
          restano invisibili ai giocatori (vedi commento sullo schema in lib/db/schema.ts). */}
      <div id="sez-png" className="scroll-mt-32">
        <NpcSection campaignId={campaignId} isDm={isDm} />
      </div>

      <div id="sez-quest" className="scroll-mt-32">
        <QuestSection campaignId={campaignId} isDm={isDm} />
      </div>

      <div id="sez-prep" className="scroll-mt-32">
        <SessionPrepSection campaignId={campaignId} isDm={isDm} />
      </div>

      <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-4">
        <h2 className="text-sm uppercase tracking-widest text-muted">Diario delle sessioni</h2>
        <div className="space-y-2">
          <input
            value={noteTitle}
            onChange={(event) => setNoteTitle(event.target.value)}
            placeholder="Titolo (es. Sessione 3 — La cripta)"
            className="input-focus w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
          />
          <textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="Cosa è successo in questa sessione?"
            rows={3}
            className="input-focus w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={addNote}
              className="glow-accent rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97]"
            >
              Aggiungi al diario
            </button>
            {aiAvailable && (
              <button
                onClick={generateSummary}
                disabled={summarizing}
                title="Legge la chat di campagna dall'ultima sessione e propone un riassunto — lo rivedi e modifichi prima di salvare, non salva da solo"
                className="rounded-lg border border-edge px-4 py-2 text-sm text-muted hover:text-foreground hover:border-accent/50 transition-colors disabled:opacity-60"
              >
                {summarizing ? "Genero il riassunto…" : "✨ Genera riassunto IA"}
              </button>
            )}
          </div>
          {aiAvailable && <AiUsageHint />}
          {summaryError && <p className="text-xs text-danger">{summaryError}</p>}
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
                    {(isDm || note.authorId === userId) && (
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Eliminare la nota "${note.titolo}"?`)) return;
                          await deleteSessionNote(note.id);
                          refresh();
                        }}
                        className="text-muted hover:text-danger text-sm"
                        aria-label={`Elimina ${note.titolo}`}
                      >
                        ×
                      </button>
                    )}
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


