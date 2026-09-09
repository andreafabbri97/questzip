/**
 * Ordina i privilegi di una sottoclasse come li ordina il manuale.
 *
 * Ordinarli per solo livello non basta: dentro uno stesso livello resta l'ordine in cui compaiono
 * nel file 5etools, e lì i privilegi "figli" stanno PRIMA di quello che li introduce. Sulla Lama
 * Spirituale si leggeva Colpi Teleguidati, Teletrasporto Psichico e infine "Lame dell'Anima" —
 * che è la voce che annuncia gli altri due e finisce con i due punti, quindi restava appesa in
 * fondo senza niente dopo.
 *
 * L'ordine giusto è dichiarato dalla sottoclasse stessa, in `subclassFeatures`: contiene solo le
 * voci principali ("Soul Blades|Rogue||Soulknife|TCE|9"), e chi non compare lì è un figlio, che
 * va subito dopo il proprio padre — cioè dopo le voci dichiarate del suo stesso livello.
 */
export function ordinaPrivilegiSottoclasse<T extends { name: string; level: number }>(
  privilegi: T[],
  ordineDichiarato: string[] | undefined,
): T[] {
  const posizione = new Map<string, number>();
  (ordineDichiarato ?? []).forEach((voce, indice) => {
    const nome = voce.split("|")[0]?.trim().toLowerCase();
    if (nome) posizione.set(nome, indice);
  });

  return privilegi
    .map((privilegio, indiceOriginale) => ({ privilegio, indiceOriginale }))
    .sort((a, b) => {
      if (a.privilegio.level !== b.privilegio.level) return a.privilegio.level - b.privilegio.level;
      // Dentro lo stesso livello: prima le voci dichiarate, nel loro ordine; poi le altre, come
      // stanno nel file. Number.MAX_SAFE_INTEGER tiene i "figli" dopo qualunque voce dichiarata.
      const pa = posizione.get(a.privilegio.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      const pb = posizione.get(b.privilegio.name.toLowerCase()) ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.indiceOriginale - b.indiceOriginale;
    })
    .map((x) => x.privilegio);
}
