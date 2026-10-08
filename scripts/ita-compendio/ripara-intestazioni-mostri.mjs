// Ricostruisce dall'originale le righe d'intestazione delle schede dei mostri che l'estrazione
// ha perso o rovinato: vulnerabilità, resistenze e immunità ai danni, immunità alle condizioni,
// sensi, linguaggi (vedi lib/fivetools/intestazioni-mostro.ts).
//
// È il fratello di ripara-numeri-mostri.mjs: come i numeri, queste righe non si correggono a
// occhio. Sono a vocabolario chiuso e il manuale italiano le scrive con una formula fissa, quindi
// si riscrivono dai dati di 5etools con i termini italiani. In 250 schede mancavano resistenze o
// immunità — il Fantasma senza resistenze, i draghi senza l'immunità al proprio soffio — e niente
// lo segnalava: la scheda si apre lo stesso, con una riga in meno.
//
// Una riga si riscrive solo se è SBAGLIATA: le manca un tipo che l'originale ha, ne ha uno che
// l'originale non ha, o contiene qualcosa che in quella riga non può stare (cifre in una riga di
// danni, «Linguaggi» in coda ai sensi: è la riga dopo finita dentro). Una riga giusta resta con le
// parole del manuale. Dove l'originale usa una forma che non si sa scrivere («resistenza al fuoco
// finché è nell'oscurità») non si inventa: la riga resta com'è e viene elencata.
//
// Uso: node --env-file=../../.env.local ripara-intestazioni-mostri.mjs [--applica] [--elenco]
import { neon } from "@neondatabase/serverless";
import { risolviCopie } from "../../lib/fivetools/risolvi-copia.ts";
import {
  condizioniInItaliano,
  condizioniNominate,
  danniInItaliano,
  linguaggiInItaliano,
  radiceDanno,
  sensiAttesi,
  sensiInItaliano,
  tipiDiDanno,
} from "../../lib/fivetools/intestazioni-mostro.ts";

const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const elenco = process.argv.includes("--elenco");
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

const index = await (await fetch(`${B}/bestiary/index.json`)).json();
const files = await Promise.all(
  [...new Set(Object.values(index))].map((f) => fetch(`${B}/bestiary/${f}`).then((r) => r.json()).catch(() => ({}))),
);
const template = await fetch(`${B}/bestiary/template.json`).then((r) => r.json()).catch(() => ({}));
const creature = new Map(
  risolviCopie(files.flatMap((f) => f.monster ?? []), template.monsterTemplate ?? []).map((m) => [`${m.name}|${m.source}`, m]),
);

const righe = await sql`
  SELECT id, nome, fonte, nome_inglese, fonte_inglese, vulnerabilita_danni, resistenza_danni, immunita_danni,
         immunita_condizioni, sensi, linguaggi
  FROM compendio_ita_mostro WHERE nome_inglese IS NOT NULL`;

