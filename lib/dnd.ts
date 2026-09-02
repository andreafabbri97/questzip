import { z } from "zod";
import {
  ALIGNMENTS,
  CONDIZIONI_5E,
  DAMAGE_TYPES,
  FULL_CASTER_SLOTS,
  LANGUAGES,
  LIVELLO_FOLLIA_EFFETTI,
  PACT_MAGIC,
  POINT_BUY_COST,
  SKILLS,
  XP_BY_CR,
  XP_THRESHOLDS,
} from "./dnd-tables";

/** Tetto dei punti ispirazione: quattro, come le caselle della scheda ufficiale in PDF. */
export const MAX_ISPIRAZIONE = 4;

// Tabelle pure spostate in dnd-tables.ts per dimensione del file — ri-esportate qui così tutti i
// call site esistenti (`import { SKILLS } from "@/lib/dnd"`) restano validi senza modifiche.
export {
  ALIGNMENTS,
  CONDIZIONI_5E,
  DAMAGE_TYPES,
  LANGUAGES,
  LIVELLO_FOLLIA_EFFETTI,
  POINT_BUY_COST,
  SKILLS,
  XP_BY_CR,
};

export const ABILITIES = [
  "forza",
  "destrezza",
  "costituzione",
  "intelligenza",
  "saggezza",
  "carisma",
] as const;

export type Ability = (typeof ABILITIES)[number];

export const ABILITY_LABELS: Record<Ability, string> = {
  forza: "Forza",
  destrezza: "Destrezza",
  costituzione: "Costituzione",
  intelligenza: "Intelligenza",
  saggezza: "Saggezza",
  carisma: "Carisma",
};

/** Mappa i codici a 3 lettere di 5etools (str/dex/con/int/wis/cha) alle nostre chiavi in italiano. */
export const ABILITY_CODE_TO_KEY: Record<string, Ability> = {
  str: "forza",
  dex: "destrezza",
  con: "costituzione",
  int: "intelligenza",
  wis: "saggezza",
  cha: "carisma",
};

export const abilityScoresSchema = z.object({
  forza: z.number().int().min(1).max(30),
  destrezza: z.number().int().min(1).max(30),
  costituzione: z.number().int().min(1).max(30),
  intelligenza: z.number().int().min(1).max(30),
  saggezza: z.number().int().min(1).max(30),
  carisma: z.number().int().min(1).max(30),
});

export type AbilityScores = z.infer<typeof abilityScoresSchema>;

export const classEntrySchema = z.object({
  nome: z.string(),
  livello: z.number().int().min(1).max(20),
  sottoclasse: z.string().optional(),
});

export type ClassEntry = z.infer<typeof classEntrySchema>;

export const inventoryItemSchema = z.object({
  id: z.string(),
  nome: z.string(),
  quantita: z.number().int().min(1).default(1),
  note: z.string().default(""),
  // Peso per singola unità in kg (moltiplicato per quantita per il peso totale della riga) —
  // 0 di default, un oggetto senza peso specificato non conta nell'ingombro invece di far
  // sembrare il personaggio sovraccarico per un dato mai compilato.
  peso: z.number().min(0).default(0),
});
export type InventoryItem = z.infer<typeof inventoryItemSchema>;

export const knownSpellSchema = z.object({
  id: z.string(),
  nome: z.string(),
  livello: z.number().int().min(0).max(9).default(0),
  preparato: z.boolean().default(false),
  // Dado danno facoltativo (es. "8d6" per Palla di Fuoco) — stesso formato libero "NdM" del campo
  // analogo sulle armi, compilato a mano perché varia troppo per incantesimo/livello per essere
  // derivato in automatico. Vuoto di default: mostra il bottone 🎲 Danno solo se compilato.
  dadoDanno: z.string().default(""),
});
export type KnownSpell = z.infer<typeof knownSpellSchema>;

export const weaponSchema = z.object({
  id: z.string(),
  nome: z.string(),
  // Non solo Forza/Destrezza: alcune sottoclassi attaccano in mischia con un'altra
  // caratteristica (es. Cavaliere Eldritch/Artefice-Fabbro da Battaglia con Intelligenza,
  // Maledizione dello Spadaccino Warlock con Carisma) — coperte tutte e sei, più "finezza" per
  // l'arma con proprietà Finezza (il migliore tra Forza e Destrezza, il caso più comune).
  caratteristica: z.enum([...ABILITIES, "finezza"]).default("forza"),
  competente: z.boolean().default(true),
  bonusExtra: z.number().int().default(0),
  dadoDanno: z.string().default("1d6"),
  tipoDanno: z.string().default(""),
  aDistanza: z.boolean().default(false),
});
export type Weapon = z.infer<typeof weaponSchema>;

// Privilegio/tratto a usi limitati (es. Rabbia 3/riposo lungo, Canalizzare Divinità 1/riposo
// breve) — sulla scheda cartacea di riferimento dell'utente è una tabella con nome/ricarica/
// totale/usi, la domanda più comune al tavolo ("quante Rabbie mi restano?") altrimenti risolta
// solo tenendo il conto a mente o su un foglio a parte.
export const RECUPERO_OPTIONS = ["riposoBreve", "riposoLungo", "alba"] as const;
export const RECUPERO_LABELS: Record<(typeof RECUPERO_OPTIONS)[number], string> = {
  riposoBreve: "Riposo breve",
  riposoLungo: "Riposo lungo",
  alba: "Alba",
};
export const limitedFeatureSchema = z.object({
  id: z.string(),
  nome: z.string(),
  usiMax: z.number().int().min(1).default(1),
  usiUsati: z.number().int().min(0).default(0),
  recupero: z.enum(RECUPERO_OPTIONS).default("riposoLungo"),
});
export type LimitedFeature = z.infer<typeof limitedFeatureSchema>;

export const knownFeatSchema = z.object({
  id: z.string(),
  nome: z.string(),
});
export type KnownFeat = z.infer<typeof knownFeatSchema>;

