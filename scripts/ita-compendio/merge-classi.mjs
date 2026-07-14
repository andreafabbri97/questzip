// Unisce i campi base delle classi (parse-classi.mjs: dado vita, competenze, equipaggiamento —
// affidabili per tutte e 12) con la tabella di progressione livelli (extract_class_table.py:
// affidabile solo per 8/12, le classi con colonne extra per gli incantesimi hanno risultati
// scarsi e vengono escluse dalla tabella, pur mantenendo i campi base).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PARSED_DIR = path.join(SCRIPT_DIR, "parsed");

// tabelle di livello affidabili (16+/20 livelli estratti): le altre 4 (Mago, Monaco,
// Stregone, Warlock) hanno colonne extra per gli incantesimi che rompono l'estrazione
const RELIABLE_TABLES = new Set([
  "Barbaro", "Bardo", "Chierico", "Druido", "Guerriero", "Ladro", "Paladino", "Ranger",
]);

function fixDiceNotation(text) {
  if (!text) return text;
  // "ld12"/"ldlO" -> "1d12"/"1d10": stesso artefatto l/1 e O/0 visto ovunque nei manuali,
  // qui isolato al pattern dado (NdM) per non toccare cifre vere altrove nel testo
  return text.replace(/\b[lI](d\d+)/gi, "1$1").replace(/(\d+d\d*)[lI]([O0]|\d)/gi, (m, pre, post) =>
    `${pre}${post === "O" ? "0" : post}`,
  );
}

const base = JSON.parse(readFileSync(path.join(PARSED_DIR, "phb-classi.json"), "utf-8"));
const tables = JSON.parse(readFileSync(path.join(PARSED_DIR, "phb-classi-tabelle.json"), "utf-8"));

const merged = base.map((c) => ({
  nome: c.nome,
  dadoVita: fixDiceNotation(c.dadoVita),
  puntiFerita1Livello: fixDiceNotation(c.puntiFerita1Livello),
  puntiFeritaSuccessivi: fixDiceNotation(c.puntiFeritaSuccessivi),
  armature: c.armature,
  armi: c.armi,
  strumenti: c.strumenti,
  tiriSalvezza: c.tiriSalvezza,
  abilita: c.abilita,
  equipaggiamento: c.equipaggiamento,
  tabellaLivelli: RELIABLE_TABLES.has(c.nome) ? (tables[c.nome] ?? {}) : {},
  fonte: c.fonte,
}));

writeFileSync(path.join(PARSED_DIR, "phb-classi-merged.json"), JSON.stringify(merged, null, 2), "utf-8");
console.log(`${merged.length} classi unite -> phb-classi-merged.json`);
for (const c of merged) {
  console.log(`  ${c.nome}: tabella con ${Object.keys(c.tabellaLivelli).length} livelli`);
}
