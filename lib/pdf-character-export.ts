import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  ABILITIES,
  ABILITY_LABELS,
  RECUPERO_LABELS,
  XP_PER_LEVEL,
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
  warlockLevel,
  weaponAttackBonus,
  weaponAbilityModifier,
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

  // Colonna sinistra: caratteristiche
  const colW = 74;
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
  const midW = 196;
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

  // Colonna destra: difesa, punti ferita, dadi vita, tiri morte
  const rightX = midX + midW + 12;
  const rightW = PAGE_W - MARGIN - rightX;
  let ry = top;

  const stats: [string, string][] = [
    ["Classe Armatura", String(character.classeArmatura)],
    ["Iniziativa", formatModifier(abilityModifier(character.caratteristiche.destrezza) + character.iniziativaBonus)],
    ["Velocità", `${character.velocita} m`],
    [
      "Percezione passiva",
      String(
        passivePerception(
          character.caratteristiche.saggezza,
          character.abilitaCompetenti.includes("Percezione") || character.abilitaEsperte.includes("Percezione"),
          character.abilitaEsperte.includes("Percezione"),
          livello,
        ) + character.percezionePassivaBonus,
      ),
    ],
  ];
  const statW = (rightW - 6) / 2;
  stats.forEach(([label, value], i) => {
    const bx = rightX + (i % 2) * (statW + 6);
    const by = ry - Math.floor(i / 2) * 40;
    box(ctx, bx, by - 36, statW, 36, true);
    centered(ctx, label.toUpperCase(), bx + statW / 2, by - 11, { size: 6, bold: true, color: MUTED });
    centered(ctx, value, bx + statW / 2, by - 28, { size: 14, bold: true });
  });
  ry -= 86;

  ry = sectionHeader(ctx, "Punti ferita", rightX, ry, rightW);
  box(ctx, rightX, ry - 30, rightW, 34);
  text(ctx, "Attuali", rightX + 6, ry - 10, { size: 6.5, bold: true, color: MUTED });
  text(ctx, `${character.hpAttuali} / ${character.hpMax}`, rightX + 6, ry - 24, { size: 13, bold: true });
  text(ctx, "Temporanei", rightX + rightW / 2 + 6, ry - 10, { size: 6.5, bold: true, color: MUTED });
  text(ctx, String(character.hpTemporanei), rightX + rightW / 2 + 6, ry - 24, { size: 13, bold: true });
  ry -= 40;

  const dadiVitaTot = livello;
  box(ctx, rightX, ry - 22, rightW, 22, true);
  text(ctx, "DADI VITA", rightX + 6, ry - 9, { size: 6.5, bold: true, color: MUTED });
  text(ctx, `${Math.max(0, dadiVitaTot - character.dadiVitaUsati)} / ${dadiVitaTot} disponibili`, rightX + 6, ry - 18, { size: 8 });
  ry -= 30;

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
  text(ctx, `Ispirazione: ${character.ispirazione ? "sì" : "no"}`, rightX + 6, ry, { size: 8 });
  ry -= 11;
  text(ctx, `Affaticamento: ${character.affaticamento}/6`, rightX + 6, ry, { size: 8 });
  ry -= 11;
  if (character.livelloFollia > 0) {
    text(ctx, `Follia: ${character.livelloFollia}/6`, rightX + 6, ry, { size: 8 });
    ry -= 11;
  }
  if (character.condizioniAttive.length > 0) {
    for (const line of wrap(ctx.font, `Condizioni: ${character.condizioniAttive.join(", ")}`, 8, rightW - 12)) {
      text(ctx, line, rightX + 6, ry, { size: 8 });
      ry -= 10;
    }
  }

  // Fascia bassa: armi (con bonus d'attacco e danno già calcolati) e privilegi limitati. Parte
  // sotto la PIÙ LUNGA delle tre colonne sopra, non da una y fissa: con un valore fisso restava
  // una fascia bianca enorme in mezzo alla pagina per i personaggi con poche righe in colonna.
  let by = Math.min(y, my, ry) - 14;
  const halfW = (CONTENT_W - 12) / 2;
  by = sectionHeader(ctx, "Armi e attacchi", MARGIN, by, CONTENT_W);
  text(ctx, "ARMA", MARGIN + 4, by, { size: 6.5, bold: true, color: MUTED });
  text(ctx, "ATTACCO", MARGIN + 250, by, { size: 6.5, bold: true, color: MUTED });
  text(ctx, "DANNO", MARGIN + 310, by, { size: 6.5, bold: true, color: MUTED });
  by -= 11;
  const armiMostrate = character.armi.slice(0, 6);
  for (const arma of armiMostrate) {
    const atk = weaponAttackBonus(arma.caratteristica, character.caratteristiche, arma.competente, livello, arma.bonusExtra);
    const dmgMod = weaponAbilityModifier(arma.caratteristica, character.caratteristiche);
    text(ctx, arma.nome, MARGIN + 4, by, { size: 8, maxWidth: 240 });
    text(ctx, formatModifier(atk), MARGIN + 250, by, { size: 8, bold: true });
    text(ctx, `${arma.dadoDanno}${dmgMod !== 0 ? formatModifier(dmgMod) : ""} ${arma.tipoDanno}`.trim(), MARGIN + 310, by, {
      size: 8,
      maxWidth: 200,
    });
    by -= 11;
  }
  by = notaTroncamento(ctx, character.armi.length, armiMostrate.length, MARGIN + 4, by);
  if (character.armi.length === 0) by = blankLines(ctx, MARGIN + 4, by - 2, CONTENT_W - 8, 3);

  by -= 8;
  const featY = sectionHeader(ctx, "Privilegi a usi limitati", MARGIN, by, halfW);
  let fy = featY;
  const privilegiMostrati = character.privilegiLimitati.slice(0, 8);
  for (const p of privilegiMostrati) {
    text(ctx, p.nome, MARGIN + 4, fy, { size: 8, maxWidth: halfW - 110 });
    text(ctx, `${Math.max(0, p.usiMax - p.usiUsati)}/${p.usiMax}`, MARGIN + halfW - 96, fy, { size: 8, bold: true });
    text(ctx, RECUPERO_LABELS[p.recupero], MARGIN + halfW - 66, fy, { size: 6.5, color: MUTED });
    fy -= 11;
  }
  fy = notaTroncamento(ctx, character.privilegiLimitati.length, privilegiMostrati.length, MARGIN + 4, fy);
  // Righe libere fino in fondo anche qui, non solo negli appunti: su una scheda STAMPATA i
  // privilegi si aggiungono salendo di livello, e lo spazio in fondo alla colonna resterebbe
  // comunque bianco.
  blankLines(ctx, MARGIN + 4, fy - 2, halfW - 8, Math.min(14, Math.max(2, Math.floor((fy - MARGIN - 8) / 12))));

  // Le righe libere per gli appunti riempiono lo spazio che avanza fino al piè di pagina, invece
  // di un numero fisso: su un personaggio con poche armi/privilegi lo spazio utile è molto di più.
  const notesX = MARGIN + halfW + 12;
  const notesY = sectionHeader(ctx, "Appunti di sessione", notesX, by, halfW);
  const righeDisponibili = Math.min(14, Math.max(3, Math.floor((notesY - MARGIN - 8) / 12)));
  blankLines(ctx, notesX + 4, notesY - 2, halfW - 8, righeDisponibili);

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
  text(ctx, `Oro ${character.monete.oro}    Argento ${character.monete.argento}    Rame ${character.monete.rame}`, MARGIN + 4, ly, { size: 8.5 });
  ly -= 18;

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

  ry = listBlock("Talenti", character.talenti.map((t) => t.nome), ry);
  if (character.infusioniConosciute.length > 0) {
    ry = listBlock("Infusioni conosciute", character.infusioniConosciute.map((i) => i.nome), ry);
  }
  if (character.scelteClasse.length > 0) {
    ry = listBlock("Scelte di classe", character.scelteClasse.map((s) => s.nome), ry);
  }
  ry = listBlock("Linguaggi", character.linguaggi, ry);
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
      const disponibili = Math.max(0, max - (character.slotUsati[i] ?? 0));
      text(ctx, `${i + 1}°`, sx, y, { size: 7, color: MUTED });
      text(ctx, `${disponibili}/${max}`, sx + 12, y, { size: 8.5, bold: true });
      sx += 52;
    });
    if (pact.slots > 0) {
      text(ctx, `Patto (${pact.slotLevel}°)`, sx, y, { size: 7, color: MUTED });
      text(ctx, `${Math.max(0, pact.slots - character.slotPattoUsati)}/${pact.slots}`, sx + 44, y, { size: 8.5, bold: true });
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
    return { titolo: lvl === 0 ? "Trucchetti" : `Livello ${lvl}`, spells, altezza: 29 + spells.length * 10.5 };
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
  const prossimoLivello = XP_PER_LEVEL[Math.min(19, livello)] ?? null;
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
  // resta coperto anche il caso Cavaliere Mistico/Furfante Arcano.
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
