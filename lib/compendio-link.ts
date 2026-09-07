/**
 * Link condivisibili verso una voce del Compendio.
 *
 * Prima il Compendio non aveva URL propri: qualunque cosa si stesse guardando, l'indirizzo restava
 * "/compendio" e mandarlo a qualcuno apriva la pagina vuota. Perché il tasto "condividi" abbia
 * senso serve prima questo — un indirizzo che punti alla voce.
 *
 * I parametri sono corti apposta: finiscono in un messaggio, spesso su WhatsApp, dove un link
 * lunghissimo scoraggia il clic. `v` (voce) e `f` (fonte) insieme identificano una voce senza
 * ambiguità: lo stesso nome esiste in più manuali (Aboleth sta in MM e in MPMM).
 */

export type VoceCondivisa = { tab: string; nome: string; fonte: string };

/** Percorso con i parametri, senza dominio: pronto da passare a history.replaceState. */
export function percorsoVoce(voce: VoceCondivisa | null): string {
  if (!voce) return "/compendio";
  const q = new URLSearchParams({ tab: voce.tab, v: voce.nome, f: voce.fonte });
  return `/compendio?${q.toString()}`;
}

/** Legge i parametri di un indirizzo condiviso. Restituisce null se non ne contiene. */
export function leggiVoceDaUrl(search: string): VoceCondivisa | null {
  const q = new URLSearchParams(search);
  const tab = q.get("tab");
  const nome = q.get("v");
  if (!tab || !nome) return null;
  return { tab, nome, fonte: q.get("f") ?? "" };
}

/**
 * Testo che accompagna il link quando si condivide.
 *
 * Va tenuto corto: nei client di messaggistica il testo precede l'anteprima del link, e una riga
 * sola si legge senza aprire il messaggio.
 */
export function testoCondivisione(nome: string, etichettaCategoria: string): string {
  return `${nome} — ${etichettaCategoria} su QuestZip`;
}
