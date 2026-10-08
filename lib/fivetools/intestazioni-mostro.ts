/**
 * Le righe d'intestazione di una scheda di mostro — vulnerabilità, resistenze e immunità ai danni,
 * immunità alle condizioni, sensi, linguaggi — scritte in italiano a partire dai dati di 5etools.
 *
 * Sono righe a vocabolario chiuso: tredici tipi di danno, quindici condizioni, quattro sensi. Il
 * manuale italiano le scrive con una formula fissa («fulmine, veleno; contundente, perforante e
 * tagliente da attacchi non magici»), quindi si possono ricostruire senza tradurre niente — come i
 * numeri, che si riprendono dall'originale invece di correggerli a occhio.
 *
 * Serve perché l'estrazione dai PDF queste righe le perde spesso: stanno in una colonna stretta,
 * fra le caratteristiche e i tratti, e bastava un titoletto letto male perché saltassero. In 250
 * schede mancavano resistenze o immunità (il Fantasma senza resistenze, i draghi senza l'immunità
 * al proprio soffio) e la scheda si apriva lo stesso, solo con una riga in meno.
 *
 * File senza dipendenze: lo usano gli script di scripts/ita-compendio, fuori da Next.
 */

/** Come scrive il manuale: quello dei Mostri del 2014 al singolare, i manuali dal 2021 al plurale. */
export type StileManuale = "2014" | "2021";

type Voce = string | { [chiave: string]: unknown };

const DANNI: Record<string, [singolare: string, plurale: string]> = {
  acid: ["acido", "acido"],
  bludgeoning: ["contundente", "contundenti"],
  cold: ["freddo", "freddo"],
  fire: ["fuoco", "fuoco"],
  force: ["forza", "forza"],
  lightning: ["fulmine", "fulmine"],
  necrotic: ["necrotico", "necrotici"],
  piercing: ["perforante", "perforanti"],
  poison: ["veleno", "veleno"],
  psychic: ["psichico", "psichici"],
  radiant: ["radioso", "radiosi"],
  slashing: ["tagliente", "taglienti"],
  thunder: ["tuono", "tuono"],
};

const CONDIZIONI: Record<string, string> = {
  blinded: "accecato",
  charmed: "affascinato",
  deafened: "assordato",
  exhaustion: "indebolimento",
  frightened: "spaventato",
  grappled: "afferrato",
  incapacitated: "incapacitato",
  invisible: "invisibile",
  paralyzed: "paralizzato",
  petrified: "pietrificato",
  poisoned: "avvelenato",
  prone: "prono",
  restrained: "trattenuto",
  stunned: "stordito",
  unconscious: "privo di sensi",
};

const SENSI: Record<string, string> = {
  blindsight: "vista cieca",
  darkvision: "scurovisione",
  tremorsense: "percezione tellurica",
  truesight: "vista pura",
};

const LINGUAGGI: Record<string, string> = {
  abyssal: "Abissale",
  aquan: "Aquan",
  auran: "Auran",
  celestial: "Celestiale",
  common: "Comune",
  "deep speech": "Gergo delle Profondità",
  draconic: "Draconico",
  druidic: "Druidico",
  dwarvish: "Nanico",
  elvish: "Elfico",
  giant: "Gigante",
  gnoll: "Gnoll",
  gnomish: "Gnomesco",
  goblin: "Goblin",
  halfling: "Halfling",
  ignan: "Ignan",
  infernal: "Infernale",
  orc: "Orchesco",
  primordial: "Primordiale",
  sahuagin: "Sahuagin",
  sylvan: "Silvano",
  terran: "Terran",
  undercommon: "Sottocomune",
};

/** Le note che 5etools attacca a un gruppo di danni, e come le scrive il manuale italiano. */
function notaInItaliano(nota: string, stile: StileManuale): string | null {
  const n = nota.toLowerCase().trim();
  if (/^from nonmagical (attacks|weapons)$/.test(n)) return "da attacchi non magici";
  if (n === "that is nonmagical") return stile === "2014" ? "non magico" : "non magici";
  // Le tre forme che seguono sono copiate dalle pagine dei manuali italiani, dove compaiono una
  // volta sola ciascuna (gli Addolorati, il Mastino d'Ombra, il Rakshasa).
  if (n === "while in dim light or darkness") return "mentre si trova in condizioni di luce fioca o oscurità";
  if (n === "from nonmagical attacks while in dim light or darkness") {
    return "da attacchi non magici quando si trova nell'oscurità o sotto una luce fioca";
  }
  if (n === "from magic weapons wielded by good creatures") return "da armi magiche impugnate da creature buone";
  if (/silvered/.test(n) && /nonmagical/.test(n)) return "da attacchi non magici con armi non argentate";
  if (/adamantine/.test(n) && /nonmagical/.test(n)) {
    return stile === "2014" ? "da attacchi non magici con armi non di adamantio" : "da attacchi non magici non adamantini";
  }
  return null;
}

const inOrdine = (voci: string[]) => [...voci].sort((a, b) => a.localeCompare(b, "it"));

/** «contundente, perforante e tagliente»: l'ultima voce di un gruppo con nota si lega con «e». */
function elenco(voci: string[]): string {
  if (voci.length < 2) return voci.join("");
  return `${voci.slice(0, -1).join(", ")} e ${voci[voci.length - 1]}`;
}

/**
 * Una riga di danni («resist», «immune», «vulnerable» di 5etools) in italiano. Restituisce null se
 * contiene una forma che non si sa scrivere (una nota libera, una condizione particolare): meglio
 * lasciare la riga com'è che inventarne il testo.
 */
