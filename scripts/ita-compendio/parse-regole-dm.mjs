// Regole vere del Manuale del Dungeon Master, Capitoli 8 "Condurre il Gioco" e 9 "Il
// Laboratorio del Dungeon Master" — trascritte A MANO (lette dalle pagine renderizzate come
// immagini, non estratte automaticamente) perché il PDF ha il font offuscato e un tentativo di
// decodifica automatica (OCR + allineamento geometrico, scripts/ita-compendio/decode_dm_manual.py)
// aveva lasciato l'88% dei caratteri irrisolti — vedi dm-manuale-mappa.json/dm-manuale.json per
// quel tentativo, conservati come riferimento del fallimento, mai più riutilizzati. Stesso motivo
// per cui qui non c'è NESSUN badge "estratta via OCR" (a differenza di regole_base/costa_spada):
// il testo è stato letto e trascritto da un umano/IA leggendo l'immagine reale della pagina,
// stessa affidabilità del resto del compendio con testo digitale vero.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

const cap8 = JSON.parse(readFileSync(path.join(PARSED_DIR, "dm-manuale-cap8-transcribed.json"), "utf-8"));
const cap9 = JSON.parse(readFileSync(path.join(PARSED_DIR, "dm-manuale-cap9-transcribed.json"), "utf-8"));

const sections = [...cap8, ...cap9].map((s) => ({
  titolo: s.titolo,
  testo: s.testo,
  pagina: s.pagina,
  fonte: "dm_regole",
}));

const outPath = path.join(PARSED_DIR, "dm_manuale-regole.json");
writeFileSync(outPath, JSON.stringify(sections, null, 2), "utf-8");
console.log(`${sections.length} sezioni (Cap. 8 + Cap. 9) -> ${outPath}`);
