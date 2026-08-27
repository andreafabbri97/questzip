// Ripulisce i NOMI dei privilegi nelle tabelle di progressione italiane (compendio_ita_classe.
// tabella_livelli).
//
// Contesto: dal PDF erano state estratte solo due colonne (privilegi e bonus di competenza), e per
// giunta con l'impaginazione a colonne strette che sbava. Le colonne numeriche (trucchetti, slot,
// suppliche...) ora NON vengono più da qui ma dai dati strutturati di 5etools, che sono gli stessi
// numeri in ogni lingua: di questa tabella serve quindi solo che i nomi dei privilegi siano
// scritti bene. Sono 39 stringhe distinte sbagliate, elencate qui una per una invece di dedurle
// con una regola: "I ncanalare" -> "Incanalare" sembra automatizzabile, ma "I" da solo è un
// articolo italiano legittimo e una regola generale finirebbe per unire anche dove non deve.
//
// Uso: node --env-file=../../.env.local pulisci-tabelle-classi.mjs [--applica]
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");

// Stringa estratta -> nome corretto. Stringa vuota = la voce va tolta del tutto: sono i casi del
// monaco in cui la cella NUMERICA di un'altra colonna è finita dentro la colonna dei privilegi
// ("1d6 +4" non è il nome di nulla).
const CORREZIONI = {
  "Arcanum Mistico (8° livello": "Arcanum Mistico (8° livello)",
  "Aure M igliorate": "Aure Migliorate",
  "Azione I mpetuosa (due utilizzi)": "Azione Impetuosa (due utilizzi)",
  "Azione I mpetuosa (un utilizzo)": "Azione Impetuosa (un utilizzo)",
  "Distruggere Non M orti (GS 3)": "Distruggere Non Morti (GS 3)",
  "Esploratore Nato M igliorato": "Esploratore Nato Migliorato",
  "Forma Selvatica M igliorata": "Forma Selvatica Migliorata",
  "I ncanalare Divinità (2/riposo)": "Incanalare Divinità (2/riposo)",
  "I ncanalare Divinità (l/riposo)": "Incanalare Divinità (1/riposo)",
  "I ncantesimi": "Incantesimi",
  "I ncantesimi Bestiali": "Incantesimi Bestiali",
  "I ncantesimi Personali": "Incantesimi Personali",
  "I ndomito (due utilizzi)": "Indomito (due utilizzi)",
  "I ndomito (tre utilizzi)": "Indomito (tre utilizzi)",
  "I ndomito (un utilizzo)": "Indomito (un utilizzo)",
  "I ntervento Divino": "Intervento Divino",
  "I ntervento Divino M igliorato": "Intervento Divino Migliorato",
  "M ovimento Senza Armatura": "Movimento Senza Armatura",
  "Nemico Prescelto M igliorato": "Nemico Prescelto Migliorato",
  "Patrono U ltraterreno": "Patrono Ultraterreno",
  "Privilegio del Patrono U ltraterreno": "Privilegio del Patrono Ultraterreno",
  "Punizione Divina M igliorata": "Punizione Divina Migliorata",
  "is· I ncanalare Divin ità (3/riposo)": "Incanalare Divinità (3/riposo)",
  "l d 6 +4": "",
  "l d 6 Attacco Extra": "Attacco Extra",
  "l d 6 Maestria": "Maestria",
  "l d l O + 9  m Corpo Vuoto": "Corpo Vuoto",
  "l d l O Perfezione I nteriore": "Perfezione Interiore",
  "l d l O Privilegio della Tradizione Monastica": "Privilegio della Tradizione Monastica",
  // Valori delle colonne NUMERICHE finiti dentro la colonna dei privilegi: nel PDF quelle celle
  // sono strettissime (dado delle arti marziali, movimento senza armatura, attacco furtivo) e
  // l'estrazione le ha attaccate al nome accanto. Dove resta solo il numero, la voce sparisce.
  "1 1 '": "",
  "1 1 ' Attacco Extra": "Attacco Extra",
  "1 1 ' Privilegio dell'Archeti o Ranger": "Privilegio dell'Archetipo Ranger",
  "1 1 · Dote Affidabile": "Dote Affidabile",
  "10d6 Aumento dei Punteggi di Caratteristica": "Aumento dei Punteggi di Caratteristica",
  "10d6 Colpo d i  Fortuna": "Colpo di Fortuna",
  "1d6 +4": "",
  "1d6 Aumento dei Punteggi di Caratteristica": "Aumento dei Punteggi di Caratteristica",
  "1d6 Azione Scaltra": "Azione Scaltra",
  "1d6 Purezza del Corpo": "Purezza del Corpo",
  "1d8 +7": "",
  "1d8 Aumento dei Pu nteggi di Caratteristica": "Aumento dei Punteggi di Caratteristica",
  "1d8 Lingua del Sole e della Luna": "Lingua del Sole e della Luna",
  "5  m Colpi Ki Potenziati": "Colpi Ki Potenziati",
  "5  m Elusione": "Elusione",
  "5  m Movimento Senza Armatura M igliorato": "Movimento Senza Armatura Migliorato",
  "5 m Anima Adamantina": "Anima Adamantina",
  "5 m Aumento dei Punteggi di Caratteristica": "Aumento dei Punteggi di Caratteristica",
  "5 m Corpo Senza Tempo": "Corpo Senza Tempo",
  "Aumento dei Punteggi d i  Caratteristica": "Aumento dei Punteggi di Caratteristica",
  "I m posizione delle Mani": "Imposizione delle Mani",
  // Arcanum Mistico: nel manuale il grado sta fra parentesi, l'OCR le ha perse su due livelli su
  // quattro. Uniformati, altrimenti la stessa voce compare scritta in due modi diversi.
  "Arcanum Mistico 6° livello": "Arcanum Mistico (6° livello)",
  "Arcanum Mistico 7° livello": "Arcanum Mistico (7° livello)",
  "Arcanum Mistico (9° l ivello)": "Arcanum Mistico (9° livello)",
};


