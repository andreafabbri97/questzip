/**
 * Ripara i refusi che un vocabolario basta a riconoscere, senza rileggere la pagina.
 *
 * Certe scansioni sbagliano sempre nello stesso modo: perdono l'apostrofo («dargento», «lisola»,
 * «dellordine»), una lettera delle legature tipografiche fi/fl/ff («infuenza», «fgure», «efetto»),
 * l'accento in fondo alla parola («tribu», «perche») e leggono la g del corsivo come una é
 * («Siénora», «leéée»). Le forme possibili sono migliaia — la Guida della Costa della Spada ne
 * aveva più di seicento — quindi un elenco chiuso non basta. Ma ognuna ha la stessa firma: la
 * parola com'è scritta NON esiste, e c'è UN SOLO modo di rimetterle ciò che manca per ottenere
 * una parola che esiste.
 *
 * Per questo la regola non indovina mai:
 * - una parola che esiste non si tocca, anche se nel contesto è sbagliata («doro» è una voce di
 *   «dorare»: resta, e va corretta a mano);
 * - se le riparazioni possibili sono due non si sceglie: «fume» può essere «fiume» o «flume»,
 *   «dallora» può essere «dall'ora» o «d'allora»;
 * - la parola riparata deve essere IN USO, non soltanto in un dizionario. I dizionari fatti a
 *   macchina contengono di tutto («eira», «ife», «ong») e mancano di parole comuni («chilometro»):
 *   con il solo dizionario la dea Leira diventava «L'eira» e «sfoggio» diventava «sfoggiò».
 *   Fanno eccezione le parole lunghe, dove una coincidenza non è credibile;
 * - l'accento si rimette solo dove non c'è un'altra lettura: i nomi in -tà e in -ù, le congiunzioni
 *   in -ché e poche parole fisse. «Sfoggio» e «sfoggiò», «ando» e «andò» esistono entrambe;
 * - «un» senza apostrofo davanti a una vocale è quasi sempre uno spazio perso («unattacco» è
 *   «un attacco»): l'apostrofo si rimette solo davanti a una parola in -a («un'altra»).
 *
 * Che cosa sia una parola lo decide chi chiama; il file è senza dipendenze e si prova da solo.
 */

export type TipoDiRefuso = "apostrofo" | "legatura" | "accento" | "lettera";

export interface Riparazione {
  prima: string;
  dopo: string;
  tipo: TipoDiRefuso;
}

export interface VocabolarioPerRefusi {
  /** Vero se la parola (in minuscolo) esiste: sta in un dizionario o nei testi del gioco. */
  nota: (parola: string) => boolean;
  /** Vero se la parola è in uso nei testi puliti. Se manca, vale `nota`. */
  comune?: (parola: string) => boolean;
}

