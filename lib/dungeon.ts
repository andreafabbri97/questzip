// Generatore procedurale di dungeon (ispirato a donjon.bin.sh/d20/dungeon/): stanze piazzate
// su una griglia, connesse da corridoi via albero ricoprente minimo + qualche anello extra.
// "Organiche" erode/fa crescere il bordo delle stanze rettangolari per un look meno geometrico
// (stesso motore a griglia di donjon). "Circolare"/"Poligonale" sono invece geometria vettoriale
// vera (cerchio/poligono con lati dritti): la forma è rasterizzata su celle solo per riusare lo
// stesso sistema di corridoi/porte/connettività già collaudato, ma il disegno usa la forma reale.

// "wall"/"floor"/"door"/"corridor" sono le celle da interno (dungeon), usate anche dal
// generatore procedurale. "grass"/"tree"/"water"/"rock" sono celle da esterno, disponibili
// solo nel pennello della tela vuota (il generatore procedurale resta solo dungeon) — stesso
// identico motore a griglia (token, fog of war, note stanza), solo altri colori/nomi.
export type CellType = "wall" | "floor" | "door" | "corridor" | "grass" | "tree" | "water" | "rock";
export type RoomShape = "rectangular" | "organic" | "circular" | "polygonal";
export type RoomDensity = "sparse" | "scattered" | "dense" | "symmetric";
export type CorridorStyle = "straight" | "errant" | "labyrinth";
export type DeadEndRemoval = "none" | "some" | "all";
export type StairsOption = "no" | "yes" | "many";

export type VectorShape =
  | { type: "circle"; cx: number; cy: number; r: number }
  | { type: "polygon"; points: [number, number][] };

export interface DungeonRoom {
  id: number;
  label: string;
  cells: [number, number][];
  centerX: number;
  centerY: number;
  encounter: string;
  reward: string;
  vectorShape?: VectorShape;
}

export interface DungeonData {
  width: number;
  height: number;
  cells: CellType[][];
  rooms: DungeonRoom[];
}

/** Token mostro piazzato dal master sulla mappa (a differenza dei token giocatore, non è legato
 * a un utente: posizione persistita al rilascio del trascinamento, aggiornata via lo stesso
 * broadcast "dungeon-changed" già usato per celle/stanze — non ha bisogno del relay per-frame
 * usato per i token giocatore, dato che solo il master lo muove). */
export interface MonsterToken {
  id: string;
  nome: string;
  x: number;
  y: number;
  colore: string;
}

export interface DungeonConfig {
  minRooms: number;
  maxRooms: number;
  shape: RoomShape;
  density?: RoomDensity;
  corridorStyle?: CorridorStyle;
  removeDeadends?: DeadEndRemoval;
  stairs?: StairsOption;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rectsOverlap(a: Rect, b: Rect, padding: number): boolean {
  return (
    a.x - padding < b.x + b.w &&
    a.x + a.w + padding > b.x &&
    a.y - padding < b.y + b.h &&
    a.y + a.h + padding > b.y
  );
}

function rectCells(rect: Rect): [number, number][] {
  const cells: [number, number][] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) cells.push([x, y]);
  }
  return cells;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** Tiene solo la componente connessa più grande (l'erosione può spezzare la forma in isole). */
function largestConnectedComponent(cells: [number, number][]): [number, number][] {
  const set = new Set(cells.map(([x, y]) => cellKey(x, y)));
  const seen = new Set<string>();
  let best: [number, number][] = [];

  for (const [startX, startY] of cells) {
    const startKey = cellKey(startX, startY);
    if (seen.has(startKey)) continue;
    const component: [number, number][] = [];
    const queue: [number, number][] = [[startX, startY]];
    seen.add(startKey);
    while (queue.length > 0) {
      const [x, y] = queue.pop()!;
      component.push([x, y]);
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as [number, number][]) {
        const key = cellKey(nx, ny);
        if (set.has(key) && !seen.has(key)) {
          seen.add(key);
          queue.push([nx, ny]);
        }
      }
    }
    if (component.length > best.length) best = component;
  }
  return best;
}

