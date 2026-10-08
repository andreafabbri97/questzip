/**
 * Toglie da una sezione di scheda (tratti, azioni...) la PROSA della pagina che ci è finita dentro.
 *
 * Nei manuali la scheda di un mostro non è un blocco isolato: accanto, sopra o in mezzo c'è il
 * testo che lo racconta, un riquadro, il titolo della pagina, una citazione in corsivo. Il testo
 * estratto li mette in fila nell'ordine di lettura, e la scheda si ritrova con dentro la storia
 * degli oblex o la descrizione degli oggetti magici del capitolo dopo: l'Ogre aveva 3.600
 * caratteri di "azioni" per due attacchi.
 *
 * Il confine non si può riconoscere dal titolo — `0BLEX` ha uno zero al posto della O, il
 * maiuscoletto esce come `Eco DI DEMOGORGON` — ma dal CONTENUTO: una scheda parla di tiri
 * salvezza, bersagli, metri e danni, e quasi ogni riga ha un numero; la prosa no. Si toglie
 * quindi un tratto di testo solo se:
 *
 * 1. comincia con uno stacco visibile — una riga di glifi illeggibili o un titolo in maiuscolo;
 * 2. da lì in poi nessuna riga contiene una cifra o un termine di regole;
 * 3. è lungo abbastanza da essere prosa e non la coda di una frase (almeno sei righe).
 *
 * Per costruzione non può sparire nessun numero. Quello che la regola non sa distinguere lo
 * lascia dov'è: meglio una scheda con un paragrafo di troppo che una senza un tratto.
 *
 * File senza dipendenze di proposito: lo usano anche gli script di scripts/ita-compendio, che
 * girano fuori da Next e non risolvono gli import fra i file di lib.
 */

// Termini che compaiono nel testo di regole e quasi mai nel racconto. Volutamente larga: una riga
// di prosa che ne contiene uno interrompe il tratto da togliere, e la regola si ferma lì.
const MECCANICA =
  /\d|attacc|tir[oi] salvezza|\bCD\b|\bazion[ei]\b|\bbonus\b|bersagli|colpire|\bdanni\b|\bround\b|\bturn[oi]\b|incantesim|\bmetri\b|\bportata\b|vantaggio|punti ferita|\bprov[ae] di\b|competenz|resistenz|immun|\bslot\b|velocità|reazion|ricarica|a volontà|\/giorno/i;

const RIGHE_MINIME_DI_PROSA = 6;
// Un tratto senza numeri né termini di regole esiste ("Sempre all'erta. Quando una delle due
// teste dorme, l'altra è sveglia."), ma è corto. Se la prosa finisce con un titoletto seguito da
// poche righe, quelle si tengono.
const RIGHE_MASSIME_DI_UN_TRATTO_BREVE = 3;

type Tipo = "vuota" | "titolo" | "rumore" | "meccanica" | "prosa";

/**
 * Quante "parole" di una riga sembrano italiano: solo lettere (con apostrofo o trattino interni),
 * almeno una vocale. Parentesi e virgolette attorno alla parola non contano: "(solo se stesso)"
 * è testo buono, e scambiarlo per glifi toglieva un pezzo all'elenco degli incantesimi.
 */
