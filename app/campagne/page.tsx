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
  setJukeboxTrack,
  setMemberRole,
  stopJukebox,
} from "@/app/actions/campaigns";
import { getPartyForCampaign, grantXp, grantXpToParty } from "@/app/actions/characters";
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
  moveMonsterToken,
  placeMonsterToken,
  removeMonsterToken,
  removeMyToken,
  setFogOfWar,
  toggleRoomRevealed,
  updateDungeonCells,
  updateRoomNotes,
  upsertMyToken,
} from "@/app/actions/dungeons";
import type {
  CellType,
  CorridorStyle,
  DeadEndRemoval,
  DungeonConfig,
  MonsterToken,
  RoomDensity,
  RoomShape,
  StairsOption,
} from "@/lib/dungeon";
import {
  addRegionalMarker,
  createBlankRegionalMap,
  deleteRegionalMap,
  deleteRegionalMarker,
  getRegionalMap,
  getRegionalMapsForCampaign,
  updateRegionalMapCells,
  updateRegionalMarkerNote,
} from "@/app/actions/regional-maps";
import {
  MARKER_ICONS,
  TERRAIN_COLORS,
  TERRAIN_LABELS,
  TERRAIN_TYPES,
  type RegionalMarker,
  type TerrainType,
} from "@/lib/regional-map";
import { loadCreatures, loadItems, type RawCreature, type RawItem } from "@/lib/fivetools/data";
import { generateName, NAME_RACES, type NameRace } from "@/lib/names";
import { usePartyRoom } from "@/lib/use-party-room";
import {
  abilityModifier,
  adjustedEncounterXp,
  CONDIZIONI_5E,
  DIFFICULTY_LABELS,
  encounterMultiplier,
  formatModifier,
  multiclassCasterLevel,
  pactMagicForLevel,
  pickTreasureRarity,
  rollGemsAndArt,
  rollHoardCoins,
  rollIndividualCoins,
  rollMagicItemCount,
  spellSlotsForCasterLevel,
  totalLevel,
  treasureTierForCr,
  warlockLevel,
  xpBudget,
  XP_BY_CR,
  type Ability,
  type CoinResult,
  type EncounterDifficulty,
  type TreasureTier,
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

      <JukeboxPlayer campaignId={campaignId} isDm={isDm} campaign={detail.campaign} onChanged={refresh} />

      <HandoutsSection campaignId={campaignId} isDm={isDm} />

      <RollTablesSection campaignId={campaignId} isDm={isDm} />

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
                  <PartySpellSlots classi={pc.classi} slotUsati={pc.slotUsati} slotPattoUsati={pc.slotPattoUsati} />
                  <div className="mt-2 pt-2 border-t border-edge/60 flex items-center justify-between gap-2 flex-wrap">
                    <p className="text-xs text-muted">
                      {pc.esperienza} XP
                      {pc.xpInSospeso > 0 && (
                        <span className="ml-1.5 text-accent-strong">
                          (+{pc.xpInSospeso} in attesa che {pc.playerName} li applichi)
                        </span>
                      )}
                    </p>
                    {isDm && <GrantXpInline campaignId={campaignId} targetUserId={pc.userId} />}
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

      <RegionalMapSection campaignId={campaignId} isDm={isDm} />

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
                    {(isDm || note.authorId === userId) && (
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

function CombatantLegendaryActions({
  combatant,
  isDm,
  onChange,
}: {
  combatant: Combatant;
  isDm: boolean;
  onChange: () => void;
}) {
  const remaining = combatant.azioniLeggendarieMax - combatant.azioniLeggendarieUsate;

  const spend = async (delta: number) => {
    if (!isDm) return;
    const next = Math.min(
      combatant.azioniLeggendarieMax,
      Math.max(0, combatant.azioniLeggendarieUsate + delta),
    );
    await updateCombatant(combatant.id, { azioniLeggendarieUsate: next });
    onChange();
  };

  return (
    <div className="flex items-center gap-2 text-[10px] text-muted">
      <span className="font-bold text-accent-strong">★ Azioni leggendarie</span>
      <span className="text-foreground">
        {remaining}/{combatant.azioniLeggendarieMax}
      </span>
      {isDm && (
        <>
          <button
            onClick={() => spend(-1)}
            className="size-4 rounded border border-edge text-accent-strong leading-none"
            aria-label="Recupera un'azione leggendaria"
          >
            +
          </button>
          <button
            onClick={() => spend(1)}
            className="size-4 rounded border border-edge text-danger leading-none"
            aria-label="Spendi un'azione leggendaria"
          >
            −
          </button>
        </>
      )}
    </div>
  );
}

function CombatantConcentration({
  combatant,
  isDm,
  onChange,
}: {
  combatant: Combatant;
  isDm: boolean;
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(combatant.concentrazione ?? "");

  const save = async () => {
    setEditing(false);
    await updateCombatant(combatant.id, { concentrazione: value.trim() || null });
    onChange();
  };

  if (!isDm && !combatant.concentrazione) return null;

  if (editing) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => event.key === "Enter" && save()}
          placeholder="Nome incantesimo"
          className="rounded border border-edge bg-surface px-1.5 py-0.5 text-[10px] text-foreground"
        />
      </div>
    );
  }

  return combatant.concentrazione ? (
    <button
      onClick={() => isDm && setEditing(true)}
      className="flex items-center gap-1 rounded-full border border-accent/40 bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent-strong w-fit"
    >
      🔮 Concentrazione: {combatant.concentrazione}
    </button>
  ) : (
    <button
      onClick={() => setEditing(true)}
      className="rounded-full border border-dashed border-edge px-2 py-0.5 text-[10px] text-muted hover:text-foreground transition-colors w-fit"
    >
      + Concentrazione
    </button>
  );
}

// Sola lettura: gli slot si modificano sulla scheda in Personaggi, qui il party vede solo
// l'ultimo stato sincronizzato (stesso principio "scatto, non live" già usato per il resto
// della scheda condivisa in campagna).
function PartySpellSlots({
  classi,
  slotUsati,
  slotPattoUsati,
}: {
  classi: { nome: string; livello: number }[];
  slotUsati: number[];
  slotPattoUsati: number;
}) {
  const casterLevel = multiclassCasterLevel(classi);
  const wlLevel = warlockLevel(classi);
  if (casterLevel === 0 && wlLevel === 0) return null;

  const maxSlots = spellSlotsForCasterLevel(casterLevel);
  const pact = pactMagicForLevel(wlLevel);

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-edge">
      <span className="text-[9px] uppercase tracking-widest text-muted">Slot</span>
      {maxSlots.map((max, index) =>
        max > 0 ? (
          <span key={index} className="text-[10px] text-foreground">
            {index + 1}°: {max - (slotUsati[index] ?? 0)}/{max}
          </span>
        ) : null,
      )}
      {pact.slots > 0 && (
        <span className="text-[10px] text-accent-strong">
          Patto ({pact.slotLevel}°): {pact.slots - slotPattoUsati}/{pact.slots}
        </span>
      )}
    </div>
  );
}

