import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  MAX_ISPIRAZIONE,
  ABILITIES,
  ABILITY_LABELS,
  RECUPERO_LABELS,
  abilityModifier,
  carryingCapacityKg,
  formatModifier,
  multiclassCasterLevel,
  pactMagicForLevel,
  passivePerception,
  primaryCastingAbility,
  proficiencyBonus,
  savingThrowModifier,
  skillModifier,
  spellAttackBonus,
  spellSaveDC,
  spellSlotsForCasterLevel,
  totalLevel,
  USI_ILLIMITATI,
  warlockLevel,
  xpForNextLevel,
  weaponAttackBonus,
  weaponDamageModifier,
  type Character,
} from "@/lib/dnd";
import { SKILLS } from "@/lib/dnd-tables";

/**
 * Esporta una scheda personaggio come PDF stampabile — il verso di
 * lib/pdf-character-import.ts, ma NON riempiendo il template cartaceo del gruppo: quel PDF è un
 * modulo di terze parti che non possiamo ridistribuire in un repo pubblico, e per riempirlo
 * andrebbe comunque fornito ogni volta dall'utente. Qui il PDF è generato da zero, prendendo
 * quel template come modello per struttura e ordine delle sezioni (3 pagine A4: combattimento,
 * equipaggiamento/personalità, incantesimi) ma includendo anche i dati che quel modulo non ha
 * caselle per rappresentare: infusioni, scelte di classe, condizioni attive, resistenze, e tutti
 * i valori derivati già calcolati (bonus d'attacco, CD incantesimi, slot per livello).
 *
 * Tutto è calcolato con le stesse funzioni che alimentano la scheda a schermo (lib/dnd.ts), mai
 * ricopiato: un PDF che mostrasse numeri diversi da quelli in app sarebbe peggio di nessun PDF.
 */

// Solo font standard (Helvetica): niente font da incorporare significa un PDF di ~10KB invece di
// diversi MB, ma copre solo WinAnsi/Latin-1 — pdf-lib LANCIA un'eccezione sui caratteri fuori da
// quel set. Il testo arriva da campi liberi scritti dagli utenti (note, nomi oggetti incollati dal
// Compendio con trattini tipografici, emoji), quindi va ripulito prima di disegnarlo o l'export
// fallirebbe per intero su un singolo carattere.
const REPLACEMENTS: Record<string, string> = {
  "—": "-", // em dash
  "–": "-", // en dash
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  " ": " ",
  "•": "-",
  "→": "->",
  "×": "x",
};

function safe(raw: string): string {
  let out = "";
  for (const char of raw.replace(/[—–‘’“”… •→×]/g, (c) => REPLACEMENTS[c] ?? c)) {
    const code = char.codePointAt(0) ?? 0;
    // Latin-1 stampabile + spazio: tutto il resto (emoji comprese) verrebbe rifiutato da Helvetica.
    if (code === 10 || (code >= 32 && code <= 126) || (code >= 160 && code <= 255)) out += char;
  }
  // Togliere un'emoji lascia lo spazio che la separava dalle parole vicine, quindi doppi spazi
  // visibili nel PDF (es. "Zorb  il Terribile") — collassati qui, mai toccando gli a capo.
  return out.replace(/[^\S\n]{2,}/g, " ");
}

const INK = rgb(0.1, 0.09, 0.08);
const MUTED = rgb(0.42, 0.4, 0.38);
const RULE = rgb(0.75, 0.72, 0.68);
const ACCENT = rgb(0.55, 0.36, 0.06);
const FILL = rgb(0.955, 0.945, 0.93);

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 32;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface Ctx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number } = {},
) {
  const size = opts.size ?? 8.5;
  const font = opts.bold ? ctx.bold : ctx.font;
  let str = safe(value);
  if (opts.maxWidth) {
    while (str.length > 1 && font.widthOfTextAtSize(str, size) > opts.maxWidth) {
      str = str.slice(0, -1);
    }
    if (str !== safe(value)) str = str.slice(0, -1) + "…".replace("…", "...");
  }
  ctx.page.drawText(str, { x, y, size, font, color: opts.color ?? INK });
}

function centered(ctx: Ctx, value: string, cx: number, y: number, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
  const size = opts.size ?? 8.5;
  const font = opts.bold ? ctx.bold : ctx.font;
  const str = safe(value);
  text(ctx, str, cx - font.widthOfTextAtSize(str, size) / 2, y, opts);
}

function box(ctx: Ctx, x: number, y: number, w: number, h: number, filled = false) {
  ctx.page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderColor: RULE,
    borderWidth: 0.7,
    color: filled ? FILL : undefined,
  });
}

/** Intestazione di sezione: barra piena con titolo, e restituisce la y del contenuto sotto. */
function sectionHeader(ctx: Ctx, titolo: string, x: number, y: number, w: number): number {
  ctx.page.drawRectangle({ x, y: y - 13, width: w, height: 13, color: FILL });
  ctx.page.drawLine({ start: { x, y: y - 13 }, end: { x: x + w, y: y - 13 }, thickness: 0.7, color: RULE });
  text(ctx, titolo.toUpperCase(), x + 4, y - 9.5, { size: 7.5, bold: true, color: ACCENT });
  // -21 e non -18: il testo sale DALLA baseline, quindi una baseline troppo vicina al bordo
  // inferiore della barra (y-13) faceva sovrapporre le maiuscole della prima riga alla barra
  // stessa — visibile su "ARMI E ATTACCHI"/"PRIVILEGI" nel primo PDF di prova.
  return y - 21;
}

/** Spezza un testo lungo su più righe entro maxWidth, restituendo le righe pronte da disegnare. */
function wrap(font: PDFFont, value: string, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of safe(value).split("\n")) {
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    lines.push(current);
  }
  return lines;
}

/** Pallino pieno/vuoto usato per "competente"/"esperto" nelle liste di tiri salvezza e abilità. */
function dot(ctx: Ctx, x: number, y: number, mode: "vuoto" | "pieno" | "doppio") {
  ctx.page.drawCircle({
    x,
    y,
    size: 2.6,
    borderColor: mode === "vuoto" ? RULE : ACCENT,
    borderWidth: 0.8,
    color: mode === "vuoto" ? undefined : ACCENT,
  });
  if (mode === "doppio") {
    ctx.page.drawCircle({ x, y, size: 4.4, borderColor: ACCENT, borderWidth: 0.7 });
  }
}

