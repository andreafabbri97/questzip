// Controlla ogni abbinamento italiano->inglese dei mostri confrontando CA e PF con i dati 5etools.
// Sono numeri, non opinioni di traduzione: se non coincidono l'abbinamento e' sbagliato, e con
// --scollega la riga viene riportata a "non abbinata" invece di mostrare il testo di un mostro
// diverso. Serve perche' l'abbinamento assistito dall'IA, dovendo SCEGLIERE dentro una rosa,
// tende a forzare una scelta anche per le voci che sono solo frammenti di nome spezzati dall'OCR.
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";
const scollega = process.argv.includes("--scollega");

const index = await (await fetch(`${B}/bestiary/index.json`)).json();
const files = await Promise.all(
  Object.values(index).map((f) => fetch(`${B}/bestiary/${f}`).then((r) => r.json()).catch(() => ({}))),
);
const perChiave = new Map();
for (const f of files)
  for (const m of f.monster ?? []) perChiave.set(`${m.name}|${m.source}`, m);

const numero = (t) => {
  const n = String(t ?? "").match(/\d+/);
  return n ? Number(n[0]) : null;
};

const righe = await sql`
  SELECT id, nome, nome_inglese, fonte_inglese, classe_armatura, punti_ferita
  FROM compendio_ita_mostro WHERE nome_inglese IS NOT NULL ORDER BY nome`;

let ok = 0, senzaDati = 0;
const sospetti = [];
for (const r of righe) {
  const eng = perChiave.get(`${r.nome_inglese}|${r.fonte_inglese}`);
  if (!eng) { sospetti.push({ r, motivo: "voce inglese inesistente" }); continue; }
  const caIta = numero(r.classe_armatura);
  const pfIta = numero(r.punti_ferita);
  const acEng = typeof eng.ac?.[0] === "object" ? eng.ac[0].ac : eng.ac?.[0];
  const pfEng = typeof eng.hp === "object" ? eng.hp?.average : eng.hp;
  if (caIta == null || pfIta == null || acEng == null || pfEng == null) { senzaDati++; continue; }
  // Tolleranza 1 sulla CA (varianti di armatura) e 10% sui PF (arrotondamenti di edizione).
  const caOk = Math.abs(caIta - acEng) <= 1;
  const pfOk = Math.abs(pfIta - pfEng) <= Math.max(3, pfEng * 0.1);
  if (caOk && pfOk) { ok++; continue; }
  sospetti.push({ r, motivo: `CA ${caIta} vs ${acEng}, PF ${pfIta} vs ${pfEng}` });
}

console.log(`coerenti: ${ok} | senza dati per il confronto: ${senzaDati} | sospetti: ${sospetti.length}`);
for (const s of sospetti) console.log(`  ${s.r.nome} -> ${s.r.nome_inglese} (${s.r.fonte_inglese}): ${s.motivo}`);
if (scollega && sospetti.length > 0) {
  for (const s of sospetti)
    await sql`UPDATE compendio_ita_mostro SET nome_inglese = NULL, fonte_inglese = NULL WHERE id = ${s.r.id}`;
  console.log(`\nscollegate ${sospetti.length} righe sospette`);
}