// Oggetto magico posseduto — "armonizzato" è una spunta per riga (non più un tetto fisso a 3 sulla
// lunghezza dell'elenco): il limite RAW di 3 oggetti sintonizzati contemporaneamente è mostrato
// come promemoria nella UI ma non blocca più l'aggiunta, perché alcune classi/privilegi (es.
// l'invocazione occulta Patto della Catena non c'entra, ma il Fabbro da Battaglia o certi oggetti
// come l'Anello di Sintonia Spirituale aumentano il tetto) lo alzano legittimamente.
export const magicItemSchema = z.object({
  id: z.string(),
  nome: z.string(),
  armonizzato: z.boolean().default(true),
});
export type MagicItem = z.infer<typeof magicItemSchema>;

const rawCharacterSchema = z.object({
  id: z.string(),
  nome: z.string().min(1),
  classi: z.array(classEntrySchema).min(1),
  razza: z.string(),
  hpMax: z.number().int().min(1),
  hpAttuali: z.number().int(),
  hpTemporanei: z.number().int().min(0).default(0),
  classeArmatura: z.number().int().min(1),
  velocita: z.number().int().min(0),
  // Iniziativa e percezione passiva sono normalmente calcolate dal vivo dalle caratteristiche
  // (Destrezza / Saggezza+competenza), quindi restano sempre corrette dopo un level-up o un
  // aumento di caratteristica — questi due campi sono solo un BONUS aggiuntivo sommato al
  // calcolo, per talenti/oggetti che lo modificano direttamente (es. Allerta: +5 all'iniziativa,
  // Attento: +5 alla percezione passiva), stesso principio di "bonusExtra" sulle armi.
  iniziativaBonus: z.number().int().default(0),
  percezionePassivaBonus: z.number().int().default(0),
  // Stesso principio: CD/Bonus attacco degli incantesimi erano SOLO calcolati (Caratteristica +
  // Competenza), senza modo di aggiustarli per un talento/oggetto che li tocca direttamente (es.
  // un oggetto che dà +1 alla CD dei tiri salvezza dei propri incantesimi) — segnalato dall'utente
  // ("voglio che siano editabili come tutti gli altri numeri della scheda").
  cdIncantesimiBonus: z.number().int().default(0),
  attaccoIncantesimiBonus: z.number().int().default(0),
  // Raggio di visione in metri — suggerito dalla scurovisione della razza (via Compendio) ma
  // sempre modificabile a mano, per restare valido anche quando non deriva dalla razza (talenti,
  // incantesimi, invocazioni). Si applica solo se "scurovisione" è spuntata: il numero da solo
  // non basta, per poter tenere il valore compilato (es. il 60 piedi/18m tipico della propria
  // razza) anche per un personaggio che per qualche motivo non ce l'ha davvero.
  visioneRadius: z.number().int().min(0).default(0),
  scurovisione: z.boolean().default(false),
  // Vista Infernale del Warlock e simili: scurovisione che funziona anche nell'oscurità
  // magica (che normalmente la blocca, per regolamento) — oggi solo un dato di scheda, la mappa
  // dungeon non modella ancora zone di oscurità magica separate da quella normale.
  vedeOscuritaMagica: z.boolean().default(false),
  caratteristiche: abilityScoresSchema,
  trsCompetenti: z.array(z.enum(ABILITIES)).default([]),
  abilitaCompetenti: z.array(z.string()).default([]),
  abilitaEsperte: z.array(z.string()).default([]),
  // Bonus extra per singolo tiro salvezza/abilità (chiave = nome caratteristica o abilità), stesso
  // principio di iniziativaBonus/percezionePassivaBonus sopra ma per riga invece che un unico
  // valore: il calcolo RAW (mod. caratteristica + competenza) resta sempre corretto da solo dopo
  // un level up, questo è solo ciò che un oggetto magico/talento aggiunge sopra (es. Manto della
  // Protezione: +1 a tutti i tiri salvezza). Chiavi assenti = 0, nessuna voce per il caso comune
  // "nessun bonus" invece di dover inizializzare tutte le 6+18 chiavi a 0.
  trsBonus: z.record(z.string(), z.number().int()).default({}),
  abilitaBonus: z.record(z.string(), z.number().int()).default({}),
  slotUsati: z.array(z.number().int().min(0)).length(9).default([0, 0, 0, 0, 0, 0, 0, 0, 0]),
  slotPattoUsati: z.number().int().min(0).default(0),
  tiriMorteSuccessi: z.number().int().min(0).max(3).default(0),
  tiriMorteFallimenti: z.number().int().min(0).max(3).default(0),
  esperienza: z.number().int().min(0).default(0),
  allineamento: z.string().default(""),
  background: z.string().default(""),
  tratti: z.string().default(""),
  legami: z.string().default(""),
  ideali: z.string().default(""),
  difetti: z.string().default(""),
  nemici: z.string().default(""),
  // Aspetto fisico — presente sulla scheda cartacea di riferimento (pagina 2, riquadro insieme
  // al ritratto), qui campi tutti testo libero (l'età di un elfo o un non-morto non è sempre un
  // numero) invece di forzare un formato specifico.
  eta: z.string().default(""),
  altezza: z.string().default(""),
  peso: z.string().default(""),
  occhi: z.string().default(""),
  carnagione: z.string().default(""),
  capelli: z.string().default(""),
  ritrattoUrl: z.string().default(""),
  /**
   * Punti ispirazione, da 0 a 4 (richiesta dell'utente: al suo tavolo se ne accumulano più d'uno,
   * e la scheda ufficiale in PDF ha infatti quattro caselle).
   *
   * Era un sì/no: le schede già salvate — in localStorage, nel backup sull'account e negli scatti
   * condivisi con la campagna — hanno ancora `true`/`false` lì dentro, quindi si accettano
   * entrambe le forme e il booleano diventa un punto solo.
   */
  ispirazione: z
    .union([z.boolean(), z.number()])
    .transform((v) => (typeof v === "boolean" ? (v ? 1 : 0) : Math.max(0, Math.min(MAX_ISPIRAZIONE, Math.trunc(v)))))
    .default(0),
  // Dadi vita TOTALI derivano dal livello di classe (totalLevel), qui serve solo tenere il conto
  // di quanti sono già stati spesi (si spendono ai riposi brevi, si recuperano — metà del totale,
  // arrotondato per eccesso — a un riposo lungo).
  dadiVitaUsati: z.number().int().min(0).default(0),
  // Livelli di esaurimento RAW (0-6, il 6° è la morte) — oggi finiva genericamente nelle
  // "condizioni attive" come voce di testo, senza un contatore numerico dedicato.
  affaticamento: z.number().int().min(0).max(6).default(0),
  // Meccanica homebrew specifica della campagna dell'utente (non RAW) — tetto e testo degli
  // effetti presi dalla tabella "Livelli di Follia" fornita direttamente dall'utente, vedi
  // LIVELLO_FOLLIA_EFFETTI più sotto.
  livelloFollia: z.number().int().min(0).max(6).default(0),
  oggettiMagici: z.array(magicItemSchema).default([]),
  privilegiLimitati: z.array(limitedFeatureSchema).default([]),
  // Peso massimo trasportabile in kg — suggerito da Forza×7,5 (vedi carryingCapacityKg) ma
  // sempre un campo modificabile a mano, mai ricalcolato in automatico ad ogni variazione di
  // Forza: un giocatore potrebbe volerlo scostare dal suggerimento (talento, oggetto magico,
  // house rule) senza vederselo silenziosamente sovrascritto alla prima modifica successiva.
  pesoMassimo: z.number().min(0).default(0),
  linguaggi: z.array(z.string()).default([]),
  resistenze: z.array(z.string()).default([]),
  immunita: z.array(z.string()).default([]),
  vulnerabilita: z.array(z.string()).default([]),
  condizioniAttive: z.array(z.string()).default([]),
  inventario: z.array(inventoryItemSchema).default([]),
  monete: z
    .object({
      oro: z.number().int().min(0).default(0),
      argento: z.number().int().min(0).default(0),
      rame: z.number().int().min(0).default(0),
    })
    .default({ oro: 0, argento: 0, rame: 0 }),
  incantesimi: z.array(knownSpellSchema).default([]),
  armi: z.array(weaponSchema).default([]),
  talenti: z.array(knownFeatSchema).default([]),
  // Infusioni conosciute (privilegio "Infondere Oggetto" dell'Artefice) — stesso identico formato
  // di "talenti" (solo nome), mostrate in UI solo se il personaggio ha almeno un livello da
  // Artefice fra le proprie classi.
  infusioniConosciute: z.array(knownFeatSchema).default([]),
  // Scelte opzionali di classe (suppliche occulte/voto del patto del Warlock, stile di
  // combattimento di Guerriero/Paladino/Ranger/Bardo, metamagia dello Stregone...) — stesso
  // formato di "talenti", un'unica lista non differenziata per tipo: un personaggio multiclasse
  // (es. Warlock/Guerriero) le vede semplicemente tutte insieme in una sola sezione "Scelte di
  // classe", mostrata solo se almeno una delle classi del personaggio ne ha di disponibili (vedi
  // CLASS_OPTIONAL_FEATURE_TYPES in lib/fivetools/data.ts).
  scelteClasse: z.array(knownFeatSchema).default([]),
  note: z.string().default(""),
  // Timestamp (epoch ms) dell'ultima modifica — non mostrato in UI, serve solo al backup su
  // account (vedi app/actions/character-sync.ts) per capire, fra la copia locale e quella sul
  // server, quale delle due è la più recente in caso di modifiche fatte da due dispositivi.
  aggiornatoAl: z.number().default(() => Date.now()),
});

