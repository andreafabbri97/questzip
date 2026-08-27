// Estrae il capitolo "Equipaggiamento" del Manuale del Giocatore italiano: armi, armature,
// attrezzatura da avventuriero, strumenti, cavalcature, veicoli, merci.
//
// A differenza degli incantesimi qui il contenuto è quasi tutto TABELLE, e il valore per il
// Compendio non è tanto la descrizione (poche voci ce l'hanno) quanto il NOME stampato: senza
// questo, il tab "Oggetti comuni" e l'autocompletamento della scheda mostrano "Handaxe" invece di
// "Ascia". Le tabelle escono dal PDF una cella per riga, quindi l'ancora è il COSTO: dove una riga
// è un costo ("5 mo", "2 ma", "1 mr"), quella prima è un nome e quelle dopo sono le altre colonne.
//
// L'impaginazione a due colonne mescola le righe delle due metà della tabella, ma l'alternanza
// resta regolare (nome, costo, peso | nome, costo, peso): siccome ogni voce si legge comunque per
// conto suo, l'ordine fra le due colonne non conta.
//
// Uso: node parse-equipaggiamento.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ricomponiParoleSpezzate, titoloItaliano } from "../../lib/compendio-ocr.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PRIMA_PAGINA = 143;
const ULTIMA_PAGINA = 160;

// "5 mo", "2 ma", "1 mr", "1 5 mo" (spazio spurio dentro il numero), "—" per le voci senza prezzo
// Nelle tabelle le cifre 1 e 0 escono spesso come lettere ("l ma" per 1 ma, "l O mo" per 10 mo,
// "O,s Kg" per 0,5 kg): sono le stesse confusioni già note altrove. Accettandole si recuperano una
// trentina di voci — fra cui il Randello, la Spada Corta e la Lancia — che altrimenti sparivano.
// contenuto della classe di caratteri, senza parentesi: va inserito dentro [...] dai due pattern
// anche la S sta per 5 ("SO mo" sono 50 monete d'oro, "2S mo" venticinque): in queste tabelle
// una lettera dentro una cifra non è mai testo vero
const CIFRE = String.raw`\dlIOoSs`;
const COSTO_RE = new RegExp(String.raw`^([${CIFRE}][${CIFRE}\s.,]*)\s*(m\s*[oarep])$`, "i");
const PESO_RE = new RegExp(String.raw`^([${CIFRE}][${CIFRE}\s.,]*)\s*k\s*g$`, "i");
const DANNI_RE = /^[l1I]?\s?d\s?\d+\s+(taglienti|perforanti|contundenti)/i;

// "Nome della Voce. Testo che comincia qui." — è il modo in cui il manuale apre ogni descrizione.
// Il titoletto è breve, in stile titolo, e finisce con un punto seguito da spazio.
const TITOLETTO_RE = /^([A-ZÀ-Ù][A-Za-zà-ÿ'’\s,()\-]{2,44})\.\s+(?=[A-ZÀ-Ù"«])/;

// nei manuali italiani il punto separa le migliaia e la virgola i decimali: "1.500 mo" sono
// millecinquecento monete d'oro, non una e mezza, e "12,5 kg" sono dodici chili e mezzo
const numero = (s) =>
  s
    .replace(/\s+/g, "")
    .replace(/[lI]/g, "1")
    .replace(/[Oo]/g, "0")
    .replace(/[Ss]/g, "5")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");

function caricaRighe() {
  const raw = JSON.parse(readFileSync(path.join(SCRIPT_DIR, "extracted", "phb.json"), "utf-8"));
  const righe = [];
  for (const pagina of raw.pages) {
    if (pagina.page < PRIMA_PAGINA || pagina.page > ULTIMA_PAGINA) continue;
    for (const linea of (pagina.text ?? "").split("\n")) {
      const t = linea.trim();
      if (t) righe.push(t);
    }
  }
  return righe;
}

/** Righe di tabella: il costo fa da ancora, il nome è la riga prima. */
function leggiTabelle(righe) {
  const voci = new Map();
  for (let i = 1; i < righe.length; i++) {
    const costo = righe[i].match(COSTO_RE);
    if (!costo) continue;
    const nome = righe[i - 1];
    // un nome di voce non è una frase: niente punto finale, corto, e non è a sua volta un numero
    if (nome.length > 44 || /[.:;]$/.test(nome) || COSTO_RE.test(nome) || PESO_RE.test(nome)) continue;
    if (!/[A-Za-zà-ÿ]{3}/.test(nome)) continue;

    const dopo = righe.slice(i + 1, i + 4);
    const danni = dopo.find((r) => DANNI_RE.test(r));
    const peso = dopo.find((r) => PESO_RE.test(r));
    const chiave = nome.replace(/\s+/g, " ");
    if (voci.has(chiave)) continue;
    voci.set(chiave, {
      nome: chiave,
      costo: `${numero(costo[1])} ${costo[2].replace(/\s+/g, "").toLowerCase()}`,
      peso: peso ? `${numero(peso.match(PESO_RE)[1])} kg` : null,
      danni: danni ? danni.replace(/\s+/g, " ") : null,
    });
  }
  return voci;
}

/** Paragrafi "Nome. Testo": le poche voci che nel manuale hanno anche una descrizione. */
function leggiDescrizioni(righe) {
  const descrizioni = new Map();
  let titoloCorrente = null;
  let buffer = [];
  const chiudi = () => {
    if (titoloCorrente && buffer.length > 0) {
      const testo = buffer.join(" ").replace(/\s+/g, " ").trim();
      if (testo.length >= 40 && !descrizioni.has(titoloCorrente)) descrizioni.set(titoloCorrente, testo);
    }
    titoloCorrente = null;
    buffer = [];
  };

  for (const riga of righe) {
    const apertura = riga.match(TITOLETTO_RE);
    if (apertura) {
      chiudi();
      titoloCorrente = apertura[1].replace(/\s+/g, " ").trim();
      buffer = [riga.slice(apertura[0].length)];
      continue;
    }
    // una riga di tabella (costo, peso, danni) chiude il paragrafo: siamo usciti dalla prosa
    if (COSTO_RE.test(riga) || PESO_RE.test(riga) || DANNI_RE.test(riga)) {
      chiudi();
      continue;
    }
    if (titoloCorrente) buffer.push(riga);
  }
  chiudi();
  return descrizioni;
}

const righe = caricaRighe();
const tabelle = leggiTabelle(righe);
const descrizioni = leggiDescrizioni(righe);

const voci = [...tabelle.values()].map((v) => ({
  ...v,
  nome: ricomponiParoleSpezzate(titoloItaliano(v.nome)),
  descrizione: descrizioni.get(v.nome) ?? null,
}));

mkdirSync(path.join(SCRIPT_DIR, "parsed"), { recursive: true });
const outPath = path.join(SCRIPT_DIR, "parsed", "phb-equipaggiamento.json");
writeFileSync(outPath, JSON.stringify(voci, null, 2), "utf-8");

console.log(`${voci.length} voci di equipaggiamento -> ${outPath}`);
console.log(`di cui con descrizione: ${voci.filter((v) => v.descrizione).length}`);
console.log(`paragrafi descrittivi riconosciuti nel capitolo: ${descrizioni.size}`);
