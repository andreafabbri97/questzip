// Trova le parole che l'OCR di Windows ha saltato lasciando il buco nella riga.
//
// Questo OCR legge quasi tutto, ma ogni tanto una parola piccola non la restituisce affatto: di
// solito il numero con il segno dell'ordinale («A partire dal 6° livello» diventa «A partire dal
// livello») o una «è» isolata. Il testo che ne esce è ancora italiano, quindi né il vocabolario
// né il controllo dei dadi se ne accorgono — e un privilegio di classe senza il suo livello è
// proprio l'errore che un Compendio non può avere. Il buco però resta nella geometria: fra due
// parole della stessa riga c'è un terzo dell'altezza delle lettere, qui ce n'è più di una intera.
//
// Stampa i buchi trovati con le parole attorno. Vanno letti sulla pagina (foglio_ritagli.py ne
// fa un foglio solo) e scritti in «_parole» nel file dei ritocchi: rilanciando, quelli già
// rimessi non compaiono più.
//
// Uso: node parole-saltate.mjs <libro> [pagina_inizio] [pagina_fine] [--ritocchi <chiave>] [--foglio <buchi.json>]
//   --ritocchi  il nome del file dei ritocchi, se diverso da quello del libro (oggetti_magici per dm_manuale)
//   --foglio    scrive l'elenco dei buchi in un file, per foglio_ritagli.py
import { writeFileSync } from "node:fs";
import { apriLettura } from "./lettura-windows.mjs";

const posizionali = process.argv.slice(2).filter((a, i, tutti) => !a.startsWith("--") && !tutti[i - 1]?.startsWith("--"));
const opzione = (nome) => (process.argv.includes(nome) ? process.argv[process.argv.indexOf(nome) + 1] : null);
const [libro, da = "0", a = "9999"] = posizionali;
if (!libro) {
  console.error("Uso: node parole-saltate.mjs <libro> [pagina_inizio] [pagina_fine] [--ritocchi <chiave>] [--foglio <buchi.json>]");
  process.exit(1);
}

const lettura = apriLettura(libro, opzione("--ritocchi") ?? libro);
const buchi = [];
for (const indice of Object.keys(lettura.dati.pagine).map(Number).sort((x, y) => x - y)) {
  if (indice < Number(da) || indice > Number(a)) continue;
  const pagina = lettura.pagina(indice);
  const centro = pagina.larghezza / 2;
  for (const riga of pagina.righe) {
    const parole = [...riga.parole].sort((x, y) => x.x - y.x);
    // Con meno di quattro parole non si sa quanto sia largo uno spazio normale.
    if (parole.length < 4) continue;
    // Le testatine: lì il buco è la barra fra «CAPITOLO 2» e il suo nome, non una parola.
    if (/^(CAPITOLO|APPENDICE)$/.test(parole[0].t)) continue;
    const altezze = parole.map((p) => p.h).sort((x, y) => x - y);
    const altezza = altezze[Math.floor(altezze.length / 2)];
    for (let i = 1; i < parole.length; i++) {
      const [prima, dopo] = [parole[i - 1], parole[i]];
      const fine = prima.x + prima.w;
      const buco = dopo.x - fine;
      if (buco < altezza * 1.25 || buco > altezza * 5) continue;
      // Lo spazio fra le due colonne, quando l'OCR ha letto due righe come una.
      if (fine < centro && dopo.x > centro) continue;
      // Sopra un'immagine le parole stanno dove capita.
      if (dopo.f && dopo.f[0] < 225) continue;
      buchi.push({
        pagina: indice,
        x0: fine,
        x1: dopo.x,
        y: Math.min(prima.y, dopo.y),
        h: altezza,
        prima: parole.slice(Math.max(0, i - 3), i).map((p) => p.t).join(" "),
        dopo: parole.slice(i, i + 3).map((p) => p.t).join(" "),
      });
    }
  }
}

buchi.forEach((b, n) => console.log(`${String(n).padStart(3)}  p. ${b.pagina}  ${b.prima} ▢ ${b.dopo}`));
console.log(`\n${buchi.length} buchi`);
const foglio = opzione("--foglio");
if (foglio) writeFileSync(foglio, JSON.stringify(buchi));
