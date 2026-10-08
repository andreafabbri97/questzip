/**
 * I manuali scrivono i titoli in maiuscoletto, e l'OCR li restituisce tutti in maiuscolo:
 * «L'ALLEANZA DEI LORD», «ROCCHE NANICHE DEL NORD». Qui tornano come li scrive l'indice del
 * libro: «L'Alleanza dei Lord», «Rocche Naniche del Nord».
 *
 * Nel maiuscoletto l'OCR confonde sempre le stesse lettere, perché la «I» è un'asta e nient'altro:
 * «Dl» per «DI», «Drv1NITÀ» per «DIVINITÀ». Si correggono prima di cambiare le maiuscole, finché
 * si vede ancora quale lettera è fuori posto (una minuscola in mezzo a una parola maiuscola).
 *
 * File senza dipendenze, si prova da solo.
 */

// Articoli, preposizioni e congiunzioni: nei titoli italiani restano in minuscolo.
const MINORI = new Set([
  "a", "ad", "al", "allo", "alla", "ai", "agli", "alle", "che", "con", "da", "dal", "dallo", "dalla", "dai", "dagli",
  "dalle", "del", "dello", "della", "dei", "degli", "delle", "di", "e", "ed", "fra", "gli", "i", "il", "in", "la", "le",
  "lo", "nel", "nello", "nella", "nei", "negli", "nelle", "o", "per", "su", "sul", "sullo", "sulla", "sui", "sugli",
  "sulle", "tra", "un", "uno", "una",
]);

// Le forme con l'apostrofo: «dell'Ordine», «L'Underdark», «d'Arme».
const ELISE = new Set(["l", "d", "un", "all", "dall", "dell", "nell", "sull", "quest", "sant"]);

// Sigle che restano in maiuscolo. Fra i numeri romani manca il sei: «vi» è anche un pronome
// («COSA VI ASPETTA»), e un pronome scritto in maiuscolo in mezzo a un titolo è peggio.
const SIGLE = new Set(["dm", "cd", "pf", "ca", "pe", "gs", "png", "pg", "ii", "iii", "iv", "vii", "viii", "ix"]);

const eLettera = (c: string | undefined) => c !== undefined && /\p{L}/u.test(c);
const eMaiuscola = (c: string | undefined) => c !== undefined && /\p{Lu}/u.test(c);
/** Un dado: «D100», «2d10». Le sue cifre sono cifre. */
const DADO = /^\d*d\d+$/i;
const senzaSegni = (parola: string) => parola.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");

/**
 * Rimette a posto le lettere che l'OCR sbaglia nel maiuscoletto: in una parola scritta in
 * maiuscolo una «l» minuscola o un «1» sono una «I», uno «0» è una «O».
 */
export function correggiMaiuscoletto(titolo: string): string {
  return titolo
    .split(" ")
    .map((parola) => {
      const lettere = parola.match(/\p{L}/gu) ?? [];
      const maiuscole = lettere.filter((l) => l !== l.toLowerCase()).length;
      // Solo parole in cui il maiuscolo prevale: «Player's» e «il» non si toccano. E non gli
      // articoli scritti giusti («Il», «Al»), né i dadi («D100»).
      if (maiuscole === 0 || maiuscole < lettere.length / 2) return parola;
      const nuda = senzaSegni(parola);
      if (nuda === "Il" || nuda === "Al" || DADO.test(nuda)) return parola;
      return [...parola]
        .map((c, i, tutte) => {
          const fraLettere = eLettera(tutte[i - 1]) || eLettera(tutte[i + 1]);
          // Una elle minuscola è una «I» solo accanto a una maiuscola: «Dl», non «Dell'ORDINE».
          if (c === "l") return eMaiuscola(tutte[i - 1]) || eMaiuscola(tutte[i + 1]) ? "I" : c;
          if (c === "1" && fraLettere) return "I";
          if (c === "0" && fraLettere) return "O";
          return c;
        })
        .join("");
    })
    .join(" ");
}

function maiuscolaIniziale(parola: string): string {
  // La prima lettera, saltando una parentesi o una virgoletta d'apertura.
  return parola.replace(/\p{L}/u, (l) => l.toUpperCase());
}

/** «L'ALLEANZA DEI LORD» -> «L'Alleanza dei Lord». */
export function titoloLeggibile(titolo: string): string {
  const parole = correggiMaiuscoletto(titolo.trim()).toLowerCase().split(/\s+/);
  let apre = true;
  const out = parole.map((parola) => {
    const inizioTitolo = apre;
    // Dopo i due punti ricomincia un titolo: «Privilegio: Occhi Aperti».
    apre = /:$/.test(parola);
    const nuda = senzaSegni(parola);
    if (SIGLE.has(nuda)) return parola.toUpperCase();
    if (DADO.test(nuda)) return parola;

    // «dell'ordine»: l'articolo resta com'è, la parola che regge prende la maiuscola.
    const elisa = nuda.match(/^(\p{L}+)(['’])(.+)$/u);
    if (elisa && ELISE.has(elisa[1])) {
      const [, articolo, apostrofo, resto] = elisa;
      const conMaiuscole = `${inizioTitolo ? maiuscolaIniziale(articolo) : articolo}${apostrofo}${maiuscolaIniziale(resto)}`;
      return parola.replace(nuda, conMaiuscole);
    }
    if (MINORI.has(nuda) && !inizioTitolo) return parola;
    // «mantol-derith» -> «Mantol-Derith»; il genitivo inglese resta minuscolo: «Baldur's».
    return parola
      .split("-")
      .map((pezzo) => maiuscolaIniziale(pezzo))
      .join("-");
  });
  return out.join(" ");
}

/**
 * La prima riga di un capitolo è scritta in maiuscoletto («UESTO CAPITOLO DESCRIVE MOLTE» dopo
 * il capolettera): torna una frase normale. I nomi propri riprendono la maiuscola se nel resto
 * del testo la portano (`nomi`: le parole che lì compaiono con la maiuscola in mezzo a una frase).
 */
export function fraseDaMaiuscoletto(riga: string, nomi: ReadonlySet<string> = new Set(), capolettera = ""): string {
  const minuscola = (capolettera + correggiMaiuscoletto(riga.trim())).toLowerCase();
  const conNomi = minuscola.replace(/\p{L}+/gu, (parola) => {
    const conMaiuscola = maiuscolaIniziale(parola);
    return nomi.has(conMaiuscola) ? conMaiuscola : parola;
  });
  // Dopo un punto ricomincia una frase. Non dopo una virgoletta chiusa: «"Vero?" brontolò».
  return maiuscolaIniziale(conNomi).replace(/(?<=[.!?] )\p{Ll}/gu, (l) => l.toUpperCase());
}

/** Le parole che in un testo portano la maiuscola senza essere all'inizio di una frase. */
export function nomiConMaiuscola(testo: string): Set<string> {
  const nomi = new Set<string>();
  for (const trovata of testo.matchAll(/(?<=[\p{Ll},;] )\p{Lu}\p{Ll}+/gu)) nomi.add(trovata[0]);
  return nomi;
}