/**
 * Migrazione in lettura per personaggi salvati PRIMA che "oggettiArmonizzati" (string[], tetto
 * fisso a 3) diventasse "oggettiMagici" (MagicItem[], spunta di armonizzazione per riga, nessun
 * tetto) — senza questo passaggio i vecchi oggetti armonizzati sparirebbero silenziosamente alla
 * prima apertura di una scheda esistente, semplicemente perché il campo col vecchio nome non è
 * più definito nello schema e "oggettiMagici" partirebbe vuoto per default.
 */
export const characterSchema = z.preprocess((raw) => {
  if (raw && typeof raw === "object" && !("oggettiMagici" in raw) && "oggettiArmonizzati" in raw) {
    const obj = raw as Record<string, unknown>;
    const legacy = Array.isArray(obj.oggettiArmonizzati) ? (obj.oggettiArmonizzati as unknown[]) : [];
    return {
      ...obj,
      oggettiMagici: legacy
        .filter((nome): nome is string => typeof nome === "string")
        .map((nome) => ({ id: crypto.randomUUID(), nome, armonizzato: true })),
    };
  }
  return raw;
}, rawCharacterSchema);

export type Character = z.infer<typeof characterSchema>;

/**
 * Normalizza una scheda che arriva dal DATABASE (il backup sull'account, vedi
 * app/actions/character-sync.ts). Le copie in localStorage passano gia' dallo schema
 * (lib/storage.ts), quelle remote no: una riga salvata da una versione precedente dell'app —
 * o da un altro dispositivo — puo' non avere un campo aggiunto dopo, e la scheda arrivava al
 * componente com'era, facendo saltare la pagina al primo accesso a quel campo (successo con
 * "dadoDanno" degli incantesimi, letto con .trim() nella scheda Incantesimi).
 *
 * Se la riga e' irrecuperabile si restituisce il dato grezzo invece di perdere la scheda: e'
 * il comportamento che c'era prima, e un backup malformato resta comunque meglio di niente.
 */
export function parseCharacterRemoto(raw: unknown): Character {
  const parsed = characterSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as Character);
}

export function totalLevel(classi: ClassEntry[]): number {
  return classi.reduce((sum, entry) => sum + entry.livello, 0);
}

/** Punti esperienza richiesti per raggiungere ciascun livello (1-20), regole standard 5e. */
export const XP_PER_LEVEL = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000,
  165000, 195000, 225000, 265000, 305000, 355000,
];