/**
 * Usi di un privilegio limitato: un pallino per uso, pieni quelli gia' spesi.
 *
 * Prima c'era solo il numero ("5/8"), che su una scheda STAMPATA non serve a niente: al tavolo
 * quel valore cambia ad ogni scontro e va segnato a penna man mano — e' il primo appunto arrivato
 * dal gruppo guardando l'esportazione. Sopra una certa quantita' i pallini non entrerebbero nella
 * colonna (i punti stregoneria di un incantatore alto arrivano a 17 o 20): li' si torna al
 * numero, con una casella vuota accanto per scriverci quanti ne restano.
 */
const MAX_PALLINI_USI = 12;
function disegnaUsi(
  ctx: Ctx,
  privilegio: { usiMax: number; usiUsati: number },
  x: number,
  y: number,
) {
  const max = Math.max(0, privilegio.usiMax);
  if (max === 0) return;
  // Sempre attivo: non c'e' niente da barrare, e una fila di caselle direbbe il contrario.
  if (max >= USI_ILLIMITATI) {
    text(ctx, "sempre attivo", x, y, { size: 7, color: MUTED });
    return;
  }
  if (max > MAX_PALLINI_USI) {
    box(ctx, x, y - 1.5, 16, 9);
    text(ctx, `/ ${max}`, x + 19, y, { size: 7, color: MUTED });
    return;
  }
  for (let i = 0; i < max; i++) {
    dot(ctx, x + 4 + i * 8, y + 3, i < privilegio.usiUsati ? "pieno" : "vuoto");
  }
}

/**
 * Recupero come tre caselle marcate RB / RL / AL (riposo breve, riposo lungo, alba), con piena
 * quella del privilegio: e' la resa della scheda cartacea del gruppo, e a parole ("riposo lungo")
 * rubava spazio al nome del privilegio, che e' la cosa da leggere.
 */
function caselleRecupero(ctx: Ctx, recupero: Character["privilegiLimitati"][number]["recupero"], x: number, y: number) {
  const voci = [
    ["RB", "riposoBreve"],
    ["RL", "riposoLungo"],
    ["AL", "alba"],
  ] as const;
  voci.forEach(([sigla, valore], i) => {
    const attivo = recupero === valore;
    dot(ctx, x + 3 + i * 17, y + 3, attivo ? "pieno" : "vuoto");
    text(ctx, sigla, x + 8 + i * 17, y, { size: 5.5, bold: attivo, color: attivo ? INK : MUTED });
  });
}

/** Etichetta a sinistra e una fila di pallini a destra, pieni fino al valore raggiunto. */
function rigaDiPallini(
  ctx: Ctx,
  etichetta: string,
  valore: number,
  massimo: number,
  x: number,
  y: number,
  larghezza: number,
) {
  text(ctx, etichetta, x, y, { size: 8 });
  const inizio = x + larghezza - 18 - massimo * 9;
  for (let i = 0; i < massimo; i++) {
    dot(ctx, inizio + i * 9, y + 3, i < valore ? "pieno" : "vuoto");
  }
}

/** Avvisa quando un elenco è stato tagliato per ragioni di spazio. Una scheda STAMPATA che omette
 * in silenzio la settima arma è peggio di una che lo dichiara: chi la usa al tavolo non ha modo di
 * accorgersene confrontandola con lo schermo. */
function notaTroncamento(ctx: Ctx, totale: number, mostrati: number, x: number, y: number): number {
  if (totale <= mostrati) return y;
  text(ctx, `… e altri ${totale - mostrati} (non stampati per spazio: vedi l'app)`, x, y, {
    size: 6.5,
    color: MUTED,
  });
  return y - 10;
}

/** Righe vuote da compilare a penna: la scheda stampata deve restare utilizzabile al tavolo. */
function blankLines(ctx: Ctx, x: number, y: number, w: number, count: number, step = 12): number {
  let cursor = y;
  for (let i = 0; i < count; i++) {
    ctx.page.drawLine({
      start: { x, y: cursor },
      end: { x: x + w, y: cursor },
      thickness: 0.5,
      color: RULE,
    });
    cursor -= step;
  }
  return cursor;
}

function pageHeader(ctx: Ctx, character: Character, sottotitolo: string) {
  const livello = totalLevel(character.classi);
  const classi = character.classi.map((c) => `${c.nome} ${c.livello}`).join(" / ");
  text(ctx, character.nome || "Senza nome", MARGIN, PAGE_H - MARGIN - 12, { size: 17, bold: true });
  const riga = [character.razza, classi, `Livello ${livello}`, character.allineamento, character.background]
    .filter(Boolean)
    .join("  ·  ");
  text(ctx, riga, MARGIN, PAGE_H - MARGIN - 25, { size: 8.5, color: MUTED, maxWidth: CONTENT_W - 90 });
  text(ctx, sottotitolo.toUpperCase(), PAGE_W - MARGIN - ctx.bold.widthOfTextAtSize(safe(sottotitolo.toUpperCase()), 8), PAGE_H - MARGIN - 12, {
    size: 8,
    bold: true,
    color: ACCENT,
  });
  ctx.page.drawLine({
    start: { x: MARGIN, y: PAGE_H - MARGIN - 32 },
    end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN - 32 },
    thickness: 1,
    color: ACCENT,
  });
}

function pageFooter(ctx: Ctx, pagina: number, totale: number) {
  centered(ctx, `QuestZip  ·  pagina ${pagina} di ${totale}`, PAGE_W / 2, MARGIN - 12, {
    size: 7,
    color: MUTED,
  });
}

// --- Pagina 1: quello che serve davvero durante il combattimento -----------------------------

