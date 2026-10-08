/**
 * Scioglie i segnaposto `{=campo}` delle varianti magiche di 5etools.
 *
 * Le varianti generiche (Arma +1, Armatura +2, Freccia Uccisore...) non scrivono i numeri nel
 * testo: li tengono in un campo accanto e nel testo mettono un rimando.
 *
 *     bonusWeaponAttack: "+1"
 *     entries: ["You have a {=bonusWeaponAttack} bonus to attack rolls..."]
 *
 * Senza questo passaggio il Compendio stampava il rimando alla lettera — "Hai un bonus di
 * {=bonusWeaponAttack} ai tiri per colpire" — cioè proprio il numero che si stava cercando
 * (segnalato dall'utente sull'Arma +1).
 *
 * Riguarda 65 voci su 2.972, tutte fra le varianti: items.json non ne contiene nessuna.
 */

/**
 * I modificatori che 5etools ammette dopo la barra: `{=baseName/at}`.
 *
 * L'ordine di applicazione e' FISSO e non segue quello scritto nel testo: prima si trasforma la
 * parola (minuscolo / maiuscolo / iniziali), poi semmai si antepone l'articolo. Seguendo
 * l'ordine letterale, "at" produceva "A Sword", perche' il maiuscolo si mangiava anche
 * l'articolo appena aggiunto.
 */
function applicaModificatori(valore: string, modificatori: string): string {
  let out = valore;
  if (modificatori.includes("l")) out = out.toLowerCase();
  if (modificatori.includes("u")) out = out.toUpperCase();
  if (modificatori.includes("t")) out = out.replace(/\b\w/g, (c) => c.toUpperCase());
  // Articolo indeterminativo inglese: vale sul testo originale, la traduzione italiana ha i
  // propri articoli e non passa di qui.
  if (modificatori.includes("a")) out = `${/^[aeiou]/i.test(out) ? "an" : "a"} ${out}`;
  return out;
}

/**
 * Il nome dell'oggetto base a cui la variante si applica, ricavato dal nome della variante.
 *
 * "Arrow of Slaying (*)" -> "Arrow". Non e' un campo dei dati: 5etools lo calcola applicando la
 * variante a un oggetto concreto, mentre qui le varianti si mostrano da sole. Meglio il nome
 * piu' probabile che un segnaposto crudo in mezzo alla frase.
 */
function nomeBase(nomeVariante: string): string {
  return nomeVariante
    .replace(/\s*\(\*\)\s*$/, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .replace(/^\+\d+\s+/, "")
    .replace(/\s+of\s+.*$/i, "")
    .trim();
}

/** Sostituisce ogni `{=campo}` / `{=campo/mod}` col valore corrispondente. */
export function risolviSegnaposto(testo: string, valori: Record<string, unknown>): string {
  return testo.replace(/\{=(\w+)(?:\/([a-z]+))?\}/g, (intero, campo: string, mod?: string) => {
    const valore = valori[campo];
    if (valore === undefined || valore === null || valore === "") return intero;
    return applicaModificatori(String(valore), mod ?? "");
  });
}

/** Applica la sostituzione a una struttura annidata di "entries", lasciando intatto il resto. */
export function risolviSegnapostoProfondo<T>(nodo: T, valori: Record<string, unknown>): T {
  if (typeof nodo === "string") return risolviSegnaposto(nodo, valori) as unknown as T;
  if (Array.isArray(nodo)) {
    return nodo.map((v) => risolviSegnapostoProfondo(v, valori)) as unknown as T;
  }
  if (nodo && typeof nodo === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(nodo)) out[k] = risolviSegnapostoProfondo(v, valori);
    return out as unknown as T;
  }
  return nodo;
}

/**
 * I valori con cui risolvere i segnaposto di una variante: i suoi campi (bonusWeapon, bonusAc,
 * dmgType...) piu' `baseName`, che va ricavato a parte.
 */
export function valoriVariante(
  nomeVariante: string,
  inherits: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...(inherits ?? {}), baseName: nomeBase(nomeVariante) };
}
