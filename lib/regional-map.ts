// Editor di mappe regionali (mondo/regione, non il singolo dungeon): dipingi il terreno cella
// per cella su una griglia e piazza marcatori (città, punti d'interesse) con etichetta e icona.
// Ispirato al concetto generale di un editor di mappe fantasy (terreno + icone + etichette) —
// codice, dati e assets tutti nostri, nessuna dipendenza o asset di terze parti.

export type TerrainType =
  | "vuoto"
  | "acqua"
  | "foresta"
  | "montagna"
  | "collina"
  | "pianura"
  | "deserto"
  | "palude"
  | "neve"
  | "strada";

export const TERRAIN_TYPES: TerrainType[] = [
  "vuoto",
  "pianura",
  "foresta",
  "collina",
  "montagna",
  "acqua",
  "palude",
  "deserto",
  "neve",
  "strada",
];

export const TERRAIN_LABELS: Record<TerrainType, string> = {
  vuoto: "Vuoto",
  acqua: "Acqua",
  foresta: "Foresta",
  montagna: "Montagna",
  collina: "Collina",
  pianura: "Pianura",
  deserto: "Deserto",
  palude: "Palude",
  neve: "Neve",
  strada: "Strada",
};

/** Colori piatti per il rendering a griglia (nessuna texture/immagine esterna). */
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  vuoto: "#26241f",
  acqua: "#2b5d7a",
  foresta: "#2f5233",
  montagna: "#6b6459",
  collina: "#7a8a4f",
  pianura: "#a3b06b",
  deserto: "#c9a86a",
  palude: "#4a5a3a",
  neve: "#e8ecec",
  strada: "#9c8663",
};

export interface RegionalMarker {
  id: number;
  x: number;
  y: number;
  label: string;
  icona: string;
  nota: string;
}

export interface RegionalMapData {
  width: number;
  height: number;
  cells: TerrainType[][];
  markers: RegionalMarker[];
}

export const MARKER_ICONS = [
  "🏰", "🏘️", "⛺", "⚔️", "💀", "⭐", "🗿", "⛰️", "🌋", "🏛️", "⚓", "🐉", "🕳️", "🌲",
] as const;
