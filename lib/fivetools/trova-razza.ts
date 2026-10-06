import type { RawRace } from "@/lib/fivetools/data";

/** La riga di una razza nel testo ufficiale italiano, per quel che serve qui. */
type RigaUfficiale = { nome: string; nomeInglese: string | null; fonteInglese: string | null };

/**
 * A quale razza del catalogo corrisponde quello che c'è scritto in scheda.
 *
 * Il campo è testo libero, quindi può contenere il nome inglese ("Reborn"), quello italiano
 * ufficiale ("Rinato") o un'annotazione personale fra parentesi ("Rinato (ex umano)", per
 * ricordarsi la razza di partenza prima di un lignaggio). E più fonti possono dichiarare la stessa
 * razza: alcune la ridefiniscono via "_copy" senza portarsi dietro i tratti, e scegliere quella
 * mostrerebbe zero privilegi per una razza che invece ne ha.
 *
 * Estratta dalla scheda per poterla usare anche dall'esportazione in PDF: la stessa domanda, posta
 * da due punti diversi, deve dare la stessa risposta.
 */
export function trovaRazza(
  races: RawRace[],
  itaRazze: RigaUfficiale[],
  nomeScritto: string,
): RawRace | null {
  const raw = nomeScritto.trim();
  if (!raw) return null;
  const pulito = raw.replace(/\s*\([^)]*\)\s*$/, "").trim() || raw;

  const perNomeInglese = (name: string) =>
    races.filter((r) => r.name.toLowerCase() === name.toLowerCase());

  // Fra più fonti vince quella che ha davvero i tratti, e fra quelle, quella per cui esiste il
  // testo ufficiale italiano già collegato (visto con Reborn/VRGR contro Reborn/RHW).
  const migliore = (candidate: RawRace[]) => {
    const conTratti = candidate.filter((r) => Array.isArray(r.entries) && r.entries.length > 0);
    const conUfficiale = conTratti.find((r) =>
      itaRazze.some((u) => u.nomeInglese === r.name && u.fonteInglese === r.source),
    );
    return conUfficiale ?? conTratti[0] ?? candidate[0] ?? null;
  };

  let candidate = perNomeInglese(raw);
  if (candidate.length === 0) candidate = perNomeInglese(pulito);
  if (candidate.length === 0) {
    // Quello che c'è scritto potrebbe essere il nome ufficiale ITALIANO: si risale a quello
    // inglese attraverso il collegamento della riga ufficiale.
    const ufficiale = itaRazze.find(
      (r) => r.nomeInglese && r.nome.toLowerCase() === pulito.toLowerCase(),
    );
    if (ufficiale?.nomeInglese) candidate = perNomeInglese(ufficiale.nomeInglese);
  }
  return migliore(candidate);
}
