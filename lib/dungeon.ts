// Generatore procedurale di dungeon (ispirato a donjon.bin.sh/d20/dungeon/): stanze piazzate
// su una griglia, connesse da corridoi via albero ricoprente minimo + qualche anello extra.
// "Organiche" erode/fa crescere il bordo delle stanze rettangolari per un look meno geometrico
// (stesso motore a griglia di donjon, non una geometria vettoriale separata).

export type CellType = "wall" | "floor" | "door" | "corridor";
export type RoomShape = "rectangular" | "organic";

export interface DungeonRoom {
  id: number;
  label: string;
  cells: [number, number][];
  centerX: number;
  centerY: number;
  encounter: string;
  reward: string;
}

export interface DungeonData {
  width: number;
  height: number;
  cells: CellType[][];
  rooms: DungeonRoom[];
}

export interface DungeonConfig {
  minRooms: number;
  maxRooms: number;
  shape: RoomShape;
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

function carveCorridor(
  cells: CellType[][],
  from: { centerX: number; centerY: number },
  to: { centerX: number; centerY: number },
) {
  let [x, y] = [Math.round(from.centerX), Math.round(from.centerY)];
  const targetX = Math.round(to.centerX);
  const targetY = Math.round(to.centerY);
  const carve = (cx: number, cy: number) => {
    if (cells[cy]?.[cx] === "wall") cells[cy][cx] = "corridor";
  };
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
}

export function generateDungeon(config: DungeonConfig): DungeonData {
  const roomCount = randInt(config.minRooms, config.maxRooms);
  const gridSize = Math.ceil(Math.sqrt(roomCount)) * 9 + 6;
  const width = gridSize;
  const height = gridSize;

  const cells: CellType[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "wall" as CellType),
  );

  const placed: Rect[] = [];
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

  const rooms: DungeonRoom[] = placed.map((rect, index) => {
    let roomCells = rectCells(rect);
    if (config.shape === "organic") roomCells = organicize(roomCells, width, height);
    for (const [x, y] of roomCells) {
      if (cells[y]?.[x] !== undefined) cells[y][x] = "floor";
    }
    // L'ancora per i corridoi dev'essere una cella REALMENTE nella stanza: dopo l'erosione
    // organica il centro geometrico originale potrebbe non farne più parte (o essere fuori
    // dalla forma, se non convessa), lasciando il corridoio scollegato dalla stanza.
    const [anchorX, anchorY] = closestCellToCentroid(roomCells);
    return {
      id: index,
      label: String(index + 1),
      cells: roomCells,
      centerX: anchorX,
      centerY: anchorY,
      encounter: "",
      reward: "",
    };
  });

  const edges = minimumSpanningEdges(rooms);
  for (const [a, b] of edges) carveCorridor(cells, rooms[a], rooms[b]);

  // qualche anello extra per rendere il dungeon meno lineare
  const extraLoops = Math.floor(rooms.length * 0.15);
  for (let i = 0; i < extraLoops && rooms.length > 2; i++) {
    const a = randInt(0, rooms.length - 1);
    const b = randInt(0, rooms.length - 1);
    if (a !== b) carveCorridor(cells, rooms[a], rooms[b]);
  }

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

  return { width, height, cells, rooms };
}