function drawCombatPage(ctx: Ctx, character: Character, totPagine: number) {
  pageHeader(ctx, character, "Combattimento");
  const livello = totalLevel(character.classi);
  const comp = proficiencyBonus(livello);
  const top = PAGE_H - MARGIN - 44;

  // Colonna sinistra: caratteristiche. Strette (52 invece di 74) perche' sulla scheda del gruppo
  // stanno incolonnate accanto a tiri salvezza e abilita', non da sole: cosi' le tre colonne
  // restano larghe uguali e la terza ha spazio per i privilegi, che sono testo lungo.
  const colW = 52;
  let y = top;
  for (const ability of ABILITIES) {
    const score = character.caratteristiche[ability];
    box(ctx, MARGIN, y - 42, colW, 42, true);
    centered(ctx, ABILITY_LABELS[ability].toUpperCase(), MARGIN + colW / 2, y - 11, { size: 6.5, bold: true, color: MUTED });
    centered(ctx, formatModifier(abilityModifier(score)), MARGIN + colW / 2, y - 27, { size: 15, bold: true });
    centered(ctx, String(score), MARGIN + colW / 2, y - 38, { size: 7.5, color: MUTED });
    y -= 47;
  }

  // Colonna centrale: competenza, tiri salvezza, abilità
  const midX = MARGIN + colW + 12;
  const midW = 118;
  let my = top;

  box(ctx, midX, my - 22, midW, 22, true);
  text(ctx, "BONUS DI COMPETENZA", midX + 6, my - 14, { size: 7, bold: true, color: MUTED });
  text(ctx, formatModifier(comp), midX + midW - 26, my - 15, { size: 11, bold: true });
  my -= 30;

  my = sectionHeader(ctx, "Tiri salvezza", midX, my, midW);
  for (const ability of ABILITIES) {
    const competente = character.trsCompetenti.includes(ability);
    const bonus = savingThrowModifier(character.caratteristiche[ability], competente, livello) + (character.trsBonus[ability] ?? 0);
    dot(ctx, midX + 6, my + 3, competente ? "pieno" : "vuoto");
    text(ctx, ABILITY_LABELS[ability], midX + 16, my, { size: 8 });
    text(ctx, formatModifier(bonus), midX + midW - 22, my, { size: 8, bold: true });
    my -= 11.5;
  }

  my -= 6;
  my = sectionHeader(ctx, "Abilità", midX, my, midW);
  for (const skill of SKILLS) {
    const esperto = character.abilitaEsperte.includes(skill.nome);
    const competente = esperto || character.abilitaCompetenti.includes(skill.nome);
    const bonus =
      skillModifier(character.caratteristiche[skill.abilita], competente, esperto, livello) +
      (character.abilitaBonus[skill.nome] ?? 0);
    dot(ctx, midX + 6, my + 3, esperto ? "doppio" : competente ? "pieno" : "vuoto");
    text(ctx, skill.nome, midX + 16, my, { size: 8, maxWidth: midW - 60 });
    text(ctx, ABILITY_LABELS[skill.abilita].slice(0, 3).toUpperCase(), midX + midW - 48, my, { size: 6.5, color: MUTED });
    text(ctx, formatModifier(bonus), midX + midW - 22, my, { size: 8, bold: true });
    my -= 11.5;
  }

  // Sotto le abilita', quello che sulla scheda del gruppo occupa il resto della prima colonna:
  // percezione passiva, competenze, linguaggi e talenti. Senza, meta' colonna restava bianca
  // mentre le altre due arrivavano in fondo alla pagina.
  const col1X = MARGIN;
  const col1W = midX + midW - MARGIN;
  const percezionePassivaTotale =
    passivePerception(
      character.caratteristiche.saggezza,
      character.abilitaCompetenti.includes("Percezione") || character.abilitaEsperte.includes("Percezione"),
      character.abilitaEsperte.includes("Percezione"),
      livello,
    ) +
    character.percezionePassivaBonus +
    (character.abilitaBonus["Percezione"] ?? 0);
  my -= 8;
  box(ctx, col1X, my - 20, col1W, 20, true);
  text(ctx, "SAGGEZZA (PERCEZIONE) PASSIVA", col1X + 6, my - 8, { size: 6.5, bold: true, color: MUTED });
  text(ctx, String(percezionePassivaTotale), col1X + col1W - 22, my - 14, { size: 11, bold: true });
  my -= 28;

  my = sectionHeader(ctx, "Competenze", col1X, my, col1W);
  for (const [etichetta, voci] of [
    ["Armature", ["Leggere", "Medie", "Pesanti", "Scudi"]],
    ["Armi", ["Semplici", "Da guerra"]],
  ] as const) {
    text(ctx, etichetta, col1X + 4, my, { size: 6.5, color: MUTED });
    let cx = col1X + 46;
    for (const voce of voci) {
      box(ctx, cx, my - 1, 7, 7);
      text(ctx, voce, cx + 9, my, { size: 6.5 });
      cx += 12 + ctx.font.widthOfTextAtSize(voce, 6.5);
    }
    my -= 12;
  }
  text(ctx, "Strumenti", col1X + 4, my, { size: 6.5, color: MUTED });
  my = blankLines(ctx, col1X + 46, my - 2, col1W - 52, 2, 12) - 6;

  my = sectionHeader(ctx, "Linguaggi", col1X, my, col1W);
  if (character.linguaggi.length > 0) {
    for (const riga of wrap(ctx.font, character.linguaggi.join(", "), 7.5, col1W - 10)) {
      text(ctx, riga, col1X + 4, my, { size: 7.5 });
      my -= 10;
    }
    my -= 4;
  } else {
    my = blankLines(ctx, col1X + 4, my - 2, col1W - 8, 2, 11) - 4;
  }

  my = sectionHeader(ctx, "Talenti", col1X, my, col1W);
  const talentiMostrati = character.talenti.slice(0, 6);
  for (const talento of talentiMostrati) {
    text(ctx, talento.nome, col1X + 4, my, { size: 7.5, maxWidth: col1W - 10 });
    my -= 11;
  }
  my = notaTroncamento(ctx, character.talenti.length, talentiMostrati.length, col1X + 4, my);
  // Le righe libere arrivano fino al piede della pagina: e' la colonna che sulla scheda del
  // gruppo si riempie a mano salendo di livello.
  blankLines(ctx, col1X + 4, my - 2, col1W - 8, Math.max(2, Math.floor((my - MARGIN - 10) / 12)), 12);

  // Colonna destra: difesa, punti ferita, dadi vita, tiri morte
  const rightX = midX + midW + 12;
  // Due colonne, non una larga: sulla scheda del gruppo la seconda tiene il combattimento e la
  // terza i privilegi, che sono testo lungo e hanno bisogno di tutta l'altezza della pagina.
  const rightW = 165;
  const terzaX = rightX + rightW + 12;
  const terzaW = PAGE_W - MARGIN - terzaX;
  let ry = top;
  let ty = top;

  // Gli stessi riquadri della scheda del gruppo, nello stesso ordine. Visione e valori degli
  // incantesimi stavano solo nelle pagine seguenti: al tavolo servono qui, dove si combatte.
  const castingAbilityP1 = primaryCastingAbility(character.classi);
  const stats: [string, string][] = [
    ["Classe Armatura", String(character.classeArmatura)],
    ["Iniziativa", formatModifier(abilityModifier(character.caratteristiche.destrezza) + character.iniziativaBonus)],
    ["Velocità", `${character.velocita} m`],
    [
      "Visione",
      character.scurovisione && character.visioneRadius > 0 ? `${character.visioneRadius} m` : "-",
    ],
    // Il valore e' quello calcolato sopra per il riquadro della prima colonna: due calcoli
    // separati avevano gia' prodotto due numeri diversi nella stessa pagina.
    ["Percezione passiva", String(percezionePassivaTotale)],
    ...(castingAbilityP1
      ? ([
          [
            "CD incantesimi",
            String(
              spellSaveDC(livello, character.caratteristiche[castingAbilityP1]) +
                character.cdIncantesimiBonus,
            ),
          ],
          [
            "Attacco incantesimi",
            formatModifier(
              spellAttackBonus(livello, character.caratteristiche[castingAbilityP1]) +
                character.attaccoIncantesimiBonus,
            ),
          ],
        ] as [string, string][])
      : []),
  ];
  const statW = (rightW - 6) / 2;
  stats.forEach(([label, value], i) => {
    const bx = rightX + (i % 2) * (statW + 6);
    const by = ry - Math.floor(i / 2) * 40;
    box(ctx, bx, by - 36, statW, 36, true);
    centered(ctx, label.toUpperCase(), bx + statW / 2, by - 11, { size: 6, bold: true, color: MUTED });
    centered(ctx, value, bx + statW / 2, by - 28, { size: 14, bold: true });
  });
  // Quante righe di riquadri sono state disegnate davvero: erano quattro fisse, e aggiungendone
  // altri (visione, valori degli incantesimi) il blocco dei punti ferita ci finiva sopra.
  ry -= Math.ceil(stats.length / 2) * 40 + 6;

  ry = sectionHeader(ctx, "Punti ferita", rightX, ry, rightW);
  // Il MASSIMO si stampa, gli ATTUALI no: cambiano ad ogni colpo, e un numero stampato sarebbe
  // gia' sbagliato al primo scontro. Sulla scheda del gruppo quel campo e' lasciato vuoto apposta
  // e si scrive a matita — qui si fa lo stesso, con una casella abbastanza grande per cancellare
  // e riscrivere. Il valore vero resta nell'app, che e' dove si aggiorna davvero.
  box(ctx, rightX, ry - 34, rightW, 38);
  text(ctx, "MASSIMI", rightX + 6, ry - 10, { size: 6, bold: true, color: MUTED });
  text(ctx, String(character.hpMax), rightX + 6, ry - 26, { size: 14, bold: true });
  text(ctx, "ATTUALI", rightX + 62, ry - 10, { size: 6, bold: true, color: MUTED });
  box(ctx, rightX + 60, ry - 30, 44, 20);
  text(ctx, "TEMP.", rightX + 116, ry - 10, { size: 6, bold: true, color: MUTED });
  box(ctx, rightX + 112, ry - 30, 44, 20);
  ry -= 44;

  const dadiVitaTot = livello;
  box(ctx, rightX, ry - 26, rightW, 26, true);
  text(ctx, "DADI VITA", rightX + 6, ry - 10, { size: 6.5, bold: true, color: MUTED });
  disegnaUsi(ctx, { usiMax: dadiVitaTot, usiUsati: character.dadiVitaUsati }, rightX + 6, ry - 22);
  ry -= 34;

  ry = sectionHeader(ctx, "Tiri salvezza contro la morte", rightX, ry, rightW);
  text(ctx, "Successi", rightX + 6, ry, { size: 7, color: MUTED });
  [0, 1, 2].forEach((i) => dot(ctx, rightX + 58 + i * 12, ry + 3, i < character.tiriMorteSuccessi ? "pieno" : "vuoto"));
  ry -= 13;
  text(ctx, "Fallimenti", rightX + 6, ry, { size: 7, color: MUTED });
  [0, 1, 2].forEach((i) => dot(ctx, rightX + 58 + i * 12, ry + 3, i < character.tiriMorteFallimenti ? "pieno" : "vuoto"));
  ry -= 22;

  // Stato: ispirazione, affaticamento, follia, condizioni — la scheda cartacea di riferimento non
  // ha un posto per le condizioni attive, ma al tavolo sono proprio la cosa che si dimentica.
  ry = sectionHeader(ctx, "Stato", rightX, ry, rightW);
  // Caselle e non numeri: ispirazione, affaticamento e follia cambiano di continuo durante una
  // sessione, e su carta si barrano — e' la stessa richiesta arrivata per i privilegi limitati.
  // Sulla scheda del gruppo l'ispirazione e' proprio una griglia di caselle.
  rigaDiPallini(ctx, "Ispirazione", character.ispirazione, MAX_ISPIRAZIONE, rightX + 6, ry, rightW);
  ry -= 12;
  rigaDiPallini(ctx, "Affaticamento", character.affaticamento, 6, rightX + 6, ry, rightW);
  ry -= 12;
  if (character.livelloFollia > 0) {
    rigaDiPallini(ctx, "Follia", character.livelloFollia, 6, rightX + 6, ry, rightW);
    ry -= 12;
  }
  if (character.condizioniAttive.length > 0) {
    for (const line of wrap(ctx.font, `Condizioni: ${character.condizioniAttive.join(", ")}`, 8, rightW - 12)) {
      text(ctx, line, rightX + 6, ry, { size: 8 });
      ry -= 10;
    }
  }

  // Armi nella colonna del combattimento, come sulla scheda del gruppo: prima erano una fascia
  // larga in fondo alla pagina, lontana dai punti ferita e dalla classe armatura che si guardano
  // nello stesso momento.
  let by = ry - 10;
  const halfW = rightW;
  by = sectionHeader(ctx, "Armi e attacchi", rightX, by, rightW);
  text(ctx, "ARMA", rightX + 4, by, { size: 6, bold: true, color: MUTED });
  text(ctx, "ATT.", rightX + rightW - 74, by, { size: 6, bold: true, color: MUTED });
  text(ctx, "DANNO", rightX + rightW - 52, by, { size: 6, bold: true, color: MUTED });
  by -= 11;
  const armiMostrate = character.armi.slice(0, 6);
  for (const arma of armiMostrate) {
    const atk = weaponAttackBonus(arma.caratteristica, character.caratteristiche, arma.competente, livello, arma.bonusExtra);
    const dmgMod = weaponDamageModifier(arma.caratteristica, character.caratteristiche, arma.bonusExtra);
    text(ctx, arma.nome, rightX + 4, by, { size: 7.5, maxWidth: rightW - 80 });
    text(ctx, formatModifier(atk), rightX + rightW - 74, by, { size: 7.5, bold: true });
    text(ctx, `${arma.dadoDanno}${dmgMod !== 0 ? formatModifier(dmgMod) : ""} ${arma.tipoDanno}`.trim(), rightX + rightW - 52, by, {
      size: 7.5,
      maxWidth: 52,
    });
    by -= 11;
  }
  by = notaTroncamento(ctx, character.armi.length, armiMostrate.length, rightX + 4, by);
  if (character.armi.length === 0) by = blankLines(ctx, rightX + 4, by - 2, rightW - 8, 3);

  // TERZA COLONNA — privilegi a usi limitati, come sulla scheda del gruppo: e' la sezione che il
  // gruppo consulta e barra di continuo, e sta in alto a destra, non in fondo alla pagina.
  ty = sectionHeader(ctx, "Privilegi e tratti limitati", terzaX, ty, terzaW);
  let fy = ty;
  text(ctx, "RECUPERO", terzaX + terzaW - 108, fy + 1, { size: 5.5, color: MUTED });
  text(ctx, "USI", terzaX + terzaW - 58, fy + 1, { size: 5.5, color: MUTED });
  fy -= 9;
  const privilegiMostrati = character.privilegiLimitati.slice(0, 10);
  for (const p of privilegiMostrati) {
    text(ctx, p.nome, terzaX + 4, fy, { size: 7.5, maxWidth: terzaW - 116 });
    caselleRecupero(ctx, p.recupero, terzaX + terzaW - 108, fy);
    disegnaUsi(ctx, p, terzaX + terzaW - 58, fy);
    fy -= 12;
  }
  fy = notaTroncamento(ctx, character.privilegiLimitati.length, privilegiMostrati.length, terzaX + 4, fy);
  // Righe libere: salendo di livello i privilegi si aggiungono a penna.
  fy = blankLines(ctx, terzaX + 4, fy - 2, terzaW - 8, Math.max(2, 10 - privilegiMostrati.length), 12);
  ty = fy - 8;

  // Sotto, quello che sulla scheda del gruppo occupa tutta la terza colonna: i privilegi che si
  // usano in combattimento. Le scelte di classe (suppliche occulte, metamagia, manovre) le
  // conosciamo; i privilegi di classe e i tratti razziali no, perche' vengono dal Compendio e
  // ognuno si annota il riassunto che gli serve — quindi righe libere fino in fondo, che e'
  // esattamente cio' che il gruppo riempie a mano.
  if (character.scelteClasse.length > 0) {
    ty = sectionHeader(ctx, "Scelte di classe", terzaX, ty, terzaW);
    const scelteMostrate = character.scelteClasse.slice(0, 8);
    for (const scelta of scelteMostrate) {
      text(ctx, scelta.nome, terzaX + 4, ty, { size: 7.5, maxWidth: terzaW - 10 });
      ty -= 11;
    }
    ty = notaTroncamento(ctx, character.scelteClasse.length, scelteMostrate.length, terzaX + 4, ty);
    ty -= 6;
  }

  ty = sectionHeader(ctx, "Privilegi di classe e tratti", terzaX, ty, terzaW);
  blankLines(ctx, terzaX + 4, ty - 2, terzaW - 8, Math.max(3, Math.floor((ty - MARGIN - 10) / 12)), 12);

  // Colonna destra: le tre cose che sulla scheda del gruppo stanno accanto alle armi e che qui
  // mancavano del tutto. Gli appunti di sessione, che quella scheda non ha, si sono presi finora
  // mezza pagina: sono rimasti nella pagina 2 insieme alle note.
  const destraX = rightX;
  let dy = sectionHeader(ctx, "Armatura", destraX, by - 8, rightW);
  // Il personaggio in app ha solo la CA finale: il resto (nome dell'armatura, Destrezza massima,
  // requisito di Forza, svantaggio a Furtività) sta sul manuale dell'armatura e su carta si
  // scrive a mano, come sulla scheda cartacea.
  text(ctx, "Armatura", destraX + 4, dy, { size: 6.5, color: MUTED });
  ctx.page.drawLine({
    start: { x: destraX + 46, y: dy - 2 },
    end: { x: destraX + halfW - 60, y: dy - 2 },
    thickness: 0.6,
    color: RULE,
  });
  text(ctx, "CA", destraX + halfW - 52, dy, { size: 6.5, color: MUTED });
  box(ctx, destraX + halfW - 36, dy - 4, 30, 13);
  centered(ctx, String(character.classeArmatura), destraX + halfW - 21, dy, { size: 9, bold: true });
  dy -= 18;
  for (const [etichetta, larghezza] of [
    ["Des max", 40],
    ["For richiesta", 40],
    ["Scudo", 40],
  ] as const) {
    text(ctx, etichetta, destraX + 4, dy, { size: 6.5, color: MUTED });
    box(ctx, destraX + 66, dy - 3, larghezza, 11);
    dy -= 15;
  }
  dot(ctx, destraX + 8, dy + 3, character.abilitaCompetenti.includes("Furtività") ? "vuoto" : "vuoto");
  text(ctx, "Svantaggio a Furtività", destraX + 16, dy, { size: 7 });
  dy -= 16;

  dy = sectionHeader(ctx, "Munizioni", destraX, dy, halfW);
  text(ctx, "TIPO", destraX + 4, dy + 1, { size: 5.5, color: MUTED });
  text(ctx, "Q.TÀ", destraX + halfW - 44, dy + 1, { size: 5.5, color: MUTED });
  dy -= 9;
  for (let i = 0; i < 3; i++) {
    ctx.page.drawLine({
      start: { x: destraX + 4, y: dy - 2 },
      end: { x: destraX + halfW - 50, y: dy - 2 },
      thickness: 0.6,
      color: RULE,
    });
    box(ctx, destraX + halfW - 46, dy - 4, 40, 12);
    dy -= 16;
  }
  dy -= 4;

  // Consumabili: pozioni, pergamene, cariche. In app stanno nell'inventario con la quantità, qui
  // hanno una casella per segnare quanti ne restano dopo averne usato uno.
  dy = sectionHeader(ctx, "Consumabili", destraX, dy, halfW);
  text(ctx, "RIMASTI", destraX + halfW - 52, dy + 1, { size: 5.5, color: MUTED });
  dy -= 9;
  const consumabili = character.inventario.filter((i) => i.quantita > 1).slice(0, 6);
  for (const voce of consumabili) {
    text(ctx, voce.nome, destraX + 4, dy, { size: 8, maxWidth: halfW - 62 });
    box(ctx, destraX + halfW - 46, dy - 3, 22, 11);
    text(ctx, `/ ${voce.quantita}`, destraX + halfW - 20, dy, { size: 7, color: MUTED });
    dy -= 15;
  }
  // Le righe libere si fermano prima del piè di pagina invece di essere sei fisse: con molte armi
  // la colonna arrivava a sfiorare il numero di pagina.
  const spazioRighe = Math.max(0, Math.floor((dy - MARGIN - 14) / 16));
  for (let i = consumabili.length; i < Math.min(6, consumabili.length + spazioRighe); i++) {
    ctx.page.drawLine({
      start: { x: destraX + 4, y: dy - 2 },
      end: { x: destraX + halfW - 50, y: dy - 2 },
      thickness: 0.6,
      color: RULE,
    });
    box(ctx, destraX + halfW - 46, dy - 4, 22, 12);
    dy -= 16;
  }

  pageFooter(ctx, 1, totPagine);
}

