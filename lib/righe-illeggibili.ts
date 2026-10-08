/**
 * Toglie dalle schede le righe che non sono testo: citazioni decorative, didascalie delle
 * illustrazioni, numeri di pagina, glifi.
 *
 * I bestiari mettono accanto alle schede una citazione in un font calligrafico e, sotto le
 * illustrazioni, il nome del mostro in maiuscoletto. Lo strato di testo del PDF non sa leggerli e
 * l'estrazione li infila in mezzo a tratti e azioni:
 *
 *     Emergere (costa 2 azioni). Lo zaratan riemerge dal guscio…
 *     §1 'i§ - ±'!:S: g+g!fW
 *     ifS
 *
 * lib/prosa-di-pagina.ts toglie la prosa (testo vero, ma di un'altra parte della pagina) e
 * riconosce i glifi solo dalla forma. Qui si usa ciò che allora mancava, un vocabolario: una riga
 * fatta in buona parte di parole che non esistono non è una riga del manuale. Restavano così quasi
 * quattrocento righe in duecento schede.
 *
 * Una riga VERA con un refuso dentro non si tocca («condizioni di accecato, affascinato,
 * ac;c;ordato»): la si riconosce dalle parole vere e lunghe che ha attorno, e va corretta, non
 * tolta. Ogni eccezione qui sotto viene dall'anteprima sulle schede, letta riga per riga.
 *
 * Che cosa sia una parola lo decide chi chiama; il file è senza dipendenze e si prova da solo.
 */

export interface RigheTolte {
  testo: string;
  /** Le righe eliminate per intero. */
  tolte: string[];
  /** Le righe a cui è stata tolta solo una coda di glifi: [prima, dopo]. */
  accorciate: [string, string][];
}

type Nota = (parola: string) => boolean;

