// Ciò che hanno in comune gli script che ricostruiscono un testo dalla lettura di un manuale
// fatta con l'OCR di Windows (sezioni-costa-spada.mjs, rileggi-oggetti-magici.mjs): la lettura
// stessa, i ritocchi fatti a mano e le pulizie a regole.
//
// La lettura sta in extracted/<libro>-windows.json (ocr_windows_pdf.py). I ritocchi stanno in
// parsed/<chiave>-ritocchi.json, fuori dal repository come ogni testo dei manuali, e sono tre cose:
//
//   "<pagina>": [ { "x": [da, a], "y": [da, a], "testo": "..." | null } ]
//       zone della pagina (in pixel, a 300 dpi) da togliere: una cartina, un'illustrazione, una
//       tabella. Con un testo, quel testo prende il posto della zona: è la tabella trascritta a
//       mano, che dalla geometria non si ricostruisce.
//   "_parole": [ { "pagina", "prima", "t", "dopo" } ]
//       parole che l'OCR ha saltato lasciando il buco nella riga (quasi sempre il numero con il
//       segno dell'ordinale, «dal 6° livello», e le «è» isolate), lette dalla pagina.
//   "_refusi": [ { "sezione", "da", "a", "tutte"? } ]
//       i refusi che nessuna regola prende. Ognuno deve trovare il suo testo una volta sola nella
//       sua sezione, così una correzione che non serve più si fa notare; con «*» al posto della
//       sezione vale ovunque, e deve servire almeno una volta.
import { existsSync, readFileSync } from "node:fs";
import { pulisciTestoOcr } from "../../lib/ocr-cleanup.ts";
import { ricuciParoleSpezzate } from "../../lib/parole-spezzate.ts";
import { riparaRefusiDaVocabolario } from "../../lib/refusi-da-vocabolario.ts";
import { caricaVocabolario } from "./vocabolario.mjs";

const QUI = new URL("./", import.meta.url);

/** Il segnaposto lasciato nella pagina al posto di una zona che ha un testo trascritto a mano. */
export const SEGNAPOSTO = /^RITOCCO(\d+)$/;

/**
 * @param libro    il libro letto: extracted/<libro>-windows.json
 * @param chiave   il nome del file dei ritocchi, se diverso da quello del libro
 */