/** Livello corrispondente a un totale di XP (1-20). */
export function levelForXp(xp: number): number {
  let level = 1;
  for (let i = 0; i < XP_PER_LEVEL.length; i++) {
    if (xp >= XP_PER_LEVEL[i]) level = i + 1;
  }
  return level;
}

/** XP richiesti per il prossimo livello, o null se già al livello 20 (massimo). */
export function xpForNextLevel(level: number): number | null {
  return level >= 20 ? null : XP_PER_LEVEL[level];
}

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatModifier(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

export function proficiencyBonus(level: number): number {
  // Le regole RAW non vanno oltre livello 20 — l'editor di classi limita ogni singola classe a
  // max 20 (vedi ClassRow in components/personaggi/classes-leveling.tsx) ma non la SOMMA in multiclasse, quindi un
  // totale più alto è raggiungibile. Stesso approccio già usato per gli slot incantesimo
  // (FULL_CASTER_SLOTS): oltre il tetto si resta fermi al valore di livello 20, non si estrapola.
  return 2 + Math.floor((Math.min(20, level) - 1) / 4);
}

// Capacità di carico in kg = Forza × 7,5 (valore indicato dall'utente per la sua campagna,
// leggermente diverso dall'arrotondamento RAW più comune) — solo un SUGGERIMENTO mostrato in UI,
// il campo pesoMassimo resta sempre modificabile a mano.
export function carryingCapacityKg(forza: number): number {
  return Math.round(forza * 7.5);
}

// Stessa conversione già usata altrove nel Compendio per le distanze (1,5m ogni 5 piedi) — il
// dato di scurovisione del Compendio (RawRace.darkvision) arriva in piedi, qui serve in metri
// per essere coerente con "Velocità (m)" già presente in scheda.
export function feetToMeters(feet: number): number {
  // Arrotondato al mezzo metro, non al metro intero: 25 piedi sono 7,5 m (non 8) e 15 piedi 4,5 m
  // (non 5). Oggi è chiamata solo su scurovisione 60/120 piedi, dove l'errore non si vedeva, ma
  // le velocità razziali di nani/halfling/gnomi sono proprio 25 piedi. La gemella in
  // lib/fivetools/format.ts conservava già il decimale.
  return Math.round(feet * 0.3 * 2) / 2;
}

/**
 * Nome della copia di un personaggio: "Pinco Pallino - Copia", e se quella esiste già
 * "Pinco Pallino - Copia 2", "…3" e così via — duplicare due volte lo stesso eroe non deve
 * produrre due schede indistinguibili nell'elenco.
 */
export function nomeCopia(nome: string, nomiEsistenti: string[]): string {
  const base = `${nome.trim() || "Senza nome"} - Copia`;
  const presi = new Set(nomiEsistenti.map((n) => n.trim().toLowerCase()));
  if (!presi.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) {
    const candidato = `${base} ${n}`;
    if (!presi.has(candidato.toLowerCase())) return candidato;
  }
}

/**
 * Copia indipendente di un personaggio: stessa scheda, identità nuova. Gli id interni (gli oggetti
 * magici sintonizzati) vengono rigenerati insieme a quello della scheda, così le due copie non
 * condividono nessun identificativo.
 */
export function duplicaCharacter(originale: Character, nomiEsistenti: string[]): Character {
  return {
    ...originale,
    id: crypto.randomUUID(),
    nome: nomeCopia(originale.nome, nomiEsistenti),
    oggettiMagici: originale.oggettiMagici.map((oggetto) => ({ ...oggetto, id: crypto.randomUUID() })),
    aggiornatoAl: Date.now(),
  };
}

export function newCharacter(): Character {
  return {
    id: crypto.randomUUID(),
    nome: "",
    classi: [{ nome: "", livello: 1 }],
    razza: "",
    hpMax: 10,
    hpAttuali: 10,
    hpTemporanei: 0,
    classeArmatura: 10,
    velocita: 9,
    iniziativaBonus: 0,
    percezionePassivaBonus: 0,
    cdIncantesimiBonus: 0,
    attaccoIncantesimiBonus: 0,
    visioneRadius: 0,
    scurovisione: false,
    vedeOscuritaMagica: false,
    caratteristiche: {
      forza: 10,
      destrezza: 10,
      costituzione: 10,
      intelligenza: 10,
      saggezza: 10,
      carisma: 10,
    },
    trsCompetenti: [],
    abilitaCompetenti: [],
    abilitaEsperte: [],
    trsBonus: {},
    abilitaBonus: {},
    slotUsati: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    slotPattoUsati: 0,
    tiriMorteSuccessi: 0,
    tiriMorteFallimenti: 0,
    esperienza: 0,
    allineamento: "",
    background: "",
    tratti: "",
    legami: "",
    ideali: "",
    difetti: "",
    nemici: "",
    eta: "",
    altezza: "",
    peso: "",
    occhi: "",
    carnagione: "",
    capelli: "",
    ritrattoUrl: "",
    ispirazione: 0,
    dadiVitaUsati: 0,
    affaticamento: 0,
    oggettiMagici: [],
    privilegiLimitati: [],
    livelloFollia: 0,
    pesoMassimo: 0,
    linguaggi: [],
    resistenze: [],
    immunita: [],
    vulnerabilita: [],
    condizioniAttive: [],
    inventario: [],
    monete: { oro: 0, argento: 0, rame: 0 },
    incantesimi: [],
    armi: [],
    talenti: [],
    infusioniConosciute: [],
    scelteClasse: [],
    note: "",
    aggiornatoAl: Date.now(),
  };
}

/**
 * Riposo lungo RAW: PF ripristinati al massimo, metà dei dadi vita totali recuperati
 * (arrotondato per eccesso), tutti gli slot incantesimo/patto magico ripristinati, i tiri
 * salvezza contro la morte azzerati (i PF sono di nuovo sopra 0), e ogni privilegio a usi
 * limitati con recupero "riposo breve", "riposo lungo" o "alba" torna disponibile — un riposo
 * lungo copre anche tutto ciò che un riposo breve recupererebbe, ed essendo notturno normalmente
 * arriva fino all'alba. Funzione pura: chi la chiama decide se/come chiedere conferma.
 */
/** Dadi Vita recuperati con un riposo lungo. RAW (PHB): "un numero di Dadi Vita pari a metà del
 * totale, MINIMO uno" — metà arrotondata per DIFETTO (5e arrotonda sempre per difetto salvo
 * indicazione contraria), non per eccesso. Funzione condivisa apposta: la stessa formula viveva
 * copiata in tre punti (qui, il mini-bottone dei Dadi Vita e il riepilogo di conferma del riposo)
 * ed è così che i tre numeri finiscono per divergere. */
export function hitDiceRecoveredOnLongRest(totalLevel: number): number {
  return Math.max(1, Math.floor(totalLevel / 2));
}

export function applyLongRest(character: Character): Character {
  const totale = totalLevel(character.classi);
  const dadiVitaRecuperati = hitDiceRecoveredOnLongRest(totale);
  return {
    ...character,
    hpAttuali: character.hpMax,
    // RAW: i PF temporanei scadono e il riposo lungo toglie UN livello di esaurimento. Entrambi
    // mancavano, e il contatore Affaticamento sta proprio accanto al bottone "Riposo lungo" —
    // l'utente credeva che il riposo avesse già fatto tutto e restava con un livello di troppo.
    hpTemporanei: 0,
    affaticamento: Math.max(0, character.affaticamento - 1),
    dadiVitaUsati: Math.max(0, character.dadiVitaUsati - dadiVitaRecuperati),
    slotUsati: character.slotUsati.map(() => 0),
    slotPattoUsati: 0,
    tiriMorteSuccessi: 0,
    tiriMorteFallimenti: 0,
    privilegiLimitati: character.privilegiLimitati.map((f) =>
      f.recupero === "riposoBreve" || f.recupero === "riposoLungo" || f.recupero === "alba"
        ? { ...f, usiUsati: 0 }
        : f,
    ),
  };
}

/**
 * Riposo breve RAW: solo gli slot Patto Magico del Warlock (che si recuperano SOLO con un riposo
 * breve, non con uno lungo) e i privilegi a usi limitati con recupero "riposo breve" tornano
 * disponibili. I PF non si ripristinano da soli (servono i Dadi Vita, gestiti a parte in
 * HitDiceTracker — spenderli per curarsi resta un'azione manuale perché richiede un tiro).
 */
export function applyShortRest(character: Character): Character {
  return {
    ...character,
    slotPattoUsati: 0,
    privilegiLimitati: character.privilegiLimitati.map((f) =>
      f.recupero === "riposoBreve" ? { ...f, usiUsati: 0 } : f,
    ),
  };
}

/** Bonus di un tiro salvezza: mod. caratteristica + bonus competenza se competente. */
export function savingThrowModifier(score: number, proficient: boolean, level: number): number {
  return abilityModifier(score) + (proficient ? proficiencyBonus(level) : 0);
}

/** Bonus di un'abilità: mod. caratteristica, +bonus competenza se competente, doppio se esperto. */
export function skillModifier(
  score: number,
  proficient: boolean,
  expert: boolean,
  level: number,
): number {
  const bonus = proficiencyBonus(level);
  return abilityModifier(score) + (expert ? bonus * 2 : proficient ? bonus : 0);
}

/** Percezione Passiva: 10 + il bonus della prova di Percezione (competenza/esperto inclusi). */
export function passivePerception(
  wisdomScore: number,
  proficient: boolean,
  expert: boolean,
  level: number,
): number {
  return 10 + skillModifier(wisdomScore, proficient, expert, level);
}

/** Nomi italiani ufficiali delle classi base (PHB + Artefice di Tasha's), per riconoscere un nome
 * scritto a mano (es. "Mago") e ricondurlo al nome inglese usato dai dati del Compendio (es.
 * "Wizard"). Elenco piccolo e fisso: non serve un servizio di traduzione per 13 nomi noti. */
const CLASS_NAME_IT_TO_EN: Record<string, string> = {
  barbaro: "Barbarian",
  bardo: "Bard",
  chierico: "Cleric",
  druido: "Druid",
  guerriero: "Fighter",
  ladro: "Rogue",
  mago: "Wizard",
  monaco: "Monk",
  paladino: "Paladin",
  ranger: "Ranger",
  stregone: "Sorcerer",
  warlock: "Warlock",
  artefice: "Artificer",
};

/** Riconduce un nome di classe scritto in italiano (es. "Mago") al nome inglese canonico usato dal
 * Compendio (es. "Wizard"); se il nome è già inglese o non riconosciuto, lo restituisce solo
 * ripulito (trim), senza alterarlo altrimenti. */
export function canonicalClassName(nome: string): string {
  const trimmed = nome.trim();
  return CLASS_NAME_IT_TO_EN[trimmed.toLowerCase()] ?? trimmed;
}

/** Progressione standard degli Aumenti di Caratteristica, valida per quasi tutte le classi. */
const ASI_LEVELS = [4, 8, 12, 16, 19];

/** Due classi ne ottengono di EXTRA rispetto alla progressione standard (PHB): il Guerriero al 6°
 * e al 14°, il Ladro al 10°. Con la sola tabella generica il wizard di level-up saltava del tutto
 * il riquadro "ottieni un Aumento di Caratteristica" a quei livelli, e il giocatore si ritrovava
 * con un aumento (o un talento) mai assegnato. */
const ASI_LEVELS_EXTRA: Record<string, number[]> = {
  fighter: [6, 14],
  rogue: [10],
};

/** Se a QUEL livello di QUELLA classe spetta un Aumento di Caratteristica (o un talento). */
export function isAsiLevelFor(className: string, level: number): boolean {
  if (ASI_LEVELS.includes(level)) return true;
  const extra = ASI_LEVELS_EXTRA[canonicalClassName(className).toLowerCase()];
  return extra?.includes(level) ?? false;
}

/** Caratteristica da incantatore per classe (chiave inglese minuscola, stessa convenzione di
 * FULL_CASTERS/HALF_CASTERS). Usata per calcolare CD e bonus d'attacco degli incantesimi. */
const CASTING_ABILITY: Record<string, Ability> = {
  bard: "carisma",
  cleric: "saggezza",
  druid: "saggezza",
  sorcerer: "carisma",
  warlock: "carisma",
  wizard: "intelligenza",
  paladin: "carisma",
  ranger: "saggezza",
  artificer: "intelligenza",
};

/** Trova la classe incantatrice "primaria" (di livello più alto) fra quelle del personaggio, per
 * calcolare CD/bonus d'attacco degli incantesimi. Semplificazione: in un vero multiclasse ogni
 * incantesimo usa la caratteristica della classe da cui proviene, ma per un riepilogo unico sulla
 * scheda si prende la classe incantatrice con più livelli. */
export function primaryCastingAbility(
  classi: { nome: string; livello: number }[],
): Ability | null {
  let best: { livello: number; ability: Ability } | null = null;
  for (const { nome, livello } of classi) {
    const ability = CASTING_ABILITY[canonicalClassName(nome).toLowerCase()];
    if (!ability) continue;
    if (!best || livello > best.livello) best = { livello, ability };
  }
  return best?.ability ?? null;
}

export function spellSaveDC(level: number, abilityScore: number): number {
  return 8 + proficiencyBonus(level) + abilityModifier(abilityScore);
}

export function spellAttackBonus(level: number, abilityScore: number): number {
  return proficiencyBonus(level) + abilityModifier(abilityScore);
}

export type WeaponAbility = Ability | "finezza";

/** Bonus al tiro per colpire di un'arma: modificatore di caratteristica (Finezza usa il
 * migliore tra Forza e Destrezza) + bonus di competenza se competente + eventuale bonus fisso
 * (arma magica, ecc.). Lo stesso modificatore di caratteristica si aggiunge anche ai danni. */
export function weaponAbilityModifier(
  caratteristica: WeaponAbility,
  caratteristiche: AbilityScores,
): number {
  if (caratteristica === "finezza") {
    return Math.max(
      abilityModifier(caratteristiche.forza),
      abilityModifier(caratteristiche.destrezza),
    );
  }
  return abilityModifier(caratteristiche[caratteristica]);
}

/** Modificatore ai DANNI di un'arma: modificatore di caratteristica + il bonus fisso dell'arma.
 * Il bonus fisso (campo "bonusExtra") nasce per le armi magiche — e un'arma +1 in 5e dà +1 sia al
 * tiro per colpire SIA ai danni: prima veniva sommato solo all'attacco, quindi una spada +1
 * mostrava "attacco +6 / danno 1d8+3" invece di 1d8+4, e si tiravano danni più bassi del dovuto a
 * ogni colpo. Funzione condivisa fra scheda a schermo e PDF stampato, che prima calcolavano il
 * danno ciascuno per conto proprio. */
export function weaponDamageModifier(
  caratteristica: WeaponAbility,
  caratteristiche: AbilityScores,
  bonusExtra: number,
): number {
  return weaponAbilityModifier(caratteristica, caratteristiche) + bonusExtra;
}

export function weaponAttackBonus(
  caratteristica: WeaponAbility,
  caratteristiche: AbilityScores,
  competente: boolean,
  level: number,
  bonusExtra: number,
): number {
  return (
    weaponAbilityModifier(caratteristica, caratteristiche) +
    (competente ? proficiencyBonus(level) : 0) +
    bonusExtra
  );
}

export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8] as const;

