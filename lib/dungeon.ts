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

// Template area d'effetto (cerchio/cono/linea), stile Roll20: disegnato trascinando sulla mappa
// per vedere subito chi/cosa ci finisce dentro (es. una palla di fuoco), effimero — non
// persistito su database, solo un messaggio realtime che ogni client mostra per qualche secondo
// e poi lascia scadere (vedi VoiceChatPanel/template handling in app/campagne/page.tsx per lo
// stesso principio di "contenuto a bassa fiducia, nessuna scrittura sul server").
export type TemplateShape = "circle" | "cone" | "line";

export interface AoeTemplate {
  shape: TemplateShape;
  // Cella di origine (in unità di cella, es. 4.5 = centro della cella 4) — cerchio/cono partono
  // da qui, la linea la attraversa nella direzione di "angle".
  originX: number;
  originY: number;
  // Raggio (cerchio) o lunghezza (cono/linea) in celle — 1 cella = 5 piedi, stessa convenzione
  // già usata altrove nell'app per le distanze.
  size: number;
  // Direzione in radianti verso cui punta cono/linea (ignorato dal cerchio, simmetrico).
  angle: number;
}

const CONE_HALF_ANGLE = Math.PI / 6; // 60° totali, apertura standard dei coni in 5e
const LINE_HALF_WIDTH = 0.5; // una linea è larga 1 cella (5 piedi)

/** true se il centro della cella (x,y) ricade dentro il template — usato per capire chi viene
 * colpito da un'area d'effetto appena disegnata. */