export function apriLettura(libro, chiave = libro) {
  const dati = JSON.parse(readFileSync(new URL(`extracted/${libro}-windows.json`, QUI), "utf-8"));
  const fileRitocchi = new URL(`parsed/${chiave}-ritocchi.json`, QUI);
  const ritocchi = existsSync(fileRitocchi) ? JSON.parse(readFileSync(fileRitocchi, "utf-8")) : {};
  const paroleRimesse = new Map();
  const refusiUsati = new Map();

  /** Rimette nelle righe le parole saltate: solo dove fra le due vicine c'è davvero il buco. */
  function conParoleSaltate(indice, pagina) {
    const saltate = (ritocchi._parole ?? []).filter((s) => s.pagina === indice);
    if (saltate.length === 0) return pagina;
    // Dall'alto in basso: se due buchi della pagina hanno le stesse parole attorno («dal ▢
    // livello» due volte), le voci dell'elenco valgono nell'ordine in cui sono scritte, e
    // l'ultima vale per i buchi che restano.
    const alto = (riga) => Math.min(...riga.parole.map((p) => p.y));
    const dallAlto = pagina.righe.filter((r) => r.parole.length > 0).sort((a, b) => alto(a) - alto(b));
    const giaUsate = new Map();
    const rifatte = new Map();
    for (const riga of dallAlto) {
      const parole = [...riga.parole].sort((a, b) => a.x - b.x);
      const altezze = parole.map((p) => p.h).sort((a, b) => a - b);
      const altezza = altezze[Math.floor(altezze.length / 2)];
      const aggiunte = [];
      for (let i = 1; i < parole.length; i++) {
        const [prima, dopo] = [parole[i - 1], parole[i]];
        const buco = dopo.x - (prima.x + prima.w);
        const adatte = saltate.filter((s) => s.prima === prima.t && s.dopo === dopo.t);
        // Fra due parole c'è un terzo dell'altezza delle lettere: qui ce n'è più di una intera.
        if (adatte.length === 0 || buco < altezza * 1.2) continue;
        const chiave = `${prima.t}\u0000${dopo.t}`;
        const quante = giaUsate.get(chiave) ?? 0;
        giaUsate.set(chiave, quante + 1);
        const saltata = adatte[Math.min(quante, adatte.length - 1)];
        paroleRimesse.set(saltata, (paroleRimesse.get(saltata) ?? 0) + 1);
        aggiunte.push({ t: saltata.t, x: prima.x + prima.w + buco * 0.15, y: dopo.y, w: buco * 0.7, h: dopo.h, f: dopo.f });
      }
      if (aggiunte.length > 0) rifatte.set(riga, { parole: [...parole, ...aggiunte] });
    }
    return { ...pagina, righe: pagina.righe.map((riga) => rifatte.get(riga) ?? riga) };
  }

  /** La pagina letta, con le parole saltate rimesse e le zone ritoccate tolte. */
  function pagina(indice) {
    const letta = conParoleSaltate(indice, dati.pagine[indice]);
    const zone = ritocchi[indice] ?? [];
    if (zone.length === 0) return letta;
    const dentro = (p, z) => {
      const cx = p.x + p.w / 2;
      const cy = p.y + p.h / 2;
      return cx >= z.x[0] && cx <= z.x[1] && cy >= z.y[0] && cy <= z.y[1];
    };
    const righe = letta.righe
      .map((r) => ({ parole: r.parole.filter((p) => !zone.some((z) => dentro(p, z))) }))
      .filter((r) => r.parole.length > 0);
    zone.forEach((z, n) => {
      if (z.testo === null || z.testo === undefined) return;
      // Scritto in maiuscolo e alto due punti: per il lettore è un titolo che non si attacca a
      // niente, largo quanto la zona (così una tabella a tutta pagina divide le fasce da sola).
      // Una parola sola: due, con uno spazio in mezzo, si dividerebbero se lo spazio cadesse fra
      // le colonne.
      righe.push({ parole: [{ t: `RITOCCO${n}`, x: z.x[0], y: z.y[0], w: z.x[1] - z.x[0], h: 2 }] });
    });
    return { ...letta, righe };
  }

  /** Il testo trascritto a mano che sta al posto del segnaposto `n` della pagina. */
  const zona = (indice, n) => ritocchi[indice][n].testo;

  /** Applica al testo di una sezione le correzioni a mano che la riguardano. */
  function conRefusi(sezione, testo, avvisi) {
    let out = testo;
    for (const r of ritocchi._refusi ?? []) {
      if (r.sezione !== sezione && r.sezione !== "*") continue;
      const volte = out.split(r.da).length - 1;
      refusiUsati.set(r, (refusiUsati.get(r) ?? 0) + volte);
      // Una correzione che vale ovunque vale anche per tutte le volte: non ha una frase sua.
      if (volte === 1 || ((r.tutte || r.sezione === "*") && volte > 0)) out = out.split(r.da).join(r.a);
      else if (r.sezione !== "*") avvisi.push(`refuso in «${sezione}»: «${r.da}» trovato ${volte} volte`);
    }
    return out;
  }

  /** I ritocchi che non hanno trovato il loro posto: da chiamare alla fine. */
  function ritocchiInutili() {
    const avvisi = [];
    for (const s of ritocchi._parole ?? []) {
      if (!paroleRimesse.get(s)) avvisi.push(`parola saltata non rimessa: p. ${s.pagina} «${s.prima} [${s.t}] ${s.dopo}»`);
    }
    for (const r of ritocchi._refusi ?? []) {
      if (r.sezione === "*" && !refusiUsati.get(r)) avvisi.push(`refuso mai trovato: «${r.da}»`);
      if (r.sezione !== "*" && !refusiUsati.has(r)) avvisi.push(`refuso per una sezione che non c'è: «${r.sezione}»`);
    }
    return avvisi;
  }

  return { dati, ritocchi, pagina, zona, conRefusi, ritocchiInutili };
}

/**
 * Le stesse pulizie che gli script fanno sul database (pulisci-ocr, ricuci-parole-spezzate,
 * ripara-refusi-da-vocabolario), nello stesso ordine e fino a che non cambia più niente: il testo
 * nasce pulito, e quegli script, rilanciati dopo il caricamento, non trovano nulla.
 *
 * Il vocabolario viene dai file di parsed/; se mancano li ricostruisce ricuci-parole-spezzate.mjs
 * (che legge il database).
 */
export async function apriPulizie() {
  const vocabolario = await caricaVocabolario(null);
  const perRefusi = { nota: vocabolario.nota, comune: (p) => vocabolario.peso(p) >= 2 };
  const prudente = { ...vocabolario, soloPezziEstranei: true };
  /** Che cosa è stato riparato, e quante volte: va letto, come ogni riparazione fatta a regole. */
  const riparazioni = new Map();
  const segna = (r) => riparazioni.set(`${r.prima} -> ${r.dopo}`, (riparazioni.get(`${r.prima} -> ${r.dopo}`) ?? 0) + 1);

  function pulisci(testo) {
    let out = testo;
    for (let giro = 0; giro < 4; giro++) {
      const ricucito = ricuciParoleSpezzate(pulisciTestoOcr(out), prudente);
      const riparato = riparaRefusiDaVocabolario(ricucito.testo, perRefusi);
      ricucito.ricuciture.forEach(segna);
      riparato.riparazioni.forEach(segna);
      if (riparato.testo === out) break;
      out = riparato.testo;
    }
    return out;
  }

  return { pulisci, riparazioni, vocabolario };
}
