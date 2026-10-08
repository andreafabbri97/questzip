/**
 * Ricuce le parole che l'estrazione dal PDF ha spezzato con uno spazio.
 *
 * Nei manuali impaginati con il maiuscoletto (Bigby, Fizban, Dragonlance, Mostri del Multiverso)
 * lo strato di testo stacca le lettere strette: «contu ndenti», «i nferiore», «u n attacco»,
 * «i m med iatamente», «ri poso l u ngo». Le regole di lib/ocr-cleanup.ts ne riparano alcune
 * forme note, ma la spezzatura cade in un punto qualunque della parola e un elenco non la chiude
 * mai: dopo tutte le passate ne restavano un migliaio, in schede che a colpo d'occhio sembrano a
 * posto.
 *
 * Qui non c'è un elenco: per ogni fila di pezzi si cerca il modo di raggrupparli che lascia meno
 * pezzi che NON sono parole. Tre cose tengono a bada gli errori, tutte nate dall'anteprima sui
 * testi veri (la prima versione univa da sinistra il gruppo più lungo, e «Il d ragonide»
 * diventava «Ild ragonide»):
 *   - pezzi che sono già tutti parole non si uniscono: «se i» resta così, anche se «sei» esiste;
 *   - a parità di pezzi estranei vince il raggruppamento fatto delle parole più COMUNI: «i n vita»
 *     è «in vita» e non «invita», «incantesi mo» è «incantesimo» e non «incantesi» + «mo»;
 *   - per unire serve più certezza che per lasciare stare (vedi `unibile`).
 *
 * Che cosa sia una parola lo decide chi chiama (un dizionario più il vocabolario dei testi puliti
 * del Compendio): il file resta senza dipendenze e si prova con un elenco finto.
 */

export interface Vocabolario {
  /** La parola, in minuscolo, sta bene da sola. */
  nota: (parola: string) => boolean;
  /**
   * I pezzi, uniti, fanno una parola. Può essere più severa di `nota`: per unire serve più
   * certezza che per lasciare stare. Se manca vale `nota` sulla parola unita.
   */
  unibile?: (pezzi: string[]) => boolean;
  /**
   * Quante volte la parola (in minuscolo) compare nei testi puliti; un valore sotto 1 per quelle
   * che stanno solo nel dizionario. Serve a scegliere fra due raggruppamenti ugualmente puliti.
   * Se manca, vince quello che unisce di meno.
   */
  peso?: (parola: string) => number;
  /** Quante parole contano in tutto i testi da cui vengono i pesi: li rende frequenze. */
  totale?: number;
  /**
   * Unisce solo dove almeno un pezzo non è una parola affatto, mai due parole vere di cui una
   * "non si vede mai". Per la prosa lunga, piena di parole vere ma rare: lì «tratti di aspro
   * terreno» diventava «diaspro», la gemma.
   */
  soloPezziEstranei?: boolean;
}

export interface Ricucitura {
  /** Com'era scritto: «contu ndenti». */
  prima: string;
  /** Com'è diventato: «contundenti». */
  dopo: string;
}

/** Le sole parole italiane di una lettera: ogni altra lettera isolata è un pezzo di parola. */
const PAROLE_DI_UNA_LETTERA = new Set(["a", "e", "i", "o", "è"]);
/** Dopo un numero queste non sono pezzi di parola ma unità di misura: «1,5 m o gittata 9 m». */
const UNITA_DI_MISURA = new Set(["m", "km", "cm", "mm", "kg", "g", "l"]);
const MAX_PEZZI = 12;
/** Da questo peso in su una parola è d'uso corrente nei testi del gioco. */
const PESO_DI_PAROLA_COMUNE = 5;
/**
 * Sotto questo peso una parola nei testi puliti non si vede (una volta sola può essere un refuso
 * anche là): esiste nel dizionario, ma nessuno la scrive. «ri», «poso», «ria», «termi».
 */