export function pointInTemplate(template: AoeTemplate, x: number, y: number): boolean {
  const dx = x + 0.5 - template.originX;
  const dy = y + 0.5 - template.originY;
  const dist = Math.hypot(dx, dy);

  if (template.shape === "circle") return dist <= template.size;
  if (dist > template.size) return false;

  if (template.shape === "cone") {
    if (dist < 0.01) return true;
    const pointAngle = Math.atan2(dy, dx);
    let diff = Math.abs(pointAngle - template.angle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    return diff <= CONE_HALF_ANGLE;
  }

  // linea: proietta il punto sull'asse della linea (along) e sulla perpendicolare (across)
  const along = dx * Math.cos(template.angle) + dy * Math.sin(template.angle);
  const across = -dx * Math.sin(template.angle) + dy * Math.cos(template.angle);
  return along >= 0 && along <= template.size && Math.abs(across) <= LINE_HALF_WIDTH;
}

// Luce dinamica: raggio di visione automatica dai token giocatore, in celle (1 cella = 5 piedi).
// 12 celle = 60 piedi, il raggio di scurovisione standard 5e — un valore fisso ragionevole invece
// di una fonte di luce configurabile per stanza/oggetto (fuori scope, l'app non traccia torce o
// incantesimi di luce individuali).
export const DEFAULT_VISION_RADIUS = 12;

// Character.visioneRadius è in metri (stessa unità di "Velocità"), la griglia è in celle
// (1 cella = 5 piedi = 1,5m, stessa conversione già usata per Character.velocita altrove).
export function metersToCells(meters: number): number {
  return Math.round(meters / 1.5);
}

/** true se non c'è nessun muro lungo la linea retta fra le due celle (Bresenham) — stesso
 * criterio "wall = opaco, tutto il resto passa" già usato per fog of war/generazione. */
function hasLineOfSight(cells: CellType[][], fromX: number, fromY: number, toX: number, toY: number): boolean {
  let x0 = fromX;
  let y0 = fromY;
  const dx = Math.abs(toX - x0);
  const dy = Math.abs(toY - y0);
  const sx = x0 < toX ? 1 : -1;
  const sy = y0 < toY ? 1 : -1;
  let err = dx - dy;
  while (true) {
    if (x0 === toX && y0 === toY) return true;
    if (!(x0 === fromX && y0 === fromY) && cells[y0]?.[x0] === "wall") return false;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Unione delle celle visibili (linea di vista + raggio) da uno o più punti di origine — la
 * "luce dinamica" vera e propria: usata sia lato server (per non mandare al client dati di
 * celle/stanze/mostri fuori dalla visuale di nessun giocatore) sia lato client (per disegnare
 * l'oscurità). Volutamente semplice (raycasting per cella, non vero shadowcasting ricorsivo): per
 * le dimensioni di griglia di questo progetto (poche migliaia di celle) è già rapidissimo, ed
 * evita le sottigliezze di implementazione di un vero algoritmo di shadowcasting simmetrico.
 * Ogni origine può avere un raggio proprio (usato in "modalità realistica" per dare a ciascun
 * giocatore la SUA visione reale, vedi Character.visioneRadius) — se assente usa il fallback
 * fisso passato come secondo argomento. */
export function computeVisibleCells(
  cells: CellType[][],
  origins: { x: number; y: number; radius?: number }[],
  fallbackRadius: number = DEFAULT_VISION_RADIUS,
): Set<string> {
  const visible = new Set<string>();
  const height = cells.length;
  const width = cells[0]?.length ?? 0;
  for (const origin of origins) {
    const radius = origin.radius ?? fallbackRadius;
    const ox = Math.floor(origin.x);
    const oy = Math.floor(origin.y);
    const minX = Math.max(0, ox - radius);
    const maxX = Math.min(width - 1, ox + radius);
    const minY = Math.max(0, oy - radius);
    const maxY = Math.min(height - 1, oy + radius);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = `${x},${y}`;
        if (visible.has(key)) continue;
        if (Math.hypot(x - ox, y - oy) > radius) continue;
        if (hasLineOfSight(cells, ox, oy, x, y)) visible.add(key);
      }
    }
  }
  return visible;
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

// --- Generatore procedurale di scene esterne (stessa griglia/celle del dungeon, tema diverso) ---

export type OutdoorBiome = "bosco" | "palude" | "pianura" | "rocciosa" | "costa";

export interface OutdoorConfig {
  width: number;
  height: number;
  biome: OutdoorBiome;
}

/** Fa crescere una chiazza organica da un seme, una cella alla volta verso un vicino libero —
 * stesso spirito di `organicize` sopra (contorno irregolare, non geometrico) ma qui si parte da
 * un singolo punto e si cresce solo in avanti, invece di erodere/far crescere un rettangolo. */
function growPatch(
  seedX: number,
  seedY: number,
  width: number,
  height: number,
  targetSize: number,
): [number, number][] {
  const set = new Set<string>([cellKey(seedX, seedY)]);
  const frontier: [number, number][] = [[seedX, seedY]];

  while (set.size < targetSize && frontier.length > 0) {
    const frontierIndex = randInt(0, frontier.length - 1);
    const [x, y] = frontier[frontierIndex];
    const candidates = (
      [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as [number, number][]
    ).filter(([nx, ny]) => nx >= 0 && ny >= 0 && nx < width && ny < height && !set.has(cellKey(nx, ny)));

    if (candidates.length === 0) {
      frontier.splice(frontierIndex, 1);
      continue;
    }
    const [nx, ny] = candidates[randInt(0, candidates.length - 1)];
    set.add(cellKey(nx, ny));
    frontier.push([nx, ny]);
  }

  return [...set].map((key) => key.split(",").map(Number) as [number, number]);
}

/** Riempie una fascia d'acqua lungo un bordo scelto a caso, con profondità che varia a random
 * walk cella per cella (stesso principio dei corridoi "vaganti" sopra) per una costa frastagliata
 * invece di una linea dritta. */
function carveCoast(cells: CellType[][], width: number, height: number) {
  const edge = (["top", "bottom", "left", "right"] as const)[randInt(0, 3)];
  const horizontal = edge === "left" || edge === "right";
  const length = horizontal ? height : width;
  const maxDepth = Math.max(3, Math.floor((horizontal ? width : height) * 0.35));

  let depth = randInt(Math.ceil(maxDepth * 0.5), maxDepth);
  for (let i = 0; i < length; i++) {
    depth = Math.max(2, Math.min(maxDepth, depth + randInt(-1, 1)));
    for (let d = 0; d < depth; d++) {
      if (horizontal) {
        const x = edge === "left" ? d : width - 1 - d;
        cells[i][x] = "water";
      } else {
        const y = edge === "top" ? d : height - 1 - d;
        cells[y][i] = "water";
      }
    }
  }
}

interface TerrainPatch {
  type: CellType;
  count: [number, number];
  size: [number, number];
}

interface BiomeProfile {
  base: CellType;
  patches: TerrainPatch[];
}

const BIOME_PROFILES: Record<OutdoorBiome, BiomeProfile> = {
  bosco: {
    base: "grass",
    patches: [
      { type: "tree", count: [5, 8], size: [15, 40] },
      { type: "water", count: [0, 1], size: [10, 25] },
      { type: "rock", count: [1, 3], size: [3, 8] },
    ],
  },
  palude: {
    base: "grass",
    patches: [
      { type: "water", count: [6, 10], size: [10, 30] },
      { type: "tree", count: [3, 5], size: [5, 12] },
    ],
  },
  pianura: {
    base: "grass",
    patches: [
      { type: "tree", count: [2, 4], size: [3, 8] },
      { type: "water", count: [0, 1], size: [8, 20] },
      { type: "rock", count: [0, 2], size: [2, 5] },
    ],
  },
  rocciosa: {
    base: "rock",
    patches: [
      { type: "grass", count: [4, 7], size: [10, 25] },
      { type: "water", count: [0, 1], size: [5, 15] },
    ],
  },
  costa: {
    base: "grass",
    patches: [
      { type: "rock", count: [2, 4], size: [3, 10] },
      { type: "tree", count: [1, 3], size: [3, 8] },
    ],
  },
};

/** Genera una scena esterna a tema (bioma): stessa griglia di celle del dungeon, nessuna stanza —
 * resta comunque modificabile a mano dopo, esattamente come una tela vuota, perché è salvata
 * negli stessi identici `cells`/`rooms` di `campaignDungeons`. */
export function generateOutdoorScene(config: OutdoorConfig): DungeonData {
  const { width, height, biome } = config;
  const profile = BIOME_PROFILES[biome];
  const cells: CellType[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => profile.base),
  );

  if (biome === "costa") carveCoast(cells, width, height);

  for (const patch of profile.patches) {
    const count = randInt(patch.count[0], patch.count[1]);
    for (let i = 0; i < count; i++) {
      const size = randInt(patch.size[0], patch.size[1]);
      const seedX = randInt(0, width - 1);
      const seedY = randInt(0, height - 1);
      const blob = growPatch(seedX, seedY, width, height, size);
      for (const [x, y] of blob) cells[y][x] = patch.type;
    }
  }

  return { width, height, cells, rooms: [] };
}