// --- Pagina 2: equipaggiamento, tratti, personalità ------------------------------------------

function drawGearPage(ctx: Ctx, character: Character, totPagine: number) {
  pageHeader(ctx, character, "Equipaggiamento e personalità");
  const halfW = (CONTENT_W - 14) / 2;
  const rightX = MARGIN + halfW + 14;
  let ly = PAGE_H - MARGIN - 44;
  let ry = ly;

  // Sinistra: inventario, monete, oggetti magici
  ly = sectionHeader(ctx, "Inventario", MARGIN, ly, halfW);
  const pesoTotale = character.inventario.reduce((sum, i) => sum + i.peso * i.quantita, 0);
  const mostrati = character.inventario.slice(0, 26);
  for (const item of mostrati) {
    const qty = item.quantita > 1 ? ` x${item.quantita}` : "";
    text(ctx, `${item.nome}${qty}`, MARGIN + 4, ly, { size: 8, maxWidth: halfW - 52 });
    if (item.peso > 0) {
      text(ctx, `${(item.peso * item.quantita).toFixed(1)} kg`, MARGIN + halfW - 44, ly, { size: 7, color: MUTED });
    }
    ly -= 10.5;
  }
  // Sempre qualche riga libera dopo l'ultimo oggetto: su una scheda stampata il bottino si
  // aggiunge a penna durante la sessione, un elenco che finisce di netto non lascia spazio.
  ly = notaTroncamento(ctx, character.inventario.length, mostrati.length, MARGIN + 4, ly);
  ly = blankLines(ctx, MARGIN + 4, ly - 2, halfW - 8, Math.max(4, 10 - mostrati.length), 11);
  ly -= 4;
  const capacita = character.pesoMassimo > 0 ? character.pesoMassimo : carryingCapacityKg(character.caratteristiche.forza);
  text(ctx, `Peso trasportato: ${pesoTotale.toFixed(1)} / ${capacita.toFixed(1)} kg`, MARGIN + 4, ly, {
    size: 7.5,
    color: pesoTotale > capacita ? rgb(0.7, 0.15, 0.1) : MUTED,
  });
  ly -= 16;

  ly = sectionHeader(ctx, "Monete", MARGIN, ly, halfW);
  // Le monete si spendono in sessione: il valore di partenza si stampa piccolo sotto la casella,
  // e quello aggiornato si scrive a matita nella casella.
  const monete: [string, number][] = [
    ["Oro", character.monete.oro],
    ["Argento", character.monete.argento],
    ["Rame", character.monete.rame],
  ];
  monete.forEach(([etichetta, valore], i) => {
    const mx = MARGIN + 4 + i * ((halfW - 8) / 3);
    text(ctx, etichetta, mx, ly, { size: 6.5, color: MUTED });
    box(ctx, mx, ly - 16, 42, 13);
    text(ctx, `partenza ${valore}`, mx, ly - 24, { size: 5.5, color: MUTED });
  });
  ly -= 34;

  ly = sectionHeader(ctx, "Oggetti magici", MARGIN, ly, halfW);
  const magiciMostrati = character.oggettiMagici.slice(0, 12);
  for (const item of magiciMostrati) {
    text(ctx, item.nome, MARGIN + 12, ly, { size: 8, maxWidth: halfW - 20 });
    dot(ctx, MARGIN + 6, ly + 3, item.armonizzato ? "pieno" : "vuoto");
    ly -= 11;
  }
  ly = notaTroncamento(ctx, character.oggettiMagici.length, magiciMostrati.length, MARGIN + 4, ly);
  if (character.oggettiMagici.length === 0) ly = blankLines(ctx, MARGIN + 4, ly - 2, halfW - 8, 3);
  ly -= 4;
  text(ctx, "(pallino pieno = armonizzato)", MARGIN + 4, ly, { size: 6.5, color: MUTED });

  // Destra: talenti/infusioni/scelte, lingue e resistenze, personalità, aspetto
  const listBlock = (titolo: string, voci: string[], y: number, minRighe = 2): number => {
    let cursor = sectionHeader(ctx, titolo, rightX, y, halfW);
    if (voci.length === 0) return blankLines(ctx, rightX + 4, cursor - 2, halfW - 8, minRighe) - 4;
    for (const line of wrap(ctx.font, voci.join(", "), 8, halfW - 10)) {
      text(ctx, line, rightX + 4, cursor, { size: 8 });
      cursor -= 10.5;
    }
    return cursor - 6;
  };

  if (character.infusioniConosciute.length > 0) {
    ry = listBlock("Infusioni conosciute", character.infusioniConosciute.map((i) => i.nome), ry);
  }
  if (character.scelteClasse.length > 0) {
    ry = listBlock("Scelte di classe", character.scelteClasse.map((s) => s.nome), ry);
  }
  if (character.resistenze.length > 0) ry = listBlock("Resistenze", character.resistenze, ry, 1);
  if (character.immunita.length > 0) ry = listBlock("Immunità", character.immunita, ry, 1);
  if (character.vulnerabilita.length > 0) ry = listBlock("Vulnerabilità", character.vulnerabilita, ry, 1);

  const aspetto = [
    ["Età", character.eta],
    ["Altezza", character.altezza],
    ["Peso", character.peso],
    ["Occhi", character.occhi],
    ["Capelli", character.capelli],
    ["Carnagione", character.carnagione],
  ].filter(([, v]) => v);
  if (aspetto.length > 0) {
    ry = sectionHeader(ctx, "Aspetto", rightX, ry, halfW);
    for (const line of wrap(ctx.font, aspetto.map(([k, v]) => `${k}: ${v}`).join("   "), 8, halfW - 10)) {
      text(ctx, line, rightX + 4, ry, { size: 8 });
      ry -= 10.5;
    }
    ry -= 6;
  }

  // Personalità a tutta larghezza in fondo: sono testi lunghi, stanno male in colonna stretta.
  let py = Math.min(ly, ry) - 10;
  const personalita: [string, string][] = [
    ["Tratti caratteriali", character.tratti],
    ["Ideali", character.ideali],
    ["Legami", character.legami],
    ["Difetti", character.difetti],
    ["Nemici", character.nemici],
  ];
  for (const [titolo, valore] of personalita) {
    if (py < MARGIN + 40) break;
    py = sectionHeader(ctx, titolo, MARGIN, py, CONTENT_W);
    if (!valore.trim()) {
      py = blankLines(ctx, MARGIN + 4, py - 2, CONTENT_W - 8, 1) - 4;
      continue;
    }
    for (const line of wrap(ctx.font, valore, 8, CONTENT_W - 10)) {
      if (py < MARGIN + 16) break;
      text(ctx, line, MARGIN + 4, py, { size: 8 });
      py -= 10.5;
    }
    py -= 6;
  }

  // Note libere della scheda: erano l'unico campo del personaggio a non finire da nessuna parte
  // nel PDF. Chiudono la pagina e le righe vuote riempiono lo spazio che resta.
  if (py > MARGIN + 30) {
    py = sectionHeader(ctx, "Note", MARGIN, py, CONTENT_W);
    for (const line of wrap(ctx.font, character.note, 8, CONTENT_W - 10)) {
      if (py < MARGIN + 16) break;
      text(ctx, line, MARGIN + 4, py, { size: 8 });
      py -= 10.5;
    }
    if (py > MARGIN + 16) blankLines(ctx, MARGIN + 4, py - 2, CONTENT_W - 8, Math.min(10, Math.floor((py - MARGIN - 8) / 12)));
  }

  pageFooter(ctx, 2, totPagine);
}

