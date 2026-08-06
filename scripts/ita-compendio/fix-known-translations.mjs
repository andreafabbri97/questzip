// Correzioni puntuali a compendio_traduzione_ia per voci (soprattutto sottoclassi) dove la
// traduzione IA (Gemini) si è rivelata sbagliata rispetto al manuale italiano reale — le
// sottoclassi non hanno una pipeline di estrazione ufficiale come le classi base (vedi
// compendio_ita_classe, solo le 12 classi PHB), quindi il loro nome/descrizione italiani erano
// finora SEMPRE di origine IA, mai estratti dal PDF vero. Ogni riga qui sotto è invece testo
// REALE, copiato da scripts/ita-compendio/extracted/<libro>.json (lo stesso testo grezzo già
// estratto dai PDF ufficiali dell'utente per il resto della pipeline) — non un'altra traduzione
// indovinata, per lo stesso motivo per cui in generale preferiamo il testo ufficiale a qualsiasi
// resa automatica. Aggiungere una voce e rilanciare: rilanciabile in sicurezza, salta le righe già
// corrette; se "descrizioneIta" è omesso, si limita a sostituire il vecchio nome col nuovo ovunque
// compaia nella descrizione esistente invece di sostituirla per intero.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { compendioTraduzioniIa } from "../../lib/db/schema.ts";
import { and, eq } from "drizzle-orm";

const CORRECTIONS = [
  {
    kind: "classi",
    name: "The Hexblade",
    source: "XGE",
    nomeIta: "La Lama del Sortilegio",
    descrizioneIta:
      "Il warlock ha stipulato il suo patto con una misteriosa entità della Coltre Oscura: una forza che si manifesta in armi di magia senzienti e ricavate dalla materia d'ombra. La possente spada Lama Nera è la più famosa di queste armi, che nell'arco dei secoli si sono diffuse in tutto il multiverso. La forza d'ombra all'origine di queste armi può offrire il suo potere a quei warlock che stipulano un patto con lei. Molti warlock della lama del sortilegio creano armi che emulano quelle forgiate sulla Coltre Oscura. Altri rinunciano a queste armi e si accontentano di infondere la magia oscura di quel piano negli incantesimi che lanciano. Poiché è noto che sia stata la Regina Corvo a forgiare la prima di queste armi, molti sapienti ipotizzano che lei e la forza siano la stessa cosa e che quelle armi, assieme ai warlock della lama del sortilegio, siano gli strumenti che usa per manipolare gli eventi del Piano Materiale per i suoi scopi imperscrutabili.",
    note: "Guida Omnicomprensiva di Xanathar (patrono Warlock), pag. 58 — segnalato dall'utente il 2026-08-06, era 'La Lama Incantata' (traduzione IA)",
  },
  {
    kind: "classi",
    name: "Arcane Trickster",
    source: "PHB",
    nomeIta: "Mistificatore Arcano",
    descrizioneIta:
      "Alcuni ladri potenziano le loro sopraffine abilità furtive e di agilità con la magia, imparando alcuni trucchi di ammaliamento e di illusione. Questi ladri includono borseggiatori, scassinatori, burloni e combinaguai di ogni genere, e naturalmente un considerevole numero di avventurieri.",
    note: "Manuale del Giocatore (archetipo ladresco), pag. 79 — segnalato dall'utente il 2026-08-06, era 'Ingannatore Arcano' (traduzione IA)",
  },
  {
    kind: "classi",
    name: "Arcane Trickster",
    source: "XPHB",
    nomeIta: "Mistificatore Arcano",
    note: "Stesso nome ufficiale del 2014 (XPHB 2024 non ancora verificato riga per riga, solo il nome è stato allineato) — era 'Ingannatore Arcano'",
  },
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
