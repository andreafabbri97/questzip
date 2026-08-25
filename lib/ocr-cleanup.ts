/**
 * Ripulisce i refusi tipici dell'OCR nei testi italiani del Compendio.
 *
 * Nasce da una segnalazione dell'utente ("a volte l'ocr sbaglia anche a leggere, ho notato € invece
 * di e e 0 invece di o"). Un audit su tutte le tabelle ha però mostrato che i casi VERI sono pochi
 * e ricorrenti: la maggior parte delle cifre dentro le parole sono notazione di dadi legittima
 * ("1d6" compare 236 volte) — sostituirle in massa avrebbe rotto molto più di quanto avrebbe
 * riparato. Qui si correggono quindi solo pattern in cui non c'è ambiguità possibile.
 */

/** "Ai Livelli Superiori" è l'intestazione ricorrente degli incantesimi: l'OCR l'ha letta in modi
 * diversi ma sempre riconoscibili, perché la parola vicina ("Superiori") non lascia dubbi. */
type Sostituzione = [RegExp, string] | [RegExp, (match: string, ...gruppi: string[]) => string];

const PAROLE_CORROTTE: Sostituzione[] = [
  [/\bLi\w{5}(?=\s+Superiori)/g, "Livelli"],
  // "1'" a inizio parola è sempre l'articolo elidato "l'" — nessuna parola italiana inizia con una
  // cifra seguita da apostrofo, e i dadi si scrivono "1d8", mai "1'".
  [/(^|[\s(«"])1'/g, "$1l'"],
  // "2d8o 2d12" -> "2d8 o 2d12": la conjunzione si è attaccata al dado precedente.
  [/(\b\d+d\d+)o(?=\s)/g, "$1 o"],
  // "o1d4 ragni" -> "o 1d4 ragni": lo stesso, ma attaccata al dado successivo.
  [/(?<=[\s(])o(?=\d+d\d+\b)/g, "o "],
  // "|'incantatore" -> "l'incantatore": la barra verticale è una lettura sbagliata della "l"
  // (stessa forma), e nessun testo di regole contiene davvero una pipe.
  [/\|'/g, "l'"],
  // "1 2 ore" -> "12 ore", "1 0 minuti" -> "10 minuti": nelle tabelle delle durate l'OCR spezza
  // il numero. Vincolato a un'unità di tempo subito dopo, così non tocca due numeri distinti.
  [/\b(\d) (\d)(?=\s+(?:or[ae]|minut[oi]|min\b|giorn[oi]|settiman[ae]|ann[oi]))/g, "$1$2"],
  // "l giorno" / "l ora" -> "1 giorno" / "1 ora": la "l" isolata non è una parola italiana, e
  // davanti a un'unità di tempo è sempre la cifra 1 letta male.
  [/\bl (?=(?:or[ae]|minut[oi]|min\b|giorn[oi]|settiman[ae]|ann[oi])\b)/g, "1 "],
  // "ld6" / "Id8" -> "1d6" / "1d8": nella notazione dei dadi la cifra 1 viene letta come "l" o "I"
  // (stessa forma nel font del manuale). Vincolato ai soli valori di dado esistenti, così non
  // tocca parole che finiscono per "ld"/"Id". È di gran lunga il refuso più diffuso: 261 casi.
  [/\b[lI]d(?=(?:2|3|4|6|8|10|12|20|100)\b)/g, "1d"],
  // Apostrofi persi dall'OCR: l'elenco è chiuso apposta, perché ricostruirli con una regola
  // generale ("l" + parola) colpirebbe parole italiane legittime.
  [
    /\b(L|l|d|D|un|Un|nell|dell|all|sull)(effetto|attacco|ariete|incantesimo|arma|area|oggetto|azione)\b/g,
    (_m: string, art: string, parola: string) => `${art}'${parola}`,
  ],
  // "velocità pari a O" -> "pari a 0", "portata O m" -> "0 m", "1O metri" -> "10 metri": lo zero
  // letto come lettera O. Solo in contesti numerici certi.
  [/\bpari a O\b/g, "pari a 0"],
  [/\bO(?= m\b)/g, "0"],
  // Sostituto come funzione: "$10" verrebbe letto come gruppo 10, non come gruppo 1 più uno zero.
  [/\b([1-9])O\b/g, (_m: string, cifra: string) => `${cifra}0`],
  // "da 1 a3 cariche" -> "a 3 cariche": la preposizione si è attaccata al numero seguente.
  [/(?<=\s)a(?=[1-9]\b)/g, "a "],
  // Spazio spurio dentro una parola spezzata a fine riga dal PDF. Elenco chiuso: "no", "re" ecc.
  // sono parole italiane vere, quindi una regola generale creerebbe danni.
  [/\b(dormi|colpi|dura|entra|resiste) (re)\b/g, "$1$2"],
  [/\b(perforan|contunden|taglien) (ti)\b/g, "$1$2"],
  // Underscore lasciato dall'OCR al posto di una parola illeggibile o di un filetto grafico.
  [/\s+_+(?=\s)/g, ""],
];

export function pulisciTestoOcr(testo: string): string {
  let out = testo;
  for (const [pattern, sostituto] of PAROLE_CORROTTE) {
    out = typeof sostituto === "string" ? out.replace(pattern, sostituto) : out.replace(pattern, sostituto);
  }
  // Spazi multipli DENTRO una riga (non gli a capo, che portano la struttura dei paragrafi e che
  // TestoStrutturato usa per distinguere titoli, elenchi e tabelle).
  return out.replace(/[^\S\n]{2,}/g, " ");
}

/**
 * Pulizia mirata ai campi NUMERICI di uno stat block (classe armatura, punti ferita, velocità,
 * sensi). Nel PDF del Manuale dei Mostri quei valori sono in colonne strette e l'OCR li spezza in
 * modo sistematico: "14 (armatura naturale)" diventa "1 4  (armatura naturale)" e "51 (6d10 + 18)"
 * diventa "51 (6dl 0  + 1 8)". Non è un problema solo di estrazione: quei campi finiscono tali e
 * quali nella scheda del mostro, quindi l'utente legge "CA 1 4".
 *
 * Si applica SOLO a questi campi, mai al testo descrittivo: unire due cifre separate da uno spazio
 * è corretto dentro un valore numerico ma sarebbe sbagliato in una frase ("colpisce 2 o 3 bersagli").
 */
export function pulisciNumeriStatBlock(testo: string): string {
  return (
    testo
      // "l"/"I" al posto della cifra 1 quando è attaccata a un dado o a un'altra cifra:
      // "6dl0", "l 5", "2dl 2". In un campo numerico non esistono parole, quindi non c'è
      // ambiguità possibile: una lettera lì dentro è sempre una cifra letta male.
      .replace(/(\d\s*d)\s*[lI](?=[\d\s])/g, (_m, dado: string) => `${dado}1`)
      .replace(/\b[lI](?=\s?\d)/g, "1")
      .replace(/(?<=\d\s?)[lI]\b/g, "1")
      // Cifre spezzate dalla colonna stretta del PDF: "1 4" -> "14", "+ 1 8" -> "+18".
      .replace(/(\d) +(?=\d)/g, "$1")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}


/** Quota di caratteri "impossibili" in un testo italiano: sequenze di consonanti senza vocali,
 * simboli fuori posto, maiuscole in mezzo alle parole. Serve a riconoscere le pagine in cui l'OCR
 * ha prodotto rumore puro invece di testo — mostrarle è peggio che non mostrarle. */
export function quotaIlleggibile(testo: string): number {
  const t = testo.trim();
  if (t.length < 40) return 0;
  const parole = t.split(/\s+/).filter((p) => p.length > 1);
  if (parole.length === 0) return 0;
  const rotte = parole.filter(
    (p) =>
      /[^\p{L}\p{N}\s'.,;:!?()«»…°/+\-–—]/u.test(p) || // simboli che in italiano non compaiono
      (/\p{L}/u.test(p) && !/[aeiouàèéìòùAEIOU]/.test(p)) || // parola senza vocali
      /[a-zà-ù][A-ZÀ-Ù]/.test(p), // maiuscola in mezzo
  ).length;
  return rotte / parole.length;
}