// --- Pagina 3: incantesimi --------------------------------------------------------------------

function drawSpellsPage(ctx: Ctx, character: Character, totPagine: number) {
  pageHeader(ctx, character, "Incantesimi");
  const livello = totalLevel(character.classi);
  let y = PAGE_H - MARGIN - 44;

  const castingAbility = primaryCastingAbility(character.classi);
  const casterLevel = multiclassCasterLevel(character.classi);
  const wl = warlockLevel(character.classi);
  const pact = pactMagicForLevel(wl);
  const slots = spellSlotsForCasterLevel(casterLevel);

  // Riepilogo da incantatore: CD e bonus d'attacco già calcolati (bonus manuali della scheda
  // inclusi), così il PDF non costringe a rifare il conto a mente al tavolo.
  const boxW = (CONTENT_W - 16) / 3;
  const riepilogo: [string, string][] = [
    ["Caratteristica", castingAbility ? ABILITY_LABELS[castingAbility] : "—".replace("—", "-")],
    [
      "CD tiro salvezza",
      castingAbility ? String(spellSaveDC(livello, character.caratteristiche[castingAbility]) + character.cdIncantesimiBonus) : "-",
    ],
    [
      "Bonus di attacco",
      castingAbility
        ? formatModifier(spellAttackBonus(livello, character.caratteristiche[castingAbility]) + character.attaccoIncantesimiBonus)
        : "-",
    ],
  ];
  riepilogo.forEach(([label, value], i) => {
    const bx = MARGIN + i * (boxW + 8);
    box(ctx, bx, y - 36, boxW, 36, true);
    centered(ctx, label.toUpperCase(), bx + boxW / 2, y - 12, { size: 6.5, bold: true, color: MUTED });
    centered(ctx, value, bx + boxW / 2, y - 29, { size: 13, bold: true });
  });
  y -= 46;

  y = sectionHeader(ctx, "Slot incantesimo", MARGIN, y, CONTENT_W);
  const hasSlots = slots.some((s) => s > 0) || pact.slots > 0;
  if (hasSlots) {
    let sx = MARGIN + 4;
    slots.forEach((max, i) => {
      if (max <= 0) return;
      text(ctx, `${i + 1}°`, sx, y, { size: 7, color: MUTED });
      // Un pallino per slot, pieni quelli gia' spesi: su carta gli slot si barrano man mano, ed
      // e' la stessa richiesta arrivata per i privilegi a usi limitati.
      disegnaUsi(ctx, { usiMax: max, usiUsati: character.slotUsati[i] ?? 0 }, sx + 10, y);
      sx += 52;
    });
    if (pact.slots > 0) {
      text(ctx, `Patto (${pact.slotLevel}°)`, sx, y, { size: 7, color: MUTED });
      disegnaUsi(ctx, { usiMax: pact.slots, usiUsati: character.slotPattoUsati }, sx + 42, y);
    }
  } else {
    text(ctx, "Questo personaggio non ha slot incantesimo.", MARGIN + 4, y, { size: 8, color: MUTED });
  }
  y -= 18;

  // Incantesimi raggruppati per livello, su due colonne per starci in una pagina sola.
  const perLivello = new Map<number, typeof character.incantesimi>();
  for (const spell of character.incantesimi) {
    const list = perLivello.get(spell.livello) ?? [];
    list.push(spell);
    perLivello.set(spell.livello, list);
  }
  const livelli = [...perLivello.keys()].sort((a, b) => a - b);

  const halfW = (CONTENT_W - 14) / 2;
  const colX = [MARGIN, MARGIN + halfW + 14];
  const colY = [y, y];

  // Ripartizione bilanciata sulle due colonne invece di "riempi la prima, poi la seconda": con
  // pochi incantesimi restava tutto a sinistra e metà pagina vuota a destra. Si stima l'altezza
  // di ogni blocco e si passa alla colonna 2 superata la metà del totale.
  const blocchi = livelli.map((lvl) => {
    const spells = perLivello.get(lvl) ?? [];
    return {
      livello: lvl,
      titolo: lvl === 0 ? "Trucchetti" : `Livello ${lvl}`,
      spells,
      altezza: 29 + spells.length * 10.5,
    };
  });
  const meta = blocchi.reduce((sum, b) => sum + b.altezza, 0) / 2;
  let accumulato = 0;
  let col = 0;

  // Quando anche la seconda colonna finisce lo spazio si SMETTE di disegnare e si tiene il conto:
  // prima il ciclo esterno proseguiva comunque, piazzando intestazioni e incantesimi sotto il
  // margine inferiore, cioè fuori dalla pagina stampata e invisibili.
  let nonStampati = 0;

  for (const blocco of blocchi) {
    if (col === 0 && accumulato > 0 && accumulato + blocco.altezza / 2 > meta) col = 1;
    accumulato += blocco.altezza;

    // Serve spazio almeno per l'intestazione più una riga, altrimenti il titolo resterebbe
    // orfano in fondo alla colonna.
    if (colY[col] - 32 < MARGIN + 16) {
      if (col === 0) col = 1;
      if (colY[col] - 32 < MARGIN + 16) {
        nonStampati += blocco.spells.length;
        continue;
      }
    }

    colY[col] = sectionHeader(ctx, blocco.titolo, colX[col], colY[col], halfW);
    // Gli slot di QUESTO livello, accanto al suo titolo: sulla scheda del gruppo ogni livello ha
    // il suo "slot totali / slot spesi" li' dove stanno i suoi incantesimi, non in una riga sola
    // in cima alla pagina — che e' dove finirebbero a cercarli mentre si gioca.
    const slotDelLivello = blocco.livello > 0 ? (slots[blocco.livello - 1] ?? 0) : 0;
    if (slotDelLivello > 0) {
      text(ctx, "Slot", colX[col] + halfW - 96, colY[col] + 15, { size: 5.5, color: MUTED });
      disegnaUsi(
        ctx,
        { usiMax: slotDelLivello, usiUsati: character.slotUsati[blocco.livello - 1] ?? 0 },
        colX[col] + halfW - 78,
        colY[col] + 14,
      );
    }
    let esauriti = false;
    for (const spell of blocco.spells) {
      if (esauriti) {
        nonStampati++;
        continue;
      }
      if (colY[col] < MARGIN + 26) {
        if (col === 1) {
          esauriti = true;
          nonStampati++;
          continue;
        }
        col = 1;
        colY[col] = sectionHeader(ctx, `${blocco.titolo} (segue)`, colX[col], colY[col], halfW);
      }
      dot(ctx, colX[col] + 6, colY[col] + 3, spell.preparato ? "pieno" : "vuoto");
      text(ctx, spell.nome, colX[col] + 16, colY[col], { size: 8, maxWidth: halfW - 60 });
      if (spell.dadoDanno) {
        text(ctx, spell.dadoDanno, colX[col] + halfW - 42, colY[col], { size: 7, color: MUTED });
      }
      colY[col] -= 10.5;
    }
    colY[col] -= 8;
  }

  // Righe libere in fondo a entrambe le colonne: gli incantesimi si imparano salendo di livello,
  // una scheda stampata deve avere dove scriverli.
  for (const i of [0, 1]) {
    const righe = Math.floor((colY[i] - MARGIN - 20) / 12);
    if (righe >= 2) {
      colY[i] = sectionHeader(ctx, "Da aggiungere", colX[i], colY[i], halfW);
      blankLines(ctx, colX[i] + 4, colY[i] - 2, halfW - 8, Math.min(8, Math.floor((colY[i] - MARGIN - 8) / 12)));
    }
  }

  const legenda =
    nonStampati > 0
      ? `(pallino pieno = preparato) - ${nonStampati} incantesimi non stampati per spazio: vedi l'app`
      : "(pallino pieno = preparato)";
  text(ctx, legenda, MARGIN + 4, MARGIN + 2, { size: 6.5, color: MUTED });

  pageFooter(ctx, 3, totPagine);
}

