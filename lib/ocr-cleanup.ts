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

// Le parole che in queste schede seguono uno zero VERO: servono a distinguerlo dalla congiunzione
// "o" letta come cifra (vedi la regola più sotto). "0 punti ferita", "0 cariche", "0 metri".
const UNITA_DI_MISURA = new Set([
  "punti", "punto", "cariche", "carica", "metri", "metro", "danni", "danno",
  "mo", "ma", "pa", "kg", "ore", "ora", "minuti", "minuto", "giorni", "giorno",
  "livello", "livelli", "dadi", "dado", "cm", "km", "m", "mt", "round", "turni", "turno",
]);

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
  // Il caso opposto, molto più diffuso (98 oggetti magici): la congiunzione "o" letta come cifra
  // zero — "scegliere liberamente 0 determinare a caso", "di livello pari 0 inferiore al 7°". Uno
  // zero VERO in queste schede compare solo in due forme, ed è così che si riconosce: preceduto da
  // "a" ("scende a 0", "pari a 0") oppure seguito da un'unità di misura ("0 punti ferita",
  // "0 cariche"). In tutti gli altri casi una cifra isolata fra due parole è la congiunzione.
  [
    /\b([A-Za-zÀ-ÿ][a-zà-ÿ]*) 0 (?=([a-zà-ÿ]+))/g,
    (_m: string, prima: string, dopo: string) =>
      prima === "a" || UNITA_DI_MISURA.has(dopo) ? `${prima} 0 ` : `${prima} o `,
  ],
  // Stessa congiunzione, ma dopo una parentesi chiusa o una virgola invece che dopo una parola:
  // "molto raro (bronzo) 0 leggendario (ferro)", "guarigione (1 carica) 0 resurrezione". Qui non
  // c'è nemmeno il dubbio dello zero vero, che in queste schede segue sempre una parola.
  [
    /(?<=[),]) 0 (?=([a-zà-ÿ]+))/g,
    (_m: string, dopo: string) => (UNITA_DI_MISURA.has(dopo) ? " 0 " : " o "),
  ],
  // "da 1 a3 cariche" -> "a 3 cariche": la preposizione si è attaccata al numero seguente.
  [/(?<=\s)a(?=[1-9]\b)/g, "a "],
  // Spazio spurio dentro una parola spezzata a fine riga dal PDF. Elenco chiuso: "no", "re" ecc.
  // sono parole italiane vere, quindi una regola generale creerebbe danni.
  [/\b(dormi|colpi|dura|entra|resiste) (re)\b/g, "$1$2"],
  [/\b(perforan|contunden|taglien) (ti)\b/g, "$1$2"],
  // Underscore lasciato dall'OCR al posto di una parola illeggibile o di un filetto grafico.
  [/\s+_+(?=\s)/g, ""],
];

// Caratteri di controllo C0 (ESC, BEL, byte nulli...) lasciati dall'OCR al posto di un carattere
// che non è riuscito a leggere: sono invisibili a schermo ma spezzano le ricerche e i confronti —
// "DRAGO D'GENTO ADULTO" non veniva trovato nemmeno cercando "DGENTO". A capo e tabulazione
// restano, perché portano la struttura del testo.
const CARATTERI_DI_CONTROLLO = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;

export function pulisciTestoOcr(testo: string): string {
  let out = testo
    .replace(CARATTERI_DI_CONTROLLO, "")
    // Il trattino "morbido" (U+00AD) segna il punto in cui il PDF ha spezzato una parola a
    // fine riga. A schermo non si vede, ma resta nel testo con lo spazio che lo segue:
    // "combat­ timento" si leggeva "combat timento" e non si trovava cercando la parola.
    .replace(/\u00ad\s*/g, "");
  for (const [pattern, sostituto] of PAROLE_CORROTTE) {
    out = typeof sostituto === "string" ? out.replace(pattern, sostituto) : out.replace(pattern, sostituto);
  }
  // Spazi multipli DENTRO una riga (non gli a capo, che portano la struttura dei paragrafi e che
  // TestoStrutturato usa per distinguere titoli, elenchi e tabelle).
  return out.replace(/[^\S\n]{2,}/g, " ");
}

