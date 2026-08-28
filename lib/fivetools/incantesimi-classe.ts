/**
 * Da dove arrivano, per davvero, gli incantesimi di una classe.
 *
 * Il Compendio ne mostrava una sola fonte, la lista base di `spells/sources.json`. Ma un warlock
 * Lama Maledetta ha *scudo* al 1° livello e nel Compendio non c'era (segnalato dall'utente), e con
 * la Guida di Xanathar in tavola la lista del warlock cresce di trentasei incantesimi. Sono tre
 * canali diversi, che vanno tenuti distinti invece che mescolati: chi legge deve sapere se un
 * incantesimo ce l'ha sempre, se dipende dal manuale in uso o dalla sottoclasse che ha scelto.
 */

/** Un incantesimo con il canale da cui la classe lo ottiene. */
export interface IncantesimoDiClasse {
  name: string;
  /** fonte 5etools dell'incantesimo, quando la dichiara; altrimenti va risolta per nome */
  source?: string;
  origine: OrigineIncantesimo;
}

export type OrigineIncantesimo =
  | { tipo: "base" }
  | { tipo: "variante"; manuale: string }
  | { tipo: "sottoclasse"; nome: string };

interface VoceSources {
  class?: { name: string; source: string }[];
  classVariant?: { name: string; source: string; definedInSource?: string }[];
}

/**
 * Lista base e liste ampliate dai manuali successivi, da `spells/sources.json`.
 *
 * `classVariant` non è "roba opzionale da ignorare": è il modo in cui la Guida di Xanathar e il
 * Calderone di Tasha AGGIUNGONO incantesimi alla lista di una classe. Chi gioca con quei manuali
 * li ha davvero — vanno mostrati, dicendo da dove arrivano.
 */
export function incantesimiDaSources(
  file: Record<string, Record<string, VoceSources>>,
  classe: string,
  fonteClasse: string,
): IncantesimoDiClasse[] {
  const risultato: IncantesimoDiClasse[] = [];
  for (const [fonteIncantesimo, incantesimi] of Object.entries(file ?? {})) {
    for (const [nome, info] of Object.entries(incantesimi)) {
      const inLista = (info.class ?? []).some((c) => c.name === classe && c.source === fonteClasse);
      if (inLista) {
        risultato.push({ name: nome, source: fonteIncantesimo, origine: { tipo: "base" } });
        continue;
      }
      const variante = (info.classVariant ?? []).find(
        (c) => c.name === classe && c.source === fonteClasse,
      );
      if (variante) {
        risultato.push({
          name: nome,
          source: fonteIncantesimo,
          origine: { tipo: "variante", manuale: variante.definedInSource ?? fonteIncantesimo },
        });
      }
    }
  }
  return risultato;
}

interface Sottoclasse {
  name: string;
  className: string;
  classSource: string;
  source: string;
  additionalSpells?: BloccoIncantesimiAggiuntivi[];
}

/** I quattro modi in cui una sottoclasse concede incantesimi; il resto del blocco è metadato. */
type BloccoIncantesimiAggiuntivi = Partial<
  Record<"expanded" | "prepared" | "known" | "innate", Record<string, unknown>>
>;

const CANALI = ["expanded", "prepared", "known", "innate"] as const;

/**
 * Nomi degli incantesimi concessi da una sottoclasse.
 *
 * Le chiavi dei livelli hanno due significati diversi ("s1" = incantesimo di 1° livello, "1" =
 * ottenuto al 1° livello di classe): qui non si interpretano affatto, perché il livello vero si
 * legge poi dall'incantesimo stesso. Si raccolgono solo i NOMI, scartando le voci "scegline uno
 * dalla lista del mago", che non sono incantesimi precisi.
 */
export function incantesimiDiSottoclasse(sottoclasse: Sottoclasse): IncantesimoDiClasse[] {
  const trovati = new Map<string, IncantesimoDiClasse>();
  const origine: OrigineIncantesimo = { tipo: "sottoclasse", nome: sottoclasse.name };

  const raccogli = (valore: unknown): void => {
    if (typeof valore === "string") {
      // "shield", "aid|xphb", e anche "fire shield|" con la fonte lasciata vuota
      const [nome, fonte] = valore.split("|");
      const pulito = nome.trim();
      if (!pulito) return;
      trovati.set(`${pulito.toLowerCase()}|${fonte ?? ""}`, {
        name: pulito,
        source: fonte?.trim() ? fonte.trim().toUpperCase() : undefined,
        origine,
      });
      return;
    }
    if (Array.isArray(valore)) {
      for (const voce of valore) raccogli(voce);
      return;
    }
    // { choose: "level=1|class=Wizard" } non nomina un incantesimo: è una scelta, e non si può
    // elencare. { "_": [...] } invece è solo un livello di annidamento in più.
    if (valore && typeof valore === "object") {
      for (const [chiave, dentro] of Object.entries(valore as Record<string, unknown>)) {
        if (chiave === "choose" || chiave === "count" || chiave === "all") continue;
        raccogli(dentro);
      }
    }
  };

  for (const blocco of sottoclasse.additionalSpells ?? []) {
    for (const canale of CANALI) raccogli(blocco[canale]);
  }
  return [...trovati.values()];
}

/** Tutte le sottoclassi di una classe che concedono incantesimi, con i loro incantesimi. */
export function incantesimiDelleSottoclassi(
  sottoclassi: Sottoclasse[],
  classe: string,
  fonteClasse: string,
): { sottoclasse: string; fonte: string; incantesimi: IncantesimoDiClasse[] }[] {
  return sottoclassi
    .filter((s) => s.className === classe && s.classSource === fonteClasse)
    .map((s) => ({ sottoclasse: s.name, fonte: s.source, incantesimi: incantesimiDiSottoclasse(s) }))
    .filter((s) => s.incantesimi.length > 0);
}
