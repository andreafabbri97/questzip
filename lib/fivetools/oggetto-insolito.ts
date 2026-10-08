// Il nome italiano dei «Trinkets». La traduzione automatica li chiamava «ninnoli»; il Manuale
// del Giocatore italiano li chiama «oggetti insoliti» (tabella "Oggetti Insoliti", p. 160). Qui
// sta la sola regola per passare dall'uno all'altro in un testo già scritto, articoli compresi:
// «il ninnolo» non diventa «il oggetto insolito».
//
// Senza import con alias: lo usa anche uno script di scripts/ita-compendio.

const maiuscola = (modello: string, parola: string) => (modello[0] === modello[0].toUpperCase() ? parola[0].toUpperCase() + parola.slice(1) : parola);

// L'articolo o la preposizione che cambia davanti alla vocale: com'era davanti a «ninnolo», com'è
// davanti a «oggetto». Lo spazio in fondo fa parte della forma: «l'oggetto», ma «gli oggetti».
const AL_SINGOLARE: Record<string, string> = { il: "l'", del: "dell'", al: "all'", dal: "dall'", nel: "nell'", sul: "sull'", col: "con l'", quel: "quell'" };
const AL_PLURALE: Record<string, string> = { i: "gli ", dei: "degli ", ai: "agli ", dai: "dagli ", nei: "negli ", sui: "sugli ", coi: "con gli ", quei: "quegli " };

const NINNOLO = /(?<![\p{L}'’])(?:(il|del|al|dal|nel|sul|col|quel|i|dei|ai|dai|nei|sui|coi|quei)(\s+))?(n)innol(o|i)(?!\p{L})/giu;

/**
 * Riscrive «ninnolo/ninnoli» come «oggetto insolito/oggetti insoliti», accordando ciò che sta
 * davanti. Il nome tiene la maiuscola che aveva («Ninnolo di Aerenal» è un titolo), l'articolo
 * anche («Il ninnolo» apre una frase).
 */
export function conOggettoInsolito(testo: string): string {
  return testo.replace(NINNOLO, (_tutto, articolo: string | undefined, spazio: string | undefined, iniziale: string, desinenza: string) => {
    const plurale = desinenza.toLowerCase() === "i";
    const nome = maiuscola(iniziale, plurale ? "oggetti insoliti" : "oggetto insolito");
    const titolo = iniziale === "N" ? nome.replace("insolit", "Insolit") : nome;
    if (!articolo) return titolo;
    const accordato = (plurale ? AL_PLURALE : AL_SINGOLARE)[articolo.toLowerCase()];
    // Un articolo che non si accorda col nome («i ninnolo») era già sbagliato: resta com'è.
    return accordato ? maiuscola(articolo, accordato) + titolo : `${articolo}${spazio}${titolo}`;
  });
}