/** Erode/fa crescere il bordo di una stanza rettangolare per un contorno più organico. */
function organicize(cells: [number, number][], width: number, height: number): [number, number][] {
  const set = new Set(cells.map(([x, y]) => cellKey(x, y)));
  const inBounds = (x: number, y: number) => x >= 1 && y >= 1 && x < width - 1 && y < height - 1;

  for (let pass = 0; pass < 2; pass++) {
    const current = [...set];
    for (const key of current) {
      const [x, y] = key.split(",").map(Number);
      const neighbors: [number, number][] = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      const outsideNeighbors = neighbors.filter((n) => !set.has(cellKey(n[0], n[1])));
      const isBoundary = outsideNeighbors.length > 0;
      if (!isBoundary) continue;

      if (Math.random() < 0.35 && set.size > 6) {
        set.delete(key);
      } else if (Math.random() < 0.35) {
        const [nx, ny] = outsideNeighbors[randInt(0, outsideNeighbors.length - 1)];
        if (inBounds(nx, ny)) set.add(cellKey(nx, ny));
      }
    }
  }
  const shaped = [...set].map((key) => key.split(",").map(Number) as [number, number]);
  return largestConnectedComponent(shaped);
}

function circleCells(cx: number, cy: number, r: number, width: number, height: number): [number, number][] {
  const cells: [number, number][] = [];
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(height - 1, Math.ceil(cy + r));
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(width - 1, Math.ceil(cx + r));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r * r) cells.push([x, y]);
    }
  }
  return cells;
}

/** Poligono semi-regolare (N lati, raggio con un po' di rumore) per un look meno geometrico. */
function polygonPoints(cx: number, cy: number, avgRadius: number): [number, number][] {
  const sides = randInt(5, 9);
  const points: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const r = avgRadius * (0.75 + Math.random() * 0.5);
    points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  return points;
}

function pointInPolygon(x: number, y: number, points: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function polygonCells(
  points: [number, number][],
  width: number,
  height: number,
): [number, number][] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.max(0, Math.floor(Math.min(...xs)));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(...xs)));
  const minY = Math.max(0, Math.floor(Math.min(...ys)));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  const cells: [number, number][] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) cells.push([x, y]);
    }
  }
  return cells;
}

function closestCellToCentroid(cells: [number, number][]): [number, number] {
  const avgX = cells.reduce((sum, c) => sum + c[0], 0) / cells.length;
  const avgY = cells.reduce((sum, c) => sum + c[1], 0) / cells.length;
  let best = cells[0];
  let bestDist = Infinity;
  for (const cell of cells) {
    const dist = (cell[0] - avgX) ** 2 + (cell[1] - avgY) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = cell;
    }
  }
  return best;
}

/** Albero ricoprente minimo (Prim) sulle distanze euclidee fra centri stanza. */
function minimumSpanningEdges(
  rooms: { centerX: number; centerY: number }[],
): [number, number][] {
  if (rooms.length <= 1) return [];
  const connected = new Set([0]);
  const edges: [number, number][] = [];
  while (connected.size < rooms.length) {
    let best: { from: number; to: number; dist: number } | null = null;
    for (const from of connected) {
      for (let to = 0; to < rooms.length; to++) {
        if (connected.has(to)) continue;
        const dx = rooms[from].centerX - rooms[to].centerX;
        const dy = rooms[from].centerY - rooms[to].centerY;
        const dist = dx * dx + dy * dy;
        if (!best || dist < best.dist) best = { from, to, dist };
      }
    }
    if (!best) break;
    edges.push([best.from, best.to]);
    connected.add(best.to);
  }
  return edges;
}

/** "straight" = L, due tratti dritti come prima. "errant"/"labyrinth" avanzano una cella alla
 * volta verso il bersaglio ma con una probabilità (bassa per errant, alta per labyrinth) di
 * deviare lateralmente invece di procedere dritti, per un percorso più tortuoso. */
