// Porta nel Compendio le voci del Manuale del Dungeon Master che NON stanno nel catalogo degli
// oggetti magici: i veleni (capitolo 8), gli esplosivi e le armi da fuoco (capitolo 9).
//
// Quei capitoli erano già stati trascritti a mano in sessioni precedenti — il PDF ha il font
// offuscato — quindi qui non si rilegge nulla: si riusa la trascrizione, si prende la scheda di
// ogni voce e la si aggancia alla voce inglese.
//
// Il PREZZO fa da prova dell'abbinamento, come per il resto dell'equipaggiamento: è un numero
// identico nelle due edizioni. Gli oggetti "moderni" del manuale sono però senza prezzo (dinamite,
// granate, lanciagranate): quelli entrano senza verifica e vengono contati a parte.
//
// Uso: node --env-file=../../.env.local aggiungi-voci-capitoli-dm.mjs [--applica]
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");

// [nome italiano stampato, voce 5etools, prezzo in mo (null = "senza prezzo" sul manuale),
//  titolo del paragrafo da cui prendere il testo (se diverso dal nome)]
const GRUPPI = [
  {
    categoria: "Veleno",
    file: "dm-manuale-cap8-transcribed.json",
    sezione: /Veleni/i,
    // le schede dei veleni hanno la forma "Nome (Tipo). Testo"
    schede: /^([A-ZÀ-Ù][A-Za-zà-ÿ'’\s]{2,44})\s*\((Contatto|Ferimento|Inalazione|Ingestione)\)\.\s+([\s\S]+)$/,
    voci: [
      ["Essenza di Etere", "Essence of Ether", 300],
      ["Fumi di Othur Bruciato", "Burnt Othur Fumes", 500],
      ["Lacrime di Mezzanotte", "Midnight Tears", 1500],
      ["Malizia", "Malice", 250],
      ["Muco di Vermeiena", "Carrion Crawler Mucus", 200],
      ["Olio di Taggit", "Oil of Taggit", 400],
      ["Sangue dell'Assassino", "Assassin's Blood", 150],
      ["Siero della Verità", "Truth Serum", 150],
      ["Tintura Pallida", "Pale Tincture", 250],
      ["Torpore", "Torpor", 600],
      ["Veleno di Serpente", "Serpent Venom", 200],
      ["Veleno di Verme Purpureo", "Purple Worm Poison", 2000],
      ["Veleno di Viverna", "Wyvern Poison", 1200],
      ["Veleno Drow", "Drow Poison", 200],
    ],
  },
  {
    categoria: "Esplosivo",
    file: "dm-manuale-cap9-transcribed.json",
    sezione: /Avventure/i,
    // qui il manuale usa un titoletto su riga propria seguito dal paragrafo
    schede: null,
    voci: [
      ["Bomba", "Bomb", 150, "Bomba"],
      ["Polvere da Sparo, Barilotto", "Gunpowder Keg", 250, "Polvere da Sparo"],
      ["Polvere da Sparo, Corno", "Gunpowder Horn", 35, "Polvere da Sparo"],
      ["Dinamite (candelotto)", "Dynamite (stick)", null, "Dinamite"],
      ["Granata a Frammentazione", "Fragmentation Grenade", null, "Granate"],
      ["Granata Fumogena", "Smoke Grenade", null, "Granate"],
      ["Lanciagranate", "Grenade Launcher", null, "Granate"],
    ],
  },
];

const items = await fetch(
  "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/items.json",
).then((r) => r.json());
const perNome = new Map(items.item.filter((i) => i.source === "DMG").map((i) => [i.name, i]));

const esistenti = new Set(
  (await sql`SELECT nome_inglese FROM compendio_ita_oggetto WHERE nome_inglese IS NOT NULL`).map(
    (r) => r.nome_inglese,
  ),
);

/** Testo della sezione, spezzato in paragrafi indicizzati per titolo. */
function schedeDi(gruppo) {
  const capitolo = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "parsed", gruppo.file), "utf-8"));
  const sezioni = Array.isArray(capitolo) ? capitolo : Object.values(capitolo).find(Array.isArray) ?? [];
  const testo = sezioni.find((s) => gruppo.sezione.test(s.titolo))?.testo ?? "";
  const schede = new Map();

  if (gruppo.schede) {
    for (const blocco of testo.split(/\n{2,}/)) {
      const m = blocco.match(gruppo.schede);
      if (m) schede.set(m[1].trim(), `${m[2]}. ${m[3].replace(/\s+/g, " ").trim()}`);
    }
    return schede;
  }

  // titoletto su riga propria: il paragrafo va da lì al titoletto successivo
  const blocchi = testo.split(/\n{2,}/);
  for (let i = 0; i < blocchi.length; i++) {
    const titolo = blocchi[i].trim();
    if (!/^[A-ZÀ-Ù][A-Za-zà-ÿ'’\s]{2,40}$/.test(titolo)) continue;
    const corpo = [];
    for (let j = i + 1; j < blocchi.length; j++) {
      if (/^[A-ZÀ-Ù][A-Za-zà-ÿ'’\s]{2,40}$/.test(blocchi[j].trim())) break;
      corpo.push(blocchi[j].trim());
    }
    if (corpo.length > 0) schede.set(titolo, corpo.join("\n\n"));
  }
  return schede;
}

const daInserire = [];
const saltati = [];
const senzaVerifica = [];

for (const gruppo of GRUPPI) {
  const schede = schedeDi(gruppo);
  for (const [nomeIta, nomeEn, prezzoMo, titoloScheda] of gruppo.voci) {
    const inglese = perNome.get(nomeEn);
    if (!inglese) { saltati.push(`${nomeIta} — "${nomeEn}" non è una voce DMG di 5etools`); continue; }
    if (esistenti.has(nomeEn)) { saltati.push(`${nomeIta} — già in tabella`); continue; }
    if (prezzoMo != null && inglese.value != null && inglese.value !== prezzoMo * 100) {
      saltati.push(`${nomeIta} — prezzo ${prezzoMo} mo ma "${nomeEn}" vale ${inglese.value / 100} mo`);
      continue;
    }
    if (prezzoMo == null) senzaVerifica.push(nomeIta);

    const testo = schede.get(titoloScheda ?? nomeIta);
    if (!testo) { saltati.push(`${nomeIta} — scheda non trovata nella trascrizione`); continue; }
    daInserire.push({ nome: nomeIta, en: nomeEn, categoria: gruppo.categoria, descrizione: testo });
  }
}

console.log(`${daInserire.length} voci da aggiungere, ${saltati.length} saltate`);
for (const v of daInserire) console.log(`  + ${v.nome} = ${v.en} (${v.descrizione.length} caratteri)`);
if (senzaVerifica.length > 0) {
  console.log(`\nsenza verifica del prezzo (il manuale le dà "senza prezzo"): ${senzaVerifica.join(", ")}`);
}
if (saltati.length > 0) {
  console.log("\nsaltate:");
  for (const s of saltati) console.log(`  - ${s}`);
}

if (applica) {
  for (const v of daInserire) {
    await sql`
      INSERT INTO compendio_ita_oggetto (nome, categoria, rarita, sintonia, descrizione, fonte, nome_inglese, fonte_inglese)
      VALUES (${v.nome}, ${v.categoria}, '', false, ${v.descrizione}, 'dm_manuale', ${v.en}, 'DMG')`;
  }
  console.log(`\ninserite ${daInserire.length} voci`);
} else {
  console.log("\n[PROVA] nessuna scrittura: aggiungere --applica");
}