function getYouTubeEmbedUrl(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{6,})/,
  );
  return match ? `https://www.youtube.com/embed/${match[1]}?autoplay=1` : null;
}

function JukeboxPlayer({
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
    <section className="rounded-xl border border-edge bg-surface p-4 space-y-2">
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
            className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-sm hover:bg-accent-strong transition-colors"
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
                  className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors"
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

type Handout = Awaited<ReturnType<typeof getHandoutsForCampaign>>[number];

function HandoutsSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [handouts, setHandouts] = useState<Handout[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Handout | null>(null);

  const refresh = () => {
    getHandoutsForCampaign(campaignId).then(setHandouts);
  };
  useEffect(refresh, [campaignId]);

  if (handouts === null) return null;
  if (handouts.length === 0 && !isDm) return null;

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
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
              onClick={() => setSelected(selected?.id === h.id ? null : h)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                selected?.id === h.id
                  ? "border-accent bg-accent/15 text-accent-strong"
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
            setSelected(null);
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

  return (
    <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
      <input
        value={titolo}
        onChange={(event) => setTitolo(event.target.value)}
        placeholder="Titolo (es. Lettera del Re)"
        className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <textarea
        value={testo}
        onChange={(event) => setTesto(event.target.value)}
        placeholder="Testo…"
        rows={3}
        className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <input
        value={immagineUrl}
        onChange={(event) => setImmagineUrl(event.target.value)}
        placeholder="URL immagine (opzionale)"
        className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <button
        onClick={create}
        disabled={creating || !titolo.trim()}
        className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors disabled:opacity-50"
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
          className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
        <textarea
          value={testo}
          onChange={(event) => setTesto(event.target.value)}
          rows={4}
          className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
        <input
          value={immagineUrl}
          onChange={(event) => setImmagineUrl(event.target.value)}
          placeholder="URL immagine"
          className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors disabled:opacity-50"
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

function RollTablesSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
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
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
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
                      className="rounded-md bg-accent text-background font-bold px-2.5 py-1 text-xs hover:bg-accent-strong transition-colors disabled:opacity-50"
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
            <input
              type="number"
              min={1}
              value={voce.peso}
              onChange={(event) =>
                updateRow(index, { peso: Math.max(1, Number(event.target.value) || 1) })
              }
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
          className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors disabled:opacity-50"
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

              {!c.isPg && c.azioniLeggendarieMax > 0 && (
                <CombatantLegendaryActions combatant={c} isDm={isDm} onChange={refresh} />
              )}

              {c.isPg && <CombatantConcentration combatant={c} isDm={isDm} onChange={refresh} />}

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
          combatants={combatants}
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
  combatants,
  onChange,
}: {
  encounter: { id: string };
  campaignId: string;
  partyLevels: number[];
  combatants: Combatant[];
  onChange: () => void;
}) {
  const [nome, setNome] = useState("");
  const [iniziativa, setIniziativa] = useState(10);
  const [hpMax, setHpMax] = useState(10);
  const [azioniLeggendarieMax, setAzioniLeggendarieMax] = useState(0);
  const [xp, setXp] = useState(0);

  const add = async () => {
    if (!nome.trim() || hpMax < 1) return;
    await addCombatant(encounter.id, { nome: nome.trim(), iniziativa, hpMax, azioniLeggendarieMax, xp });
    setNome("");
    setAzioniLeggendarieMax(0);
    setXp(0);
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
          onPick={(name, hp, legendaryActions, monsterXp) => {
            setNome(name);
            setHpMax(hp);
            setAzioniLeggendarieMax(legendaryActions);
            setXp(monsterXp);
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
      <TreasureGenerator
        defaultCr={partyLevels.length > 0 ? Math.round(partyLevels.reduce((a, b) => a + b, 0) / partyLevels.length) : 1}
      />
      <NameGenerator />
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
        <label className="flex items-center gap-1 text-xs text-muted">
          Az. legg.
          <input
            type="number"
            min={0}
            value={azioniLeggendarieMax}
            onChange={(event) => setAzioniLeggendarieMax(Math.max(0, Number(event.target.value) || 0))}
            className="w-12 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted">
          XP
          <input
            type="number"
            min={0}
            value={xp}
            onChange={(event) => setXp(Math.max(0, Number(event.target.value) || 0))}
            className="w-16 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <button
          onClick={add}
          className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors"
        >
          Aggiungi
        </button>
      </div>

      <XpDistributor campaignId={campaignId} combatants={combatants} />
    </div>
  );
}

function XpDistributor({
  campaignId,
  combatants,
}: {
  campaignId: string;
  combatants: Combatant[];
}) {
  const monsterXp = combatants.filter((c) => !c.isPg).reduce((sum, c) => sum + c.xp, 0);
  const pgCount = combatants.filter((c) => c.isPg).length;
  const suggestedShare = pgCount > 0 ? Math.floor(monsterXp / pgCount) : monsterXp;

  const [perPlayer, setPerPlayer] = useState(suggestedShare);
  const [touched, setTouched] = useState(false);
  const [autoLevelUp, setAutoLevelUp] = useState(true);
  const [granting, setGranting] = useState(false);
  const [granted, setGranted] = useState(false);

  // il totale XP dei mostri cambia mentre il master aggiunge/rimuove combattenti: finché il
  // master non ha toccato il campo a mano, resta agganciato al suggerimento; una volta
  // modificato manualmente, resta quello che ha scelto anche se il suggerimento cambia dopo
  // (altrimenti una modifica manuale verrebbe silenziosamente scavalcata al prossimo mostro
  // aggiunto)
  const [lastSuggested, setLastSuggested] = useState(suggestedShare);
  if (suggestedShare !== lastSuggested) {
    setLastSuggested(suggestedShare);
    if (!touched) setPerPlayer(suggestedShare);
  }

  if (monsterXp === 0 && pgCount === 0) return null;

  const grant = async () => {
    setGranting(true);
    try {
      await grantXpToParty(campaignId, perPlayer, autoLevelUp);
      setGranted(true);
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted">Distribuisci XP al party</p>
      <p className="text-xs text-muted">
        Mostri nel combattimento: {monsterXp} XP totali ÷ {pgCount || "?"} PG ={" "}
        {suggestedShare} XP a testa (modificabile).
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          XP a testa
          <input
            type="number"
            min={0}
            value={perPlayer}
            onChange={(event) => {
              setPerPlayer(Math.max(0, Number(event.target.value) || 0));
              setTouched(true);
              setGranted(false);
            }}
            className="w-20 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={autoLevelUp}
            onChange={(event) => setAutoLevelUp(event.target.checked)}
          />
          Level up automatico se possibile
        </label>
        <button
          onClick={grant}
          disabled={granting || perPlayer <= 0}
          className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors disabled:opacity-50"
        >
          {granting ? "Assegno…" : granted ? "✓ Assegnato" : "Assegna XP"}
        </button>
      </div>
      <p className="text-[10px] text-muted">
        Ogni giocatore vedrà l&apos;XP in sospeso sulla propria scheda Personaggio e dovrà
        applicarla lui (l&apos;app non modifica la scheda di qualcun altro direttamente).
      </p>
    </div>
  );
}

function GrantXpInline({
  campaignId,
  targetUserId,
}: {
  campaignId: string;
  targetUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [autoLevelUp, setAutoLevelUp] = useState(true);
  const [granting, setGranting] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-accent-strong hover:underline"
      >
        + Assegna XP
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <input
        type="number"
        min={0}
        value={amount}
        onChange={(event) => setAmount(Math.max(0, Number(event.target.value) || 0))}
        className="w-16 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-foreground text-center"
        placeholder="XP"
        autoFocus
      />
      <label className="flex items-center gap-1 text-muted">
        <input
          type="checkbox"
          checked={autoLevelUp}
          onChange={(event) => setAutoLevelUp(event.target.checked)}
        />
        auto level up
      </label>
      <button
        onClick={async () => {
          if (amount <= 0) return;
          setGranting(true);
          try {
            await grantXp(campaignId, targetUserId, amount, autoLevelUp);
            setOpen(false);
            setAmount(0);
          } finally {
            setGranting(false);
          }
        }}
        disabled={granting || amount <= 0}
        className="rounded-md bg-accent text-background font-bold px-2 py-1 hover:bg-accent-strong transition-colors disabled:opacity-50"
      >
        {granting ? "…" : "Assegna"}
      </button>
      <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
        ×
      </button>
    </div>
  );
}

function NameGenerator() {
  const [race, setRace] = useState<NameRace>("Umano");
  const [gender, setGender] = useState<"maschile" | "femminile">("maschile");
  const [names, setNames] = useState<string[]>([]);

  const roll = () => {
    setNames(Array.from({ length: 5 }, () => generateName(race, gender)));
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted">Genera nomi PNG</p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={race}
          onChange={(event) => setRace(event.target.value as NameRace)}
          className="rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-sm text-foreground"
        >
          {NAME_RACES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <div className="flex rounded-lg border border-edge overflow-hidden">
          {(["maschile", "femminile"] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGender(g)}
              className={`px-2.5 py-1.5 text-xs font-bold transition-colors ${
                gender === g ? "bg-accent/15 text-accent-strong" : "text-muted hover:text-foreground"
              }`}
            >
              {g === "maschile" ? "M" : "F"}
            </button>
          ))}
        </div>
        <button
          onClick={roll}
          className="text-xs font-bold rounded-lg border border-edge px-2 py-1.5 text-foreground hover:border-accent transition-colors"
        >
          🎲 Genera
        </button>
      </div>
      {names.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {names.map((n, index) => (
            <li
              key={index}
              className="rounded-md border border-edge bg-surface-raised px-2.5 py-1 text-sm text-foreground"
            >
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const COIN_LABELS: { key: keyof CoinResult; label: string }[] = [
  { key: "mp", label: "mp" },
  { key: "mo", label: "mo" },
  { key: "me", label: "me" },
  { key: "ma", label: "ma" },
  { key: "mr", label: "mr" },
];

function formatCoins(coins: CoinResult): string {
  return COIN_LABELS.filter((c) => coins[c.key] > 0)
    .map((c) => `${coins[c.key]} ${c.label}`)
    .join(", ") || "—";
}

function TreasureGenerator({ defaultCr }: { defaultCr: number }) {
  const [cr, setCr] = useState(defaultCr);
  const [mode, setMode] = useState<"individuale" | "tesoro">("individuale");
  const [items, setItems] = useState<RawItem[] | null>(null);
  const [result, setResult] = useState<{
    coins: CoinResult;
    gemsArt: { count: number; value: number } | null;
    magicItems: RawItem[];
  } | null>(null);
  const [rolling, setRolling] = useState(false);

  const roll = async () => {
    setRolling(true);
    const tier: TreasureTier = treasureTierForCr(cr);
    const coins = mode === "individuale" ? rollIndividualCoins(tier) : rollHoardCoins(tier);
    const gemsArt = mode === "tesoro" ? rollGemsAndArt(tier) : null;

    const magicItems: RawItem[] = [];
    if (mode === "tesoro") {
      const magicCount = rollMagicItemCount(tier);
      if (magicCount > 0) {
        const pool = items ?? (await loadItems());
        if (!items) setItems(pool);
        for (let i = 0; i < magicCount; i++) {
          const rarity = pickTreasureRarity(tier);
          const candidates = pool.filter((it) => it.rarity === rarity);
          if (candidates.length > 0) {
            magicItems.push(candidates[Math.floor(Math.random() * candidates.length)]);
          }
        }
      }
    }

    setResult({ coins, gemsArt, magicItems });
    setRolling(false);
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted">Genera ricompensa</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-edge overflow-hidden">
          {(["individuale", "tesoro"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1.5 text-xs font-bold transition-colors ${
                mode === m ? "bg-accent/15 text-accent-strong" : "text-muted hover:text-foreground"
              }`}
            >
              {m === "individuale" ? "Individuale" : "Tesoro (party)"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          GS
          <input
            type="number"
            min={0}
            max={30}
            value={cr}
            onChange={(event) => setCr(Math.max(0, Math.min(30, Number(event.target.value) || 0)))}
            className="w-14 rounded-md border border-edge bg-surface-raised px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <button
          onClick={roll}
          disabled={rolling}
          className="text-xs font-bold rounded-lg border border-edge px-2 py-1.5 text-foreground hover:border-accent transition-colors disabled:opacity-50"
        >
          🎲 Genera
        </button>
      </div>

      {result && (
        <div className="rounded-md border border-accent/40 bg-surface-raised px-3 py-2 space-y-1.5 text-sm">
          <p className="text-foreground">
            <span className="text-muted">Monete: </span>
            <span className="font-bold">{formatCoins(result.coins)}</span>
          </p>
          {result.gemsArt && (
            <p className="text-foreground">
              <span className="text-muted">Gemme/oggetti d&apos;arte: </span>
              <span className="font-bold">
                {result.gemsArt.count} da {result.gemsArt.value} mo ciascuno
              </span>
            </p>
          )}
          {result.magicItems.length > 0 && (
            <div>
              <p className="text-muted mb-1">Oggetti magici:</p>
              <ul className="space-y-0.5">
                {result.magicItems.map((item, index) => (
                  <li key={index} className="text-foreground">
                    <span className="font-bold">{item.name}</span>{" "}
                    <span className="text-xs text-muted capitalize">({item.rarity})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {mode === "tesoro" && !result.gemsArt && result.magicItems.length === 0 && (
            <p className="text-xs text-muted">Solo monete questa volta.</p>
          )}
        </div>
      )}
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
    xpPerMonster: number;
  } | null>(null);
  const [adding, setAdding] = useState(false);
  // parte precompilata dal party sincronizzato, ma modificabile: utile per pianificare un
  // incontro con un party diverso da quello attuale (assenti, PNG aggiunti, ecc.)
  const [levels, setLevels] = useState<number[]>(partyLevels);

  const updateLevel = (index: number, value: number) =>
    setLevels((prev) => prev.map((l, i) => (i === index ? Math.min(20, Math.max(1, value)) : l)));
  const addMember = () => setLevels((prev) => [...prev, 1]);
  const removeMember = (index: number) => setLevels((prev) => prev.filter((_, i) => i !== index));

  const budget = xpBudget(levels, difficulty);

  const generate = async () => {
    const pool = creatures ?? (await loadCreatures());
    if (!creatures) setCreatures(pool);

    const withXp = pool
      .map((creature) => ({ creature, xp: creatureXp(creature) }))
      .filter((entry) => entry.xp > 0);

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
    setSuggestion({
      creature: pick.creature,
      count,
      totalXp: adjustedEncounterXp(pick.xp, count),
      xpPerMonster: pick.xp,
    });
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
        xp: suggestion.xpPerMonster,
      });
    }
    setAdding(false);
    setSuggestion(null);
    onAdded();
  };

  return (
    <div className="rounded-lg border border-edge bg-surface p-3 space-y-2">
      <p className="text-xs uppercase tracking-widest text-muted">Genera incontro casuale</p>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted mr-1">Party (livelli)</span>
        {levels.map((level, index) => (
          <span key={index} className="flex items-center gap-0.5">
            <input
              type="number"
              min={1}
              max={20}
              value={level}
              onChange={(event) => updateLevel(index, Number(event.target.value) || 1)}
              className="w-10 rounded-md border border-edge bg-surface-raised px-1 py-1 text-xs text-foreground text-center"
            />
            <button
              onClick={() => removeMember(index)}
              className="text-muted hover:text-danger text-xs"
              aria-label={`Rimuovi PG ${index + 1} dal calcolo`}
            >
              ×
            </button>
          </span>
        ))}
        <button
          onClick={addMember}
          className="text-xs font-bold text-accent-strong hover:underline"
        >
          + PG
        </button>
        {levels.length !== partyLevels.length && (
          <button
            onClick={() => setLevels(partyLevels)}
            className="text-xs text-muted hover:text-foreground hover:underline"
          >
            ↺ party attuale
          </button>
        )}
      </div>

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
          Budget: {budget} XP ({levels.length} PG)
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

function creatureXp(creature: RawCreature): number {
  return XP_BY_CR[typeof creature.cr === "string" ? creature.cr : (creature.cr?.cr ?? "")] ?? 0;
}

function MonsterTokenSearch({
  onPick,
  picked,
}: {
  onPick: (name: string) => void;
  picked: string | null;
}) {
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
    <div className="relative flex items-center gap-1.5">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Cerca mostro da piazzare…"
        className="rounded-md border border-edge bg-surface-raised px-2 py-1.5 text-xs text-foreground w-52"
      />
      {picked && (
        <span className="text-xs text-accent-strong font-bold">
          {picked} — clicca sulla mappa
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 top-full mt-1 w-56 max-h-48 overflow-auto rounded-lg border border-edge bg-surface-raised shadow-lg">
          {suggestions.map((c, index) => (
            <li key={`${c.source}-${c.name}-${index}`}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onPick(c.name);
                  setQuery(c.name);
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-surface transition-colors"
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MonsterQuickAdd({
  onPick,
}: {
  onPick: (name: string, hp: number, legendaryActions: number, xp: number) => void;
}) {
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
                  onPick(
                    c.name,
                    combatantHp(c),
                    c.legendary && c.legendary.length > 0 ? 3 : 0,
                    creatureXp(c),
                  );
                  setQuery("");
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-surface transition-colors"
              >
                {c.name} <span className="text-muted">({combatantHp(c)} PF)</span>
                {c.legendary && c.legendary.length > 0 && (
                  <span className="ml-1 text-accent-strong">★</span>
                )}
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

const DENSITY_LABELS: Record<RoomDensity, string> = {
  sparse: "Sparse",
  scattered: "Sparpagliate",
  dense: "Dense",
  symmetric: "Simmetriche",
};

const CORRIDOR_LABELS: Record<CorridorStyle, string> = {
  straight: "Dritti",
  errant: "Vaganti",
  labyrinth: "Labirinto",
};

const DEADEND_LABELS: Record<DeadEndRemoval, string> = {
  none: "Nessuno",
  some: "Alcuni",
  all: "Tutti",
};

const STAIRS_LABELS: Record<StairsOption, string> = {
  no: "No",
  yes: "Sì",
  many: "Diverse",
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
  const [density, setDensity] = useState<RoomDensity>("scattered");
  const [corridorStyle, setCorridorStyle] = useState<CorridorStyle>("straight");
  const [removeDeadends, setRemoveDeadends] = useState<DeadEndRemoval>("none");
  const [stairs, setStairs] = useState<StairsOption>("no");
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
      const config: DungeonConfig = {
        minRooms,
        maxRooms,
        shape,
        density,
        corridorStyle,
        removeDeadends,
        stairs,
      };
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
      </div>

      <div className="grid sm:grid-cols-2 gap-2">
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Densità stanze</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(Object.keys(DENSITY_LABELS) as RoomDensity[]).map((option) => (
              <button
                key={option}
                onClick={() => setDensity(option)}
                className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                  density === option
                    ? "border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface text-muted hover:text-foreground"
                }`}
              >
                {DENSITY_LABELS[option]}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Corridoi</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(Object.keys(CORRIDOR_LABELS) as CorridorStyle[]).map((option) => (
              <button
                key={option}
                onClick={() => setCorridorStyle(option)}
                className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                  corridorStyle === option
                    ? "border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface text-muted hover:text-foreground"
                }`}
              >
                {CORRIDOR_LABELS[option]}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Rimuovi vicoli ciechi</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(Object.keys(DEADEND_LABELS) as DeadEndRemoval[]).map((option) => (
              <button
                key={option}
                onClick={() => setRemoveDeadends(option)}
                className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                  removeDeadends === option
                    ? "border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface text-muted hover:text-foreground"
                }`}
              >
                {DEADEND_LABELS[option]}
              </button>
            ))}
          </div>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-widest text-muted">Scale</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {(Object.keys(STAIRS_LABELS) as StairsOption[]).map((option) => (
              <button
                key={option}
                onClick={() => setStairs(option)}
                className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                  stairs === option
                    ? "border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface text-muted hover:text-foreground"
                }`}
              >
                {STAIRS_LABELS[option]}
              </button>
            ))}
          </div>
        </label>
      </div>

      <button
        onClick={generate}
        disabled={generating}
        className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors disabled:opacity-50"
      >
        {generating ? "Genero…" : "🎲 Genera"}
      </button>
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

  // `dungeon` è lo stesso oggetto React-key (id) ma un riferimento nuovo ad ogni refetch (es.
  // dopo un aggiornamento realtime): risincronizza le celle locali durante il render (non in un
  // effetto, per evitare un render a cascata), a meno che non ci siano modifiche non salvate in
  // corso (altrimenti le cancellerebbe).
  const [syncedCells, setSyncedCells] = useState(dungeon.cells);
  if (dungeon.cells !== syncedCells && !dirty) {
    setSyncedCells(dungeon.cells);
    setCells(dungeon.cells);
  }
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
    const msg = message as
      | { type?: string; userId?: string; x?: number; y?: number }
      | null;
    if (!msg?.type) return;

    if (msg.type === "dungeon-changed") {
      onRoomUpdated();
      return;
    }
    if (msg.type === "dungeon-deleted") {
      onDeleted();
      return;
    }
    if (msg.type === "remove" && msg.userId) {
      setRawTokens((prev) => prev.filter((t) => t.userId !== msg.userId));
      return;
    }
    if (msg.type !== "move" || !msg.userId || typeof msg.x !== "number" || typeof msg.y !== "number") return;
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
    const x = Math.floor(dungeon.width / 2);
    const y = Math.floor(dungeon.height / 2);
    await upsertMyToken(dungeon.id, x, y);
    const fresh = await getDungeonTokens(dungeon.id);
    setRawTokens(fresh);
    send({ type: "move", x, y });
  };

  const removeMyTokenFromMap = async () => {
    await removeMyToken(dungeon.id);
    setRawTokens((prev) => prev.filter((t) => t.userId !== myUserId));
    send({ type: "remove" });
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

  const [monsterMode, setMonsterMode] = useState(false);
  const [monsterToPlace, setMonsterToPlace] = useState<string | null>(null);

  const placeMonster = async (x: number, y: number) => {
    if (!monsterToPlace) return;
    await placeMonsterToken(dungeon.id, monsterToPlace, x, y);
    setMonsterToPlace(null);
    onRoomUpdated();
  };

  const moveMonster = async (id: string, x: number, y: number) => {
    await moveMonsterToken(dungeon.id, id, x, y);
    onRoomUpdated();
  };

  const removeMonster = async (id: string) => {
    await removeMonsterToken(dungeon.id, id);
    onRoomUpdated();
  };

  const toggleFogOfWar = async () => {
    await setFogOfWar(dungeon.id, !dungeon.fogOfWar);
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

      {isDm && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface-raised p-2">
          <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
            <input
              type="checkbox"
              checked={dungeon.fogOfWar}
              onChange={toggleFogOfWar}
            />
            🌫️ Fog of war
          </label>
          {dungeon.fogOfWar && (
            <span className="text-[10px] text-muted">
              i giocatori vedono solo le stanze rivelate — apri una stanza per rivelarla
            </span>
          )}
          <button
            onClick={() => {
              setMonsterMode((prev) => !prev);
              setMonsterToPlace(null);
            }}
            className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
              monsterMode
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface text-muted hover:text-foreground"
            }`}
          >
            👹 Piazza mostro
          </button>
          {monsterMode && (
            <MonsterTokenSearch
              onPick={(name) => setMonsterToPlace(name)}
              picked={monsterToPlace}
            />
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
        isDm={isDm}
        fogOfWar={dungeon.fogOfWar}
        revealedRooms={dungeon.revealedRooms}
        monsterTokens={dungeon.monsterTokens}
        monsterPlaceMode={monsterMode && Boolean(monsterToPlace)}
        onPlaceMonster={placeMonster}
        onMoveMonster={moveMonster}
        onRemoveMonster={removeMonster}
      />
      {selectedRoom && isDm && !editMode && (
        <RoomNotesEditor
          key={selectedRoom.id}
          dungeonId={dungeon.id}
          room={selectedRoom}
          fogOfWar={dungeon.fogOfWar}
          revealed={dungeon.revealedRooms.includes(selectedRoom.id)}
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
  fogOfWar,
  revealed,
  onSaved,
  onDeleted,
}: {
  dungeonId: string;
  room: DungeonFull["rooms"][number];
  fogOfWar: boolean;
  revealed: boolean;
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
      {fogOfWar && (
        <label className="flex items-center gap-1.5 text-xs font-bold text-foreground">
          <input
            type="checkbox"
            checked={revealed}
            onChange={() => toggleRoomRevealed(dungeonId, room.id).then(onSaved)}
          />
          👁️ Rivelata ai giocatori
        </label>
      )}
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
  isDm = false,
  fogOfWar = false,
  revealedRooms = [],
  monsterTokens = [],
  monsterPlaceMode = false,
  onPlaceMonster,
  onMoveMonster,
  onRemoveMonster,
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
  isDm?: boolean;
  fogOfWar?: boolean;
  revealedRooms?: number[];
  monsterTokens?: MonsterToken[];
  monsterPlaceMode?: boolean;
  onPlaceMonster?: (x: number, y: number) => void;
  onMoveMonster?: (id: string, x: number, y: number) => void;
  onRemoveMonster?: (id: string) => void;
}) {
  const cellSize = 14;
  const isPaintingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingTokenRef = useRef<string | null>(null);
  const [draggingTokenId, setDraggingTokenId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const lastSentRef = useRef(0);
  const draggingMonsterRef = useRef<string | null>(null);
  const [draggingMonsterId, setDraggingMonsterId] = useState<string | null>(null);
  const [monsterDragPos, setMonsterDragPos] = useState<{ x: number; y: number } | null>(null);

  const fogActive = fogOfWar && !isDm;
  const revealedSet = new Set(revealedRooms);
  const hiddenCells = new Set<string>();
  if (fogActive) {
    for (const room of dungeon.rooms) {
      if (revealedSet.has(room.id)) continue;
      for (const [x, y] of room.cells) hiddenCells.add(`${x},${y}`);
    }
  }

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

  // Trascinamento dei token mostro: solo il master li muove, quindi niente relay realtime
  // per-frame come per i token giocatore — solo uno stato visivo locale mentre trascini, con
  // scrittura sul server (e broadcast agli altri client) al rilascio.
  useEffect(() => {
    if (!isDm) return;
    const clientToCell = (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = Math.min(dungeon.width - 1, Math.max(0, ((clientX - rect.left) / rect.width) * dungeon.width));
      const y = Math.min(dungeon.height - 1, Math.max(0, ((clientY - rect.top) / rect.height) * dungeon.height));
      return { x, y };
    };
    const move = (event: PointerEvent) => {
      if (!draggingMonsterRef.current) return;
      const pos = clientToCell(event.clientX, event.clientY);
      if (pos) setMonsterDragPos(pos);
    };
    const up = () => {
      const id = draggingMonsterRef.current;
      if (!id) return;
      draggingMonsterRef.current = null;
      setDraggingMonsterId(null);
      setMonsterDragPos((pos) => {
        if (pos) onMoveMonster?.(id, Math.round(pos.x), Math.round(pos.y));
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [isDm, dungeon.width, dungeon.height, onMoveMonster]);

  const handleCellDown = (x: number, y: number) => {
    if (markerMode) {
      onPlaceMarker?.(x, y);
      return;
    }
    if (monsterPlaceMode) {
      onPlaceMonster?.(x, y);
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
            if (hiddenCells.has(`${x},${y}`)) {
              return (
                <rect
                  key={`${x}-${y}`}
                  x={x * cellSize}
                  y={y * cellSize}
                  width={cellSize}
                  height={cellSize}
                  fill="#0c0a09"
                />
              );
            }
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
          const hidden = fogActive && !revealedSet.has(room.id);
          const fill = hidden ? "#0c0a09" : activeRoomId === room.id ? "#e0a83e33" : "#241f1a";
          const stroke = hidden ? "#0c0a09" : activeRoomId === room.id ? "#e0a83e" : "#3b322a";
          const label = hidden ? null : (
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
          const handleClick = hidden ? undefined : () => onRoomClick(room.id);

          if (room.vectorShape?.type === "circle") {
            const { cx, cy, r } = room.vectorShape;
            return (
              <g key={room.id} onClick={handleClick} className={hidden ? "" : "cursor-pointer"}>
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
              <g key={room.id} onClick={handleClick} className={hidden ? "" : "cursor-pointer"}>
                <polygon points={points} fill={fill} stroke={stroke} strokeWidth={1.5} />
                {label}
              </g>
            );
          }

          return (
            <g key={room.id} onClick={handleClick} className={hidden ? "" : "cursor-pointer"}>
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
        {(editable || monsterPlaceMode) &&
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
                className={markerMode || monsterPlaceMode ? "cursor-crosshair" : "cursor-pointer"}
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
        {monsterTokens.map((monster) => {
          const dragging = draggingMonsterId === monster.id && monsterDragPos;
          const cx = ((dragging ? monsterDragPos!.x : monster.x) + 0.5) * cellSize;
          const cy = ((dragging ? monsterDragPos!.y : monster.y) + 0.5) * cellSize;
          const glide = dragging ? "none" : "cx 0.15s ease-out, cy 0.15s ease-out";
          return (
            <g
              key={monster.id}
              onPointerDown={(event) => {
                if (!isDm) return;
                event.stopPropagation();
                draggingMonsterRef.current = monster.id;
                setDraggingMonsterId(monster.id);
                setMonsterDragPos({ x: monster.x, y: monster.y });
              }}
              onDoubleClick={(event) => {
                if (!isDm) return;
                event.stopPropagation();
                if (window.confirm(`Rimuovere "${monster.nome}" dalla mappa?`)) {
                  onRemoveMonster?.(monster.id);
                }
              }}
              className={isDm ? "cursor-grab" : undefined}
            >
              <rect
                x={cx - cellSize * 0.42}
                y={cy - cellSize * 0.42}
                width={cellSize * 0.84}
                height={cellSize * 0.84}
                fill={monster.colore}
                stroke="#0c0a09"
                strokeWidth={1.5}
                style={{ transition: glide }}
              />
              <text
                x={cx}
                y={cy}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={cellSize * 0.45}
                fill="#ece5da"
                className="pointer-events-none select-none font-bold"
                style={{ transition: glide }}
              >
                {tokenInitials(monster.nome)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --- Mappa regionale: dipingi il terreno + marcatori con etichetta/icona. Stessa impalcatura
// di sezione/viewer del dungeon (lista + attiva), ma niente token/procedurale/realtime: è una
// risorsa di riferimento che il master prepara con calma, non qualcosa che cambia in diretta
// mentre i giocatori la guardano.

type RegionalMapListItem = Awaited<ReturnType<typeof getRegionalMapsForCampaign>>[number];
type RegionalMapFull = Awaited<ReturnType<typeof getRegionalMap>>;

function RegionalMapSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [maps, setMaps] = useState<RegionalMapListItem[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<RegionalMapFull | null>(null);
  const [showForm, setShowForm] = useState(false);

  const refreshList = () => {
    getRegionalMapsForCampaign(campaignId).then(setMaps);
  };
  useEffect(refreshList, [campaignId]);

  const openMap = (id: string) => {
    setActiveId(id);
    getRegionalMap(id).then(setActive);
  };

  const refreshActive = () => {
    if (activeId) getRegionalMap(activeId).then(setActive);
  };

  if (maps === null) return null;

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-widest text-muted">🗺️ Mappa regionale</h2>
        {isDm && (
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="text-xs font-bold text-accent-strong hover:underline"
          >
            {showForm ? "Annulla" : "+ Nuova mappa"}
          </button>
        )}
      </div>

      {showForm && isDm && (
        <NewRegionalMapForm
          campaignId={campaignId}
          onCreated={(map) => {
            setShowForm(false);
            refreshList();
            openMap(map.id);
          }}
        />
      )}

      {maps.length === 0 ? (
        <p className="text-sm text-muted">Nessuna mappa regionale ancora.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {maps.map((m) => (
            <button
              key={m.id}
              onClick={() => openMap(m.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                activeId === m.id
                  ? "border-accent bg-accent/15 text-accent-strong"
                  : "border-edge bg-surface-raised text-muted hover:text-foreground"
              }`}
            >
              {m.nome}
            </button>
          ))}
        </div>
      )}

      {active && (
        <RegionalMapViewer
          key={active.id}
          map={active}
          isDm={isDm}
          onDeleted={() => {
            setActiveId(null);
            setActive(null);
            refreshList();
          }}
          onChanged={refreshActive}
        />
      )}
    </section>
  );
}

function NewRegionalMapForm({
  campaignId,
  onCreated,
}: {
  campaignId: string;
  onCreated: (map: { id: string }) => void;
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
      const map = await createBlankRegionalMap(campaignId, nome.trim(), width, height);
      setNome("");
      onCreated(map);
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
        placeholder="Nome (es. Regno di Valdoria)"
        className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Larghezza
          <input
            type="number"
            min={8}
            max={80}
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
            max={80}
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
          {creating ? "Creo…" : "Crea mappa vuota"}
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

function RegionalMapViewer({
  map,
  isDm,
  onDeleted,
  onChanged,
}: {
  map: RegionalMapFull;
  isDm: boolean;
  onDeleted: () => void;
  onChanged: () => void;
}) {
  const [editMode, setEditMode] = useState(false);
  const [markerMode, setMarkerMode] = useState(false);
  const [brush, setBrush] = useState<TerrainType>("pianura");
  const [icon, setIcon] = useState<string>(MARKER_ICONS[0]);
  const [cells, setCells] = useState<TerrainType[][]>(map.cells);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedMarkerId, setSelectedMarkerId] = useState<number | null>(null);

  // stesso principio già usato per il dungeon: risincronizza le celle locali quando la mappa
  // viene ricaricata (es. dopo aver piazzato un marcatore), durante il render e non in un
  // effetto, a meno che non ci siano modifiche di terreno non salvate in corso
  const [syncedCells, setSyncedCells] = useState(map.cells);
  if (map.cells !== syncedCells && !dirty) {
    setSyncedCells(map.cells);
    setCells(map.cells);
  }

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
      await updateRegionalMapCells(map.id, cells);
      setDirty(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  };

  const placeMarker = async (x: number, y: number) => {
    const label = window.prompt("Nome del luogo", "");
    if (label === null) return;
    await addRegionalMarker(map.id, x, y, label, icon);
    onChanged();
  };

  const selectedMarker = map.markers.find((m) => m.id === selectedMarkerId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {map.markers.length} luoghi · {map.width}×{map.height}
        </p>
        {isDm && (
          <button
            onClick={async () => {
              if (window.confirm(`Eliminare "${map.nome}"?`)) {
                await deleteRegionalMap(map.id);
                onDeleted();
              }
            }}
            className="text-xs text-danger hover:underline"
          >
            Elimina
          </button>
        )}
      </div>

      {isDm && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => {
              setEditMode((prev) => !prev);
              setMarkerMode(false);
            }}
            className={`rounded-lg border px-2.5 py-1.5 font-bold transition-colors ${
              editMode
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            {editMode ? "Modifica terreno: ON" : "Modifica terreno"}
          </button>
          <button
            onClick={() => {
              setMarkerMode((prev) => !prev);
              setEditMode(false);
            }}
            className={`rounded-lg border px-2.5 py-1.5 font-bold transition-colors ${
              markerMode
                ? "border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            {markerMode ? "Piazza luogo: ON" : "Piazza luogo"}
          </button>

          {editMode && (
            <div className="flex flex-wrap gap-1.5">
              {TERRAIN_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => setBrush(t)}
                  className={`rounded-md border px-2 py-1 font-bold transition-colors ${
                    brush === t ? "border-accent text-accent-strong" : "border-edge text-muted"
                  }`}
                  style={{ backgroundColor: brush === t ? undefined : TERRAIN_COLORS[t] + "33" }}
                >
                  {TERRAIN_LABELS[t]}
                </button>
              ))}
            </div>
          )}

          {markerMode && (
            <div className="flex flex-wrap gap-1">
              {MARKER_ICONS.map((i) => (
                <button
                  key={i}
                  onClick={() => setIcon(i)}
                  className={`size-7 rounded-md border text-sm transition-colors ${
                    icon === i ? "border-accent bg-accent/15" : "border-edge bg-surface-raised"
                  }`}
                >
                  {i}
                </button>
              ))}
            </div>
          )}

          {editMode && dirty && (
            <button
              onClick={saveCells}
              disabled={saving}
              className="rounded-lg bg-accent text-background font-bold px-2.5 py-1.5 hover:bg-accent-strong transition-colors disabled:opacity-50"
            >
              {saving ? "Salvo…" : "💾 Salva terreno"}
            </button>
          )}
        </div>
      )}

      <RegionalMapCanvas
        map={{ ...map, cells }}
        editable={editMode || markerMode}
        markerMode={markerMode}
        onPaintCell={paintCell}
        onPlaceMarker={placeMarker}
        onMarkerClick={(id) => setSelectedMarkerId((prev) => (prev === id ? null : id))}
      />

      {selectedMarker && (
        <div className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-foreground">
              {selectedMarker.icona} {selectedMarker.label}
            </p>
            {isDm && (
              <button
                onClick={async () => {
                  await deleteRegionalMarker(map.id, selectedMarker.id);
                  setSelectedMarkerId(null);
                  onChanged();
                }}
                className="text-xs text-danger hover:underline"
              >
                Elimina
              </button>
            )}
          </div>
          <textarea
            defaultValue={selectedMarker.nota}
            disabled={!isDm}
            placeholder="Note (popolazione, governo, agganci narrativi…)"
            rows={3}
            onBlur={async (event) => {
              if (!isDm) return;
              await updateRegionalMarkerNote(map.id, selectedMarker.id, event.target.value);
              onChanged();
            }}
            className="w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground disabled:opacity-70"
          />
        </div>
      )}
    </div>
  );
}

function RegionalMapCanvas({
  map,
  editable,
  markerMode,
  onPaintCell,
  onPlaceMarker,
  onMarkerClick,
}: {
  map: { width: number; height: number; cells: TerrainType[][]; markers: RegionalMarker[] };
  editable: boolean;
  markerMode: boolean;
  onPaintCell: (x: number, y: number) => void;
  onPlaceMarker: (x: number, y: number) => void;
  onMarkerClick: (id: number) => void;
}) {
  const cellSize = 14;
  const isPaintingRef = useRef(false);

  useEffect(() => {
    if (!editable) return;
    const stop = () => {
      isPaintingRef.current = false;
    };
    window.addEventListener("pointerup", stop);
    return () => window.removeEventListener("pointerup", stop);
  }, [editable]);

  const handleCellDown = (x: number, y: number) => {
    if (markerMode) {
      onPlaceMarker(x, y);
      return;
    }
    isPaintingRef.current = true;
    onPaintCell(x, y);
  };

  const handleCellEnter = (x: number, y: number) => {
    if (!editable || markerMode || !isPaintingRef.current) return;
    onPaintCell(x, y);
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-edge bg-background p-2">
      <svg
        viewBox={`0 0 ${map.width * cellSize} ${map.height * cellSize}`}
        width={map.width * cellSize}
        height={map.height * cellSize}
        className="max-w-full h-auto"
        shapeRendering="crispEdges"
      >
        {map.cells.map((row, y) =>
          row.map((cell, x) => (
            <rect
              key={`${x}-${y}`}
              x={x * cellSize}
              y={y * cellSize}
              width={cellSize}
              height={cellSize}
              fill={TERRAIN_COLORS[cell]}
            />
          )),
        )}
        {editable &&
          map.cells.map((row, y) =>
            row.map((_cell, x) => (
              <rect
                key={`hit-${x}-${y}`}
                x={x * cellSize}
                y={y * cellSize}
                width={cellSize}
                height={cellSize}
                fill="transparent"
                stroke="#3b322a22"
                strokeWidth={0.5}
                className={markerMode ? "cursor-crosshair" : "cursor-pointer"}
                onPointerDown={() => handleCellDown(x, y)}
                onPointerEnter={() => handleCellEnter(x, y)}
              />
            )),
          )}
        {map.markers.map((marker) => (
          <g
            key={marker.id}
            onClick={() => onMarkerClick(marker.id)}
            className="cursor-pointer"
          >
            <circle
              cx={(marker.x + 0.5) * cellSize}
              cy={(marker.y + 0.5) * cellSize}
              r={cellSize * 0.55}
              fill="#0c0a09cc"
              stroke="#e0a83e"
              strokeWidth={1}
            />
            <text
              x={(marker.x + 0.5) * cellSize}
              y={(marker.y + 0.5) * cellSize}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={cellSize * 0.7}
              className="pointer-events-none select-none"
            >
              {marker.icona}
            </text>
            <text
              x={(marker.x + 0.5) * cellSize}
              y={(marker.y + 0.5) * cellSize + cellSize}
              textAnchor="middle"
              fontSize={cellSize * 0.55}
              fill="#ece5da"
              className="pointer-events-none select-none font-bold"
            >
              {marker.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