/** Simboli che in una scheda non compaiono mai. */
const SIMBOLI_ESTRANEI = /[<>{}[\]@€&|\\~^`_#*=§±µ$«»ώ]/;
/** Punteggiatura in mezzo a una parola, senza spazio: «ia,nte», «Je.I», «q,uel». */
const PUNTEGGIATURA_DENTRO = /\p{L}[,.;:]\p{L}/gu;
/** I titoli delle sezioni: se sono rimasti dentro una sezione la scheda va risuddivisa, non pulita. */
const TITOLO_DI_SEZIONE = /^\s*(AZIONI|AZIONI BONUS|REAZIONI|AZIONI LEGGENDARIE|AZIONI MITICHE|TRATTI)\s*$/;
/** I titoli dei riquadri che fanno parte della scheda. */
const TITOLO_DI_RIQUADRO = /^\s*(VARIANTE|OGGETTO MAGICO)\b/i;

function parole(riga: string): string[] {
  return riga.match(/\p{L}+/gu) ?? [];
}

function quotaMaiuscole(testo: string): number {
  const lettere = testo.match(/\p{L}/gu) ?? [];
  if (lettere.length === 0) return 0;
  return lettere.filter((l) => l !== l.toLowerCase()).length / lettere.length;
}

type Giudizio = "buona" | "rumore" | "debole";

/**
 * "rumore" si toglie comunque; "debole" (un numero da solo, una parola sconosciuta da sola) si
 * toglie solo se sta accanto a del rumore: da sola può essere la fine della frase della riga prima.
 */
function giudica(riga: string, nota: Nota): Giudizio {
  const testo = riga.trim();
  if (!testo || TITOLO_DI_SEZIONE.test(testo) || TITOLO_DI_RIQUADRO.test(testo)) return "buona";
  // «(CD 15)», «(3d6)», «(1/giorno)» andati a capo da soli: una parentesi chiusa con dentro un
  // numero è la fine di una frase di regole, non un glifo.
  if (/^\([^()]*\d[^()]*\)[.,;:]?$/.test(testo)) return "buona";
  const tutte = parole(testo);

  // Nessuna lettera: una fila di simboli è rumore, un numero da solo forse no («CD» a capo «13,»).
  if (tutte.length === 0) return /[#§$%&*=<>{}@€±µ•·'"?!^~\\|]/.test(testo) ? "rumore" : "debole";

  // Una riga in maiuscolo: la didascalia di un'illustrazione o una citazione in maiuscoletto.
  if ((testo.match(/\p{L}/gu) ?? []).length >= 6 && quotaMaiuscole(testo) >= 0.6) return "rumore";

  const lunghe = tutte.filter((p) => p.length >= 2);
  // Solo lettere isolate: «• g;:e, 54», «(1· i». In una riga vera c'è almeno una parola.
  if (lunghe.length === 0) return /[•·;:=?!#§]/.test(testo) || SIMBOLI_ESTRANEI.test(testo) ? "rumore" : "debole";
  const ignote = lunghe.filter((p) => !nota(p.toLowerCase()));
  const quota = lunghe.length === 0 ? 0 : 1 - ignote.length / lunghe.length;
  const vereELunghe = lunghe.filter((p) => p.length >= 6 && nota(p.toLowerCase())).length;

  // Il font calligrafico esce con la punteggiatura dentro le parole. Due volte in una riga senza
  // quasi parole vere è una citazione; in mezzo a parole vere è un refuso da correggere.
  if ((testo.match(PUNTEGGIATURA_DENTRO) ?? []).length >= 2 && quota < 0.9 && vereELunghe < 2) return "rumore";

  // Simboli che il manuale non usa, e attorno nemmeno una parola: «ET#S & t», «rl pt j;p 62§».
  // Una riga vera con un simbolo fuori posto («già inclusi nell'attacco}») le parole le ha.
  if (SIMBOLI_ESTRANEI.test(testo) && !lunghe.some((p) => p.length >= 4 && nota(p.toLowerCase()))) return "rumore";

  // Lettere e cifre attaccate non sono un refuso di lettura ma un altro alfabeto: «r0inchio».
  const cifreDentro = /\p{L}\d|\d\p{L}{2,}/u.test(testo.replace(/\b\d+d\d+\b/g, ""));
  if (ignote.length === 0 && !cifreDentro) return "buona";

  // Una parola sola e sconosciuta. Il nome storpiato sotto un'illustrazione è in maiuscolo o
  // brevissimo («BULETTR», «SaSS», «rld»); una parola lunga in minuscolo può chiudere la frase
  // della riga prima («lncapacitato.», «(Percetione).») e allora è un refuso.
  if (tutte.length === 1) {
    const parola = tutte[0];
    if (parola.length <= 4 || quotaMaiuscole(parola) >= 0.6) return "rumore";
    return "debole";
  }
  // Una riga vera con un refuso ha attorno parole vere, e di solito lunghe: «produrre fiammo»,
  // «att.icchi di opportunità». Senza nemmeno una parola lunga riconosciuta è rumore.
  if (quota < 0.6 && vereELunghe === 0) return "rumore";
  // Con una sola parola vera attorno non si può dire: decide ciò che le sta accanto.
  const vere = lunghe.filter((p) => p.length >= 5 && nota(p.toLowerCase())).length;
  return vere < 2 ? "debole" : "buona";
}

/**
 * La coda di glifi rimasta attaccata a una riga buona: «…l'azione Disimpegno.::s zsq». Si cerca
 * l'ultima parola vera della riga: se subito dopo c'è un punto fermo e poi qualcosa che non
 * contiene nemmeno una parola, quel qualcosa si toglie. Una riga che continua con testo vero
 * («…per fuggire); se la») o che finisce con la sua punteggiatura («…incantesimo 20):») non ha
 * niente da togliere: la prima versione tagliava dopo ogni parentesi chiusa, e l'anteprima
 * mostrava 176 righe accorciate, quasi tutte buone.
 */
function senzaCoda(riga: string, nota: Nota): string {
  let fineUltimaParola = -1;
  for (const m of riga.matchAll(/\p{L}+/gu)) {
    if (m[0].length >= 3 && nota(m[0].toLowerCase())) fineUltimaParola = m.index + m[0].length;
  }
  if (fineUltimaParola < 0 || riga[fineUltimaParola] !== ".") return riga;
  const coda = riga.slice(fineUltimaParola + 1);
  if (!coda.trim() || coda.length > 30) return riga;
  // Virgolette e parentesi che chiudono la frase sono punteggiatura, non glifi.
  if (/^[\s)»"'’”]+$/.test(coda)) return riga;
  // «…la magia. I» è l'articolo della frase che continua alla riga dopo.
  if (/^\s*[aeioè]\s*$/i.test(coda)) return riga;
  if (codaDaTenere(coda.trim())) return riga;
  if (parole(coda).some((p) => p.length >= 2 && nota(p.toLowerCase()))) return riga;
  return riga.slice(0, fineUltimaParola + 1);
}

/** Una didascalia in maiuscolo resta tale anche se, tagliata, ne avanza un pezzo che è una parola. */
function eDidascalia(riga: string): boolean {
  const testo = riga.trim();
  if (TITOLO_DI_SEZIONE.test(testo) || TITOLO_DI_RIQUADRO.test(testo)) return false;
  return (testo.match(/\p{L}/gu) ?? []).length >= 6 && quotaMaiuscole(testo) >= 0.6;
}

/**
 * Dove finisce il testo vero di una sezione, se dopo l'ultima frase resta qualcosa che testo non
 * è: il nome del mostro stampato a piè di pagina e letto male («DRAC;O», «Az:ER», «..ABOLETH»),
 * o qualche glifo («e ez», «s ss», «5W»). Restituisce -1 se non c'è niente da togliere.
 *
 * È il caso che le regole riga per riga non vedono: «e ez» è fatta di una parola vera e di un
 * mozzicone, e accanto non ha altro rumore. In fondo alla sezione però non può esserci una riga
 * che non chiude una frase e non ha nemmeno una parola lunga: una settantina di schede finivano
 * così. Un elenco («1/giorno: paura») ha parole vere e resta; il titolo di un riquadro pure.
 */
const CODA_CHE_È_UN_DATO =
  /\d+d\d+|\bCD\b|\d\s?(?:m|metri|km|cm|kg|mo|ma|mr|PF|PE)\b|^[+-]\d+$|\d+\/\d+|^\([^()]*\d[^()]*\)$/;
/** Una coda corta che non è rumore: un dato di gioco, o una battuta fra virgolette. */
function codaDaTenere(coda: string): boolean {
  return CODA_CHE_È_UN_DATO.test(coda) || /^["«“'‘].*["»”'’]$/.test(coda);
}

function fineDelTestoVero(testo: string, nota: Nota): number {
  const fine = testo.trimEnd();
  // L'ultimo punto che chiude una frase vera: dopo una parola del testo o una parentesi. Il nome
  // in maiuscolo non conta («…dalla creatura..ABOLETH» finisce a «creatura.»).
  let taglio = -1;
  // Le virgolette che chiudono la frase ne fanno parte («Il drago ruggisce. "Via!"»).
  for (const m of fine.matchAll(/(\p{L}+|\))[.!?]["»”’']?(?=\s|[.!?,;:]|\p{Lu}|$)/gu)) {
    const prima = m[1];
    if (prima === ")" || (prima.length >= 3 && prima !== prima.toUpperCase() && nota(prima.toLowerCase()))) {
      taglio = m.index + m[0].length;
    }
  }
  if (taglio < 0) return -1;
  const coda = fine.slice(taglio).trim();
  if (!coda || coda.length > 30) return -1;
  if (/^[)»"'’”]+$/.test(coda) || TITOLO_DI_RIQUADRO.test(coda)) return -1;
  // Il titolo di una sezione rimasto in fondo dice che la scheda va risuddivisa: non si nasconde.
  if (coda.split("\n").some((riga) => TITOLO_DI_SEZIONE.test(riga))) return -1;
  // «…la magia. I» è l'articolo di una frase che continua altrove.
  if (/^[aeioè]$/i.test(coda)) return -1;
  // Una coda che ha la forma di un dato di gioco è testo, per quanto corta: dadi, una CD, una
  // misura, un bonus, una gittata doppia, una parentesi con dei numeri. Meglio lasciare due
  // glifi che togliere «(CD 15)».
  if (codaDaTenere(coda)) return -1;
  const eParolaDiTesto = (p: string) => p.length >= 4 && p !== p.toUpperCase() && nota(p.toLowerCase());
  return parole(coda).some(eParolaDiTesto) ? -1 : taglio;
}

export function togliRigheIllegibili(testoIntero: string, nota: Nota): RigheTolte {
  const accorciate: [string, string][] = [];
  const tolteInFondo: string[] = [];
  const fineVera = fineDelTestoVero(testoIntero, nota);
  const testo = fineVera < 0 ? testoIntero : testoIntero.slice(0, fineVera);
  if (fineVera >= 0) {
    const prima = testoIntero.split("\n");
    const dopo = testo.split("\n");
    const ultima = dopo.length - 1;
    if (prima[ultima] !== dopo[ultima]) accorciate.push([prima[ultima], dopo[ultima]]);
    tolteInFondo.push(...prima.slice(dopo.length).filter((riga) => riga.trim()));
  }
  const righe = testo.split("\n").map((riga) => {
    if (eDidascalia(riga)) return riga;
    const pulita = senzaCoda(riga, nota);
    if (pulita !== riga) accorciate.push([riga, pulita]);
    return pulita;
  });
  const giudizi = righe.map((riga) => giudica(riga, nota));
  const chiudeUnaFrase = (riga: string | undefined) => riga === undefined || /[.!?:]["»”)]?\s*$/.test(riga);

  // Una riga debole che continua la frase della riga buona di prima è testo: «…non è» a capo
  // «lncapacitato.». Si decide prima di guardare il rumore attorno, e non cambia più.
  giudizi.forEach((g, i) => {
    if (g === "debole" && giudizi[i - 1] === "buona" && !chiudeUnaFrase(righe[i - 1])) giudizi[i] = "buona";
  });

  // Le altre righe deboli accanto al rumore sono rumore: una citazione illeggibile occupa più
  // righe, e fra una riga di glifi e l'altra restano numeri sparsi e mozziconi di parola. Lo
  // stesso vale per i numeri rimasti in fondo alla sezione, dopo l'ultima frase: sono i numeri
  // di pagina.
  for (let cambiato = true; cambiato; ) {
    cambiato = false;
    giudizi.forEach((g, i) => {
      if (g !== "debole") return;
      const accantoAlRumore = giudizi[i - 1] === "rumore" || giudizi[i + 1] === "rumore";
      const numeroInFondo = !/\p{L}/u.test(righe[i]) && giudizi.slice(i + 1).every((x) => x === "rumore");
      if (accantoAlRumore || numeroInFondo) {
        giudizi[i] = "rumore";
        cambiato = true;
      }
    });
  }

  const tolte = [...righe.filter((_, i) => giudizi[i] === "rumore"), ...tolteInFondo];
  // Di una riga tolta non interessa che prima fosse stata anche accorciata.
  const rimaste = new Set(righe.filter((_, i) => giudizi[i] !== "rumore"));
  const esito = {
    testo: righe.filter((_, i) => giudizi[i] !== "rumore").join("\n"),
    tolte,
    accorciate: accorciate.filter(([, dopo]) => rimaste.has(dopo)),
  };
  // Tolte le righe di glifi, ciò che resta in fondo può essere a sua volta una coda da togliere
  // (e viceversa): si ripete finché il testo non cambia più, così una passata sola dà lo stesso
  // risultato di più passate — chi confronta due testi puliti deve poterci contare.
  if (esito.testo === testoIntero) return esito;
  const ancora = togliRigheIllegibili(esito.testo, nota);
  return {
    testo: ancora.testo,
    tolte: [...esito.tolte, ...ancora.tolte],
    accorciate: [...esito.accorciate, ...ancora.accorciate],
  };
}
