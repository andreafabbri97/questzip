// Prepara il file di abbinamento italiano -> inglese per i mostri di un manuale.
//
// Scrive da sé le righe che non hanno bisogno di giudizio — nome identico a meno di maiuscole e
// accenti E stesso grado di sfida, il che vale per tutti i nomi che l'italiano lascia invariati
// (Aboleth, Chuul, Balor, Quasit...) — e stampa le altre con la rosa dei candidati possibili
// (stesso grado di sfida, stesso tipo di creatura) da completare a mano nel file.
//
// Uso: node --env-file=../../.env.local proponi-mappa-mostri.mjs <chiave_libro>
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { neon } from "@neondatabase/serverless";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const [libro] = process.argv.slice(2);

const BESTIARI = {
  mm: { file: "bestiary-mm.json", fonte: "MM" },
  multiverso: { file: "bestiary-mpmm.json", fonte: "MPMM" },
  fizban: { file: "bestiary-ftd.json", fonte: "FTD" },
  bigby: { file: "bestiary-bgg.json", fonte: "BGG" },
  dragonlance: { file: "bestiary-dsotdq.json", fonte: "DSotDQ" },
  ravenloft: { file: "bestiary-vrgr.json", fonte: "VRGR" },
};
if (!BESTIARI[libro]) {
  console.error(`Uso: proponi-mappa-mostri.mjs <${Object.keys(BESTIARI).join("|")}>`);
  process.exit(1);
}

const TIPI = {
  aberration: "ABERRAZIONE", beast: "BESTIA", celestial: "CELESTIALE", construct: "COSTRUTTO",
  dragon: "DRAGO", elemental: "ELEMENTALE", fey: "FATA", fiend: "IMMOND", giant: "GIGANTE",
  humanoid: "UMANOIDE", monstrosity: "MOSTRUOSIT", ooze: "MELMA", plant: "VEGETAL", undead: "MORTO",
};

const norm = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const sfidaDi = (m) => {
  const cr = typeof m.cr === "object" ? m.cr?.cr : m.cr;
  return cr == null ? null : String(cr).trim();
};
const tipoDi = (m) => TIPI[typeof m.type === "object" ? m.type.type : m.type] ?? "";

const RAW = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/bestiary/";
const bestiario = await fetch(RAW + BESTIARI[libro].file).then((r) => r.json());

const inTabella = new Set(
  (await sql.query(`SELECT nome FROM compendio_ita_mostro WHERE fonte = $1`, [libro])).map((r) => r.nome),
);
const agganciati = new Set(
  (
    await sql.query(
      `SELECT nome_inglese FROM compendio_ita_mostro WHERE fonte_inglese = $1 AND nome_inglese IS NOT NULL`,
      [BESTIARI[libro].fonte],
    )
  ).map((r) => r.nome_inglese),
);

const parsed = JSON.parse(
  readFileSync(path.join(SCRIPT_DIR, "parsed", `${libro}-mostri.json`), "utf-8"),
);
// un nome vero comincia con una maiuscola, non contiene punti e non è una frase: le altre righe
// sono frasi narrative che il parser ha scambiato per intestazioni, e non vanno abbinate
const candidate = (Array.isArray(parsed) ? parsed : parsed.mostri).filter(
  (m) => !inTabella.has(m.nome) && /^[A-ZÀ-Þ]/.test(m.nome) && !m.nome.includes(".") && m.nome.length <= 60,
);
const liberi = bestiario.monster.filter((m) => !agganciati.has(m.name));
const perNome = new Map(liberi.map((m) => [norm(m.name), m]));

const automatiche = {};
const daDecidere = [];
for (const m of candidate) {
  const uguale = perNome.get(norm(m.nome));
  if (uguale && sfidaDi(uguale) === String(m.sfida ?? "").trim()) {
    automatiche[m.nome] = uguale.name;
    continue;
  }
  const tipo = norm(m.tipo ?? "");
  const rosa = liberi.filter(
    (x) =>
      sfidaDi(x) === String(m.sfida ?? "").trim() &&
      (!tipo || !tipoDi(x) || tipo.includes(tipoDi(x))),
  );
  daDecidere.push({ m, rosa });
}

const destinazione = path.join(SCRIPT_DIR, `mappa-mostri-${libro}.json`);
if (existsSync(destinazione)) {
  console.log(`${destinazione} esiste già: non lo sovrascrivo.`);
} else {
  writeFileSync(
    destinazione,
    JSON.stringify(
      {
        _nota: `Abbinamento fra le schede estratte da ${libro} e le voci inglesi di 5etools. Le righe qui sotto sono state proposte automaticamente perché il nome è identico a meno di maiuscole e accenti e il grado di sfida coincide; le altre vanno aggiunte a mano. Il campo "it" serve solo quando il nome estratto è rovinato dall'OCR e va riscritto.`,
        ...automatiche,
      },
      null,
      2,
    ) + "\n",
    "utf-8",
  );
  console.log(`scritte ${Object.keys(automatiche).length} righe automatiche in ${path.basename(destinazione)}`);
}

console.log(`\nda decidere a mano (${daDecidere.length}):`);
for (const { m, rosa } of daDecidere) {
  const etichetta = `${m.nome} [${m.sfida ?? "?"} ${m.taglia ?? ""} ${m.tipo ?? ""}]`.replace(/\s+/g, " ");
  console.log(`${etichetta.padEnd(50)} => ${rosa.map((x) => x.name).join(", ") || "(nessun candidato con quel grado di sfida)"}`);
}
