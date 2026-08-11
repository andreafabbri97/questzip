"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { IntField } from "@/components/int-field";
import {
  addMarker,
  createBlankDungeon,
  createDungeon,
  createOutdoorScene,
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
  setRealisticMode,
  toggleRoomRevealed,
  updateDungeonCells,
  updateRoomNotes,
  upsertMyToken,
} from "@/app/actions/dungeons";
import {
  computeVisibleCells,
  metersToCells,
  pointInTemplate,
  type AoeTemplate,
  type CellType,
  type CorridorStyle,
  type DeadEndRemoval,
  type DungeonConfig,
  type MonsterToken,
  type OutdoorBiome,
  type RoomDensity,
  type RoomShape,
  type StairsOption,
  type TemplateShape,
} from "@/lib/dungeon";
import { usePartyRoom } from "@/lib/use-party-room";
import { getPartyForCampaign } from "@/app/actions/characters";
import { getActiveEncounter } from "@/app/actions/encounters";
import { MonsterTokenSearch } from "./generators";
import type { DungeonFull, DungeonListItem } from "./types";

export function DungeonSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
  const [dungeons, setDungeons] = useState<DungeonListItem[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<DungeonFull | null>(null);
  const [formMode, setFormMode] = useState<"none" | "generate" | "outdoor" | "blank">("none");

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
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
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
              onClick={() => setFormMode((prev) => (prev === "outdoor" ? "none" : "outdoor"))}
              className="text-xs font-bold text-accent-strong hover:underline"
            >
              {formMode === "outdoor" ? "Annulla" : "+ Genera scena esterna"}
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

      {formMode === "outdoor" && isDm && (
        <NewOutdoorSceneForm
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
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Stanze min
          <IntField
            min={1}
            max={40}
            value={minRooms}
            onChange={setMinRooms}
            className="w-14 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          max
          <IntField
            min={1}
            max={40}
            value={maxRooms}
            onChange={setMaxRooms}
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
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
        className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
      >
        {generating ? "Genero…" : "🎲 Genera"}
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}

const BIOME_LABELS: Record<OutdoorBiome, string> = {
  bosco: "Bosco",
  palude: "Palude",
  pianura: "Pianura",
  rocciosa: "Rocciosa",
  costa: "Costa",
};

function NewOutdoorSceneForm({
  campaignId,
  onCreated,
}: {
  campaignId: string;
  onCreated: (dungeon: { id: string }) => void;
}) {
  const [nome, setNome] = useState("");
  const [width, setWidth] = useState(30);
  const [height, setHeight] = useState(20);
  const [biome, setBiome] = useState<OutdoorBiome>("bosco");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const dungeon = await createOutdoorScene(campaignId, nome.trim(), { width, height, biome });
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
        placeholder="Nome (es. Imboscata sulla strada del bosco)"
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Larghezza
          <IntField
            min={8}
            max={60}
            value={width}
            onChange={setWidth}
            className="w-16 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Altezza
          <IntField
            min={8}
            max={60}
            value={height}
            onChange={setHeight}
            className="w-16 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(BIOME_LABELS) as OutdoorBiome[]).map((option) => (
            <button
              key={option}
              onClick={() => setBiome(option)}
              className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                biome === option
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                  : "border-edge bg-surface text-muted hover:text-foreground"
              }`}
            >
              {BIOME_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={generate}
        disabled={generating}
        className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
      >
        {generating ? "Genero…" : "🎲 Genera"}
      </button>
      <p className="text-xs text-muted">
        Genera una scena a tema, poi resta modificabile a mano con lo stesso pennello della tela
        vuota (✏️ Modifica mappa) — esattamente come un dungeon generato.
      </p>
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
        placeholder="Nome (es. Cripta sotto la torre, Radura nel bosco…)"
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Larghezza
          <IntField
            min={8}
            max={60}
            value={width}
            onChange={setWidth}
            className="w-16 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Altezza
          <IntField
            min={8}
            max={60}
            value={height}
            onChange={setHeight}
            className="w-16 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <button
          onClick={create}
          disabled={creating}
          className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
        >
          {creating ? "Creo…" : "✏️ Crea tela vuota"}
        </button>
      </div>
      <p className="text-xs text-muted">
        Crea una griglia vuota da disegnare a mano: pennello per interni (muri/pavimento/porte) o
        per esterni (erba/alberi/acqua/roccia), più punti d&apos;interesse — stessi token, fog of
        war e aggiornamenti in tempo reale del dungeon, solo un altro tema grafico.
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
  grass: "Erba",
  tree: "Albero",
  water: "Acqua",
  rock: "Roccia",
};

const INDOOR_BRUSHES: CellType[] = ["floor", "wall", "door"];
const OUTDOOR_BRUSHES: CellType[] = ["grass", "tree", "water", "rock"];

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

  // Visione/velocità REALI di ciascun giocatore (per la modalità realistica) — dallo snapshot
  // sincronizzato in campagna, non dalla scheda completa (che potrebbe non essere accessibile,
  // ed è comunque quello che il resto della campagna già usa come fonte per Party/XP/PF).
  const [party, setParty] = useState<Awaited<ReturnType<typeof getPartyForCampaign>>>([]);
  useEffect(() => {
    getPartyForCampaign(dungeon.campaignId).then(setParty);
  }, [dungeon.campaignId]);

  // Combattimento attivo (per il limite di movimento in modalità realistica) — stessa stanza
  // realtime "combat" già usata da chat/dadi/jukebox/voce di questa campagna, non quella
  // dungeon-specifica usata sopra per token/celle: un dungeon può essere aperto senza che ci sia
  // un combattimento in corso, e viceversa.
  const [encounter, setEncounter] = useState<Awaited<ReturnType<typeof getActiveEncounter>>>(null);
  const refreshEncounter = () => {
    getActiveEncounter(dungeon.campaignId).then(setEncounter);
  };
  useEffect(refreshEncounter, [dungeon.campaignId]);
  usePartyRoom({ kind: "combat", campaignId: dungeon.campaignId }, (message) => {
    if ((message as { type?: string } | null)?.type === "encounter-changed") refreshEncounter();
  });

  const currentCombatant = encounter?.combatants[encounter.encounter.currentTurn] ?? null;
  const isMyCombatTurn = Boolean(myUserId && currentCombatant?.characterUserId === myUserId);
  const myVelocity = party.find((p) => p.userId === myUserId)?.velocita ?? 0;
  const speedBudgetCells = metersToCells(myVelocity);

  // Celle percorse nel turno corrente — azzerate quando cambia turno/round (reset a render,
  // non in un effetto, stesso pattern già consolidato in questo progetto). Solo un avviso, non
  // un blocco: troppe eccezioni RAW (Scatto, terreno difficile...) per un limite invalicabile.
  const turnKey = encounter
    ? `${encounter.encounter.id}-${encounter.encounter.round}-${encounter.encounter.currentTurn}`
    : null;
  const [loadedTurnKey, setLoadedTurnKey] = useState(turnKey);
  const [movedThisTurn, setMovedThisTurn] = useState(0);
  if (turnKey !== loadedTurnKey) {
    setLoadedTurnKey(turnKey);
    setMovedThisTurn(0);
  }

  const [templateShape, setTemplateShape] = useState<TemplateShape | null>(null);
  const [activeTemplates, setActiveTemplates] = useState<
    { id: number; template: AoeTemplate; hits: string[] }[]
  >([]);
  const templateIdRef = useRef(0);

  // Effimero apposta (mai scritto su database): un template resta visibile ~6 secondi e poi
  // scompare da solo, come lo strumento di misurazione di Roll20 — non serve un modo per
  // rimuoverlo a mano.
  const addTemplate = (template: AoeTemplate, hits: string[]) => {
    const id = templateIdRef.current++;
    setActiveTemplates((prev) => [...prev, { id, template, hits }]);
    setTimeout(() => setActiveTemplates((prev) => prev.filter((t) => t.id !== id)), 6000);
  };

  const fetchingNewTokenRef = useRef(false);
  const { send } = usePartyRoom({ kind: "dungeon", dungeonId: dungeon.id }, (message) => {
    const msg = message as
      | (Partial<AoeTemplate> & {
          type?: string;
          userId?: string;
          x?: number;
          y?: number;
          hits?: string[];
        })
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
    if (
      msg.type === "template" &&
      msg.shape &&
      typeof msg.originX === "number" &&
      typeof msg.originY === "number" &&
      typeof msg.size === "number" &&
      typeof msg.angle === "number"
    ) {
      addTemplate(
        { shape: msg.shape, originX: msg.originX, originY: msg.originY, size: msg.size, angle: msg.angle },
        msg.hits ?? [],
      );
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
  const tokens: DungeonToken[] = rawTokens.map((t) => {
    const character = party.find((p) => p.userId === t.userId);
    return {
      userId: t.userId,
      x: t.x,
      y: t.y,
      label: tokenInitials(t.name),
      color: tokenColor(t.userId),
      isMe: t.userId === myUserId,
      visioneRadius: character?.visioneRadius,
      velocita: character?.velocita,
    };
  });

  const handleTemplateDrawn = (template: AoeTemplate) => {
    const hitTokens = tokens
      .filter((t) => pointInTemplate(template, Math.floor(t.x), Math.floor(t.y)))
      .map((t) => (t.isMe ? "tu" : t.label));
    const hitMonsters = dungeon.monsterTokens
      .filter((m) => pointInTemplate(template, m.x, m.y))
      .map((m) => m.nome);
    const hits = [...hitTokens, ...hitMonsters];
    addTemplate(template, hits);
    send({ type: "template", ...template, hits });
    setTemplateShape(null);
  };

  const handleTokenDrag = (x: number, y: number) => {
    send({ type: "move", x, y });
  };

  const handleTokenDragEnd = async (x: number, y: number) => {
    if (dungeon.realisticMode && isMyCombatTurn && myToken) {
      const distance = Math.round(Math.hypot(x - myToken.x, y - myToken.y));
      setMovedThisTurn((prev) => prev + distance);
    }
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

  const toggleRealisticMode = async () => {
    await setRealisticMode(dungeon.id, !dungeon.realisticMode);
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
        <div className="flex items-center gap-2 text-xs flex-wrap">
          {myToken ? (
            <button onClick={removeMyTokenFromMap} className="font-bold text-danger hover:underline">
              🧭 Rimuovi il mio token
            </button>
          ) : (
            <button onClick={placeMyToken} className="font-bold text-accent-strong hover:underline">
              🧭 Metti il mio token in mappa
            </button>
          )}
          {dungeon.realisticMode && isMyCombatTurn && (
            <span
              className={`font-bold ${movedThisTurn > speedBudgetCells ? "text-danger" : "text-muted"}`}
            >
              🏃 È il tuo turno — movimento: {movedThisTurn}/{speedBudgetCells} celle
              {movedThisTurn > speedBudgetCells && " (oltre la tua velocità!)"}
            </span>
          )}
        </div>
      )}

      {myUserId && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface-raised p-2">
          <span className="text-xs uppercase tracking-widest text-muted">📐 Area d&apos;effetto</span>
          {(
            [
              { shape: "circle" as const, label: "⭕ Cerchio" },
              { shape: "cone" as const, label: "🔺 Cono" },
              { shape: "line" as const, label: "📏 Linea" },
            ]
          ).map((option) => (
            <button
              key={option.shape}
              onClick={() => setTemplateShape((prev) => (prev === option.shape ? null : option.shape))}
              className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                templateShape === option.shape
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                  : "border-edge bg-surface text-muted hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
          {templateShape && (
            <span className="text-[10px] text-muted">
              trascina sulla mappa dall&apos;origine verso la direzione desiderata
            </span>
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
                ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface text-muted hover:text-foreground"
            }`}
          >
            {editMode ? "Fine modifica" : "✏️ Modifica mappa"}
          </button>
          {editMode && (
            <>
              <div className="flex gap-1">
                {INDOOR_BRUSHES.map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setBrush(option);
                      setMarkerMode(false);
                    }}
                    className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                      !markerMode && brush === option
                        ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                        : "border-edge bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    {BRUSH_LABELS[option]}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setBrush("wall");
                    setMarkerMode(false);
                  }}
                  title="Riporta la cella a muro"
                  className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                    !markerMode && brush === "wall"
                      ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                      : "border-edge bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  🧹 Gomma
                </button>
              </div>
              <div className="flex gap-1 pl-1 border-l border-edge">
                {OUTDOOR_BRUSHES.map((option) => (
                  <button
                    key={option}
                    onClick={() => {
                      setBrush(option);
                      setMarkerMode(false);
                    }}
                    className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                      !markerMode && brush === option
                        ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                        : "border-edge bg-surface text-muted hover:text-foreground"
                    }`}
                  >
                    {BRUSH_LABELS[option]}
                  </button>
                ))}
                <button
                  onClick={() => {
                    setBrush("grass");
                    setMarkerMode(false);
                  }}
                  title="Riporta la cella a erba"
                  className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                    !markerMode && brush === "grass"
                      ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                      : "border-edge bg-surface text-muted hover:text-foreground"
                  }`}
                >
                  🧹 Gomma
                </button>
              </div>
              <button
                onClick={() => setMarkerMode((prev) => !prev)}
                className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
                  markerMode
                    ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                    : "border-edge bg-surface text-muted hover:text-foreground"
                }`}
              >
                📍 Punto d&apos;interesse
              </button>
              <button
                onClick={saveCells}
                disabled={!dirty || saving}
                className="rounded-md bg-accent text-background font-bold px-2 py-1 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
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
            🌫️ Nebbia di guerra
          </label>
          {dungeon.fogOfWar && (
            <span className="text-[10px] text-muted">
              i giocatori vedono solo le stanze rivelate — apri una stanza per rivelarla
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs font-bold text-foreground pl-2 border-l border-edge">
            <input type="checkbox" checked={dungeon.realisticMode} onChange={toggleRealisticMode} />
            🎯 Movimento e visione realistici
          </label>
          {dungeon.realisticMode && (
            <span className="text-[10px] text-muted">
              visione = quella reale del personaggio (se fog attivo) · avviso se ti muovi oltre la
              tua velocità durante il tuo turno
            </span>
          )}
          <button
            onClick={() => {
              setMonsterMode((prev) => !prev);
              setMonsterToPlace(null);
            }}
            className={`rounded-md border px-2 py-1 text-xs font-bold transition-colors ${
              monsterMode
                ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
        templateShape={templateShape}
        onTemplateDrawn={handleTemplateDrawn}
        activeTemplates={activeTemplates.map((t) => t.template)}
        realisticMode={dungeon.realisticMode}
      />
      {activeTemplates.length > 0 && (
        <div className="space-y-1">
          {activeTemplates.map((t) => (
            <p key={t.id} className="text-xs text-accent-strong">
              🎯{" "}
              {t.template.shape === "circle" ? "Cerchio" : t.template.shape === "cone" ? "Cono" : "Linea"}
              {" — "}
              {t.hits.length > 0 ? `colpisce: ${t.hits.join(", ")}` : "non colpisce nessuno"}
            </p>
          ))}
        </div>
      )}
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
        // DungeonMap non genera mai un click su una stanza nascosta (vedi handleClick lì),
        // quindi se siamo qui la stanza era visibile al momento della selezione — niente da
        // ricontrollare.
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
          className="mt-1 input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
      </label>
      <label className="block">
        <span className="text-[10px] uppercase tracking-widest text-muted">Ricompensa</span>
        <textarea
          value={reward}
          onChange={(event) => setReward(event.target.value)}
          rows={2}
          placeholder="Es. Pozione di cura, 20 mo"
          className="mt-1 input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
        />
      </label>
      <button
        onClick={save}
        disabled={saving}
        className="glow-accent rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
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
  grass: "#4f6b3a",
  tree: "#1f3320",
  water: "#2b5d7a",
  rock: "#5a534a",
};

