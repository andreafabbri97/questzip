// Regole di lettura condivise dai parser dei manuali italiani (scripts/ita-compendio/parse-*.mjs).
//
// Stanno qui, e non dentro i singoli script, per due motivi: sono le stesse in tutti i parser
// (incantesimi, talenti, mostri leggono la stessa tipografia), e sono la parte che sbaglia più
// facilmente — ogni regola nasce da una scheda che era sparita dal Compendio, quindi va coperta
// dai test invece di essere verificata a mano sul PDF ogni volta.

/**
 * Nei titoli dei manuali italiani articoli e preposizioni restano minuscoli: negli elenchi per
 * classe del Manuale del Giocatore si legge "Banchetto degli Eroi", "Camminare nel Vento",
 * "Interdizione alle Lame". Il nome delle schede è però stampato tutto in maiuscolo, quindi la
 * grafia va ricostruita — e con un elenco incompleto uscivano nomi come "Tempio Degli Dèi".
 */
export const TITOLO_STOPWORDS = new Set([
  "di", "del", "dello", "della", "dei", "degli", "delle",
  "a", "al", "allo", "alla", "ai", "agli", "alle",
  "da", "dal", "dallo", "dalla", "dai", "dagli", "dalle",
  "in", "nel", "nello", "nella", "nei", "negli", "nelle",
  "su", "sul", "sullo", "sulla", "sui", "sugli", "sulle",
  "con", "col", "per", "tra", "fra",
  "e", "ed", "o", "od", "ad",
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una",
]);

/**
 * Le stesse parole, elise davanti a vocale ("sull'Acqua", "dall'Energia", "d'Ombra"): la parte
 * prima dell'apostrofo resta minuscola, quella dopo va maiuscola.
 */
export const TITOLO_ELISIONI = new Set([
  "d", "l", "un", "dell", "all", "nell", "sull", "dall", "coll", "sott",
]);