// Le facce che un dado può avere: è ciò che permette di riparare i dadi senza rischi. Una
// parentesi diventa "(1d10 + 3)" solo se, tradotte le lettere in cifre, ne esce un dado che
// esiste — "(dolo)" o "(lodi)" non ci arriveranno mai.
const FACCE_DI_DADO = new Set(["2", "3", "4", "6", "8", "10", "12", "20", "100"]);

/**
 * Ripara i dadi scritti fra parentesi, dove l'OCR ha letto le cifre come lettere.
 *
 * Nel testo delle azioni il danno ha sempre la forma "13 (3d6 + 3)", e nei manuali scansionati la
 * parentesi è il punto più martoriato: "(ldlO + 3)" per (1d10 + 3), "(Sd6)" per (5d6),
 * "(14d l 0 + 42)" per (14d10 + 42), "{2d& + 4)" per (2d8 + 4). pulisciTestoOcr si ferma a
 * "ld6": qui le lettere sbagliate sono anche DOPO la d, e spesso con uno spazio in mezzo.
 *
 * Fuori dalle parentesi non si tocca niente: lì una "l" o una "S" sono quasi sempre lettere vere.
 */
export function riparaDadiFraParentesi(testo: string): string {
  return testo.replace(
    /[({]([\dlIOoS&\s]*d[\dlIOoS&\s]+(?:[+\-−][\dlIOoS&\s]+)?)[)}]/g,
    (intero, dentro: string) => {
      const cifre = dentro
        .replace(/[lI]/g, "1")
        .replace(/[Oo]/g, "0")
        .replace(/S/g, "5")
        .replace(/&/g, "8")
        .replace(/\s+/g, "");
      const m = cifre.match(/^(\d+)d(\d+)(?:([+\-−])(\d+))?$/);
      if (!m || !FACCE_DI_DADO.has(m[2])) return intero;
      return m[3] ? `(${m[1]}d${m[2]} ${m[3]} ${m[4]})` : `(${m[1]}d${m[2]})`;
    },
  );
}

// La colonna delle caratteristiche dello stat block, finita in testa ai tratti: una sigla per
// riga ("INT") e sotto il suo valore ("12 (+l)"). Succede quando nel PDF la colonna sta di fianco
// alla riga "Sfida" e l'estrazione la legge dopo.
const RIGA_SIGLA = /^(?:FOR|DES|COS|I ?NT|SAG|SAC|CAR)$/i;
const RIGA_PUNTEGGIO = /^[\dlISOo ]{1,5}\s?[({]\s?[+\-−·]?\s?[\dlISOo ]{1,3}[)}]$/;

/** Toglie le righe della colonna delle caratteristiche rimaste in cima a una sezione. */
export function togliColonnaCaratteristiche(testo: string): string {
  const righe = testo.split("\n");
  const tenute: string[] = [];
  let i = 0;
  for (; i < righe.length; i++) {
    const riga = righe[i].trim();
    if (RIGA_SIGLA.test(riga) || RIGA_PUNTEGGIO.test(riga)) continue;
    // "Bonus di Competenza +2" sta fra la Sfida e i tratti, in mezzo alla colonna colata: è
    // un'informazione vera e resta, ma non interrompe la ricerca delle righe da togliere.
    if (/^Bonus di competenza/i.test(riga)) {
      tenute.push(righe[i]);
      continue;
    }
    break;
  }
  return [...tenute, ...righe.slice(i)].join("\n");
}

/**
 * Ripara i dadi scritti nel testo corrente, fuori dalle parentesi: "evoca l d4 lupi", "15 (ldl2 +
 * 4 più 1 d8)", "(massimo 1 0d6)", "pari a l dl 2 + il punteggio di Costituzione".
 *
 * riparaDadiFraParentesi vede solo la parentesi che contiene un dado e nient'altro; questi le
 * sfuggono perché stanno in mezzo a una frase, o in una parentesi che contiene anche parole. Sono
 * pochi (una quindicina in tutto il bestiario) ma sono proprio i numeri che servono al tavolo.
 *
 * Come là, il vincolo è che ne esca un dado che esiste: "l d4" non è italiano, "I d6 extra" sì
 * (l'articolo davanti ai dadi), quindi la I maiuscola vale 1 solo se è attaccata alla d.
 */
