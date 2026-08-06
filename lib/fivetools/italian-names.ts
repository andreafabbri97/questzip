// Logica CONDIVISA per scegliere il miglior nome italiano di una voce del Compendio — estratta da
// lib/fivetools/compendio-detail.tsx (un file "use client") perché serve anche lato server
// (lib/fivetools/mention-search.ts, usato sia dai mention "#Nome" in chat sia dall'assistente
// regole IA in app/actions/ai-assistant.ts). Prima esistevano DUE implementazioni indipendenti
// della stessa idea — questa qui e un merge "ultima riga vince" dentro mention-search.ts — che
// potevano derivare: la seconda non aveva il livello "ufficiale di un'altra fonte" aggiunto qui,
// quindi chat/assistente IA/bottone "Verifica" potevano mostrare un nome diverso da quello già
// corretto nel Compendio per la stessa identica voce. Segnalato dall'utente: "quei nomi si devono
// rifare tutti al Compendio, sia in chat, sia l'assistente IA, sia nel personaggio".

export interface OfficialNameRow {
  nome: string;
  nomeInglese: string | null;
  fonteInglese: string | null;
}

export interface IaNameRow {
  name: string;
  source: string;
  nomeIta: string | null;
}

export interface ItalianNameIndex {
  /** "name|source" -> nome ufficiale, solo per righe collegate via nomeInglese/fonteInglese. */
  official: Map<string, string>;
  /** "name" (senza fonte) -> nome ufficiale, dalla PRIMA fonte trovata per quel nome — ripiego
   * quando la fonte esatta non ha testo ufficiale proprio (es. una ristampa 2024 di una voce
   * 2014 con lo stesso nome inglese). */
  officialAny: Map<string, string>;
  /** "name|source" -> nome dalla cache IA (traduzione automatica salvata, mai il testo ufficiale). */
  ia: Map<string, string>;
}

/** Costruisce l'indice a partire dalle righe grezze di DB — nessun hook, chiamabile sia lato
 * client (dentro un effetto) sia lato server (azioni/route). */
export function buildItalianNameIndex(official: OfficialNameRow[], ia: IaNameRow[]): ItalianNameIndex {
  const officialMap = new Map<string, string>();
  const officialAnyMap = new Map<string, string>();
  for (const row of official) {
    if (row.nomeInglese && row.fonteInglese) {
      officialMap.set(`${row.nomeInglese}|${row.fonteInglese}`, row.nome);
      if (!officialAnyMap.has(row.nomeInglese)) officialAnyMap.set(row.nomeInglese, row.nome);
    }
  }
  const iaMap = new Map<string, string>();
  for (const row of ia) {
    if (row.nomeIta) iaMap.set(`${row.name}|${row.source}`, row.nomeIta);
  }
  return { official: officialMap, officialAny: officialAnyMap, ia: iaMap };
}

/** Miglior nome italiano per una entry di 5etools: ufficiale (fonte esatta) > ufficiale
 * (qualsiasi fonte) > cache IA (fonte esatta) > niente (il chiamante ricade sulla traduzione dal
 * vivo). Stessa identica priorità ovunque nel sito: Compendio, autocompletamento Personaggi,
 * mention "#Nome" in chat, assistente regole IA. */
export function bestItalianName(index: ItalianNameIndex, name: string, source: string): string | undefined {
  return index.official.get(`${name}|${source}`) ?? index.officialAny.get(name) ?? index.ia.get(`${name}|${source}`);
}