export function danniInItaliano(campo: Voce[] | undefined, stile: StileManuale): string | null {
  if (!campo || campo.length === 0) return "";
  const forma = stile === "2014" ? 0 : 1;
  const semplici: string[] = [];
  const gruppi: string[] = [];
  for (const voce of campo) {
    if (typeof voce === "string") {
      if (!DANNI[voce]) return null;
      semplici.push(DANNI[voce][forma]);
      continue;
    }
    const tipi = (voce.resist ?? voce.immune ?? voce.vulnerable) as unknown;
    if (!Array.isArray(tipi) || tipi.some((t) => typeof t !== "string" || !DANNI[t])) return null;
    if (voce.preNote || voce.special) return null;
    const nota = typeof voce.note === "string" ? notaInItaliano(voce.note, stile) : null;
    if (!nota) return null;
    gruppi.push(`${elenco(inOrdine((tipi as string[]).map((t) => DANNI[t][forma])))} ${nota}`);
  }
  return [inOrdine(semplici).join(", "), ...gruppi].filter(Boolean).join("; ");
}

/** I tipi di danno nominati in una riga, in qualunque forma: serve a confrontare con l'italiano. */
export function tipiDiDanno(campo: Voce[] | undefined): string[] {
  const out = new Set<string>();
  const visita = (nodo: unknown) => {
    if (typeof nodo === "string") {
      if (DANNI[nodo]) out.add(nodo);
    } else if (Array.isArray(nodo)) nodo.forEach(visita);
    else if (nodo && typeof nodo === "object") {
      const o = nodo as Record<string, unknown>;
      for (const k of ["resist", "immune", "vulnerable"]) if (o[k]) visita(o[k]);
    }
  };
  visita(campo ?? []);
  return [...out];
}

/** La radice italiana di un tipo di danno, uguale al singolare e al plurale: «necrotic», «radios». */
export function radiceDanno(tipo: string): string {
  const [singolare, plurale] = DANNI[tipo] ?? ["", ""];
  let i = 0;
  while (i < singolare.length && singolare[i] === plurale[i]) i++;
  return singolare.slice(0, i);
}

export function condizioniInItaliano(campo: Voce[] | undefined): string | null {
  if (!campo || campo.length === 0) return "";
  const voci: string[] = [];
  for (const voce of campo) {
    if (typeof voce !== "string" || !CONDIZIONI[voce]) return null;
    voci.push(CONDIZIONI[voce]);
  }
  return inOrdine(voci).join(", ");
}

/** Le condizioni nominate, e la loro forma italiana. */
export function condizioniNominate(campo: Voce[] | undefined): { chiave: string; italiano: string }[] {
  return (campo ?? [])
    .filter((v): v is string => typeof v === "string" && Boolean(CONDIZIONI[v]))
    .map((chiave) => ({ chiave, italiano: CONDIZIONI[chiave] }));
}

/** I piedi dei manuali inglesi nei metri di quelli italiani: 1,5 metri ogni 5 piedi. */
function metri(piedi: number): string {
  return String(Math.round(piedi * 3) / 10).replace(".", ",");
}

/**
 * «Percezione passiva 13, scurovisione 36 m, vista cieca 9 m»: la Percezione passiva per prima e i
 * sensi in ordine alfabetico, come le schede già estratte bene.
 */
export function sensiInItaliano(sensi: string[] | undefined, passiva: number | string | undefined): string | null {
  const voci: string[] = [];
  for (const senso of sensi ?? []) {
    const m = senso.trim().match(/^(blindsight|darkvision|tremorsense|truesight) (\d+) ft\.?( \(blind beyond this radius\))?$/i);
    if (!m) return null;
    voci.push(`${SENSI[m[1].toLowerCase()]} ${metri(Number(m[2]))} m${m[3] ? " (cieco oltre questo raggio)" : ""}`);
  }
  if (passiva === undefined || passiva === null || Number.isNaN(Number(passiva))) return null;
  return [`Percezione passiva ${Number(passiva)}`, ...inOrdine(voci)].join(", ");
}

/** I sensi attesi come coppie «nome + metri»: per controllare che l'italiano li abbia tutti. */
export function sensiAttesi(sensi: string[] | undefined): string[] | null {
  const out: string[] = [];
  for (const senso of sensi ?? []) {
    const m = senso.trim().match(/^(blindsight|darkvision|tremorsense|truesight) (\d+) ft\.?/i);
    if (!m) return null;
    out.push(`${SENSI[m[1].toLowerCase()]} ${metri(Number(m[2]))} m`);
  }
  return out;
}

/**
 * I linguaggi, solo quando sono un elenco di nomi noti (più la telepatia): «capisce il Comune ma
 * non lo parla» e le altre forme libere il manuale le scrive in tanti modi, e qui restano null.
 */
export function linguaggiInItaliano(linguaggi: string[] | undefined): string | null {
  if (!linguaggi || linguaggi.length === 0) return "";
  const voci: string[] = [];
  let telepatia: string | null = null;
  for (const voce of linguaggi) {
    const t = voce.trim().match(/^telepathy (\d+) ft\.?$/i);
    if (t) {
      telepatia = `telepatia ${metri(Number(t[1]))} m`;
      continue;
    }
    const nome = LINGUAGGI[voce.trim().toLowerCase()];
    if (!nome) return null;
    voci.push(nome);
  }
  return [...inOrdine(voci), ...(telepatia ? [telepatia] : [])].join(", ");
}
