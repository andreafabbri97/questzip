/**
 * I refusi che l'OCR di Windows fa sempre uguali quando legge i manuali
 * (scripts/ita-compendio/ocr_windows_pdf.py). Legge molto meglio di easyocr, ma inciampa sui
 * segni piccoli e sulle aste: l'articolo «Il» diventa «II», l'uno dei dadi una «I», il segno
 * dell'ordinale («6° livello») un apice, un asterisco o una cifra in più.
 *
 * Qui si corregge solo ciò che non ha un'altra lettura possibile: «141 livello» non può essere
 * un livello, «Id6» non è una parola. Ciò che resta ambiguo («il 50» per «il 5°») si corregge a
 * mano guardando la pagina. File senza dipendenze, si prova da solo.
 */

// Le facce che un dado può avere: un «dado» riparato deve essere uno di questi.
const FACCE_DI_DADO = new Set(["2", "3", "4", "6", "8", "10", "12", "20", "100"]);

const inCifre = (lettere: string) => lettere.replace(/[Il]/g, "1").replace(/O/g, "0");

export function pulisciLetturaWindows(testo: string): string {
  return (
    testo
      // «II Tethyr è un regno»: l'articolo «Il», letto come due aste. Solo a inizio frase (o in
      // testa alla voce di un elenco), dove un numero romano non può stare.
      // Sulla stessa riga: un «II» da solo fra due capoversi è un numero romano. E non dopo una
      // parentesi: «(II secolo)».
      .replace(/(^|^- |[.!?:;"“«—][ \t]*)I ?I(?=[ \t]+\p{L})/gmu, "$1Il")
      // «piü», «virtü»: la «ù» finale letta con la dieresi.
      .replace(/(?<=\p{L})ü(?!\p{L})/gu, "ù")
      // «Id8 danni», «dlOO»: nei dadi l'uno letto «I» o «l», lo zero letto «O». Vale solo se ne
      // esce un dado che esiste.
      .replace(/(?<![\p{L}\p{N}])([\dIl]{0,2})d([\dlIO]{1,3})(?![\p{L}\p{N}])/gu, (tutto, quanti: string, facce: string) => {
        if (!/[IlO]/.test(tutto)) return tutto;
        return FACCE_DI_DADO.has(inCifre(facce)) ? `${inCifre(quanti)}d${inCifre(facce)}` : tutto;
      })
      // «1d6 — 1»: il meno di una formula letto come una lineetta. «1d6 +6»: lo spazio perso.
      .replace(/(\dd\d+) [—–] (?=\d)/g, "$1 − ")
      .replace(/(\dd\d+) ?\+ ?(?=\d)/g, "$1 + ")
      // «1 0 più cariche», «+2 0 +3»: la congiunzione «o» letta come uno zero, davanti a «più» e
      // «meno» o fra due bonus. Non fra due numeri qualunque: «3 2 0 0» è la riga di una tabella.
      .replace(/(?<=\d) 0 (?=(?:più|meno)(?!\p{L}))/gu, " o ")
      .replace(/(?<=\+\d) 0 (?=\+\d)/g, " o ")
      // «(l carica)», «spendere I carica», «della durata di I minuto»: l'uno letto come una
      // lettera. Solo davanti a un singolare: «I minuti» è l'articolo.
      .replace(/(?<![\p{L}\p{N}'’])[lI] (?=(?:carica|cariche|minuto|ora|giorno|metro|volta|punto)(?!\p{L}))/gu, "1 ")
      // «scende a O punti ferita»: lo zero letto come una «O».
      .replace(/(?<=\p{Ll}) O (?=punt[oi] ferita)/gu, " 0 ")
      // «un bonus di 42 alla CA»: il più letto come un quattro. Un bonus di quaranta non esiste.
      .replace(/(bonus di )4([1-3])(?= (?:a|ai|al|alla|alle|agli)(?!\p{L}))/gu, "$1+$2")
      // «1a Luce della Legge»: l'articolo «la» con la elle letta come un uno. Non dopo una parola
      // che vuole un numero: «Area 1a» è la stanza di una mappa.
      .replace(/(?<![\p{L}\p{N}])(?<!(?:Area|Aree|Stanza|Sala|Mappa|Tabella|Figura|Fig\.) )1a(?= \p{L})/gu, "la")
      // «5' livello», «17* livello», «17 • livello», «3" livello»: il segno dell'ordinale.
      .replace(/(?<![\p{L}\p{N}])(\d{1,2}) ?['’*•"] ?(?=livello)/gu, "$1° ")
      .replace(/(?<![\p{L}\p{N}])IO" ?(?=livello)/gu, "10° ")
      // «141 livello», «31 livello»: lo stesso segno letto come una cifra in più. Si riconosce
      // perché il numero non può esistere: un personaggio non supera il 20° livello, un
      // incantesimo il 9°.
      .replace(/(?<![\p{L}\p{N}])(\d{1,2})([014]) (?=livello)/gu, (tutto, numero: string, coda: string) => (Number(numero + coda) > 20 ? `${numero}° ` : tutto))
      .replace(/(incantesimo di )(\d)[014] (?=livello)/g, "$1$2° ")
  );
}