export const POINT_BUY_BUDGET = 27;

export function pointBuyCost(scores: Record<Ability, number>): number {
  return ABILITIES.reduce((total, ability) => total + (POINT_BUY_COST[scores[ability]] ?? 0), 0);
}

function rollD6(): number {
  return Math.floor(Math.random() * 6) + 1;
}

/** Tira 4d6 e scarta il dado più basso, il metodo classico per generare una caratteristica. */
export function roll4d6DropLowest(): number {
  const rolls = [rollD6(), rollD6(), rollD6(), rollD6()].sort((a, b) => a - b);
  return rolls[1] + rolls[2] + rolls[3];
}

/** PF totali per livello: dado vita massimo al 1° livello, poi media (arrotondata per eccesso) + mod. COS a ogni livello. */
export function calculateHitPoints(hitDieFaces: number, level: number, conModifier: number): number {
  const firstLevel = hitDieFaces + conModifier;
  const average = Math.floor(hitDieFaces / 2) + 1;
  const restLevels = Math.max(0, level - 1) * (average + conModifier);
  return Math.max(1, firstLevel + restLevels);
}

/**
 * PF multiclasse: solo il livello 1 della PRIMA classe scelta (la classe di origine, il primo
 * elemento dell'array) è massimizzato; ogni altro livello — sia della classe di origine sia
 * delle classi aggiunte dopo — usa la media del dado vita.
 */
