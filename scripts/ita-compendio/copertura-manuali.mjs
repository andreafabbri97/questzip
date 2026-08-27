// Quanto del Compendio ha il testo ufficiale italiano, e quanto se ne potrebbe ancora recuperare.
//
// Divide ogni categoria in tre: voci che il testo del manuale ce l'hanno già, voci che stanno in un
// manuale che possediamo (quindi recuperabili leggendo meglio quel PDF) e voci che stanno solo in
// libri che non abbiamo (per quelle non c'è niente da estrarre, resta la traduzione). Serve a
// decidere dove conviene lavorare: è così che si è visto che 306 mostri erano già estratti ma tenuti
// fuori dal seed, e che i talenti di Tasha/Xanathar/Dragonlance non erano mai stati letti.
//
// Il conteggio è per aggancio ESATTO nome+fonte, quindi sottostima: le varianti che in app
// ricadono sulla scheda madre (Belt of Fire Giant Strength -> Cintura della Forza dei Giganti, vedi
// findUfficiale in lib/fivetools/compendio-detail.tsx) qui risultano ancora "recuperabili" anche se
// il testo del manuale lo mostrano già. Vale soprattutto per gli oggetti del Manuale del DM, dove
// le varianti sono centinaia.
//
// Uso: node --env-file=.env.local scripts/ita-compendio/copertura-manuali.mjs
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
// Fonte 5etools -> manuale italiano che possediamo
const POSSEDUTI = { PHB:"phb", MM:"mm", DMG:"dm-manuale", XGE:"xanathar", TCE:"tasha",
  FTD:"fizban", BGG:"bigby", MPMM:"multiverso", VRGR:"ravenloft", DSotDQ:"dragonlance", SCAG:"costa_spada" };
const TAB = { incantesimi:"compendio_ita_incantesimo", mostri:"compendio_ita_mostro",
  oggetti:"compendio_ita_oggetto", razze:"compendio_ita_razza", talenti:"compendio_ita_talento" };

for (const [kind, tabella] of Object.entries(TAB)) {
  const ia = await sql`SELECT name, source FROM compendio_traduzione_ia WHERE kind = ${kind}`;
  const uff = await sql.query(`SELECT nome_inglese, fonte_inglese FROM ${tabella} WHERE nome_inglese IS NOT NULL`);
  const conUfficiale = new Set(uff.map((u) => `${u.nome_inglese}|${u.fonte_inglese}`));
  let recuperabili = 0, giaFatte = 0, senzaManuale = 0;
  const perLibro = new Map();
  for (const x of ia) {
    if (conUfficiale.has(`${x.name}|${x.source}`)) { giaFatte++; continue; }
    const libro = POSSEDUTI[x.source];
    if (!libro) { senzaManuale++; continue; }
    recuperabili++;
    perLibro.set(libro, (perLibro.get(libro) ?? 0) + 1);
  }
  const top = [...perLibro].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([l,n])=>`${l}:${n}`).join(", ");
  console.log(`${kind.padEnd(13)} ufficiali ${String(giaFatte).padStart(4)} | recuperabili dai nostri manuali ${String(recuperabili).padStart(4)} | senza manuale ${String(senzaManuale).padStart(4)}`);
  if (recuperabili) console.log(`               ${top}`);
}