// Privilegi che dal PDF non sono stati estratti affatto (la cella era vuota o illeggibile),
// verificati sul testo del manuale: al 20° il warlock ha "Maestro dell'Occulto" — non
// "Maestro Occulto", che sarebbe la traduzione che viene spontanea ma non e' quella stampata.
// Aggiunti solo se quel livello e' davvero vuoto, cosi' rilanciare lo script non duplica nulla.
const AGGIUNTE = {
  Monaco: { 19: ["Aumento dei Punteggi di Caratteristica"] },
  Warlock: { 19: ["Aumento dei Punteggi di Caratteristica"], 20: ["Maestro dell'Occulto"] },
};

const righe = await sql`SELECT id, nome, tabella_livelli FROM compendio_ita_classe ORDER BY nome`;
let classiToccate = 0;
let vociCorrette = 0;
const nonTrovate = new Set(Object.keys(CORREZIONI));

for (const riga of righe) {
  const tabella = riga.tabella_livelli ?? {};
  let cambiata = false;
  const nuova = {};
  for (const [livello, dati] of Object.entries(tabella)) {
    const privilegi = [];
    for (const p of dati?.privilegi ?? []) {
      if (!(p in CORREZIONI)) {
        privilegi.push(p);
        continue;
      }
      nonTrovate.delete(p);
      cambiata = true;
      vociCorrette++;
      const corretto = CORREZIONI[p];
      if (corretto) privilegi.push(corretto);
    }
    nuova[livello] = { ...dati, privilegi };
  }
  for (const [livello, nomi] of Object.entries(AGGIUNTE[riga.nome] ?? {})) {
    const attuali = nuova[livello]?.privilegi ?? [];
    if (attuali.length > 0) continue;
    nuova[livello] = { ...(nuova[livello] ?? { bonusCompetenza: "" }), privilegi: nomi };
    cambiata = true;
    vociCorrette += nomi.length;
  }
  if (!cambiata) continue;
  classiToccate++;
  console.log(`${riga.nome}: privilegi sistemati`);
  if (applica) {
    await sql`UPDATE compendio_ita_classe SET tabella_livelli = ${JSON.stringify(nuova)}::jsonb WHERE id = ${riga.id}`;
  }
}

console.log(`\n${applica ? "" : "[PROVA] "}classi toccate: ${classiToccate}, voci corrette: ${vociCorrette}`);
if (nonTrovate.size > 0) {
  console.log(`correzioni non usate (${nonTrovate.size}): ${[...nonTrovate].join(" | ")}`);
}