export function riparaDadiNelTesto(testo: string): string {
  const inCifre = (s: string) => s.replace(/[lI]/g, "1").replace(/O/g, "0").replace(/\s+/g, "");
  return testo.replace(
    /(?<![A-Za-zÀ-ÿ\d])([lI]|\d{1,2}|[1-9] 0)( ?)d ?([lI1] ?[O0] ?[O0]|[lI1] ?[O02]|2 ?[O0]|[468])(?![A-Za-zÀ-ÿ\d])/g,
    (intero, quanti: string, spazio: string, facce: string) => {
      if (quanti === "I" && spazio) return intero;
      const numeroFacce = inCifre(facce);
      return FACCE_DI_DADO.has(numeroFacce) ? `${inCifre(quanti)}d${numeroFacce}` : intero;
    },
  );
}

/**
 * Pulizia del testo di tratti e azioni di una scheda di mostro: quella generale, più le
 * riparazioni che hanno senso solo dentro uno stat block.
 */
export function pulisciCorpoScheda(testo: string): string {
  const riparato = riparaDadiNelTesto(riparaDadiFraParentesi(pulisciTestoOcr(togliColonnaCaratteristiche(testo))))
    // "Colpito: l3 (2d8 + 4)": la prima cifra del danno medio letta come elle.
    .replace(/(?<![A-Za-zÀ-ÿ\d])[lI](\d)(?= \(\d+d\d+)/g, "1$1")
    // "Colpito: 1 3 (3d6 + 3) danni": il danno medio, spezzato in due dalla colonna stretta. Si
    // ricompone solo davanti alla parentesi dei dadi, dove due cifre staccate non possono essere
    // due numeri distinti.
    .replace(/\b(\d) (\d)(?= \(\d+d\d+)/g, "$1$2")
    // "CD 1 4": stessa spezzatura sulla classe difficoltà, che è sempre un numero solo.
    .replace(/\bCD (\d) (\d)\b/g, "CD $1$2")
    // "I l dragocchio": l'articolo letto come due lettere staccate. "I l" non è italiano.
    .replace(/\bI l\b/g, "Il")
    // "11 bersaglio deve...": lo stesso articolo letto come il numero undici. Solo a inizio
    // frase e non davanti a un'unità di misura, dove undici è un numero vero.
    .replace(
      /(^|[.:;!?]\s+)11 (?!(?:metri|punti|danni|creature|cariche|ore|minuti|round|giorni|anni|kg|m)\b)(?=[a-zà-ù]{3,})/gm,
      "$1Il ",
    )
    // "l: Raggio paralizzante": la voce numero 1 di un elenco, con la cifra letta come elle.
    .replace(/^l: /gm, "1: ")
    // "(3/Ciorno}", "{Costa 2 Azioni)": nel corsivo dei titoletti la parentesi tonda esce graffa.
    // In una scheda le graffe non esistono, quindi la sostituzione non può sbagliare.
    .replace(/\{/g, "(")
    .replace(/\}/g, ")")
    // "(3/Ciorno)", "(1/Ciarno)": la G maiuscola del corsivo letta come C.
    .replace(/\bCi[oa]rno\b/g, "Giorno")
    // "q uest'ultima": la q staccata dal resto. "q" da sola non è una parola.
    .replace(/\bq uest(?=['’])/g, "quest")
    // "3" livello (3 slot)", "2• livello": il simbolo dell'ordinale negli elenchi degli incantesimi.
    .replace(/\b([1-9])\s?["•](?= livello\b)/g, "$1°")
    // "portata 1, 5 m", "entro 1 8 metri": la distanza spezzata in due dalla colonna stretta. Davanti
    // all'unità di misura due cifre staccate sono un numero solo — lo ha mostrato il confronto con
    // i piedi dell'originale: 180 schede avevano un "5 m" al posto di un "1,5 m".
    // Solo «N, 5»: le distanze con la virgola sono sempre mezzi metri. E non in mezzo a un elenco
    // («linee di 3, 6, 9 m» sono tre misure, non «6,9 m»).
    .replace(/(?<!, ?)\b(\d), 5(?=(?:\/\d+)? (?:m|metri|km)\b)/g, "$1,5")
    .replace(/(?<![\d,/] ?)\b(\d) (\d)(?= (?:m|metri)\b)/g, "$1$2")
    // "portata l,5 m", "entro 1, S metri", "portata l,S m": l'uno letto come elle e il cinque come
    // esse. Davanti all'unità di misura non possono essere altro.
    .replace(/\b[lI1], ?[5S](?= (?:m|metri|km)\b)/g, "1,5")
    .replace(/\bl (\d)(?= (?:m|metri)\b)/g, "1$1")
    // "gittata 6/1 8 m", "gittata 1 8/72 m", "entro 1 50 metri", "gittata 45/1 83 m": l'uno iniziale
    // staccato anche dentro una gittata doppia e davanti alle centinaia.
    .replace(/(?<![\d,] ?)\b1 (\d{1,2})(?=(?:\/\d+(?:,\d+)?)? (?:m|metri)\b)/g, "1$1")
    .replace(/(?<!, ?)\b(\d), 5(?= (?:cm|centimetri)\b)/g, "$1,5")
    // "portata 1,5 mo gittata 6/18 m": l'unità attaccata alla congiunzione.
    .replace(/(\d) mo (?=gittata\b)/g, "$1 m o ");
  return riparaFormeRicorrenti(riparato);
}

// L'elle del corsivo letta come barra, insieme alla a letta come o: parole intere che nessuna
// regola generale può ricostruire. Sono i titoletti e i nomi degli incantesimi, che nelle schede
// stanno in corsivo.
const PAROLE_COL_CORSIVO_ROTTO: [RegExp, string][] = [
  [/\bMu\/tiattacco\b/g, "Multiattacco"],
  [/\bMultiottacco\b/g, "Multiattacco"],
  [/\b([Ee])lemento\/e\b/g, "$1lementale"],
  [/\bfu\/mine\b/g, "fulmine"],
  [/\bmo\/edizione\b/g, "maledizione"],
  [/\bMuta\/orma\b/g, "Mutaforma"],
  [/\bpor\/ore con\b/g, "parlare con"],
  [/\bonimo\/i\b/g, "animali"],
  [/\bvegeto\/i\b/g, "vegetali"],
  [/\ba\/fuoco\b/g, "al fuoco"],
  [/\bi\/filamento\b/g, "il filamento"],
  [/\bCia11el\/otto\b/g, "Giavellotto"],
];

/**
 * Le forme di lettura sbagliata che tornano uguali in decine di schede. Ognuna è una sequenza
 * che in una scheda non può voler dire altro: per questo si correggono a regola e non una per una.
 * Trovate contando le forme sulla tabella intera (ottobre 2026): "l/giorno" stava in 79 schede,
 * il bonus per colpire spezzato in 87, lo zero letto come O in 94.
 */
function riparaFormeRicorrenti(testo: string): string {
  const riparato = testo
    // "l/giorno ciascuno", "l /giorno", "1 /giorno": la frequenza degli incantesimi innati.
    // Non dopo un numero: «5 l/giorno di acqua» sono litri.
    .replace(/(?<!\d ?)\b[lI] ?\/ ?giorno\b/g, "1/giorno")
    .replace(/\b(\d) \/ ?giorno\b/g, "$1/giorno")
    // "Multiattacco. li drago può…": l'articolo a inizio frase letto come "li". Dopo un punto il
    // pronome "li" non può stare (sarebbe maiuscolo), quindi è sempre l'articolo.
    .replace(/(?:(?<=[.!?]\)?\s)|^)li (?=\p{Ll})/gu, "Il ")
    // "+1 3 al tiro per colpire", ":+ 17 al tiro": il bonus per colpire spezzato o staccato dal segno
    // (la frase può andare a capo dopo "per").
    .replace(/\+ ?(\d) (\d)(?=\sal\s+tiro\s+per\s+colpire)/g, "+$1$2")
    .replace(/\+ (\d+)(?=\sal\s+tiro\s+per\s+colpire)/g, "+$1")
    .replace(/:(?=\+\d+\sal\s+tiro\s+per\s+colpire)/g, ": ")
    // "scende a O punti ferita", "un bonus di +O": lo zero letto come O maiuscola.
    // Solo dove si parla di un numero che scende («scende a O», «ridotto a O», «punti ferita a O»):
    // una «a O» qualunque può essere l'Ovest di «da E a O» o l'inizio di un nome.
    .replace(/(?<=\b(?:scend\p{L}*|ridott\p{L}|riduc\p{L}*|ridurr\p{L}+|portat\p{L}|ferita|pari)\s+a\s)O\b(?!['’])/gu, "0")
    .replace(/\+O\b/g, "+0")
    .replace(/\bO(?= punti ferita\b)/g, "0")
    // "Colpito: S (1d8 + 1)", "(Ricarica S-6)": il cinque letto come esse.
    .replace(/\bS(?= \(\d+d\d)/g, "5")
    .replace(/\bS(?=-6\))/g, "5")
    // "in l round": l'uno letto come elle davanti a un'unità di tempo.
    .replace(/(?<=\b(?:in|per|di|ogni|entro) )l (?=round\b|minut[oi]\b|or[ae]\b)/g, "1 ")
    // "sull'incantesimo 1 3)": la CD degli incantesimi spezzata.
    .replace(/(?<=sull['’]incantesimo )1 (\d)(?=[),])/g, "1$1")
    // "l 'effetto", "quell 'area", "all' inizio", "u n'azione": l'apostrofo staccato dalla parola.
    .replace(/\bu n(?=['’]\p{L})/gu, "un")
    // Non se la parola dopo è chiusa da un altro apice: «un 'ordine' segreto» è una citazione.
    .replace(/(?<=\b(?:l|un|d|dell|all|nell|sull|dall|quell|quest|coll|sott|tutt|nessun|ciascun|qualcos|mezz|senz|anch))\s(?=['’]\p{L}+(?!['’\p{L}]))/giu, "")
    .replace(/(?<=\b(?:l|un|d|dell|all|nell|sull|dall|quell|quest)['’]) (?=[aeiouàèéìòùh])/giu, "")
    // "altri menti cade a terra prono": le menti sono femminili, "altri menti" non esiste.
    .replace(/\baltri menti\b/g, "altrimenti")
    // "ram pollo": il rampollo di Bigby spezzato dalla sillabazione; "ram" non è una parola.
    .replace(/\b([Rr])am pollo\b/g, "$1ampollo")
    .replace(/\bpu nti(?= ferita\b)/g, "punti")
    // "da/l'urlatore", "de/l'incubo": l'elle doppia del corsivo, la prima letta come barra.
    // Solo dopo la radice di una preposizione articolata: «la creatura/l'oggetto» è una barra vera.
    .replace(/(?<=\b(?:[Dd]e|[Dd]a|[Nn]e|[Ss]u|[Aa]|[Cc]o))\/l(?=['’]\p{L})/gu, "ll")
    // "del/a fornace": la stessa cosa dentro la preposizione articolata.
    .replace(/(?<=\b(?:de|da|ne|su)l)\/(?=[aeo]\b)/gi, "l")
    // "Runa de/fuoco", "Avversione a/fuoco", "Ritrarre i/filamento": l'elle e lo spazio che la segue.
    // Solo «de/»: «de» da solo non è italiano, quindi è sempre «del». Con «a», «da», «su», «i»
    // la barra può essere vera («su/giù», «da/verso»): quelle viste stanno nell'elenco qui sopra.
    .replace(/(?<=\b[Dd]e)\/(?=\p{Ll}{3,})/gu, "l ");
  return PAROLE_COL_CORSIVO_ROTTO.reduce((t, [da, a]) => t.replace(da, a), riparato);
}

/** Sostituisce le lettere che l'OCR ha messo al posto di cifre: l/I valgono 1, O/o valgono 0. */
const lettereInCifre = (s: string) => s.replace(/[lI]/g, "1").replace(/[Oo]/g, "0");

// Un pezzo è "solo numerico" se, tolte cifre, spazi, segni e le lettere che l'OCR confonde con le
// cifre, non resta nulla. La "d" è ammessa solo dentro le parentesi, dov'è il separatore dei dadi.
const SOLO_NUMERICO = /^[\d\s+\-/lIOo]*$/;
const SOLO_DADI = /^[\d\s+\-/*dlIOo]*$/;

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
  // Regole "una lettera accanto a una cifra" non bastano: in "+ l O" nessuna delle due ha una
  // cifra vicino, perché sono corrotte entrambe, e restavano lì. Si ragiona quindi per PEZZI —
  // la parte iniziale e ogni gruppo fra parentesi — convertendo le lettere solo quando l'intero
  // pezzo non contiene nient'altro che numeri: dentro "(10d1 O + l O)" una lettera non può essere
  // altro che una cifra, mentre "(armatura naturale)" resta intatta perché è testo vero.
  const conParentesi = testo.replace(/\(([^)]*)\)/g, (intero, dentro: string) =>
    SOLO_DADI.test(dentro) ? `(${lettereInCifre(dentro)})` : intero,
  );
  const taglio = conParentesi.indexOf("(");
  const testa = taglio >= 0 ? conParentesi.slice(0, taglio) : conParentesi;
  const coda = taglio >= 0 ? conParentesi.slice(taglio) : "";
  const testaPulita = SOLO_NUMERICO.test(testa) ? lettereInCifre(testa) : testa;

  return (
    `${testaPulita}${coda}`
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

// Le parole in "-ità" (e simili) che compaiono nei testi di regole. Elenco CHIUSO: "ferita",
// "vita", "limita", "evita", "capita" finiscono allo stesso modo e sono giuste così.
const PAROLE_IN_A_ACCENTATA = [
  "velocita", "abilita", "immunita", "oscurita", "opportunita", "invisibilita", "capacita",
  "profondita", "mostruosita", "entita", "divinita", "qualita", "quantita", "possibilita",
  "furtivita", "vulnerabilita", "citta", "rapidita", "volonta", "difficolta", "liberta", "realta",
];
const A_ACCENTATA = new RegExp(`\\b(${PAROLE_IN_A_ACCENTATA.join("|")})\\b`, "gi");

/**
 * Rimette gli accenti a un testo estratto da un PDF che li ha persi.
 *
 * Il Calderone di Tasha ha uno strato di testo in cui le vocali accentate sono state lette in
 * modo sistematico come qualcos'altro: ogni "è" è diventata "é" (o "@"), "ù" è diventata "t",
 * "ti" o "tt" ("pit", "piti", "pitt"), "ò" è diventata "d" ("pud", "cid") e la "à" finale ha
 * perso l'accento ("velocita", "meta"). Proprio perché l'errore è sempre lo stesso si può
 * tornare indietro senza indovinare: nessuna di queste forme è una parola italiana.
 *
 * Va applicata SOLO ai testi che vengono da quel manuale: altrove "é" isolata o "meta" possono
 * essere giuste, e la funzione le cambierebbe comunque.
 *
 * Restano fuori di proposito le coppie davvero ambigue (da/dà, la/là, si/sì, ne/né, se/sé): lì
 * l'accento perso non si riconosce dalla parola, e sbagliarlo cambierebbe il senso della frase.
 */
export function ripristinaAccentiPersi(testo: string): string {
  const conIniziale = (originale: string, corretta: string) =>
    /^[A-ZÀ-Ù]/.test(originale) ? corretta[0].toUpperCase() + corretta.slice(1) : corretta;
  return (
    testo
      // Parola spezzata a fine riga dal PDF e ricucita con trattino e spazio: "incan- tesimi".
      .replace(/([a-zà-ù]{2,})- ([a-zà-ù]{2,})/g, "$1$2")
      .replace(/(?<![\p{L}'’])é(?![\p{L}'’])/gu, "è")
      .replace(/(?<![\p{L}'’])É(?![\p{L}'’])/gu, "È")
      .replace(/ @ /g, " è ")
      .replace(/\b(pud|puo)\b/gi, (m) => conIniziale(m, "può"))
      // "pit:" compare proprio così: i due punti sono un avanzo della "ù".
      .replace(/\b(pit[it]?:?|piu)(?=[\s,.;)])/gi, (m) => conIniziale(m, "più"))
      .replace(/\bcid\b/gi, (m) => conIniziale(m, "ciò"))
      .replace(/\bperd\b/gi, (m) => conIniziale(m, "però"))
      .replace(/\bgia\b/gi, (m) => conIniziale(m, "già"))
      .replace(/\bcosi\b/gi, (m) => conIniziale(m, "così"))
      // "la metà dei danni", "metà della sua velocità": sempre seguita da una preposizione.
      .replace(/\bmeta(?= d[eai])/gi, (m) => conIniziale(m, "metà"))
      .replace(A_ACCENTATA, (m) => `${m.slice(0, -1)}à`)
  );
}

// Parole a cui l'OCR ha tolto l'apostrofo, incollando l'articolo o la preposizione al nome:
// "la parola dordine", "ogni giorno allalba", "spende lultima carica". Elenco CHIUSO, ricavato
// contando le forme nel catalogo degli oggetti magici: una regola generale ("l" + vocale) farebbe
// a pezzi parole vere — "luna", "lama", "dato", "allarma" cominciano allo stesso modo.
const SENZA_APOSTROFO = [
  "dordine", "dorigine", "dacqua", "daria", "dolio", "darme", "dargento", "desistenza",
  "allalba", "allinterno", "allinizio", "allesterno", "allaltra",
  "dallinterno", "dallaltro", "dallincantesimo", "dallaspetto", "dallanello",
  "dellarmatura", "dellaria", "dellolio", "dellacqua", "dellincantesimo",
  "questarma", "questultimo",
  "lultima", "lanello", "laltra", "lelmo", "lapparato", "lelsa", "lestremità",
  "loriginale", "liniziativa", "larmatura", "labitacolo", "lacqua", "laspetto", "lelemento",
  "lodore", "lintervento", "lordine", "lapplicazione", "lolio", "lintera", "laccesso", "lalbero",
  "lallineamento", "lesplosione", "lenergia", "lincantesimo",
];
const PREFISSI_ELISI = ["dell", "dall", "nell", "sull", "all", "quest", "l", "d"];
// Niente \b in coda: per JavaScript la "à" non è una lettera di parola, e "lestremità" non
// veniva mai trovata. Il confine si scrive a mano, con le lettere accentate.
const RE_SENZA_APOSTROFO = new RegExp(`(?<![\\p{L}'’])(${SENZA_APOSTROFO.join("|")})(?![\\p{L}'’])`, "giu");

/**
 * Ripara i refusi sistematici del catalogo "Oggetti magici A-Z", letto con l'OCR da pagine
 * fotografate (fonte `oggetti_magici`).
 *
 * È un OCR diverso da quello dei bestiari e sbaglia in modo diverso, ma sempre uguale: la
 * congiunzione "e" in corsivo diventa "€", "è" diventa "&", le legature "ff" e "fl" perdono una
 * lettera ("efetto", "infigge", "futtua"), gli apostrofi spariscono ("dordine", "allalba") e in
 * "1 o più cariche" la "o" è letta come zero. Nessuna di queste forme esiste in italiano, quindi
 * si torna indietro senza indovinare.
 *
 * Il punto e virgola al posto della virgola (286 casi) NON si corregge qui: non si riconosce dal
 * testo, serve il confronto con l'originale — vedi scripts/ita-compendio/ripara-ocr-oggetti-magici.mjs.
 */
export function ripristinaTestoOggettiMagici(testo: string): string {
  return (
    testo
      // Un simbolo dell'euro in un manuale dove tutto si paga in monete d'oro è sempre una "e".
      .replace(/(^|\s)€(?=\s|$)/g, "$1e")
      .replace(/ & /g, " è ")
      // Legature perse. "efletto" è la stessa parola con la legatura letta a metà.
      .replace(/\b([Ee])f(?:l)?ett/g, "$1ffett")
      // La stessa parola con l'articolo incollato davanti: "lefetto" ha perso legatura e apostrofo.
      .replace(/\b([Ll])ef(?:l)?ett/g, "$1'effett")
      .replace(/\b([Ii])nfi(?=gg|tt)/g, "$1nfli")
      .replace(/\b([Aa])ferr/g, "$1fferr")
      .replace(/\b([Ff])uttua/g, "$1luttua")
      // "danni da {uoco", "muro di [uoco": la f letta come parentesi.
      .replace(/[{[]uoco\b/g, "fuoco")
      // Lo stesso davanti a qualunque parola: "{orza", "{attura drow", "si {rantuma", "[reccia".
      // Una graffa aperta in mezzo a una frase non esiste; la quadra è una f solo davanti a una
      // parola in minuscolo (davanti a una maiuscola è un'elle con l'apostrofo, vedi sotto).
      .replace(/\{(?=[a-zà-ù]{2,})/g, "f")
      .replace(/(?<=\s)\[(?=[a-zà-ù]{4,})/g, "f")
      // La quadra al posto di "l'" e di "I": "parlare [Abissale", "capire ['Ignan", "[l personaggio",
      // "[ punti ferita persi" in testa alla frase.
      .replace(/\['(?=[A-ZÀ-Ù])/g, "l'")
      .replace(/(?<=\s)\[(?=[A-ZÀ-Ù][a-zà-ù])/g, "l'")
      .replace(/(^|[.!?] )\[l (?=[a-zà-ù])/g, "$1Il ")
      .replace(/(^|[.!?] )\[ (?=[a-zà-ù])/g, "$1I ")
      // Il trattino basso al posto del punto fermo ("termina_ La mazza") o di niente ("ogni_ suo").
      .replace(/_ (?=[A-ZÀ-Ù])/g, ". ")
      .replace(/_ (?=[a-zà-ù])/g, " ")
      // L'uguale rimasto dopo una parola: "ogni = suo turno", "la impugna,= può".
      .replace(/ = (?=[a-zà-ù])/g, " ")
      .replace(/,= /g, ", ")
      // L'euro attaccato: "1 carica €, se", "al suo interno €e trasportate".
      .replace(/(?<=\s)€e?(?=[,\s])/g, "e")
      .replace(/(^|[.!?] )@gni\b/g, "$1Ogni")
      // "rara (+2)0 molto rara (+3)": la "o" fra due rarità letta come zero.
      .replace(/\)0 (?=[a-zà-ù])/g, ") o ")
      // Niente \b dopo "più": per JavaScript la "ù" non è una lettera di parola, e fra "ù" e lo
      // spazio non vede alcun confine.
      .replace(/\b(\d) 0 (pi[uù]|meno)(?=\s|$)/g, "$1 o $2")
      .replace(/\bpiu(?=\s|[,.;:)]|$)/g, "più")
      // "Forza 0 Costituzione", "Media 0 Grande": fra due parole di cui la seconda maiuscola uno
      // zero non può stare (dopo uno zero vero viene un'unità, o un punto).
      .replace(/(?<=[a-zà-ù]) 0 (?=[A-ZÀ-Ù][a-zà-ù]{2,})/g, " o ")
      // Dadi con le cifre lette come lettere, fuori dalle parentesi: "un dl00", "Idl0 livelli".
      .replace(/\b([lI\d]{0,2})d[lI]([0O]{1,2})(e)?\b/g, (_m, quanti: string, zeri: string, e?: string) => {
        // "si tira un dl00e si consulta": la congiunzione è rimasta attaccata al dado.
        return `${quanti.replace(/[lI]/g, "1")}d1${zeri.replace(/O/g, "0")}${e ? " e" : ""}`;
      })
      // La cifra incollata alla parola che segue: "un risultato di 20al tiro per colpire".
      .replace(/\b(\d+)(al|del|di)\b/g, "$1 $2")
      .replace(/#l\s?ai\b/g, "+1 ai")
      .replace(RE_SENZA_APOSTROFO, (forma) => {
        const minuscola = forma.toLowerCase();
        const prefisso = PREFISSI_ELISI.find((p) => minuscola.startsWith(p)) ?? "";
        return `${forma.slice(0, prefisso.length)}'${forma.slice(prefisso.length)}`;
      })
  );
}