interface DungeonToken {
  userId: string;
  x: number;
  y: number;
  label: string;
  color: string;
  isMe: boolean;
  // Da campaignCharacters (personaggio sincronizzato), usati solo in modalità realistica —
  // undefined se il giocatore non ha ancora sincronizzato un personaggio in questa campagna.
  visioneRadius?: number;
  velocita?: number;
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

// Disegna un template area d'effetto (cerchio/cono/linea) — usata sia per l'anteprima live
// mentre lo si trascina (semitrasparente, bordo ambra) sia per quelli già finalizzati e
// condivisi con tutta la stanza (bordo rosso, coerente col colore "pericolo" già usato altrove).
function renderAoeTemplate(template: AoeTemplate, cellSize: number, preview: boolean) {
  const cx = template.originX * cellSize;
  const cy = template.originY * cellSize;
  const r = template.size * cellSize;
  const fill = preview ? "#e0a83e22" : "#dc262633";
  const stroke = preview ? "#e0a83e" : "#dc2626";
  const shared = { fill, stroke, strokeWidth: 1.5, className: "pointer-events-none" };

  if (template.shape === "circle") {
    return <circle cx={cx} cy={cy} r={r} {...shared} />;
  }
  if (template.shape === "line") {
    const halfWidth = cellSize * 0.5;
    return (
      <rect
        x={cx}
        y={cy - halfWidth}
        width={r}
        height={halfWidth * 2}
        transform={`rotate(${(template.angle * 180) / Math.PI} ${cx} ${cy})`}
        {...shared}
      />
    );
  }
  const half = Math.PI / 6;
  const x1 = cx + r * Math.cos(template.angle - half);
  const y1 = cy + r * Math.sin(template.angle - half);
  const x2 = cx + r * Math.cos(template.angle + half);
  const y2 = cy + r * Math.sin(template.angle + half);
  return <path d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`} {...shared} />;
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
  templateShape = null,
  onTemplateDrawn,
  activeTemplates = [],
  realisticMode = false,
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
  templateShape?: TemplateShape | null;
  onTemplateDrawn?: (template: AoeTemplate) => void;
  activeTemplates?: AoeTemplate[];
  realisticMode?: boolean;
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
  const draggingTemplateRef = useRef(false);
  const [templateDrag, setTemplateDrag] = useState<
    { originX: number; originY: number; x: number; y: number } | null
  >(null);

  const fogActive = fogOfWar && !isDm;
  const revealedSet = new Set(revealedRooms);
  // Luce dinamica vera: quello che i giocatori vedono ORA è l'unione di due fonti — la visuale
  // automatica (linea di vista + raggio di scurovisione dai token giocatore, ricalcolata ad ogni
  // spostamento) e le stanze rivelate a mano dal master (es. per un evento narrativo indipendente
  // dalla posizione dei token). Non è "esplorato in memoria": una cella uscita dalla visuale
  // torna scura, come una vera fonte di luce che si sposta — a differenza del fog of war "a
  // memoria" di altri VTT, qui deliberatamente più semplice.
  const autoVisibleCells = fogActive
    ? computeVisibleCells(
        dungeon.cells,
        (tokens ?? []).map((t) => ({
          x: t.x,
          y: t.y,
          radius: realisticMode ? metersToCells(t.visioneRadius ?? 0) : undefined,
        })),
      )
    : new Set<string>();
  const manuallyRevealedCells = new Set<string>();
  if (fogActive) {
    for (const room of dungeon.rooms) {
      if (revealedSet.has(room.id)) {
        for (const [x, y] of room.cells) manuallyRevealedCells.add(`${x},${y}`);
      }
    }
  }
  const isRoomVisible = (room: DungeonFull["rooms"][number]) =>
    !fogActive ||
    revealedSet.has(room.id) ||
    room.cells.some(([x, y]) => autoVisibleCells.has(`${x},${y}`));
  const hiddenCells = new Set<string>();
  if (fogActive) {
    for (let y = 0; y < dungeon.height; y++) {
      for (let x = 0; x < dungeon.width; x++) {
        const key = `${x},${y}`;
        if (autoVisibleCells.has(key) || manuallyRevealedCells.has(key)) continue;
        hiddenCells.add(key);
      }
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

  // Trascinamento del template area d'effetto: origine al pointerdown, raggio/direzione seguono
  // il puntatore mentre si trascina (stesso motore pointermove/pointerup a livello di window già
  // usato per token/mostri), finalizzato al rilascio.
  useEffect(() => {
    if (!templateShape) return;
    const clientToCell = (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = Math.min(dungeon.width, Math.max(0, ((clientX - rect.left) / rect.width) * dungeon.width));
      const y = Math.min(dungeon.height, Math.max(0, ((clientY - rect.top) / rect.height) * dungeon.height));
      return { x, y };
    };
    const move = (event: PointerEvent) => {
      if (!draggingTemplateRef.current) return;
      const pos = clientToCell(event.clientX, event.clientY);
      if (pos) setTemplateDrag((prev) => (prev ? { ...prev, x: pos.x, y: pos.y } : prev));
    };
    const up = () => {
      if (!draggingTemplateRef.current) return;
      draggingTemplateRef.current = false;
      setTemplateDrag((drag) => {
        if (drag) {
          const dx = drag.x - drag.originX;
          const dy = drag.y - drag.originY;
          const size = Math.max(0.5, Math.hypot(dx, dy));
          const angle = Math.atan2(dy, dx);
          onTemplateDrawn?.({
            shape: templateShape,
            originX: Math.floor(drag.originX) + 0.5,
            originY: Math.floor(drag.originY) + 0.5,
            size,
            angle,
          });
        }
        return null;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [templateShape, dungeon.width, dungeon.height, onTemplateDrawn]);

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
          const hidden = !isRoomVisible(room);
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
          // stesso fog dei giocatori: un mostro piazzato in un'imboscata dentro una stanza non
          // ancora rivelata non deve tradirsi comparendo comunque sulla mappa
          if (fogActive && hiddenCells.has(`${monster.x},${monster.y}`)) return null;
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
        {activeTemplates.map((template, index) => (
          <g key={index}>{renderAoeTemplate(template, cellSize, false)}</g>
        ))}
        {templateDrag &&
          templateShape &&
          (() => {
            const dx = templateDrag.x - templateDrag.originX;
            const dy = templateDrag.y - templateDrag.originY;
            const size = Math.max(0.3, Math.hypot(dx, dy));
            const angle = Math.atan2(dy, dx);
            return renderAoeTemplate(
              {
                shape: templateShape,
                originX: Math.floor(templateDrag.originX) + 0.5,
                originY: Math.floor(templateDrag.originY) + 0.5,
                size,
                angle,
              },
              cellSize,
              true,
            );
          })()}
        {templateShape && (
          <rect
            x={0}
            y={0}
            width={dungeon.width * cellSize}
            height={dungeon.height * cellSize}
            fill="transparent"
            className="cursor-crosshair"
            onPointerDown={(event) => {
              const rect = svgRef.current?.getBoundingClientRect();
              if (!rect) return;
              const x = ((event.clientX - rect.left) / rect.width) * dungeon.width;
              const y = ((event.clientY - rect.top) / rect.height) * dungeon.height;
              draggingTemplateRef.current = true;
              setTemplateDrag({ originX: x, originY: y, x, y });
            }}
          />
        )}
      </svg>
    </div>
  );
}