/** Rimette in stile titolo un nome stampato tutto in maiuscolo. */
export function titoloItaliano(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((parola, i) => {
      if (i > 0 && TITOLO_STOPWORDS.has(parola)) return parola;
      const elisione = i > 0 ? parola.match(/^([a-zà-ÿ]+)'(.+)$/) : null;
      if (elisione && TITOLO_ELISIONI.has(elisione[1])) {
        return `${elisione[1]}'${elisione[2].replace(/^[a-zà-ÿ]/, (c) => c.toUpperCase())}`;
      }
      return parola.replace(/(^|[-'/])([a-zà-ÿ])/g, (_m, sep, lettera) => sep + lettera.toUpperCase());
    })
    .join(" ");
}

/**
 * Il sottotitolo di un incantesimo ("Illusione di 5° livello") è la riga più fragile della scheda:
 * è in corsivo, e nel corsivo l'OCR confonde lettere e cifre di forma simile. Le schede che ne
 * uscivano storpiate venivano scartate in silenzio, e con esse l'incantesimo intero. Tre confusioni
 * ricorrenti, tutte viste nel Manuale del Giocatore e nella Guida di Xanathar:
 *   - la "I" iniziale della scuola letta come "1", "l" o "J" ("1llusione", "Jllusione");
 *   - la cifra del livello letta come lettera ("Illusione di s° livello" per il 5);
 *   - la seconda "l" di "livello" letta come J o cifra ("livelJo").
 * La correzione va sempre verificata a valle contro le otto scuole di magia vere: da sola non
 * decide nulla, e così una riga di prosa qualsiasi non può passare per un sottotitolo.
 */
const CIFRE_DA_LETTERA: Record<string, string> = {
  s: "5", S: "5", Z: "2", B: "8", G: "6", O: "0", o: "0",
};

export function correggiSottotitoloIncantesimo(sottotitolo: string): string {
  return sottotitolo
    .replace(/^[1lJ](?=[a-zà-ù])/, "I")
    .replace(/\bdi\s+([sSZBGOo])(?=\s*[°·'’]\s*livel[lJ1I]o)/, (_m, c: string) => `di ${CIFRE_DA_LETTERA[c]}`);
}

/** I gradi di sfida che esistono davvero in D&D 5e. */
export const GRADI_DI_SFIDA = new Set<string>([
  "0", "1/8", "1/4", "1/2",
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
]);

/**
 * Le cifre del grado di sfida possono uscire separate da uno spazio spurio, come già visto per la
 * Classe Armatura ("Classe Armatura 1 9"): "Sfida 1 7 (18.000 PE)" veniva letto come grado 1, e il
 * mostro finiva in Compendio con la sfida sbagliata o veniva scartato per incoerenza (il Nagpa è
 * 17, non 1). Gli spazi si tolgono solo se il risultato è un grado che esiste davvero.
 */
export function normalizzaGradoSfida(grezzo: string): string {
  const compatto = grezzo.replace(/\s+/g, "");
  if (GRADI_DI_SFIDA.has(compatto)) return compatto;
  return grezzo.trim().split(/\s+/)[0] ?? "";
}

/**
 * Il maiuscoletto dei manuali fa infilare all'estrazione uno spazio DENTRO le parole, sempre dopo
 * le prime lettere: "I Mbottita" per Imbottita, "G Iaco di Maglia" per Giaco di Maglia, "Armatura
 * Com Pleta" per Completa, "Martello da G Uerra". Il segnale è che il primo pezzo è cortissimo e il
 * secondo comincia con una maiuscola in mezzo al nome: nei titoli italiani, dopo titoloItaliano, le
 * parole di una o due lettere sono già state rese minuscole se erano articoli o preposizioni, quindi
 * un frammento corto ancora maiuscolo non è una parola vera ma la testa di quella dopo.
 */
export function ricomponiParoleSpezzate(nome: string): string {
  const parole = nome.split(" ");
  const fuse: string[] = [];
  for (const parola of parole) {
    const precedente = fuse[fuse.length - 1];
    const spezzata =
      precedente !== undefined &&
      precedente.length <= 3 &&
      /^[A-ZÀ-Ù][a-zà-ÿ]*$/.test(precedente) &&
      /^[A-ZÀ-Ù][a-zà-ÿ]/.test(parola);
    if (spezzata) {
      fuse[fuse.length - 1] = precedente + parola.charAt(0).toLowerCase() + parola.slice(1);
      continue;
    }
    fuse.push(parola);
  }
  return fuse.join(" ");
}

/**
 * Le citazioni decorative dei manuali (il corsivo calligrafico con la firma del personaggio in
 * fondo, "— Bigby") sono stampate con un font che l'estrazione non sa leggere: escono come glifi
 * casuali, `Nuo'lo Cotro, nvo'I) (),'l'l)IJCu=! L(), rtil'I(), vo!C()`. Stanno in mezzo alle schede
 * e finivano dentro la descrizione del talento o del mostro che le precede.
 *
 * Il segnale non è la presenza di simboli — il testo buono ne ha (`8 + il bonus`, `ld6`) — ma
 * l'assenza di PAROLE: qui quasi nessun gruppo di lettere è una parola italiana plausibile, cioè
 * lettere con almeno una vocale e senza punteggiatura infilata dentro.
 */
export function rigaIllegibile(riga: string): boolean {
  const testo = riga.trim();
  // sotto una certa lunghezza non c'è abbastanza materiale per giudicare: una riga corta di testo
  // buono ("massimo di 20.", "18 metri.") sarebbe indistinguibile da una corta di glifi
  if (testo.length < 15) return false;
  const token = testo.split(/\s+/).filter((t) => /[A-Za-zÀ-ÿ]/.test(t));
  if (token.length === 0) return false;
  // parentesi e uguale NON valgono come punteggiatura di chiusura: in italiano una parola non
  // finisce quasi mai per ")" mentre nei glifi della citazione è il carattere più frequente
  const plausibili = token.filter(
    (t) => /^[A-Za-zÀ-ÿ]+(['’][A-Za-zÀ-ÿ]+)?[.,;:!?]?$/.test(t) && /[aeiouàèéìòùAEIOU]/.test(t),
  );
  return plausibili.length / token.length < 0.5;
}

/**
 * Unisce le righe fisiche di una scheda in un testo, tenendo le ETICHETTE come paragrafi a sé.
 *
 * Sono etichette le righe che i manuali stampano sopra la descrizione: il prerequisito di una
 * supplica occulta o di un talento, e l'oggetto richiesto da un'infusione dell'Artefice.
 *
 * Sui manuali il prerequisito è una riga in corsivo sopra la descrizione; unendo le righe con uno
 * spazio, come si fa per il resto della prosa, diventava `Prerequisito: 5° livello Il warlock può
 * lanciare…` — due frasi appiccicate, con la maiuscola in mezzo e nessun segno che le separi
 * (segnalato dall'utente leggendo le suppliche occulte).
 *
 * Il prerequisito può andare a capo (`Prerequisito: talento Colpo dei giganti (Colpo del` / `gelo)
 * di 4° livello`), ma la sua continuazione riprende sempre in minuscolo o con un segno — la
 * parentesi chiusa, o il grado del livello rimasto orfano sulla riga dopo (`Prerequisito: 5` /
 * `° livello Come reazione…`, la Tomba di Levistus della Guida di Xanathar): la prima riga che
 * comincia con una lettera maiuscola è già la descrizione.
 */
const ETICHETTA_RE = /^(prerequisit[oi]|oggetto)\s*:/i;

export function unisciRigheDiScheda(righe: string[]): string {
  const paragrafi: string[] = [];
  let dentroEtichetta = false;

  for (const riga of righe) {
    if (ETICHETTA_RE.test(riga)) {
      paragrafi.push(riga);
      dentroEtichetta = true;
      continue;
    }
    if (dentroEtichetta) {
      if (/^[a-zà-ÿ)°"'’]/.test(riga)) {
        paragrafi[paragrafi.length - 1] += ` ${riga}`;
        continue;
      }
      dentroEtichetta = false;
      paragrafi.push(riga);
      continue;
    }
    if (paragrafi.length === 0) paragrafi.push(riga);
    else paragrafi[paragrafi.length - 1] += ` ${riga}`;
  }

  return paragrafi.map((p) => p.replace(/\s+/g, " ").trim()).join("\n\n");
}
