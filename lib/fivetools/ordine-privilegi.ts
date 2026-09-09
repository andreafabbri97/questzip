/**
 * Ordina i privilegi di una sottoclasse come li ordina il manuale.
 *
 * Ordinarli per solo livello non basta: dentro uno stesso livello resta l'ordine in cui compaiono
 * nel file 5etools, e lì i privilegi "figli" stanno PRIMA di quello che li introduce. Sulla Lama
 * Spirituale si leggeva Colpi Teleguidati, Teletrasporto Psichico e infine "Lame dell'Anima" —
 * che è la voce che annuncia gli altri due e finisce con i due punti, quindi restava appesa in
 * fondo senza niente dopo.
 *
 * La parentela è scritta nei dati, dentro il testo del padre: i blocchi `refSubclassFeature`
 * elencano i figli nell'ordine giusto ("Psionic Power" richiama "Psi-Bolstered Knack" e "Psychic
 * Whispers"). Si ricostruisce quindi l'albero e lo si percorre in profondità: ogni padre viene
 * subito prima dei propri figli, esattamente come sulla pagina stampata.
 */

type Privilegio = { name: string; level: number; entries?: unknown };

/** Nomi dei privilegi richiamati dentro un testo, in ordine e a qualunque profondità. */
function figliDichiarati(entries: unknown): string[] {
  const nomi: string[] = [];
  const visita = (valore: unknown): void => {
    if (Array.isArray(valore)) {
      for (const v of valore) visita(v);
      return;
    }
    if (!valore || typeof valore !== "object") return;
    const oggetto = valore as Record<string, unknown>;
    const riferimento =
      oggetto.subclassFeature ?? oggetto.classFeature ?? oggetto.optionalfeature;
    if (typeof riferimento === "string") {
      const nome = riferimento.split("|")[0]?.trim();
      if (nome) nomi.push(nome);
      return;
    }
    for (const v of Object.values(oggetto)) visita(v);
  };
  visita(entries);
  return nomi;
}

export function ordinaPrivilegiSottoclasse<T extends Privilegio>(
  privilegi: T[],
  ordineDichiarato: string[] | undefined,
): T[] {
  const chiave = (nome: string) => nome.trim().toLowerCase();

  // Posizione delle voci principali, dichiarate dalla sottoclasse ("Soul Blades|Rogue||…|9").
  const posizioneRadice = new Map<string, number>();
  (ordineDichiarato ?? []).forEach((voce, indice) => {
    const nome = voce.split("|")[0]?.trim();
    if (nome) posizioneRadice.set(chiave(nome), indice);
  });

  const perLivello = new Map<number, T[]>();
  for (const p of privilegi) {
    perLivello.set(p.level, [...(perLivello.get(p.level) ?? []), p]);
  }

  const risultato: T[] = [];
  for (const livello of [...perLivello.keys()].sort((a, b) => a - b)) {
    const voci = perLivello.get(livello)!;
    const perNome = new Map(voci.map((v) => [chiave(v.name), v]));

    // Chi è figlio di qualcun altro non apre l'elenco: lo raggiungeremo dal suo padre.
    const figli = new Map<string, string[]>();
    const haPadre = new Set<string>();
    for (const v of voci) {
      const suoi = figliDichiarati(v.entries).map(chiave).filter((n) => perNome.has(n));
      figli.set(chiave(v.name), suoi);
      for (const f of suoi) haPadre.add(f);
    }

    const radici = voci
      .filter((v) => !haPadre.has(chiave(v.name)))
      .sort((a, b) => {
        const pa = posizioneRadice.get(chiave(a.name)) ?? Number.MAX_SAFE_INTEGER;
        const pb = posizioneRadice.get(chiave(b.name)) ?? Number.MAX_SAFE_INTEGER;
        if (pa !== pb) return pa - pb;
        return voci.indexOf(a) - voci.indexOf(b);
      });

    const visitati = new Set<string>();
    const scendi = (voce: T): void => {
      const k = chiave(voce.name);
      if (visitati.has(k)) return; // un riferimento circolare non deve bloccare la pagina
      visitati.add(k);
      risultato.push(voce);
      for (const nomeFiglio of figli.get(k) ?? []) {
        const figlio = perNome.get(nomeFiglio);
        if (figlio) scendi(figlio);
      }
    };
    for (const radice of radici) scendi(radice);
    // Voci rimaste fuori (parentele incoerenti nei dati): meglio in fondo che sparite.
    for (const v of voci) if (!visitati.has(chiave(v.name))) risultato.push(v);
  }

  return risultato;
}
