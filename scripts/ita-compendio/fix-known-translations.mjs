// Correzioni puntuali a compendio_traduzione_ia per voci (soprattutto sottoclassi) dove la
// traduzione IA (Gemini) si è rivelata sbagliata rispetto al manuale italiano reale — le
// sottoclassi non hanno una pipeline di estrazione ufficiale come le classi base (vedi
// compendio_ita_classe, solo le 12 classi PHB), quindi il loro nome/descrizione italiani erano
// finora SEMPRE di origine IA, mai estratti dal PDF vero. Ogni riga qui sotto è invece testo
// REALE, copiato da scripts/ita-compendio/extracted/<libro>.json (lo stesso testo grezzo già
// estratto dai PDF ufficiali dell'utente per il resto della pipeline) — non un'altra traduzione
// indovinata, per lo stesso motivo per cui in generale preferiamo il testo ufficiale a qualsiasi
// resa automatica. Aggiungere una voce e rilanciare: rilanciabile in sicurezza, salta le righe già
// corrette.
//
// ATTENZIONE kind="classi": descrizioneIta per le classi/sottoclassi NON è un paragrafo semplice,
// è multi-riga "Nome (Liv. N): testo" (una riga per privilegio, letto da parseIaClassText in
// lib/fivetools/compendio-detail.tsx per l'elenco espandibile in scheda) — per questo kind, se
// serve correggere anche la descrizione, USARE SEMPRE "descrizioneIta" per sostituire l'INTERO
// campo con tutte le righe ricostruite a mano (vedi parse-subclasses-pdf.mjs per l'estrazione
// automatica della sola prima riga, che preserva le altre) — mai un paragrafo semplice, altrimenti
// l'elenco per livello sparisce (bug già capitato una volta, 2026-08-06, corretto a mano). Per
// altri kind (incantesimi, mostri, oggetti...) descrizioneIta è invece un paragrafo semplice, va
// benissimo sostituirlo per intero.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { compendioTraduzioniIa } from "../../lib/db/schema.ts";
import { and, eq } from "drizzle-orm";