const PREFISSI_ELISI = ["quest", "quell", "dell", "dall", "nell", "sull", "coll", "all", "un", "l", "d"];
const VOCALE_O_ACCA = /^[aeiouàèéìòùh]/;
const APOSTROFO = /['’]/;
// Quanto deve essere lunga una parola che sta solo nel dizionario perché ci si possa fidare.
const LUNGHEZZA_CHE_NON_È_UN_CASO = 7;
// Dopo un apostrofo rimesso basta meno, se la parola è scritta in minuscolo: «l'usanza»,
// «d'erica». Con la maiuscola può essere un nome («Darante»), e si torna alla soglia piena.
const LUNGHEZZA_DOPO_L_APOSTROFO = 5;
// Parole inglesi che una lettera in più trasformerebbe in parole del gioco («find» -> «flind»).
const INGLESI = new Set(["find", "fight"]);
// L'accento finale che non ha un'altra lettura.
const SEMPRE_ACCENTATE = new Set(["bensì", "così", "cioè", "però", "perciò", "più", "già", "giù", "lassù", "laggiù", "quaggiù", "finché", "rothé"]);
// In italiano una parola non finisce per u senza accento: «tribu», «schiavitu», «virtu».
const FINALI_ACCENTATE = /(?:tà|ù|ché)$/;
const ACCENTATE: Record<string, string[]> = { a: ["à"], e: ["è", "é"], i: ["ì"], o: ["ò"], u: ["ù"] };

/** Rimette la maiuscola della forma originale sulla forma riparata. */
function comeLOriginale(originale: string, riparata: string): string {
  if (originale === originale.toUpperCase() && originale.length > 1) return riparata.toUpperCase();
  if (originale[0] === originale[0].toUpperCase()) return riparata[0].toUpperCase() + riparata.slice(1);
  return riparata;
}

/**
 * @param tipi  i tipi di refuso da riparare; senza, tutti. Un testo che ha perso soltanto gli
 *              accenti (il Calderone di Tasha) non deve vedersi "riparare" anche le é.
 */
export function riparaRefusiDaVocabolario(
  testo: string,
  vocabolario: VocabolarioPerRefusi,
  tipi?: TipoDiRefuso[],
): { testo: string; riparazioni: Riparazione[] } {
  const { nota } = vocabolario;
  const comune = vocabolario.comune ?? nota;
  const attivo = (tipo: TipoDiRefuso) => !tipi || tipi.includes(tipo);
  const credibile = (parola: string, lunghezzaMinima = LUNGHEZZA_CHE_NON_È_UN_CASO) =>
    comune(parola) || (parola.length >= lunghezzaMinima && nota(parola));

  const conLegatura = (parola: string): string[] => {
    if (INGLESI.has(parola)) return [];
    const candidate = new Set<string>();
    // La legatura è seguita da altre lettere: una effe in fondo alla parola non ne ha persa una.
    for (let i = 0; i < parola.length - 1; i++) {
      if (parola[i] !== "f") continue;
      // fi, fl: la lettera dopo la effe; ff: la seconda effe.
      for (const persa of ["i", "l", "f"]) {
        const forma = parola.slice(0, i + 1) + persa + parola.slice(i + 1);
        if (credibile(forma)) candidate.add(forma);
      }
    }
    return [...candidate];
  };

  /** Le letture «prefisso'resto» possibili: [dove cade l'apostrofo, il resto riparato]. */
  const conApostrofo = (forma: string): [number, string][] => {
    const parola = forma.toLowerCase();
    const letture: [number, string][] = [];
    for (const prefisso of PREFISSI_ELISI) {
      if (!parola.startsWith(prefisso)) continue;
      const resto = parola.slice(prefisso.length);
      // Tre lettere almeno: «l'io» o «d'un» esistono, ma «lio» e «dun» sono più spesso rumore.
      if (resto.length < 3 || !VOCALE_O_ACCA.test(resto)) continue;
      if (prefisso === "un" && !resto.endsWith("a")) continue;
      const restoScritto = forma.slice(prefisso.length);
      // «dellAmn», «lAlleanza»: una maiuscola in mezzo alla parola, dopo un prefisso minuscolo,
      // può essere soltanto un nome proprio rimasto senza apostrofo.
      const nomeProprio = /\p{Ll}$/u.test(forma.slice(0, prefisso.length)) && /^\p{Lu}\p{Ll}/u.test(restoScritto);
      const minimo = forma === parola ? LUNGHEZZA_DOPO_L_APOSTROFO : LUNGHEZZA_CHE_NON_È_UN_CASO;
      if (nomeProprio || credibile(resto, minimo)) {
        letture.push([prefisso.length, restoScritto]);
        continue;
      }
      // «linfuenza»: l'apostrofo e la legatura persi insieme.
      const legate = attivo("legatura") ? conLegatura(resto) : [];
      if (legate.length === 1) letture.push([prefisso.length, comeLOriginale(restoScritto, legate[0])]);
    }
    return letture;
  };

  const conAccento = (parola: string): string[] => {
    const finale = parola.at(-1) ?? "";
    if (!ACCENTATE[finale]) return [];
    return ACCENTATE[finale]
      .map((v) => parola.slice(0, -1) + v)
      .filter((forma) => (SEMPRE_ACCENTATE.has(forma) || FINALI_ACCENTATE.test(forma)) && credibile(forma));
  };

  // «Siénora», «leéée»: la g del corsivo letta come é. In fondo alla parola la é è un accento vero.
  const conLaG = (parola: string): string[] => {
    const corpo = parola.slice(0, -1);
    if (!corpo.includes("é")) return [];
    const forma = corpo.replace(/é/g, "g") + parola.slice(-1);
    return credibile(forma) ? [forma] : [];
  };

  const riparazioni: Riparazione[] = [];
  // Un accento scritto come lettera più segno («e» + U+0301) non sarebbe riconosciuto come «é».
  const riparato = testo.normalize("NFC").replace(/\p{L}{4,}/gu, (forma, posizione: number, intero: string) => {
    const parola = forma.toLowerCase();
    if (nota(parola)) return forma;
    // Una parola attaccata a un apostrofo è già elisa («dell'infuenza»): può aver perso una
    // lettera, non un altro apostrofo.
    const giaElisa = APOSTROFO.test(intero[posizione - 1] ?? "") || APOSTROFO.test(intero[posizione + forma.length] ?? "");
    const proposte: { tipo: TipoDiRefuso; dopo: string }[] = [
      ...(attivo("apostrofo") && !giaElisa
        ? conApostrofo(forma).map(([dove, resto]) => ({ tipo: "apostrofo" as const, dopo: `${forma.slice(0, dove)}'${resto}` }))
        : []),
      ...(attivo("legatura") ? conLegatura(parola).map((f) => ({ tipo: "legatura" as const, dopo: comeLOriginale(forma, f) })) : []),
      ...(attivo("accento") ? conAccento(parola).map((f) => ({ tipo: "accento" as const, dopo: comeLOriginale(forma, f) })) : []),
      ...(attivo("lettera") ? conLaG(parola).map((f) => ({ tipo: "lettera" as const, dopo: comeLOriginale(forma, f) })) : []),
    ];
    if (proposte.length !== 1) return forma;
    riparazioni.push({ prima: forma, ...proposte[0] });
    return proposte[0].dopo;
  });
  return { testo: riparato, riparazioni };
}
