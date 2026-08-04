// Rimuove intestazioni di pagina del PDF finite per errore dentro il testo di alcune voci ufficiali
// (bug di decode_dm_manual.py sui salti pagina, scoperto verificando ai-translate-compendio.mjs —
// script una tantum, non pensato per essere rilanciato).
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import { compendioItaTalenti, compendioItaIncantesimi } from "../../lib/db/schema.ts";

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

const fixes = [
  { table: compendioItaTalenti, nome: "Carica",
    from: "spingere CAPITOLO 6 I OPZIONI DI PE RSONALI ZZAZIONE il bersaglio",
    to: "spingere il bersaglio" },
  { table: compendioItaTalenti, nome: "Guaritore",
    from: "punti ferita CAPITO LO 6 I OPZION I D I  PERSONALIZZAZI O N E 168 aggiuntivi",
    to: "punti ferita aggiuntivi" },
  { table: compendioItaTalenti, nome: "Iniziato Alla Magia",
    from: "Carisma per C A PITOLO 6 I O P Z I O N I  DI P E RSONALI Z Z A Z I O N E il bardo",
    to: "Carisma per il bardo" },
  { table: compendioItaTalenti, nome: "Resiliente",
    from: "scelta. C A P I TOLO 6 I OPZION I DI PERSON A LIZZAZION E",
    to: "scelta." },
  { table: compendioItaTalenti, nome: "Attore",
    from: "seguenti: C A P I TOLO 6 I O P Z I O N I  DI PERSON A L I Z Z A Z I O N E 1 6 5 166\n\n•",
    to: "seguenti:\n\n•" },
  { table: compendioItaTalenti, nome: "Maestro delle Armature Pesanti",
    from: "seguenti: CA PITOLO 6 I OPZION I DI PERSONA LIZZAZ I O N E 1 69 Il suo punteggio",
    to: "seguenti: Il suo punteggio" },
  { table: compendioItaIncantesimi, nome: "Confusione",
    from: "normalmente. C A P I TOLO 11 I I NCANTESl M l Alla fine",
    to: "normalmente. Alla fine" },
  { table: compendioItaIncantesimi, nome: "Disco Fluttuante di Tenser",
    from: "cambio CAPITOLO 11 i I NCANTESl M I di elevazione",
    to: "cambio di elevazione" },
  { table: compendioItaIncantesimi, nome: "Globo di Invulnerabilità",
    from: "superiore al 6°. CAPITOLO 11 I I NCANTESf M I",
    to: "superiore al 6°." },
  { table: compendioItaIncantesimi, nome: "Guarigione",
    from: "superiore al 6°. C A PITOLO 11 I 1 NCANTE S 1 M 1",
    to: "superiore al 6°." },
  { table: compendioItaIncantesimi, nome: "Reincarnazione",
    from: "di conseguenza. CAPITO LO 1 1  I l NC A NTESI M I",
    to: "di conseguenza." },
  { table: compendioItaIncantesimi, nome: "Sogno",
    from: "un'azione CAPI TOLO 11 I I NCANTESI M l bonus in un suo turno successivo",
    to: "un'azione bonus in un suo turno successivo" },
  { table: compendioItaIncantesimi, nome: "Tocco del Vampiro",
    from: "3d6 danni CA P I TOLO 11 I I NCA NTESI M l necrotici",
    to: "3d6 danni necrotici" },
  { table: compendioItaIncantesimi, nome: "Prestidigitazione",
    from: "di 30 cm. CAPI TOLO 11 I f N CANTESI M I Riscalda, raffredda",
    to: "di 30 cm.\n\n• Riscalda, raffredda" },
];

for (const fix of fixes) {
  const [row] = await db.select().from(fix.table).where(eq(fix.table.nome, fix.nome));
  if (!row) { console.error(`NON TROVATO: ${fix.nome}`); continue; }
  if (!row.descrizione.includes(fix.from)) { console.error(`FRAMMENTO NON TROVATO in ${fix.nome}: ${JSON.stringify(fix.from)}`); continue; }
  const nuova = row.descrizione.replace(fix.from, fix.to);
  await db.update(fix.table).set({ descrizione: nuova }).where(eq(fix.table.id, row.id));
  console.log(`OK: ${fix.nome}`);
}
