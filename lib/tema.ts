/**
 * Il tema dell'interfaccia, in un modulo a parte.
 *
 * Non può stare in app/actions/tema.ts: un file "use server" può esportare SOLO funzioni async
 * (Next.js le trasforma in endpoint), quindi una costante e un type-guard sincrono lì dentro
 * fanno fallire la build. Qui sono anche importabili dai componenti client senza trascinarsi
 * dietro il database.
 */
export const TEMI = ["scuro", "chiaro"] as const;
export type Tema = (typeof TEMI)[number];

export const TEMA_PREDEFINITO: Tema = "scuro";

export function isTema(valore: unknown): valore is Tema {
  return typeof valore === "string" && (TEMI as readonly string[]).includes(valore);
}

/** Il tema scritto sull'<html> dal server, letto dal browser. */
export function temaDalDocumento(elemento: { dataset: DOMStringMap }): Tema {
  return isTema(elemento.dataset.theme) ? elemento.dataset.theme : TEMA_PREDEFINITO;
}
