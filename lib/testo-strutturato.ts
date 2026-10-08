/**
 * Decide che cosa è ciascun blocco di un testo del Compendio: titolo, etichetta, elenco, tabella,
 * definizione o paragrafo. Il componente TestoStrutturato disegna, qui si decide.
 *
 * Stava dentro il componente, con una regola sola per i titoli: «una riga corta che non finisce
 * con un punto». In un testo di regole quella descrizione calza a molte cose che titoli non sono,
 * e nei Background si vedeva tutta insieme (segnalato dall'utente con uno screenshot): cinque
 * righe in grassetto una sotto l'altra — «Caratteristiche: Forza, Costituzione, Saggezza»,
 * «Talento: Guaritore» — e in cima il nome del background ripetuto, subito sotto il titolo vero.
 * Contando su tutto il Compendio erano oltre 800 righe:
 *
 * - le schede a «Etichetta: valore» dei background e degli attrezzi (522);
 * - il nome della voce ripetuto come prima riga (120 fra background, oggetti e incantesimi);
 * - le frasi che introducono un elenco, «Ottieni i seguenti benefici:» (80);
 * - le voci di quell'elenco: lo zaino dell'esploratore era quindici titoli, uno per oggetto.
 *
 * File senza dipendenze: lavora su blocchi già separati, così si prova senza montare niente.
 */

export type Blocco =
  | { tipo: "tabella"; titolo: string; righe: { etichetta: string | null; testo: string }[] }
  | { tipo: "elenco"; voci: string[] }
  | { tipo: "etichetta"; etichetta: string; valore: string }
  | { tipo: "titolo"; testo: string }
  | { tipo: "definizione"; termine: string; descrizione: string }
  | { tipo: "paragrafo"; testo: string };

export interface OpzioniBlocchi {
  /** I nomi della voce (italiano, inglese): se il testo si apre ripetendone uno, quella riga si toglie. */
  nomiVoce?: (string | null | undefined)[];
  /**
   * `false` quando si sa che il testo d'origine NON si apre con un titolo (vedi siApreConTitolo):
   * allora una riga breve in apertura è il nome della voce anche se è scritto in un altro modo.
   * La traduzione in cache lo rende spesso diversamente dal titolo mostrato — «Anarca Gruul»
   * sotto «Anarchico Gruul», «[Stivali della Rapidità]» sotto «Stivali della Velocità» — e il
   * confronto con nomiVoce non lo vede: erano 126 voci fra oggetti, background e incantesimi.
   */
  originaleApreConTitolo?: boolean;
}

const LUNGHEZZA_MAX_TITOLO = 70;
const LUNGHEZZA_MAX_VOCE = 170;

// Le etichette che i manuali stampano su una riga a sé sopra la descrizione: valgono anche da
// sole, senza altre righe dello stesso tipo accanto.
const ETICHETTE_NOTE = /^(Prerequisit[oi]|Oggetto)$/i;

const normalizza = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** «Abilità:. Saggezza»: un avanzo della conversione, dove il nome finiva già con i due punti. */
const ripulisci = (riga: string) => riga.replace(/:\.(?=\s)/g, ":").trim();

/** Una riga corta senza punto finale: ciò che finora bastava per essere un titolo. */
function eCorta(riga: string): boolean {
  return riga.length < LUNGHEZZA_MAX_TITOLO && !/[.!?]$/.test(riga);
}

/**
 * «Etichetta: valore» su una riga. L'etichetta è breve e senza punteggiatura di frase; una riga
 * tutta in maiuscolo è un titolo di capitolo («CAPITOLO 9: COMBATTIMENTO»), non una scheda.
 */
function comeEtichetta(riga: string): { etichetta: string; valore: string } | null {
  const m = riga.match(/^([A-ZÀ-Ý0-9][^:.!?;()]{1,44}):\s+(\S.*)$/);
  if (!m) return null;
  const [, etichetta, valore] = m;
  if (etichetta.trim().split(/\s+/).length > 6) return null;
  if (riga === riga.toUpperCase()) return null;
  return { etichetta: etichetta.trim(), valore: valore.trim() };
}

