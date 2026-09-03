/**
 * Composizione delle scene per la Modalità sessione.
 *
 * Il master ha già scritto tutto in campagna (trame, NPC, mostri del Compendio homebrew): questa
 * funzione collega le tre cose SENZA chiedergli di configurare niente, cercando nel testo di ogni
 * scena i nomi degli NPC e dei mostri della campagna. Al tavolo si legge la scena e si hanno
 * accanto le schede che servono in quel momento, invece di cercarle mentre cinque persone aspettano.
 */

/** Toglie le precisazioni fra parentesi dai nomi salvati: "Veterano (Sfida 3)" -> "Veterano". */
function nomePulito(nome: string): string {
  return nome.replace(/\s*[(（][^)）]*[)）]/g, "").trim();
}

/**
 * Parole su cui cercare: la prima abbastanza lunga da essere distintiva, per ciascuna etichetta.
 *
 * Sul nome intero non funzionerebbe: "Tatsudo Yoshimitsu" comparirebbe in ogni scena che nomina la
 * famiglia, e "Guardia tiefling (Sfida 1/8)" non comparirebbe mai perché nel testo si legge solo
 * "Guardie". Il cognome è quindi ignorato di proposito.
 *
 * Un trattino lungo separa invece due etichette dello stesso avversario ("Sicario — Duckworth
 * Lamerde"): il testo può nominarlo in entrambi i modi, quindi valgono entrambe — ma sempre solo
 * la prima parola di ciascuna, così il cognome non rientra dalla finestra.
 */
function paroleChiave(nome: string): string[] {
  return nomePulito(nome)
    .split(/\s*[—–]\s*/)
    .map((etichetta) => etichetta.split(/[\s-]+/).find((p) => p.length >= 3)?.toLowerCase() ?? "")
    .filter(Boolean);
}

/**
 * Radice per reggere il plurale italiano senza un dizionario: "Veterano" deve trovare "Veterani",
 * "Guardia" deve trovare "Guardie". Si taglia la vocale finale, ma solo se resta abbastanza parola
 * da non pescare a caso.
 */
function radice(parola: string): string {
  return parola.length >= 5 && /[aeiou]$/.test(parola) ? parola.slice(0, -1) : parola;
}

/** Il nome compare nel testo della scena? Il confronto parte sempre da un inizio di parola. */
export function citatoNelTesto(nome: string, testo: string): boolean {
  return paroleChiave(nome).some((parola) => {
    const chiave = radice(parola);
    if (chiave.length < 3) return false;
    const escapata = chiave.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escapata}`, "i").test(testo);
  });
}

/** Filtra una lista di voci con nome, tenendo quelle citate nella scena. */
export function vociInScena<T extends { nome: string }>(voci: T[], testo: string): T[] {
  return voci.filter((v) => citatoNelTesto(v.nome, testo));
}

/**
 * Le frasi da leggere ad alta voce: nel materiale del master stanno fra virgolette basse. Averle
 * separate dal resto evita di doverle cercare dentro un paragrafo mentre si sta parlando.
 */
export function battuteDaLeggere(testo: string): string[] {
  return [...testo.matchAll(/«([^»]{3,})»/g)].map((m) => m[1].trim());
}

/** I paragrafi della scena, come sono stati scritti (righe vuote come separatore). */
export function paragrafi(testo: string): string[] {
  return testo
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