/** Genera il PDF stampabile della scheda. Ritorna i byte: il chiamante decide cosa farne
 * (download nel browser), stesso ruolo dell'export JSON già esistente. */
export async function exportCharacterToPdf(character: Character): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const livello = totalLevel(character.classi);
  // xpForNextLevel ritorna già null al 20°: con Math.min(19, ...) si finiva per stampare la soglia
  // del livello GIÀ raggiunto ("355000 XP (prossimo livello: 355000)").
  const prossimoLivello = xpForNextLevel(livello);
  pdf.setTitle(safe(`${character.nome} - scheda QuestZip`));
  pdf.setCreator("QuestZip");
  // XP non trova posto fra i riquadri della pagina 1 (spazio) ma resta un dato della scheda:
  // finisce nei metadati, dove non ruba spazio alla stampa ma non va perso.
  pdf.setSubject(
    safe(
      `Livello ${livello} - ${character.esperienza} XP${prossimoLivello ? ` (prossimo livello: ${prossimoLivello})` : ""}`,
    ),
  );

  // La pagina incantesimi si salta del tutto per chi non è incantatore (un guerriero puro non
  // deve stamparsi un foglio vuoto) — ma basta un solo incantesimo o slot per includerla, così
  // resta coperto anche il caso Cavaliere Mistico/Mistificatore Arcano (i due "terzi
  // incantatori": nomi ufficiali del Manuale del Giocatore 2014 — nel 2024 Eldritch Knight
  // diventa "Cavaliere Occulto").
  const haIncantesimi =
    character.incantesimi.length > 0 ||
    multiclassCasterLevel(character.classi) > 0 ||
    warlockLevel(character.classi) > 0;
  const pagine = haIncantesimi
    ? [drawCombatPage, drawGearPage, drawSpellsPage]
    : [drawCombatPage, drawGearPage];

  for (const draw of pagine) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    draw({ page, font, bold, y: PAGE_H - MARGIN }, character, pagine.length);
  }

  return pdf.save();
}

/** Nome file suggerito: leggibile e senza caratteri che i filesystem rifiutano. */
export function pdfFileName(character: Character): string {
  const base = safe(character.nome).replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "personaggio";
  return `${base.replace(/\s+/g, "-")}-questzip.pdf`;
}