const PESO_DI_PAROLA_MAI_VISTA = 2;
/**
 * Quanto costa ogni unione nel confronto fra due letture ugualmente pulite: uno spazio nel testo
 * è più spesso vero che falso. Tiene «in vita» lontano da «invita» anche quando i conti sono
 * vicini.
 */
const COSTO_DI_UN_UNIONE = 2;
/** Tre o più lettere con la maiuscola in testa: un nome proprio, o l'inizio di una frase. */
const INIZIA_DA_NOME = /^\p{Lu}\p{L}{2,}$/u;

interface Pezzo {
  /** Punteggiatura d'apertura attaccata alla parola: `(`, `«`, `"`. */
  apertura: string;
  lettere: string;
  /** Il segno di a-capo rimasto dentro la parola («incan· tesimi», «imme- diatamente»). */
  sillabazione: string;
  /** Punteggiatura di chiusura: `,`, `.`, `)`. */
  chiusura: string;
  /** Unità di misura dopo un numero: sta da sola e non si unisce a niente. */
  unita: boolean;
}

function scomponi(token: string, precedente: string | undefined): Pezzo | null {
  const m = token.match(/^([("«'‘“]*)(\p{L}+)([·-]?)([.,;:!?)»"'’”]*)$/u);
  if (!m) return null;
  // Il segno di sillabazione e la punteggiatura di chiusura non stanno insieme.
  if (m[3] && m[4]) return null;
  const unita = UNITA_DI_MISURA.has(m[2]) && precedente !== undefined && /\d$/.test(precedente);
  return { apertura: m[1], lettere: m[2], sillabazione: m[3], chiusura: m[4], unita };
}

const tuttoMaiuscolo = (s: string) => s === s.toUpperCase() && s !== s.toLowerCase();
const tuttoMinuscolo = (s: string) => s === s.toLowerCase();

/** I pezzi da `da` a `a` (escluso) possono diventare una parola sola? */
function gruppoUnibile(
  pezzi: Pezzo[],
  da: number,
  a: number,
  vocabolario: Vocabolario,
  daSolo: (p: Pezzo) => boolean,
): boolean {
  const gruppo = pezzi.slice(da, a);
  for (let k = 0; k < gruppo.length; k++) {
    const p = gruppo[k];
    if (p.unita) return false;
    // Solo il primo pezzo può aprirsi con una parentesi, solo l'ultimo chiudersi con un punto.
    if (k > 0 && p.apertura) return false;
    if (k < gruppo.length - 1 && p.chiusura) return false;
    // L'a-capo sillabato lascia almeno due lettere prima del segno: «s·» è un «5°» letto male.
    if (p.sillabazione && (k === gruppo.length - 1 || p.lettere.length < 2)) return false;
  }
  const lettere = gruppo.map((p) => p.lettere);
  const peso = vocabolario.peso;
  const tuttiParole = gruppo.every(daSolo);
  // Se ogni pezzo è già una parola, di norma sono parole vicine e non c'è niente da ricucire.
  // Fanno eccezione le "parole" che i dizionari conoscono ma nessuno scrive («ri», «poso»,
  // «termi»): se un pezzo nei testi puliti non si vede mai e la parola unita invece è d'uso
  // corrente, è una parola spezzata («ri poso», «fu ria»). Basta che i pezzi si vedano entrambi
  // perché restino due parole: «norma le Navi», «sala mensa e sala comune», «artigli o morso».
  // Senza i pesi questa distinzione non si può fare, e non si unisce.
  if (tuttiParole) {
    if (!peso || vocabolario.soloPezziEstranei) return false;
    // Che cosa prova che un pezzo non è una parola a sé:
    //  - non è nel vocabolario affatto, e passava solo perché ha la maiuscola di un nome («Pau ra»,
    //    «Percezio ne», «CE LESTIALI»). Non vale se l'altro pezzo è una parola di una lettera: lì è
    //    un nome vero seguito da una congiunzione («il Vast e…», «TORIL E LE SUE TERRE»);
    //  - è nel vocabolario ma nei testi non si vede mai («ri poso»). Non vale per una parola con
    //    la maiuscola: un nome è raro per definizione («Alter a» resta così).
    const conParolaDiUnaLettera = lettere.some((l) => l.length === 1);
    const pezzoMaiVisto = lettere.some((l) => {
      const parola = l.toLowerCase();
      if (l.length < 2) return false;
      if (!vocabolario.nota(parola)) return !conParolaDiUnaLettera;
      return !INIZIA_DA_NOME.test(l) && peso(parola) < PESO_DI_PAROLA_MAI_VISTA;
    });
    if (!pezzoMaiVisto || peso(lettere.join("").toLowerCase()) < PESO_DI_PAROLA_COMUNE) return false;
  }
  // Una parola che nei testi puliti non si vede mai è un'unione sospetta: i dizionari grandi
  // hanno anche «ledoti», «dartele», «mogie». Vale solo se nessun pezzo lungo stava in piedi da
  // solo: «rigu rgitare» sì, «l e doti» no (è «le doti»).
  if (peso && peso(lettere.join("").toLowerCase()) < PESO_DI_PAROLA_MAI_VISTA) {
    if (gruppo.some((pz) => pz.lettere.length >= 2 && daSolo(pz))) return false;
  }
  // Le maiuscole di una parola stanno in testa («G rande») o dappertutto («AZI O N I»): una
  // maiuscola dopo una minuscola è un'altra parola («con C A», «passiva l O»).
  const maiuscoleCoerenti = lettere.every(tuttoMaiuscolo) || lettere.slice(1).every(tuttoMinuscolo);
  if (!maiuscoleCoerenti) return false;
  return vocabolario.unibile ? vocabolario.unibile(lettere) : vocabolario.nota(lettere.join("").toLowerCase());
}

function ricuciFila(pezzi: Pezzo[], token: string[], vocabolario: Vocabolario, ricuciture: Ricucitura[]): string[] {
  const daSolo = (p: Pezzo) => {
    if (p.unita) return true;
    const parola = p.lettere.toLowerCase();
    if (parola.length === 1) return PAROLE_DI_UNA_LETTERA.has(parola);
    // Un nome proprio che il vocabolario non conosce resta una parola: «Toril e» non è «Torile»,
    // e nemmeno «TORIL E LE SUE TERRE» in un titolo.
    if (parola.length >= 3 && /^\p{Lu}(\p{Ll}+|\p{Lu}+)$/u.test(p.lettere)) return true;
    return vocabolario.nota(parola);
  };

  // Quanto vale una parola nel confronto: il logaritmo della sua frequenza (quindi negativo: più
  // parole costano di più, ma una parola rara costa più di due comuni), meno il costo delle unioni
  // che è servita a farla. Senza `peso` conta solo il numero di unioni.
  const totaleParole = vocabolario.totale ?? 1_000_000;
  const valore = (parola: string, unioni: number) =>
    (vocabolario.peso ? Math.log(Math.max(vocabolario.peso(parola), 1e-9) / totaleParole) : 0) -
    COSTO_DI_UN_UNIONE * unioni;

  // migliore[j]: il raggruppamento dei primi j pezzi con meno pezzi estranei e, a parità, col
  // valore più alto. `da` è l'inizio dell'ultimo gruppo.
  const migliore: { estranei: number; valore: number; da: number }[] = [{ estranei: 0, valore: 0, da: 0 }];
  for (let j = 1; j <= pezzi.length; j++) {
    let scelta = { estranei: Infinity, valore: -Infinity, da: j - 1 };
    for (let i = j - 1; i >= Math.max(0, j - MAX_PEZZI); i--) {
      const dimensione = j - i;
      if (dimensione > 1 && !gruppoUnibile(pezzi, i, j, vocabolario, daSolo)) continue;
      const estraneo = dimensione === 1 && !daSolo(pezzi[i]);
      const estranei = migliore[i].estranei + (estraneo ? 1 : 0);
      const parola = pezzi.slice(i, j).map((p) => p.lettere).join("").toLowerCase();
      const totale = migliore[i].valore + (estraneo ? 0 : valore(parola, dimensione - 1));
      if (estranei < scelta.estranei || (estranei === scelta.estranei && totale > scelta.valore)) {
        scelta = { estranei, valore: totale, da: i };
      }
    }
    migliore.push(scelta);
  }

  const gruppi: [number, number][] = [];
  for (let j = pezzi.length; j > 0; j = migliore[j].da) gruppi.unshift([migliore[j].da, j]);

  return gruppi.map(([da, a]) => {
    if (a - da === 1) return token[da];
    const unito = pezzi[da].apertura + pezzi.slice(da, a).map((p) => p.lettere).join("") + pezzi[a - 1].chiusura;
    ricuciture.push({ prima: token.slice(da, a).join(" "), dopo: unito });
    return unito;
  });
}

function ricuciRiga(riga: string, vocabolario: Vocabolario, ricuciture: Ricucitura[]): string {
  const token = riga.split(" ");
  const out: string[] = [];
  let fila: Pezzo[] = [];
  let inizio = 0;
  const chiudi = (fine: number) => {
    if (fila.length > 0) out.push(...ricuciFila(fila, token.slice(inizio, fine), vocabolario, ricuciture));
    fila = [];
  };

  for (let i = 0; i < token.length; i++) {
    const pezzo = scomponi(token[i], token[i - 1]);
    if (pezzo) {
      if (fila.length === 0) inizio = i;
      fila.push(pezzo);
    } else {
      chiudi(i);
      out.push(token[i]);
    }
  }
  chiudi(token.length);
  return out.join(" ");
}

/**
 * La parola andata a capo fra due righe col segno rimasto in fondo alla prima: «scom·» / «pare
 * all'istante», «imme-» / «diatamente prima». Il pezzo della riga dopo sale a completare la
 * parola; gli a-capo restano dov'erano. Solo se l'unione è una parola e il segno segue almeno due
 * lettere: un trattino in fondo alla riga può anche essere un inciso.
 */
function ricuciACapo(righe: string[], vocabolario: Vocabolario, ricuciture: Ricucitura[]): string[] {
  const out = [...righe];
  for (let i = 0; i < out.length - 1; i++) {
    const fine = out[i].match(/^(.*?)(\p{L}{2,})[·-]\s*$/u);
    // La punteggiatura attaccata al pezzo sale con lui: «incan-» / «tesimi, lancia».
    const inizio = out[i + 1].match(/^(\s*)(\p{Ll}+)([.,;:!?)»]*)(.*)$/u);
    if (!fine || !inizio) continue;
    const unita = fine[2] + inizio[2];
    const unibile = vocabolario.unibile ? vocabolario.unibile([fine[2], inizio[2]]) : vocabolario.nota(unita.toLowerCase());
    if (!unibile) continue;
    ricuciture.push({ prima: `${fine[2]}·/${inizio[2]}`, dopo: unita });
    out[i] = fine[1] + unita + inizio[3];
    out[i + 1] = inizio[4].replace(/^ /, "");
  }
  // La riga dopo può essere rimasta vuota (conteneva solo la coda della parola).
  return out.filter((riga, i) => riga !== "" || righe[i] === "");
}

/**
 * Ricuce le parole spezzate di un testo, riga per riga (gli a-capo restano dove sono).
 * Restituisce anche l'elenco di ciò che ha unito: va letto prima di scrivere nel database.
 */
export function ricuciParoleSpezzate(
  testo: string,
  vocabolario: Vocabolario,
): { testo: string; ricuciture: Ricucitura[] } {
  const ricuciture: Ricucitura[] = [];
  const righe = testo.split("\n").map((riga) => ricuciRiga(riga, vocabolario, ricuciture));
  return { testo: ricuciACapo(righe, vocabolario, ricuciture).join("\n"), ricuciture };
}
