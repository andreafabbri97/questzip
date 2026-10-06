/**
 * Lettura del testo italiano prodotto per il Compendio (scripts/ita-compendio/self-translate-fetch.mjs):
 * una riga per privilegio di classe, un paragrafo per tratto di razza.
 *
 * Vivevano dentro compendio-detail.tsx, che è un componente e si porta dietro mezzo Compendio —
 * database e autenticazione compresi. Da quando servono anche all'esportazione in PDF (vedi
 * lib/privilegi-scheda.ts) stanno qui, dove sono due funzioni pure su una stringa: si possono
 * importare da qualunque parte e provare senza montare niente.
 */

// "Nome (Liv. N): testo", una riga per privilegio.
const RIGA_PRIVILEGIO = /^(.*?) \(Liv\. (\d+)\): ([\s\S]*)$/;

export function parseIaClassText(text: string): { name: string; level: number; text: string }[] {
  const items: { name: string; level: number; text: string }[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const match = line.match(RIGA_PRIVILEGIO);
    if (match) items.push({ name: match[1], level: Number(match[2]), text: match[3] });
  }
  return items;
}

// Per le razze: paragrafi separati da riga vuota, "Nome: testo" (niente livello). Il paragrafo
// introduttivo e le intestazioni di sottorazza ("— Elfo Alto —") non hanno ":" e restano fuori di
// proposito: qui servono i tratti veri e propri.
const PARAGRAFO_TRATTO = /^([^:\n]{1,60}): ([\s\S]*)$/;

export function parseIaRaceText(text: string): { name: string; text: string }[] {
  const items: { name: string; text: string }[] = [];
  for (const paragraph of text.split("\n\n")) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    const match = trimmed.match(PARAGRAFO_TRATTO);
    if (match) items.push({ name: match[1], text: match[2] });
  }
  return items;
}