const CORRECTIONS = [
  // Trovate confrontando le intestazioni reali del PHB (scripts/ita-compendio/extracted/phb.json)
  // con le sottoclassi che parse-subclasses-pdf.mjs non riusciva ad abbinare — segno che il nome
  // IA non combaciava affatto col manuale vero. Dopo questa correzione, rilanciare
  // "parse-subclasses-pdf.mjs phb" per estrarre anche la descrizione reale (ora che il nome
  // combacia con l'intestazione, l'abbinamento automatico funziona).
  { kind: "classi", name: "Path of the Totem Warrior", source: "PHB", nomeIta: "Cammino del Combattente Totemico", note: "PHB pag. 50 — era 'Cammino del Guerriero Totemico'" },
  { kind: "classi", name: "College of Lore", source: "PHB", nomeIta: "Collegio della Sapienza", note: "PHB pag. 54 — era 'Collegio del Sapere'" },
  { kind: "classi", name: "Eldritch Knight", source: "PHB", nomeIta: "Cavaliere Mistico", note: "PHB pag. 74 — era 'Cavaliere Occulto'" },
  { kind: "classi", name: "Thief", source: "PHB", nomeIta: "Furfante", note: "PHB pag. 79 — era 'Ladro' (nome della classe base, non dell'archetipo)" },
  { kind: "classi", name: "Beast Master", source: "PHB", nomeIta: "Signore delle Bestie", note: "PHB pag. 106 — era 'Maestro delle Bestie'" },
  { kind: "classi", name: "The Archfey", source: "PHB", nomeIta: "Il Signore Fatato", note: "PHB pag. 116 — era 'Il Fatato Supremo'" },
  { kind: "classi", name: "The Fiend", source: "PHB", nomeIta: "L'Immondo", note: "PHB pag. 117 — era 'L'Infernale'" },

  // Trovate allo stesso modo nella Guida Omnicomprensiva di Xanathar (extracted/xanathar.json) —
  // un indice compatto classe/sottoclasse a pag. 28 ha reso il confronto rapido per tutte queste.
  { kind: "classi", name: "Cavalier", source: "XGE", nomeIta: "Cavaliere Errante", note: "XGE pag. 28 — era solo 'Cavaliere'" },
  { kind: "classi", name: "Oath of Conquest", source: "XGE", nomeIta: "Giuramento di Conquista", note: "XGE pag. 28 — era 'Giuramento della Conquista'" },
  { kind: "classi", name: "Oath of Redemption", source: "XGE", nomeIta: "Giuramento di Redenzione", note: "XGE pag. 28 — era 'Giuramento della Redenzione'" },
  { kind: "classi", name: "Horizon Walker", source: "XGE", nomeIta: "Viandante dell'Orizzonte", note: "XGE pag. 28 — era 'Camminatore dell'Orizzonte'" },
  { kind: "classi", name: "Monster Slayer", source: "XGE", nomeIta: "Uccisore di Mostri", note: "XGE pag. 28 — era 'Sterminatore di Mostri'" },
  { kind: "classi", name: "Inquisitive", source: "XGE", nomeIta: "Indagatore", note: "XGE pag. 28 — era 'Investigatore'" },
  { kind: "classi", name: "Mastermind", source: "XGE", nomeIta: "Pianificatore", note: "XGE pag. 28 — era 'Mente Geniale'" },
  { kind: "classi", name: "Shadow Magic", source: "XGE", nomeIta: "Magia delle Ombre", note: "XGE pag. 28 — era 'Magia dell'Ombra'" },
  { kind: "classi", name: "War Magic", source: "XGE", nomeIta: "Magia della Guerra", note: "XGE pag. 28 — era 'Magia Bellica'" },

  // Trovate allo stesso modo nel Calderone Omnicomprensivo di Tasha (extracted/tasha.json).
  { kind: "classi", name: "Draconic Bloodline", source: "PHB", nomeIta: "Discendenza Draconica", note: "PHB pag. 110 — l'utente aveva corretto in precedenza in 'Stirpe Draconica' ma non era giusto, verificato di nuovo sul testo reale" },
  { kind: "classi", name: "Circle of Wildfire", source: "TCE", nomeIta: "Circolo della Fiamma", note: "TCE — era 'Circolo del Fuoco Selvaggio'" },
  { kind: "classi", name: "Rune Knight", source: "TCE", nomeIta: "Cavaliere Runico", note: "TCE — era 'Cavaliere delle Rune'" },
  { kind: "classi", name: "Fey Wanderer", source: "TCE", nomeIta: "Viandante Fatato", note: "TCE — era 'Vagabondo Fatato'" },
  { kind: "classi", name: "Swarmkeeper", source: "TCE", nomeIta: "Custode degli Sciami", note: "TCE — era 'Guardiano dello Sciame'" },
  { kind: "classi", name: "Soulknife", source: "TCE", nomeIta: "Lama Spirituale", note: "TCE — era 'Lama dell'Anima'" },
  { kind: "classi", name: "Order of Scribes", source: "TCE", nomeIta: "Ordine degli Scribi", note: "TCE — era 'Ordine degli Scrivani'" },

  // Trovate allo stesso modo in Fizban's Treasury of Dragons e Bigby Presenta La Gloria dei
  // Giganti (indice all'inizio del libro, stesso trucco usato per Xanathar's pag. 28).
  { kind: "classi", name: "Drakewarden", source: "FTD", nomeIta: "Guardiano dei Draghi", note: "FTD, indice — era 'Guardiano del Draghetto'" },
  { kind: "classi", name: "Path of the Giant", source: "BGG", nomeIta: "Via del Gigante", note: "BGG, indice — era 'Cammino del Gigante' (questo libro traduce 'Path of' come 'Via', non 'Cammino')" },
];

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

for (const c of CORRECTIONS) {
  const [existing] = await db
    .select()
    .from(compendioTraduzioniIa)
    .where(
      and(
        eq(compendioTraduzioniIa.kind, c.kind),
        eq(compendioTraduzioniIa.name, c.name),
        eq(compendioTraduzioniIa.source, c.source),
      ),
    );
  if (!existing) {
    console.log(`SALTATO (riga non trovata): ${c.kind}/${c.name}/${c.source}`);
    continue;
  }
  if (existing.nomeIta === c.nomeIta && (!c.descrizioneIta || existing.descrizioneIta === c.descrizioneIta)) {
    console.log(`Già corretto: ${c.kind}/${c.name}/${c.source}`);
    continue;
  }
  const oldName = existing.nomeIta;
  const newDescrizione =
    c.descrizioneIta ?? (existing.descrizioneIta && oldName
      ? existing.descrizioneIta.replaceAll(oldName, c.nomeIta)
      : existing.descrizioneIta);
  await db
    .update(compendioTraduzioniIa)
    .set({ nomeIta: c.nomeIta, descrizioneIta: newDescrizione })
    .where(
      and(
        eq(compendioTraduzioniIa.kind, c.kind),
        eq(compendioTraduzioniIa.name, c.name),
        eq(compendioTraduzioniIa.source, c.source),
      ),
    );
  console.log(`Corretto ${c.kind}/${c.name}/${c.source}: "${oldName}" -> "${c.nomeIta}" (${c.note})`);
}