export function calculateMulticlassHitPoints(
  classes: { hitDieFaces: number; livello: number }[],
  conModifier: number,
): number {
  let total = 0;
  classes.forEach(({ hitDieFaces, livello }, index) => {
    const average = Math.floor(hitDieFaces / 2) + 1;
    if (index === 0) {
      total += hitDieFaces + conModifier;
      total += Math.max(0, livello - 1) * (average + conModifier);
    } else {
      total += livello * (average + conModifier);
    }
  });
  return Math.max(1, total);
}

// --- Costruzione incontri (regole standard 2014 DMG) ---

export type EncounterDifficulty = "facile" | "medio" | "difficile" | "mortale";

export const DIFFICULTY_LABELS: Record<EncounterDifficulty, string> = {
  facile: "Facile",
  medio: "Medio",
  difficile: "Difficile",
  mortale: "Mortale",
};

// Scala ufficiale dei moltiplicatori: il numero di PG fa salire o scendere di UNO scaglione
// lungo questa scala, non moltiplica il valore.
const MOLTIPLICATORI = [0.5, 1, 1.5, 2, 2.5, 3, 4];

function scaglionePerNumeroMostri(monsterCount: number): number {
  if (monsterCount <= 1) return 1; // -> 1
  if (monsterCount === 2) return 2; // -> 1.5
  if (monsterCount <= 6) return 3; // -> 2
  if (monsterCount <= 10) return 4; // -> 2.5
  if (monsterCount <= 14) return 5; // -> 3
  return 6; // -> 4
}

