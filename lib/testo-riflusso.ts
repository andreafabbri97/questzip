// Le fonti OCR del compendio conservano gli a-capo di fine colonna del PDF: nel database una
// frase risulta spezzata ogni ~60 caratteri. Renderizzata con whitespace-pre-wrap quella
// spezzatura viene mostrata tale e quale, quindi il testo esce frastagliato e — soprattutto su
// telefono, dove la colonna è molto più stretta di quella del manuale — non si riadatta alla
// larghezza dello schermo: ogni riga del PDF va a capo di nuovo, a metà frase.
//
// Qui gli a-capo singoli vengono ricuciti in un flusso continuo (così è il browser a decidere
// dove andare a capo, come per qualsiasi altro testo) e i paragrafi veri vengono ricostruiti dai
// titoletti che nel manuale aprono ogni tratto ("Multiattacco.", "Resistenza alla Magia.").
// Le righe vuote già presenti restano separatori di paragrafo, e gli elenchi/tabelle — dove gli
// a-capo sono semantici, non tipografici — vengono lasciati intatti.

const LUNGHEZZA_MAX_TITOLETTO = 44;
const PAROLE_MAX_TITOLETTO = 6;

// Nei titoletti del manuale le parole piene sono in maiuscolo e solo le particelle restano
// minuscole ("Resistenza alla Magia", "Pregiati Animali da Guardia"). Richiederlo evita di
// scambiare una frase breve qualunque ("Poi risorge.") per un titolo.
const CONNETTIVI = new Set([
  "di", "del", "dello", "della", "dei", "degli", "delle", "da", "dal", "dallo", "dalla", "dai",
  "dagli", "dalle", "a", "al", "allo", "alla", "ai", "agli", "alle", "in", "nel", "nello",
  "nella", "nei", "negli", "nelle", "con", "su", "sul", "sulla", "per", "tra", "fra", "e", "o",
  "il", "lo", "la", "i", "gli", "le", "un", "uno", "una", "d", "l",
]);

/** Vero se la frase ha la forma di un titoletto di tratto del manuale. */
export function eTitoletto(frase: string): boolean {
  const testo = frase.trim();
  if (!testo || testo.length > LUNGHEZZA_MAX_TITOLETTO) return false;
  // Virgole, due punti e parentesi non compaiono mai in un titoletto: sono segno di frase piena.
  if (/[,:;()[\]]/.test(testo)) return false;
  const parole = testo.split(/\s+/).filter(Boolean);
  if (parole.length === 0 || parole.length > PAROLE_MAX_TITOLETTO) return false;
  if (!/^[A-ZÀ-Ú]/.test(parole[0])) return false;
  return parole.every(
    (p) => /^[A-ZÀ-Ú]/.test(p) || CONNETTIVI.has(p.toLowerCase().replace(/['’]/g, "")),
  );
}

function separaTitoletti(testo: string): string {
  return testo.replace(
    // Il candidato sta in un lookahead, non nel match: un candidato scartato non deve consumare
    // la frase che lo segue, altrimenti il titoletto successivo non verrebbe più esaminato.
    /(?<=[.!?»”")])[ \t]+(?=([^.\n]{1,44})\.[ \t])/gu,
    (spazio, candidato: string) => (eTitoletto(candidato) ? "\n\n" : spazio),
  );
}

function riflussoBlocco(blocco: string): string {
  const righe = blocco.split("\n").map((r) => r.trim()).filter(Boolean);
  if (righe.length === 0) return "";
  // Elenchi puntati e tabelle "etichetta — valore" usano gli a-capo per separare voci diverse:
  // ricucirli li distruggerebbe.
  if (righe.some((r) => /^[-•*]\s/.test(r) || r.includes(" \u2014 "))) return righe.join("\n");
  return separaTitoletti(righe.join(" ").replace(/[ \t]{2,}/g, " "));
}

/** Ricuce gli a-capo tipografici del PDF e ricostruisce i paragrafi dai titoletti. */
export function riflussoTestoOcr(testo: string): string {
  return testo
    .split(/\n{2,}/)
    .map(riflussoBlocco)
    .filter(Boolean)
    .join("\n\n");
}
