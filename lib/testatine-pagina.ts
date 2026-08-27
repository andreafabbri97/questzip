/**
 * Toglie dal testo estratto le TESTATINE DI PAGINA del PDF e i watermark della scansione.
 *
 * Nei manuali il titolo del capitolo è stampato in cima a ogni pagina: l'estrazione lo legge come
 * fosse testo del corpo e lo lascia in mezzo a una frase, spesso spezzato a metà parola perché in
 * quelle righe le lettere sono spaziate ("C A P I TOLO 6 I OPZION I DI PERSONALIZZAZIONE").
 * Risultato: la descrizione di un talento finiva con un pezzo di intestazione appiccicato dentro.
 * Nelle azioni di alcuni mostri è finito perfino il watermark di chi ha scansionato il PDF.
 *
 * Il confronto ammette spazi fra un carattere e l'altro, perché la spaziatura dell'OCR su quelle
 * righe è imprevedibile e cambia da pagina a pagina.
 */

/** "CAPITOLO" -> "C\s*A\s*P\s*I\s*T\s*O\s*L\s*O": accetta la spaziatura casuale dell'OCR. */
function spaziabile(parola: string): string {
  return parola.split("").join(String.raw`\s*`);
}

// Il titolo che segue "CAPITOLO n" è tutto in maiuscolo: lo si prende finché restano maiuscole,
// spazi e i separatori che l'OCR produce al posto della barra verticale del manuale. Il tetto di
// 60 caratteri evita che, in mancanza di una minuscola che chiuda il titolo, il taglio si mangi
// mezza descrizione.
// La barra e le parentesi rientrano fra i caratteri ammessi perché su queste righe l'OCR sbaglia
// di brutto: "CREATURE VARIE" è stato letto "CRE.ATI!RE V/.RI", e senza la barra il taglio si
// fermava a metà lasciando un moncone in coda alla descrizione.
const TITOLO_MAIUSCOLO = String.raw`[A-ZÀ-Ù0-9\s|IlJ:.,'’·#*&!?/()\-]{0,60}`;

// L'ordine conta: il watermark va tolto PRIMA delle intestazioni. Quando i due sono attaccati
// ("APPENDICE A: CREATURE VARIE Offrimi un caffè: …"), il titolo in maiuscolo si mangerebbe la
// "O" iniziale del watermark e lo lascerebbe monco a schermo.
const TESTATINE: RegExp[] = [
  // Watermark di chi ha scansionato il PDF, finito dentro le azioni di alcuni mostri.
  /Offrimi un caff[eè]\s*:?\s*paypal\.me\/\S+/gi,
  // "CAPITOLO 6 I OPZIONI DI PERSONALIZZAZIONE", "C A P ITOLO 2 I BESTIARIO"
  new RegExp(`${spaziabile("CAPITOLO")}\\s*\\d+${TITOLO_MAIUSCOLO}`, "g"),
  // "APPENDICE A: CONDIZIONI", "APPENDICE B: PERSONAGGI NON GIOCANTI"
  new RegExp(`${spaziabile("APPENDICE")}\\s*[A-Z]\\s*:?${TITOLO_MAIUSCOLO}`, "g"),
];

export function togliTestatinePagina(testo: string): string {
  let out = testo;
  for (const pattern of TESTATINE) out = out.replace(pattern, " ");
  return out
    // Spazi rimasti dove stava la testatina, senza toccare gli a capo che portano la struttura.
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