/** Moltiplicatore incontro per numero di mostri, aggiustato per la dimensione del party (DMG):
 * con MENO di 3 personaggi si sale di uno scaglione, con 6 o più si scende di uno. Senza questo
 * aggiustamento un gruppo di 6-7 giocatori vede gli incontri come più duri di quanto siano (e il
 * generatore li sotto-popola), mentre in due sono più pericolosi di quanto l'app dichiari. */
export function encounterMultiplier(monsterCount: number, partySize?: number): number {
  let indice = scaglionePerNumeroMostri(monsterCount);
  if (partySize !== undefined && partySize > 0) {
    if (partySize < 3) indice += 1;
    else if (partySize >= 6) indice -= 1;
  }
  return MOLTIPLICATORI[Math.min(MOLTIPLICATORI.length - 1, Math.max(0, indice))];
}

/** Budget XP totale del party per una data difficoltà (somma delle soglie individuali). */
export function xpBudget(partyLevels: number[], difficulty: EncounterDifficulty): number {
  return partyLevels.reduce((sum, level) => {
    const index = Math.min(20, Math.max(1, level)) - 1;
    return sum + XP_THRESHOLDS[difficulty][index];
  }, 0);
}

/** XP "aggiustato" (con moltiplicatore) di un gruppo di mostri dello stesso CR. */
export function adjustedEncounterXp(crXp: number, monsterCount: number, partySize?: number): number {
  return crXp * monsterCount * encounterMultiplier(monsterCount, partySize);
}

// --- Slot incantesimi (regole standard PHB) ---

const FULL_CASTERS = new Set(["bard", "cleric", "druid", "sorcerer", "wizard"]);
const HALF_CASTERS = new Set(["paladin", "ranger"]);

/** Livello incantatore effettivo: full=intero, mezzo=metà, artefice=metà arrotondata per eccesso.
 * Il Warlock NON entra qui: usa il Patto Magico, un pool di slot separato.
 *
 * ATTENZIONE alla differenza fra monoclasse e multiclasse per i MEZZI incantatori: la regola del
 * multiclasse dice "metà dei livelli da paladino/ranger, arrotondata per DIFETTO", ma un
 * paladino/ranger che NON è multiclasse usa la tabella della propria classe, che equivale a
 * metà arrotondata per ECCESSO. Applicare la regola del multiclasse anche al monoclasse (com'era
 * prima) toglie slot a ogni livello dispari: un Paladino 5 aveva 3 slot di 1° invece di 4 di 1° +
 * 2 di 2°, e ai livelli 9/13/17 non gli compariva proprio il grado di incantesimo appena
 * sbloccato. Il livello 1 resta 0: paladini e ranger iniziano a lanciare al 2°. */
export function multiclassCasterLevel(classi: { nome: string; livello: number }[]): number {
  const soloUnaClasse = classi.length === 1;
  let total = 0;
  for (const { nome, livello } of classi) {
    const key = canonicalClassName(nome).toLowerCase();
    if (FULL_CASTERS.has(key)) total += livello;
    else if (HALF_CASTERS.has(key)) {
      total += soloUnaClasse
        ? livello < 2
          ? 0
          : Math.ceil(livello / 2)
        : Math.floor(livello / 2);
    } else if (key === "artificer") total += Math.ceil(livello / 2);
  }
  return total;
}

export function spellSlotsForCasterLevel(casterLevel: number): number[] {
  if (casterLevel <= 0) return [0, 0, 0, 0, 0, 0, 0, 0, 0];
  return FULL_CASTER_SLOTS[Math.min(20, casterLevel) - 1];
}

export function warlockLevel(classi: { nome: string; livello: number }[]): number {
  return classi
    .filter((c) => canonicalClassName(c.nome).toLowerCase() === "warlock")
    .reduce((sum, c) => sum + c.livello, 0);
}

export function pactMagicForLevel(level: number): { slotLevel: number; slots: number } {
  if (level <= 0) return { slotLevel: 0, slots: 0 };
  return PACT_MAGIC[Math.min(20, level) - 1];
}

// --- Generatore di ricompense (tabelle standard 2014 DMG) ---

export type TreasureTier = "0-4" | "5-10" | "11-16" | "17+";

export function treasureTierForCr(cr: number): TreasureTier {
  if (cr <= 4) return "0-4";
  if (cr <= 10) return "5-10";
  if (cr <= 16) return "11-16";
  return "17+";
}

function rollDice(count: number, faces: number): number {
  let total = 0;
  for (let i = 0; i < count; i++) total += Math.floor(Math.random() * faces) + 1;
  return total;
}

export interface CoinResult {
  mr: number; // monete di rame
  ma: number; // monete d'argento
  me: number; // monete elettro
  mo: number; // monete d'oro
  mp: number; // monete di platino
}