const TUTTI_I_DANNI = ["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing", "poison", "psychic", "radiant", "slashing", "thunder"];
const DANNI = [
  ["vulnerabilita_danni", "vulnerable"],
  ["resistenza_danni", "resist"],
  ["immunita_danni", "immune"],
];
/** Ciò che in una riga d'intestazione non può stare: è la riga dopo, o un pezzo di tabella. */
const ESTRANEO = /\d|immunit|resisten|vulnerab|condizion|linguagg|sensi\b|percezione|[{}<>\\$"*=;:](?!\s)|[;:,.\s-]+$/i;
const soloLettere = (s) => (s ?? "").toLowerCase().replace(/[^a-zà-ù0-9]+/g, " ").trim();

const cambi = [];
const daGuardare = [];
for (const r of righe) {
  const eng = creature.get(`${r.nome_inglese}|${r.fonte_inglese}`);
  if (!eng) continue;
  const stile = r.fonte === "mm" ? "2014" : "2021";
  const patch = {};
  const proponi = (colonna, nuovo, motivo) => {
    if (nuovo === null) {
      daGuardare.push(`${r.nome} [${r.fonte}] ${colonna}: ${motivo}, ma l'originale ha una forma che non si sa scrivere — c'è ${JSON.stringify(r[colonna])}`);
    } else if (nuovo !== (r[colonna] ?? "")) {
      patch[colonna] = nuovo;
      cambi.push(`${r.nome} [${r.fonte}] ${colonna} (${motivo}): ${JSON.stringify(r[colonna])} -> ${JSON.stringify(nuovo)}`);
    }
  };

  for (const [colonna, campo] of DANNI) {
    const italiano = (r[colonna] ?? "").toLowerCase();
    const attesi = tipiDiDanno(eng[campo]);
    const mancano = attesi.filter((t) => !italiano.includes(radiceDanno(t)));
    const inPiu = TUTTI_I_DANNI.filter((t) => !attesi.includes(t) && italiano.includes(radiceDanno(t)));
    // I due punti e virgola interni («fuoco; contundente…») sono della formula: si guarda il resto.
    const estraneo = ESTRANEO.test(italiano.replace(/; /g, " "));
    // Un tipo che l'originale non ha non basta a riscrivere: può essere stampato così sul manuale
    // italiano. Si segnala e basta; se è la riga dopo finita dentro, lo dice il testo estraneo.
    if (mancano.length === 0 && !(italiano && estraneo)) {
      if (inPiu.length > 0) daGuardare.push(`${r.nome} [${r.fonte}] ${colonna}: ha ${inPiu.map(radiceDanno).join(", ")}, che l'originale non ha — c'è ${JSON.stringify(r[colonna])}`);
      continue;
    }
    proponi(colonna, danniInItaliano(eng[campo], stile), mancano.length > 0 ? `mancano ${mancano.length} tipi` : "testo estraneo");
  }

  {
    const italiano = (r.immunita_condizioni ?? "").toLowerCase();
    const attese = condizioniNominate(eng.conditionImmune);
    const mancano = attese.filter((c) => !italiano.includes(c.italiano.slice(0, -1)));
    const estraneo = italiano && ESTRANEO.test(italiano);
    const troppe = soloLettere(italiano).split(" ").filter(Boolean).length > attese.length * 3 + 2;
    if (mancano.length > 0 || estraneo || troppe) {
      proponi("immunita_condizioni", condizioniInItaliano(eng.conditionImmune), mancano.length > 0 ? `mancano ${mancano.length} condizioni` : "testo estraneo");
    }
  }

  {
    const italiano = (r.sensi ?? "").toLowerCase();
    const attesi = sensiAttesi(eng.senses);
    const nuovo = sensiInItaliano(eng.senses, eng.passive);
    const mancano = attesi === null || attesi.some((s) => !italiano.includes(s)) || !new RegExp(`percezione passiva ${eng.passive}\\b`).test(italiano);
    const estraneo = /linguagg|[{}<>\\$"*=]|[;:,.\s-]+$/i.test(italiano);
    // Un senso in più di quelli dell'originale: la riga è un'altra.
    const troppi = (italiano.match(/scurovisione|vista cieca|vista pura|percezione tellurica/g) ?? []).length > (attesi?.length ?? 0);
    if (eng.passive !== undefined && (mancano || estraneo || troppi)) proponi("sensi", nuovo, mancano ? "sensi mancanti o diversi" : "testo estraneo");
  }

  {
    const nuovo = linguaggiInItaliano(eng.languages);
    // Solo dove l'originale è un elenco semplice: lì il confronto è alla pari. Le forme libere
    // («capisce il Comune ma non lo parla») il manuale le scrive a modo suo e restano com'erano.
    // Si riscrive se manca un linguaggio o se c'è qualcosa che non è un nome («Comune, Gigante ; ..
    // f», «telepatia 1 8 m»). Un linguaggio IN PIÙ scritto pulito resta: è ciò che dice il manuale.
    if (nuovo !== null && nuovo !== "") {
      const italiano = soloLettere(r.linguaggi);
      const manca = nuovo.split(", ").some((voce) => !italiano.includes(soloLettere(voce)));
      const testo = (r.linguaggi ?? "").trim();
      // Simboli, una cifra staccata dall'altra, o una lettera sola rimasta in coda (che non sia la
      // «m» dei metri).
      const sporco = /[;:.$"*={}<>]|\d \d/.test(testo) || /\s(?!m$)\p{L}{1,2}$/u.test(testo);
      if (manca || sporco) proponi("linguaggi", nuovo, (r.linguaggi ?? "").trim() ? "diversi dall'originale" : "mancavano");
    }
  }

  const colonne = Object.keys(patch);
  if (colonne.length > 0 && applica) {
    const set = colonne.map((c, i) => `${c} = $${i + 1}`).join(", ");
    await sql.query(`UPDATE compendio_ita_mostro SET ${set} WHERE id = $${colonne.length + 1}`, [...colonne.map((c) => patch[c]), r.id]);
  }
}

const perColonna = {};
for (const c of cambi) {
  const colonna = c.match(/\] (\w+) \(/)[1];
  perColonna[colonna] = (perColonna[colonna] ?? 0) + 1;
}
console.log(`${applica ? "" : "[PROVA] "}righe d'intestazione riscritte: ${cambi.length} ${JSON.stringify(perColonna)}`);
if (elenco) for (const c of cambi) console.log(`  ${c}`);
console.log(`da guardare a mano: ${daGuardare.length}`);
for (const d of daGuardare) console.log(`  - ${d}`);
