import { abilityModifier, formatModifier } from "@/lib/dnd";
import type { RawCreature } from "./data";
import { flattenEntries } from "./entries";
import {
  formatAC,
  formatChallengeRating,
  formatCreatureType,
  formatHP,
  formatSize,
  formatSpeed,
} from "./format";

/**
 * Riduce una creatura del Compendio a testo semplice, nel formato che il master legge al tavolo.
 *
 * Serve al Compendio homebrew della campagna (components/campagne/homebrew.tsx), che conserva la
 * descrizione come `text` e non come struttura: importando un mostro se ne ottiene una scheda
 * già scritta, che il master può poi modificare — un troll con più punti ferita, un'aggiunta
 * inventata — invece di ricopiarla a mano dal Compendio.
 */
export function descrizioneCreatura(creature: RawCreature): string {
  const blocchi: string[] = [];

  const identita = [formatSize(creature.size), formatCreatureType(creature.type)]
    .filter(Boolean)
    .join(" ");
  const testata = [
    identita,
    `CA ${formatAC(creature.ac)}`,
    `PF ${formatHP(creature.hp)}`,
    `velocità ${formatSpeed(creature.speed, "it")}`,
    creature.cr != null ? `Sfida ${formatChallengeRating(creature.cr)}` : "",
  ].filter(Boolean);
  blocchi.push(testata.join(" · "));

  const caratteristiche = (
    [
      ["FOR", creature.str],
      ["DES", creature.dex],
      ["COS", creature.con],
      ["INT", creature.int],
      ["SAG", creature.wis],
      ["CAR", creature.cha],
    ] as const
  )
    .map(([sigla, valore]) => `${sigla} ${valore} (${formatModifier(abilityModifier(valore))})`)
    .join(" · ");
  blocchi.push(caratteristiche);

  const percezione = creature.passive != null ? `percezione passiva ${creature.passive}` : "";
  const sensi = [...(creature.senses ?? []), percezione].filter(Boolean).join(", ");
  if (sensi) blocchi.push(`SENSI — ${sensi}`);
  if (creature.languages?.length) blocchi.push(`LINGUAGGI — ${creature.languages.join(", ")}`);

  // Tratti e azioni con la stessa forma "NOME. testo" della scheda stampata: entries annidate
  // (elenchi, sotto-voci) vengono appiattite in righe, come già fa il resto dell'app.
  const sezioni = [
    ["", creature.trait],
    ["AZIONI", creature.action],
    ["AZIONI BONUS", creature.bonus],
    ["REAZIONI", creature.reaction],
    ["AZIONI LEGGENDARIE", creature.legendary],
  ] as const;

  for (const [titolo, voci] of sezioni) {
    if (!voci?.length) continue;
    const righe = voci.map((v) => `${v.name}. ${flattenEntries(v.entries).join(" ")}`.trim());
    blocchi.push(titolo ? [titolo, ...righe].join("\n") : righe.join("\n"));
  }

  return blocchi.join("\n\n");
}
