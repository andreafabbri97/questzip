/**
 * Divide i privilegi di una classe o sottoclasse in "già ottenuti" e "ai livelli successivi".
 *
 * L'elenco del Compendio arriva sempre completo fino al 20° livello: un Ladro di 5° si trovava
 * davanti anche i privilegi del 9°, 13° e 17°, senza alcun segno che non fossero ancora suoi. Al
 * tavolo la domanda è una sola — che cosa ho ADESSO — e la risposta stava in mezzo a roba che
 * arriverà fra quattro livelli.
 */
export function dividiPerLivello<T extends { level: number }>(
  privilegi: T[],
  livello: number,
): { ottenuti: T[]; futuri: T[] } {
  const ottenuti: T[] = [];
  const futuri: T[] = [];
  for (const privilegio of privilegi) {
    (privilegio.level <= livello ? ottenuti : futuri).push(privilegio);
  }
  return { ottenuti, futuri };
}

/** Il livello a cui arriva il prossimo privilegio, per annunciarlo senza aprire l'elenco. */
export function prossimoLivelloConPrivilegi<T extends { level: number }>(
  futuri: T[],
): number | null {
  if (futuri.length === 0) return null;
  return Math.min(...futuri.map((f) => f.level));
}

/** Una riga del testo tradotto di una classe: nome italiano e descrizione, con il suo livello. */
export type PrivilegioTradotto = { level: number; name: string; text: string };

/**
 * Abbina a ciascun privilegio inglese la sua riga tradotta, quando l'abbinamento è sicuro.
 *
 * Il testo tradotto contiene i nomi già in italiano, quindi non si può accoppiare per nome: si
 * accoppia per livello, nell'ordine. Ma se a un livello i due elenchi non hanno la stessa
 * lunghezza l'ordine non prova più niente, e i nomi scivolano — nella scheda di un Ladro Lama
 * Spirituale si leggeva "Lama Spirituale (Psi-Bolstered Knack)", cioè il nome di un altro
 * privilegio. Un nome italiano sbagliato è peggio del nome inglese giusto, quindi in quel caso si
 * rinuncia: `null` e il chiamante mostra l'originale.
 *
 * Il testo della descrizione resta comunque disponibile per i livelli che combaciano.
 */
export function abbinaPrivilegiTradotti<T extends { level: number }>(
  privilegi: T[],
  tradotti: PrivilegioTradotto[],
): (PrivilegioTradotto | null)[] {
  const perLivello = new Map<number, PrivilegioTradotto[]>();
  for (const t of tradotti) {
    perLivello.set(t.level, [...(perLivello.get(t.level) ?? []), t]);
  }

  const conteggioPrivilegi = new Map<number, number>();
  for (const p of privilegi) {
    conteggioPrivilegi.set(p.level, (conteggioPrivilegi.get(p.level) ?? 0) + 1);
  }

  const code = new Map<number, PrivilegioTradotto[]>();
  for (const [livello, voci] of perLivello) {
    if (voci.length === conteggioPrivilegi.get(livello)) code.set(livello, [...voci]);
  }

  return privilegi.map((p) => code.get(p.level)?.shift() ?? null);
}
