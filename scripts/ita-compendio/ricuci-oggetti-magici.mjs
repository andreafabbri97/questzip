// Ricuce le descrizioni degli oggetti magici rimaste a metà.
//
// Il catalogo "Oggetti magici A-Z" viene da pagine lette con l'OCR a paragrafi
// (extracted/oggetti_magici.json): ogni paragrafo è un blocco. parse-oggetti-magici.mjs prende,
// per ogni oggetto, il blocco che comincia col nome e la riga "categoria, rarità" — e solo
// quello. Ma una descrizione che scavalca la colonna viene letta come DUE blocchi, e il secondo
// non ha intestazione: nell'ordine dell'OCR finisce spesso PRIMA del suo oggetto, in cima alla
// colonna successiva. Il "Talismano del Male Estremo" si fermava a «subisce 6d6», senza dire
// di che cosa, e senza le cariche né la fenditura infuocata che è il motivo per cui lo si usa.
//
// Un blocco orfano non dice a chi appartiene, quindi non lo si attacca a intuito: si prova con
// gli oggetti troncati della stessa pagina e si tiene l'abbinamento solo se il risultato si
// avvicina all'originale su 5etools — stessi dadi (si scrivono uguali in ogni lingua) e una
// lunghezza compatibile — e se la frase si salda: dopo una frase lasciata a metà deve venire una
// minuscola, dopo un punto una maiuscola.
//
// Uso: node --env-file=../../.env.local ricuci-oggetti-magici.mjs [--applica]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { pulisciTestoOcr } from "../../lib/ocr-cleanup.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sql = neon(process.env.DATABASE_URL);
const applica = process.argv.includes("--applica");
const B = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

const MIN_ITEM_PAGE = 8;
const CATEGORY_RE =
  /(Oggetto meraviglioso|Armatura|Arma|Anello|Bastone|Bacchetta|Verga|Munizioni|Scudo|Pozione|Pergamena)(\s*\([^)]{1,40}\))?/i;
const RARITY_RE = /(molto rar[oa]|rar[oa]|non comune|comune|leggendari[oa]|rarit[aà]\s*variabile|artefatto)/i;
const HEADER_RE = new RegExp(`${CATEGORY_RE.source}[,;]?\\s*${RARITY_RE.source}`, "i");

const soloLettere = (t) => t.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "");

function dadi(testo) {
  const conta = new Map();
  for (const m of testo.matchAll(/\b(\d+)d(\d+)\b/g)) conta.set(m[0], (conta.get(m[0]) ?? 0) + 1);
  return conta;
}
function scarto(a, b) {
  let n = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) n += Math.abs((a.get(k) ?? 0) - (b.get(k) ?? 0));
  return n;
}
/** Il testo inglese di una voce, senza le tabelle (che in italiano non sono nel paragrafo). */
function prosa(valore) {
  if (typeof valore === "string") return valore;
  if (Array.isArray(valore)) return valore.map(prosa).join(" ");
  if (valore && typeof valore === "object") {
    if (valore.type === "table") return "";
    return [valore.name, valore.entries, valore.items, valore.entry].map(prosa).join(" ");
  }
  return "";
}