/** Un rimando di 5etools rimasto nel testo («{#itemEntry Ring of Resistance|DMG}»): non è testo. */
const eRimandoCrudo = (riga: string) => /^\{[#@=][^}]*\}$/.test(riga);

/** Come comincia una riga: serve a capire se l'ultima di un elenco è «diversa dalle altre». */
function forma(riga: string): "cifra" | "minuscola" | "maiuscola" {
  const inizio = riga.replace(/^[^\p{L}\p{N}]+/u, "");
  if (/^\d/.test(inizio)) return "cifra";
  return /^\p{Ll}/u.test(inizio) ? "minuscola" : "maiuscola";
}

const senzaPunto = (riga: string) => riga.replace(/^[•*-]\s+/, "");

export function classificaBlocchi(blocchiGrezzi: string[], opzioni: OpzioniBlocchi = {}): Blocco[] {
  const blocchi = blocchiGrezzi.map((b) => b.trim()).filter(Boolean);
  const righeDi = blocchi.map((b) => b.split("\n").map(ripulisci).filter(Boolean));
  const unica = righeDi.map((righe) => (righe.length === 1 ? righe[0] : null));

  // Le schede a etichette si riconoscono dal fatto che sono PIÙ D'UNA di fila: una riga isolata
  // con i due punti può essere un titolo («Parte 1: Creare un Personaggio») e resta tale.
  const candidate = unica.map((riga) => (riga ? comeEtichetta(riga) : null));
  const etichette = candidate.map((e, i) =>
    e && (candidate[i - 1] || candidate[i + 1] || ETICHETTE_NOTE.test(e.etichetta)) ? e : null,
  );

  const nomi = new Set((opzioni.nomiVoce ?? []).filter((n): n is string => Boolean(n)).map(normalizza));

  /**
   * Una riga che può essere la voce di un elenco: sta da sola e non chiude una frase. Può essere
   * più lunga di un titolo («Una maledizione, inclusa la Sintonia con un oggetto maledetto»), ma
   * non quanto un paragrafo: nei testi letti con l'OCR capita il capoverso intero senza punto.
   */
  const eVoce = (i: number): boolean => {
    const riga = unica[i];
    if (!riga || riga.length > LUNGHEZZA_MAX_VOCE) return false;
    return !/[.!?:]$/.test(riga) && !eRimandoCrudo(riga) && !etichette[i];
  };

  const risultato: Blocco[] = [];
  // Vero finché non si è incontrato un blocco di testo: un rimando crudo in testa non conta.
  let apertura = true;

  for (let i = 0; i < blocchi.length; i++) {
    const righe = righeDi[i];
    const riga = unica[i];
    const inApertura = apertura;
    if (!(riga && eRimandoCrudo(riga))) apertura = false;

    if (/^Tabella\b/.test(righe[0])) {
      const [didascalia, ...resto] = righe;
      risultato.push({
        tipo: "tabella",
        titolo: didascalia.replace(/^Tabella\s*[—-]\s*/, "").replace(/:$/, ""),
        righe: resto.map((r) => {
          const celle = r.split(" — ");
          return celle.length > 1
            ? { etichetta: celle[0], testo: celle.slice(1).join(" — ") }
            : { etichetta: null, testo: r };
        }),
      });
      continue;
    }

    // Anche un solo "- " basta: nessuna frase di regole comincia per caso con un trattino, e
    // molti talenti hanno un unico beneficio.
    const puntate = righe.filter((r) => r.startsWith("- "));
    if (puntate.length >= righe.length / 2 && puntate.length >= 1) {
      risultato.push({ tipo: "elenco", voci: righe.map((r) => r.replace(/^- /, "")) });
      continue;
    }

    if (riga) {
      if (eRimandoCrudo(riga)) continue;

      const etichetta = etichette[i];
      if (etichetta) {
        risultato.push({ tipo: "etichetta", ...etichetta });
        continue;
      }

      // «Ottieni i seguenti benefici:» è una frase che annuncia ciò che segue, non un titolo. E
      // le righe che la seguono senza chiudere una frase sono le voci di ciò che annuncia.
      if (riga.endsWith(":")) {
        risultato.push({ tipo: "paragrafo", testo: riga });

        let fine = i + 1;
        while (fine < blocchi.length && eVoce(fine)) fine++;
        const voci = unica.slice(i + 1, fine) as string[];
        const seguitoDaTesto = fine < blocchi.length;

        // L'ultima riga può essere invece il titolo di ciò che viene dopo. Lo è quando è l'unica
        // («i seguenti benefici:», poi «Fisicità Potenziata» e la sua descrizione), o quando
        // comincia in modo diverso da tutte le altre («2 proprietà benefiche», «1 proprietà
        // dannosa», e poi «Incantesimi»). Un elenco di nomi tutti uguali di forma resta intero:
        // lì non c'è modo di distinguerla, e una voce in più è meglio di un titolo inventato.
        // Un titolo comincia con la maiuscola: «2 giorni di razioni» in fondo a un elenco di
        // oggetti scritti in minuscolo è diversa dalle altre, ma resta una voce.
        let titoloDopo: string | null = null;
        const ultima = voci.at(-1);
        if (seguitoDaTesto && ultima && eCorta(ultima) && forma(ultima) === "maiuscola") {
          const formeDellePrime = new Set(voci.slice(0, -1).map(forma));
          const diversa = formeDellePrime.size === 1 && !formeDellePrime.has("maiuscola");
          if (voci.length === 1 || diversa) titoloDopo = voci.pop()!;
        }

        if (voci.length > 0) {
          const elenco = voci.map(senzaPunto);
          // L'ultima voce di un elenco è spesso l'unica col punto: «…, 2 giorni di razioni», «un otre.»
          // Non se comincia con la maiuscola: lì è indistinguibile dalla frase che segue l'elenco
          // («Questo beneficio non si somma.»), e una frase fra le voci è peggio di una voce fuori.
          const chiusura = unica[fine];
          if (
            !titoloDopo &&
            chiusura &&
            chiusura.endsWith(".") &&
            chiusura.length < LUNGHEZZA_MAX_TITOLO &&
            forma(chiusura) !== "maiuscola" &&
            voci.some((v) => forma(v) === forma(chiusura))
          ) {
            elenco.push(senzaPunto(chiusura));
            fine++;
          }
          risultato.push({ tipo: "elenco", voci: elenco });
        }
        if (titoloDopo) risultato.push({ tipo: "titolo", testo: titoloDopo });
        i = fine - 1;
        continue;
      }

      if (eCorta(riga)) {
        // Il nome della voce ripetuto in apertura: il titolo vero sta già sopra il testo.
        if (risultato.length === 0 && nomi.has(normalizza(riga))) continue;
        if (inApertura && opzioni.originaleApreConTitolo === false) continue;
        risultato.push({ tipo: "titolo", testo: riga });
        continue;
      }
    }

    // Voce a definizione delle Regole principali: «ATTACCO — Effettua uno o più attacchi…». Il
    // termine deve essere tutto maiuscolo e breve, o una frase qualunque con un trattino lungo
    // verrebbe scambiata per una definizione.
    const blocco = righe.join("\n");
    const separatore = righe[0].indexOf(" — ");
    const termine = separatore > 1 && separatore <= 40 ? righe[0].slice(0, separatore) : null;
    if (termine && termine === termine.toUpperCase() && /[A-Z]/.test(termine)) {
      risultato.push({
        tipo: "definizione",
        termine: termine.trim(),
        descrizione: blocco.slice(blocco.indexOf(" — ") + 3).trim(),
      });
      continue;
    }

    risultato.push({ tipo: "paragrafo", testo: blocco });
  }

  return risultato;
}

/**
 * Il testo si apre con un titolo? Si chiede all'ORIGINALE inglese, per sapere che cosa aspettarsi
 * dalla traduzione: se là la prima riga è una frase, un titolo in cima alla versione italiana non
 * può che essere il nome della voce. Bastano i primi due blocchi: il secondo serve a riconoscere
 * la scheda a etichette dei background, che comincia con «Skill Proficiencies: …».
 */
export function siApreConTitolo(blocchi: string[]): boolean {
  const primi = blocchi.map((b) => b.trim()).filter(Boolean).slice(0, 2);
  return classificaBlocchi(primi)[0]?.tipo === "titolo";
}