/** Monete per un singolo mostro/individuo, tabella "Treasure: Challenge X" del DMG. */
export function rollIndividualCoins(tier: TreasureTier): CoinResult {
  const roll = Math.floor(Math.random() * 100) + 1;
  const empty: CoinResult = { mr: 0, ma: 0, me: 0, mo: 0, mp: 0 };
  if (tier === "0-4") {
    if (roll <= 30) return { ...empty, mr: rollDice(5, 6) };
    if (roll <= 60) return { ...empty, ma: rollDice(4, 6) };
    if (roll <= 70) return { ...empty, me: rollDice(3, 6) };
    if (roll <= 95) return { ...empty, mo: rollDice(3, 6) };
    return { ...empty, mp: rollDice(1, 6) };
  }
  if (tier === "5-10") {
    if (roll <= 30) return { ...empty, mr: rollDice(4, 6) * 100, me: rollDice(1, 6) * 10 };
    if (roll <= 60) return { ...empty, ma: rollDice(6, 6) * 10, mo: rollDice(2, 6) * 10 };
    if (roll <= 70) return { ...empty, me: rollDice(3, 6) * 10, mo: rollDice(2, 6) * 10 };
    if (roll <= 95) return { ...empty, mo: rollDice(4, 6) * 10 };
    return { ...empty, mo: rollDice(2, 6) * 10, mp: rollDice(3, 6) };
  }
  if (tier === "11-16") {
    if (roll <= 20) return { ...empty, ma: rollDice(4, 6) * 100, mo: rollDice(1, 6) * 100 };
    if (roll <= 35) return { ...empty, me: rollDice(1, 6) * 100, mo: rollDice(1, 6) * 100 };
    if (roll <= 75) return { ...empty, mo: rollDice(2, 6) * 100 };
    return { ...empty, mo: rollDice(2, 6) * 100, mp: rollDice(1, 6) * 100 };
  }
  if (roll <= 15) return { ...empty, me: rollDice(2, 6) * 1000, mo: rollDice(8, 6) * 100 };
  if (roll <= 55) return { ...empty, mo: rollDice(1, 6) * 1000, mp: rollDice(1, 6) * 100 };
  return { ...empty, mo: rollDice(1, 6) * 1000, mp: rollDice(2, 6) * 100 };
}

/** Monete di un tesoro d'incontro (party intero), riga "Coins" delle tabelle "Treasure Hoard"
 * del DMG. Gli importi sono FISSI per fascia: nel manuale il tiro di d100 serve a determinare
 * gemme/oggetti d'arte/oggetti magici, NON le monete — qui invece si tirava un d100 anche per
 * queste, su una tabella che non esiste, con risultati fino a 3-4 volte troppo generosi per i
 * party di basso livello e circa un terzo del dovuto per quelli di livello alto. */
export function rollHoardCoins(tier: TreasureTier): CoinResult {
  const empty: CoinResult = { mr: 0, ma: 0, me: 0, mo: 0, mp: 0 };
  if (tier === "0-4") {
    return { ...empty, mr: rollDice(6, 6) * 100, ma: rollDice(3, 6) * 100, mo: rollDice(2, 6) * 10 };
  }
  if (tier === "5-10") {
    return {
      ...empty,
      mr: rollDice(2, 6) * 100,
      ma: rollDice(2, 6) * 1000,
      mo: rollDice(6, 6) * 100,
      mp: rollDice(3, 6) * 10,
    };
  }
  if (tier === "11-16") {
    return { ...empty, mo: rollDice(4, 6) * 1000, mp: rollDice(5, 6) * 100 };
  }
  return { ...empty, mo: rollDice(12, 6) * 1000, mp: rollDice(8, 6) * 1000 };
}

/** Valori tipici (in mo) di gemme/oggetti d'arte per fascia di GS, tabella DMG semplificata:
 * niente nomi di fantasia inventati, solo il valore — restano da descrivere a voce dal master. */
const GEM_ART_VALUES: Record<TreasureTier, number[]> = {
  "0-4": [10, 25, 50],
  "5-10": [50, 100, 250],
  "11-16": [250, 750, 2500],
  "17+": [2500, 7500, 25000],
};

export interface GemArtResult {
  count: number;
  value: number;
}

/** Numero e valore di gemme/oggetti d'arte in un tesoro d'incontro (semplificato dalla tabella
 * DMG: stessa fascia di valore usata dal libro per il GS, senza i nomi di fantasia specifici). */
export function rollGemsAndArt(tier: TreasureTier): GemArtResult | null {
  if (Math.random() > 0.5) return null;
  const values = GEM_ART_VALUES[tier];
  const value = values[Math.floor(Math.random() * values.length)];
  const count = rollDice(2, 4);
  return { count, value };
}

/** Rarità plausibili per gli oggetti magici di un tesoro, per fascia di GS (stessa proporzione
 * approssimativa delle tabelle DMG A-I: ai GS bassi prevalgono oggetti comuni/non comuni, ai GS
 * alti oggetti rari/molto rari/leggendari). Usata per pescare un oggetto vero dal Compendio
 * invece di inventare nomi — niente tabelle A-I riprodotte parola per parola. */
const MAGIC_ITEM_RARITY_WEIGHTS: Record<TreasureTier, [string, number][]> = {
  "0-4": [["common", 5], ["uncommon", 3], ["rare", 1]],
  "5-10": [["uncommon", 4], ["rare", 3], ["very rare", 1]],
  "11-16": [["rare", 4], ["very rare", 3], ["legendary", 1]],
  "17+": [["very rare", 3], ["legendary", 4], ["artifact", 1]],
};

export function pickTreasureRarity(tier: TreasureTier): string {
  const weights = MAGIC_ITEM_RARITY_WEIGHTS[tier];
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [rarity, w] of weights) {
    if (roll < w) return rarity;
    roll -= w;
  }
  return weights[0][0];
}

/** Probabilità (0-1) che un tesoro d'incontro contenga oggetti magici, e quanti, per fascia di
 * GS — approssima la frequenza delle tabelle DMG senza riprodurle nel dettaglio. */
const MAGIC_ITEM_CHANCE: Record<TreasureTier, { chance: number; count: [number, number] }> = {
  "0-4": { chance: 0.3, count: [1, 1] },
  "5-10": { chance: 0.5, count: [1, 2] },
  "11-16": { chance: 0.7, count: [1, 3] },
  "17+": { chance: 0.9, count: [2, 4] },
};

export function rollMagicItemCount(tier: TreasureTier): number {
  const { chance, count } = MAGIC_ITEM_CHANCE[tier];
  if (Math.random() > chance) return 0;
  const [min, max] = count;
  return min + Math.floor(Math.random() * (max - min + 1));
}