const finita = (t) => /[.!?»”")]$/.test(t.trim());

// Un blocco che comincia come una tabella ("d100 Effetto...") o come un titolo in maiuscolo
// ("FACCE DEL CUBO DI FORZA", "ARMA +1, +2 O +3") non è la continuazione di una frase.
const sembraTabellaOTitolo = (t) => /^d\d+/.test(t) || /^[A-ZÀ-Ù]{3,}(?![a-zà-ù])/.test(t) || HEADER_RE.test(t.slice(0, 120));

// "tempo massimo di" + "l'incantesimo": in italiano la preposizione si fonde con l'articolo
// ("dell'incantesimo"), quindi una frase a metà che finisce in preposizione non può proseguire
// con un articolo. È il segno che il blocco appartiene a un altro oggetto.
const finisceInPreposizione = (t) => /\b(di|a|da|in|su|con|per)$/i.test(t.trim());
const iniziaConArticolo = (t) => /^(il|lo|la|l'|i|gli|le|un|uno|una|un')\b/i.test(t);

// La parola con cui il testo chiama l'oggetto, ricavata dal nome: serve a riconoscere un blocco
// che parla d'altro quando i dadi non bastano a decidere.
const SINONIMI = {
  spada: ["spada", "lama", "arma"], spadone: ["spada", "spadone", "lama", "arma"],
  arco: ["arco", "arma"], pugnale: ["pugnale", "lama", "coltello", "arma"], arma: ["arma"],
  tomo: ["tomo", "libro"], manuale: ["manuale", "libro", "tomo"],
  pozione: ["pozione"], elisir: ["elisir", "pozione"],
};
function nomiDellOggetto(nome) {
  const prima = nome.toLowerCase().split(/\s+/)[0];
  return SINONIMI[prima] ?? [prima];
}

/** I numeri di un testo italiano che ritrovano il loro corrispondente nell'originale. */
function numeriRiscontrati(pezzo, testoEn) {
  const inglesi = new Set([...testoEn.matchAll(/\d+/g)].map((m) => Number(m[0])));
  const italiani = [...pezzo.matchAll(/\d+(?:,\d)?/g)].map((m) => Number(m[0].replace(",", ".")));
  // metri -> piedi (0,3), chili -> libbre (0,5), e il numero così com'è
  const torna = (n) => inglesi.has(n) || inglesi.has(Math.round(n / 0.3)) || inglesi.has(Math.round(n * 2));
  return { quanti: italiani.length, riscontrati: italiani.filter(torna).length };
}

// ---- i blocchi delle pagine, divisi fra oggetti (con intestazione) e orfani ----
const pagine = JSON.parse(readFileSync(path.join(__dirname, "extracted", "oggetti_magici.json"), "utf-8")).pages
  .filter((p) => p.page >= MIN_ITEM_PAGE)
  .map((p) => {
    const blocchi = (p.text ?? "").split("\n").map((b) => b.trim()).filter(Boolean);
    return {
      pagina: p.page,
      blocchi: blocchi.map((testo, indice) => {
        const m = testo.match(HEADER_RE);
        const eOggetto = testo.length >= 40 && m && m.index > 0 && m.index <= 60;
        // Testatine, numeri di pagina, l'indice dei nomi in cima alla pagina: non sono testo.
        const rumore = testo.length < 40 || /^CAPITOLO\s+\d/i.test(testo) || (testo.length < 200 && !/[.:;,]/.test(testo));
        return { indice, testo, tipo: eOggetto ? "oggetto" : rumore ? "rumore" : "orfano" };
      }),
    };
  });

// ---- l'originale ----
const [items, variants] = await Promise.all([
  fetch(`${B}/items.json`).then((r) => r.json()),
  fetch(`${B}/magicvariants.json`).then((r) => r.json()),
]);
const inglese = new Map();
for (const x of [...(items.item ?? []), ...(items.itemGroup ?? [])]) inglese.set(`${x.name}|${x.source}`, x.entries);
for (const x of variants.magicvariant ?? []) inglese.set(`${x.name}|${x.inherits?.source ?? x.source}`, x.inherits?.entries ?? x.entries);

const righe = await sql`
  SELECT id, nome, descrizione, nome_inglese, fonte_inglese FROM compendio_ita_oggetto
  WHERE fonte = 'oggetti_magici' AND nome_inglese IS NOT NULL ORDER BY nome`;

let ricucite = 0;
const usati = new Set(); // "pagina:indice" dei blocchi orfani già assegnati
const daGuardare = [];

// Un orfano già ricucito in una passata precedente sta dentro la descrizione del suo oggetto: va
// considerato preso anche adesso. Senza questo controllo lo script non si poteva rilanciare — alla
// seconda esecuzione il blocco tornava "libero" e finiva attaccato a un altro oggetto della pagina
// (la luce del Spadone del Gelo in coda alla Spada delle Risposte).
const descrizioniEsistenti = righe.map((r) => soloLettere(r.descrizione ?? ""));
pagine.forEach((pagina, p) => {
  for (const b of pagina.blocchi) {
    if (b.tipo !== "orfano") continue;
    const impronta = soloLettere(pulisciTestoOcr(b.testo)).slice(0, 60);
    if (impronta.length >= 30 && descrizioniEsistenti.some((d) => d.includes(impronta))) usati.add(`${p}:${b.indice}`);
  }
});

// Prima i più troncati: se due oggetti si contendono lo stesso orfano, vince chi ne ha più bisogno.
const candidati = [];
for (const r of righe) {
  const en = inglese.get(`${r.nome_inglese}|${r.fonte_inglese}`);
  if (!en) continue;
  const testoEn = prosa(en);
  const descrizione = (r.descrizione ?? "").trim();
  const rapporto = descrizione.length / Math.max(1, testoEn.length);
  if (finita(descrizione) && rapporto >= 0.75) continue;
  candidati.push({ r, testoEn, descrizione, rapporto });
}
candidati.sort((a, b) => a.rapporto - b.rapporto);

for (const { r, testoEn, descrizione: iniziale } of candidati) {
  // dove sta l'oggetto: il blocco che contiene l'inizio della sua descrizione
  const impronta = soloLettere(iniziale).slice(0, 40);
  if (impronta.length < 25) continue;
  let posto = null;
  for (let p = 0; p < pagine.length && !posto; p++) {
    for (const b of pagine[p].blocchi) {
      if (b.tipo === "oggetto" && soloLettere(b.testo).includes(impronta)) {
        posto = { p, indice: b.indice };
        break;
      }
    }
  }
  if (!posto) {
    daGuardare.push(`${r.nome}: non ritrovo il suo blocco nelle pagine`);
    continue;
  }

  // gli orfani a tiro: quelli della sua pagina, e quelli in testa alla pagina dopo
  const vicini = pagine[posto.p].blocchi.filter((b) => b.tipo === "orfano").map((b) => ({ ...b, chiave: `${posto.p}:${b.indice}` }));
  const dopo = pagine[posto.p + 1];
  if (dopo) {
    for (const b of dopo.blocchi) {
      if (b.tipo === "oggetto") break;
      if (b.tipo === "orfano") vicini.push({ ...b, chiave: `${posto.p + 1}:${b.indice}` });
    }
  }

  const dadiEn = dadi(JSON.stringify(inglese.get(`${r.nome_inglese}|${r.fonte_inglese}`)));
  const attesa = testoEn.length * 1.15;
  const costo = (t) => scarto(dadi(t), dadiEn) * 400 + Math.abs(t.length - attesa);

  let descrizione = iniziale;
  const giunte = [];
  for (let giro = 0; giro < 3; giro++) {
    let migliore = null;
    for (const o of vicini) {
      if (usati.has(o.chiave)) continue;
      const pezzo = pulisciTestoOcr(o.testo);
      // la saldatura: frase a metà -> minuscola (o cifra); frase chiusa -> maiuscola
      const iniziaMinuscola = /^[a-zà-ù\d(]/.test(pezzo);
      if (finita(descrizione) === iniziaMinuscola) continue;
      if (sembraTabellaOTitolo(pezzo)) continue;
      if (finisceInPreposizione(descrizione) && iniziaConArticolo(pezzo)) continue;
      const unita = `${descrizione} ${pezzo}`;
      if (unita.length > Math.max(attesa * 1.6, attesa + 600)) continue;
      const guadagno = costo(descrizione) - costo(unita);
      if (guadagno <= 40) continue;
      // I dadi che tornano sono la prova migliore. Dove non spostano niente servono altri due
      // riscontri: i numeri del blocco devono ritrovarsi nell'originale, oppure il blocco deve
      // almeno parlare dello stesso oggetto senza numeri che lo smentiscano.
      const dadiMigliorati = scarto(dadi(unita), dadiEn) < scarto(dadi(descrizione), dadiEn);
      const numeri = numeriRiscontrati(pezzo, testoEn);
      const numeriTornano = numeri.quanti >= 2 && numeri.riscontrati >= numeri.quanti * 0.75;
      const numeriSmentiscono = numeri.quanti >= 2 && numeri.riscontrati < numeri.quanti * 0.5;
      const parlaDellOggetto = nomiDellOggetto(r.nome).some((n) => pezzo.toLowerCase().includes(n));
      if (!(dadiMigliorati || numeriTornano || (parlaDellOggetto && !numeriSmentiscono))) continue;
      if (!migliore || guadagno > migliore.guadagno) migliore = { o, unita, guadagno, pezzo };
    }
    if (!migliore) break;
    giunte.push(`…${descrizione.slice(-45)} ⟫ ${migliore.pezzo.slice(0, 60)}…`);
    descrizione = migliore.unita;
    usati.add(migliore.o.chiave);
  }

  if (descrizione === iniziale) {
    daGuardare.push(`${r.nome}: ${iniziale.length} car contro ${testoEn.length} dell'originale, nessun blocco orfano che si saldi`);
    continue;
  }
  ricucite++;
  const s0 = scarto(dadi(iniziale), dadiEn);
  const s1 = scarto(dadi(descrizione), dadiEn);
  console.log(`✓ ${r.nome}: ${iniziale.length} -> ${descrizione.length} car (originale ${testoEn.length}), dadi diversi ${s0} -> ${s1}`);
  for (const g of giunte) console.log(`     ${g}`);
  if (applica) await sql`UPDATE compendio_ita_oggetto SET descrizione = ${descrizione} WHERE id = ${r.id}`;
}

console.log(`\n${applica ? "" : "[PROVA] "}descrizioni ricucite: ${ricucite}`);
console.log(`ancora corte o a metà, da guardare sulla pagina: ${daGuardare.length}`);
for (const d of daGuardare) console.log(`  - ${d}`);
