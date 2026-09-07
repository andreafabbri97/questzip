import {
  loadBackgrounds,
  loadClassChoices,
  loadClassData,
  loadConditions,
  loadCreatures,
  loadFeats,
  loadInventoryItems,
  loadRaces,
  loadSpells,
  type CompendiumKind,
} from "@/lib/fivetools/data";
import type { Entry } from "@/lib/fivetools/compendio-detail";

/**
 * Categorie del Compendio e loro caricatori.
 *
 * Stanno qui e non dentro la pagina perché servono in due posti: il Compendio vero e proprio e la
 * pagina di una voce condivisa (app/compendio/condivisa), che è pubblica e deve saper aprire una
 * voce di qualunque categoria partendo solo dai parametri del link.
 */
export const COMPENDIO_TABS: {
  id: string;
  kind: CompendiumKind;
  label: string;
  icon: string;
  itemFilter?: "magici" | "comuni";
}[] = [
  { id: "incantesimi", kind: "incantesimi", label: "Incantesimi", icon: "✨" },
  { id: "mostri", kind: "mostri", label: "Mostri", icon: "🐉" },
  { id: "oggetti-magici", kind: "oggetti", label: "Oggetti magici", icon: "💍", itemFilter: "magici" },
  { id: "oggetti-comuni", kind: "oggetti", label: "Oggetti comuni", icon: "🎒", itemFilter: "comuni" },
  { id: "razze", kind: "razze", label: "Razze", icon: "🧝" },
  { id: "talenti", kind: "talenti", label: "Talenti", icon: "🏅" },
  { id: "background", kind: "background", label: "Background", icon: "📜" },
  { id: "condizioni", kind: "condizioni", label: "Condizioni", icon: "☠️" },
  { id: "classi", kind: "classi", label: "Classi", icon: "⚔️" },
  { id: "scelte-classe", kind: "scelteClasse", label: "Scelte di classe", icon: "🔮" },
];

export const COMPENDIO_LOADERS: Record<CompendiumKind, () => Promise<Entry[]>> = {
  incantesimi: loadSpells,
  mostri: loadCreatures,
  oggetti: loadInventoryItems,
  razze: loadRaces,
  talenti: loadFeats,
  background: loadBackgrounds,
  condizioni: loadConditions,
  classi: () => loadClassData().then((data) => data.classes),
  scelteClasse: loadClassChoices,
};
