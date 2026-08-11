"use client";

// --- Mappa regionale: dipingi il terreno + marcatori con etichetta/icona. Stessa impalcatura
// di sezione/viewer del dungeon (lista + attiva), ma niente token/procedurale/realtime: è una
// risorsa di riferimento che il master prepara con calma, non qualcosa che cambia in diretta
// mentre i giocatori la guardano.

import { useEffect, useRef, useState } from "react";
import { IntField } from "@/components/int-field";
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

type RegionalMapListItem = Awaited<ReturnType<typeof getRegionalMapsForCampaign>>[number];
type RegionalMapFull = Awaited<ReturnType<typeof getRegionalMap>>;

export function RegionalMapSection({ campaignId, isDm }: { campaignId: string; isDm: boolean }) {
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
    <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
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
                  ? "glow-accent border-accent bg-accent/15 text-accent-strong"
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
        className="input-focus w-full rounded-md border border-edge bg-surface px-2 py-1.5 text-sm text-foreground"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Larghezza
          <IntField
            min={8}
            max={80}
            value={width}
            onChange={setWidth}
            className="w-16 rounded-md border border-edge bg-surface px-1.5 py-1 text-sm text-foreground text-center"
          />
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          Altezza
          <IntField
            min={8}
            max={80}
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
                ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            {editMode ? "Modifica terreno (attivo)" : "Modifica terreno"}
          </button>
          <button
            onClick={() => {
              setMarkerMode((prev) => !prev);
              setEditMode(false);
            }}
            className={`rounded-lg border px-2.5 py-1.5 font-bold transition-colors ${
              markerMode
                ? "glow-accent border-accent bg-accent/15 text-accent-strong"
                : "border-edge bg-surface-raised text-muted hover:text-foreground"
            }`}
          >
            {markerMode ? "Piazza luogo (attivo)" : "Piazza luogo"}
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
              className="rounded-lg bg-accent text-background font-bold px-2.5 py-1.5 hover:bg-accent-strong transition-colors active:scale-[0.97] disabled:opacity-50"
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
        // key sul marcatore selezionato: la textarea sotto è non controllata (defaultValue), che
        // regge finché il marcatore è quello che era mentre si scrive. Cliccando direttamente su
        // un marcatore diverso mentre il pannello è già aperto, senza il key React riuserebbe lo
        // stesso nodo textarea col vecchio testo — un blur a quel punto avrebbe salvato le note
        // stantie del marcatore precedente sopra quelle del marcatore nuovo, silenziosamente
        // (stesso pattern già corretto per RoomNotesEditor nel dungeon, qui era mancato).
        <div key={selectedMarker.id} className="rounded-lg border border-edge bg-surface-raised p-3 space-y-2">
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