function quotaDiParole(riga: string): number {
  const conLettere = riga.split(/\s+/).filter((t) => /[A-Za-zÀ-ÿ]/.test(t));
  if (conLettere.length === 0) return 0;
  const plausibili = conLettere.filter((t) => {
    const nuda = t.replace(/^[("«“'’]+/, "").replace(/[)"»”]+(?=[.,;:!?]?$)/, "");
    return /^[A-Za-zÀ-ÿ]+([-'’][A-Za-zÀ-ÿ]+)*[.,;:!?]?$/.test(nuda) && /[aeiouàèéìòù]/i.test(nuda);
  });
  return plausibili.length / conLettere.length;
}

/** Titolo di pagina o di riquadro: quasi tutto maiuscolo, con le sole cifre che l'OCR scambia per lettere. */
function eTitolo(riga: string): boolean {
  if (riga.length > 60) return false;
  // Il riquadro di una variante fa parte della scheda: va letto insieme al tratto che introduce.
  if (/^VARIANTE\b/i.test(riga)) return false;
  const normalizzata = riga.replace(/0/g, "O").replace(/1/g, "I");
  if (/\d/.test(normalizzata)) return false;
  const lettere = normalizzata.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (lettere.length < 4) return false;
  const maiuscole = lettere.replace(/[a-zà-ÿ]/g, "").length;
  return maiuscole / lettere.length >= 0.75;
}

// Segni che in una riga di regole non compaiono: quando una riga corta ne contiene uno, è ciò che
// resta di un fregio o di un'illustrazione.
const SEGNO_ESTRANEO = /[^A-Za-zÀ-ÿ0-9\s.,;:!?'’()«»"“”\-–—]/;

/**
 * Glifi al posto del testo: una citazione in corsivo, un fregio, i resti di un'illustrazione.
 *
 * Una riga con una cifra non è mai rumore: "1,5 m." è la fine di una frase andata a capo. E una
 * riga corta fatta di parole vere nemmeno — "taglienti...", "di sé." — anche se non supererebbe
 * un conteggio delle parole: sotto i quindici caratteri è rumore solo se le lettere sono troppo
 * poche per fare una parola, o se c'è un segno estraneo e nemmeno una parola di quattro lettere
 * ("del couatl}." ha una graffa al posto della parentesi, ma è la fine di una frase).
 */
function eRumore(riga: string): boolean {
  if (/\d/.test(riga)) return false;
  if (riga.length < 15) {
    const lettere = riga.replace(/[^A-Za-zÀ-ÿ]/g, "").length;
    if (lettere <= 2) return true;
    return SEGNO_ESTRANEO.test(riga) && !/[A-Za-zÀ-ÿ]{4}/.test(riga);
  }
  return /[A-Za-zÀ-ÿ]/.test(riga) ? quotaDiParole(riga) < 0.5 : true;
}

function tipoDi(riga: string): Tipo {
  const testo = riga.trim();
  if (!testo) return "vuota";
  if (eTitolo(testo)) return "titolo";
  // Prima le regole, poi il sospetto di rumore: una riga che nomina un attacco o un tiro
  // salvezza resta, per quanto male sia stata letta.
  if (MECCANICA.test(testo)) return "meccanica";
  if (eRumore(testo)) return "rumore";
  return "prosa";
}

/** "Sempre all'erta. Quando..." — l'inizio di un tratto: poche parole con la maiuscola, poi il punto. */
function iniziaConTitoletto(riga: string): boolean {
  const m = riga.trim().match(/^([A-ZÀ-Ù][^.:;,()]{2,44})\.\s+\S/);
  if (!m) return false;
  return m[1].split(/\s+/).length <= 6;
}

export function togliProsaDiPagina(testo: string): string {
  const righe = testo.split("\n");
  const tipi = righe.map(tipoDi);
  const togli = new Array<boolean>(righe.length).fill(false);

  for (let i = 0; i < righe.length; i++) {
    if (tipi[i] !== "titolo" && tipi[i] !== "rumore") continue;

    // Il tratto senza regole che comincia da questo stacco.
    let fine = i;
    let prosa = 0;
    while (fine < righe.length && tipi[fine] !== "meccanica") {
      if (tipi[fine] === "prosa") prosa++;
      fine++;
    }

    if (prosa >= RIGHE_MINIME_DI_PROSA) {
      // Un tratto breve in coda alla prosa, subito prima che la scheda riprenda: si tiene.
      for (let k = fine - 1; k > i; k--) {
        if (tipi[k] !== "prosa") break;
        if (iniziaConTitoletto(righe[k])) {
          if (fine - k <= RIGHE_MASSIME_DI_UN_TRATTO_BREVE) fine = k;
          break;
        }
      }
      for (let k = i; k < fine; k++) togli[k] = true;
      i = fine - 1;
    } else if (tipi[i] === "rumore") {
      // Uno stacco senza prosa dietro: si toglie soltanto la riga di glifi.
      togli[i] = true;
    }
  }

  return righe
    .filter((_, k) => !togli[k])
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