function carveCorridor(
  cells: CellType[][],
  from: { centerX: number; centerY: number },
  to: { centerX: number; centerY: number },
  style: CorridorStyle = "straight",
) {
  const width = cells[0]?.length ?? 0;
  const height = cells.length;
  const carve = (cx: number, cy: number) => {
    if (cells[cy]?.[cx] === "wall") cells[cy][cx] = "corridor";
  };

  if (style === "straight") {
    let [x, y] = [Math.round(from.centerX), Math.round(from.centerY)];
    const targetX = Math.round(to.centerX);
    const targetY = Math.round(to.centerY);
    const horizontalFirst = Math.random() < 0.5;
    const stepX = () => {
      while (x !== targetX) {
        x += x < targetX ? 1 : -1;
        carve(x, y);
      }
    };
    const stepY = () => {
      while (y !== targetY) {
        y += y < targetY ? 1 : -1;
        carve(x, y);
      }
    };
    if (horizontalFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }
    return;
  }

  const wanderChance = style === "labyrinth" ? 0.55 : 0.2;
  let [x, y] = [Math.round(from.centerX), Math.round(from.centerY)];
  const targetX = Math.round(to.centerX);
  const targetY = Math.round(to.centerY);
  let guard = (Math.abs(targetX - x) + Math.abs(targetY - y)) * 6 + 20;
  carve(x, y);
  while ((x !== targetX || y !== targetY) && guard-- > 0) {
    const towardMoves: [number, number][] = [];
    if (x !== targetX) towardMoves.push([x < targetX ? 1 : -1, 0]);
    if (y !== targetY) towardMoves.push([0, y < targetY ? 1 : -1]);
    const allDirections: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const sidewaysMoves: [number, number][] = allDirections.filter(
      ([dx, dy]) => !towardMoves.some(([tx, ty]) => tx === dx && ty === dy),
    );

    const useWander = Math.random() < wanderChance && sidewaysMoves.length > 0;
    const [dx, dy] = useWander
      ? sidewaysMoves[randInt(0, sidewaysMoves.length - 1)]
      : towardMoves[randInt(0, towardMoves.length - 1)];
    const nx = Math.min(width - 2, Math.max(1, x + dx));
    const ny = Math.min(height - 2, Math.max(1, y + dy));
    x = nx;
    y = ny;
    carve(x, y);
  }
  // se il vagabondaggio non è arrivato esatto a destinazione, chiude dritto l'ultimo tratto
  while (x !== targetX) {
    x += x < targetX ? 1 : -1;
    carve(x, y);
  }
  while (y !== targetY) {
    y += y < targetY ? 1 : -1;
    carve(x, y);
  }
}

/** Rimuove i vicoli ciechi (celle di corridoio con un solo vicino aperto), un'iterazione alla
 * volta come nella generazione classica di labirinti — "some" ne rimuove circa metà con un
 * singolo passaggio, "all" itera finché non ne restano più. */
function removeDeadEnds(cells: CellType[][], mode: DeadEndRemoval) {
  if (mode === "none") return;
  const height = cells.length;
  const width = cells[0]?.length ?? 0;
  const isOpen = (x: number, y: number) => {
    const c = cells[y]?.[x];
    return c === "corridor" || c === "floor" || c === "door";
  };

  const passes = mode === "all" ? width * height : 1;
  for (let pass = 0; pass < passes; pass++) {
    let removedAny = false;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (cells[y][x] !== "corridor") continue;
        const openNeighbors = [
          [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1],
        ].filter(([nx, ny]) => isOpen(nx, ny)).length;
        if (openNeighbors > 1) continue;
        if (mode === "some" && Math.random() > 0.5) continue;
        cells[y][x] = "wall";
        removedAny = true;
      }
    }
    if (!removedAny) break;
  }
}

// Densità: quanto è grande la griglia rispetto al numero di stanze — griglia più larga a
// parità di stanze = stanze più sparse. "Symmetric" non cambia la griglia, cambia solo il modo
// in cui le stanze vengono piazzate (vedi sotto).
const DENSITY_MULTIPLIER: Record<RoomDensity, number> = {
  dense: 7,
  scattered: 9,
  sparse: 12,
  symmetric: 9,
};

export function generateDungeon(config: DungeonConfig): DungeonData {
  const roomCount = randInt(config.minRooms, config.maxRooms);
  const density = config.density ?? "scattered";
  const gridSize = Math.ceil(Math.sqrt(roomCount)) * DENSITY_MULTIPLIER[density] + 6;
  const width = gridSize;
  const height = gridSize;

  const cells: CellType[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "wall" as CellType),
  );

  const placed: Rect[] = [];
  if (density === "symmetric") {
    // piazza solo nella metà sinistra, poi rispecchia ogni stanza sull'asse verticale: un
    // dungeon simmetrico, come un tempio o una fortezza progettata apposta
    const halfWidth = Math.max(4, Math.floor(width / 2) - 1);
    const halfCount = Math.ceil(roomCount / 2);
    for (let i = 0; i < halfCount; i++) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const w = randInt(3, 7);
        const h = randInt(3, 7);
        const x = randInt(1, Math.max(1, halfWidth - w));
        const y = randInt(1, Math.max(1, height - h - 1));
        const rect = { x, y, w, h };
        const mirrored = { x: width - x - w, y, w, h };
        if (
          !placed.some((existing) => rectsOverlap(rect, existing, 1)) &&
          !placed.some((existing) => rectsOverlap(mirrored, existing, 1)) &&
          !rectsOverlap(rect, mirrored, 1)
        ) {
          placed.push(rect, mirrored);
          break;
        }
      }
    }
  } else {
    for (let i = 0; i < roomCount; i++) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const w = randInt(3, 7);
        const h = randInt(3, 7);
        const x = randInt(1, Math.max(1, width - w - 1));
        const y = randInt(1, Math.max(1, height - h - 1));
        const rect = { x, y, w, h };
        if (!placed.some((existing) => rectsOverlap(rect, existing, 1))) {
          placed.push(rect);
          break;
        }
      }
    }
  }

  const rooms: DungeonRoom[] = placed.map((rect, index) => {
    let roomCells: [number, number][];
    let vectorShape: VectorShape | undefined;

    if (config.shape === "circular") {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const r = Math.min(rect.w, rect.h) / 2;
      roomCells = circleCells(cx, cy, r, width, height);
      vectorShape = { type: "circle", cx, cy, r };
    } else if (config.shape === "polygonal") {
      const cx = rect.x + rect.w / 2;
      const cy = rect.y + rect.h / 2;
      const avgRadius = Math.min(rect.w, rect.h) / 2;
      const points = polygonPoints(cx, cy, avgRadius);
      roomCells = polygonCells(points, width, height);
      vectorShape = { type: "polygon", points };
    } else {
      roomCells = rectCells(rect);
      if (config.shape === "organic") roomCells = organicize(roomCells, width, height);
    }

    // Sicurezza: forme piccole/rasterizzate ai bordi possono produrre celle scollegate
    // (es. un cerchio minuscolo con angoli solo diagonali) — stesso principio delle organiche.
    roomCells = largestConnectedComponent(roomCells);
    for (const [x, y] of roomCells) {
      if (cells[y]?.[x] !== undefined) cells[y][x] = "floor";
    }
    // L'ancora per i corridoi dev'essere una cella REALMENTE nella stanza: il centro
    // geometrico teorico potrebbe non farne più parte dopo rasterizzazione/erosione.
    const [anchorX, anchorY] = closestCellToCentroid(roomCells);
    return {
      id: index,
      label: String(index + 1),
      cells: roomCells,
      centerX: anchorX,
      centerY: anchorY,
      encounter: "",
      reward: "",
      vectorShape,
    };
  });

  const corridorStyle = config.corridorStyle ?? "straight";
  const edges = minimumSpanningEdges(rooms);
  for (const [a, b] of edges) carveCorridor(cells, rooms[a], rooms[b], corridorStyle);

  // qualche anello extra per rendere il dungeon meno lineare
  const extraLoops = Math.floor(rooms.length * 0.15);
  for (let i = 0; i < extraLoops && rooms.length > 2; i++) {
    const a = randInt(0, rooms.length - 1);
    const b = randInt(0, rooms.length - 1);
    if (a !== b) carveCorridor(cells, rooms[a], rooms[b], corridorStyle);
  }

  removeDeadEnds(cells, config.removeDeadends ?? "none");

  // porte: celle di corridoio adiacenti a una cella di stanza
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x] !== "corridor") continue;
      const neighbors: [number, number][] = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ];
      const touchesRoom = neighbors.some(([nx, ny]) => cells[ny]?.[nx] === "floor");
      if (touchesRoom && Math.random() < 0.5) cells[y][x] = "door";
    }
  }

  const stairsOption = config.stairs ?? "no";
  if (stairsOption !== "no" && rooms.length > 0) {
    const stairsCount = stairsOption === "many" ? Math.min(rooms.length, randInt(2, 3)) : 1;
    const roomOrder = [...rooms].sort(() => Math.random() - 0.5);
    for (let i = 0; i < stairsCount; i++) {
      const room = roomOrder[i % roomOrder.length];
      const [sx, sy] = room.cells[randInt(0, room.cells.length - 1)];
      rooms.push({
        id: rooms.length,
        label: stairsCount > 1 ? `🪜 Scale ${i + 1}` : "🪜 Scale",
        cells: [[sx, sy]],
        centerX: sx,
        centerY: sy,
        encounter: "",
        reward: "",
      });
    }
  }

  return { width, height, cells, rooms };
}
