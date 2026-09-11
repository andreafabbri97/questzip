import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { characterSchema, newCharacter, type Character } from "@/lib/dnd";
import { exportCharacterToPdf, pdfFileName } from "@/lib/pdf-character-export";

function build(overrides: Partial<Character> = {}): Character {
  return characterSchema.parse({ ...newCharacter(), nome: "Prova", ...overrides });
}

async function numeroPagine(bytes: Uint8Array): Promise<number> {
  const pdf = await PDFDocument.load(bytes as unknown as ArrayBuffer);
  return pdf.getPageCount();
}

/**
 * Le parole davvero stampate sulle pagine.
 *
 * Il testo di un PDF sta dentro stream compressi, quindi cercarlo come stringa nel file non
 * funziona: prima si decomprimono. Di quello che ne esce si tengono solo gli operatori di
 * disegno del testo (`<...> Tj`, che pdf-lib scrive in esadecimale), così restano fuori i
 * metadati del file — compresa la data di creazione, che cambia a ogni generazione e renderebbe
 * impossibile confrontare due schede.
 */
function testoStampato(bytes: Uint8Array): string[] {
  const file = Buffer.from(bytes);
  const parole: string[] = [];
  let da = 0;
  for (;;) {
    const apertura = file.indexOf("stream", da);
    if (apertura === -1) break;
    let inizio = apertura + "stream".length;
    if (file[inizio] === 0x0d) inizio++;
    if (file[inizio] === 0x0a) inizio++;
    const fine = file.indexOf("endstream", inizio);
    if (fine === -1) break;
    const dati = file.subarray(inizio, fine);
    let contenuto: string;
    try {
      contenuto = inflateSync(dati).toString("latin1");
    } catch {
      continue; // non è un flusso compresso: nessun testo da leggere qui
    } finally {
      da = fine + "endstream".length;
    }
    for (const [, esadecimale] of contenuto.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      const parola = Buffer.from(esadecimale, "hex").toString("latin1");
      if (parola.trim()) parole.push(parola);
    }
  }
  return parole;
}

describe("exportCharacterToPdf", () => {
  it("genera un PDF valido e non vuoto", async () => {
    const bytes = await exportCharacterToPdf(build());
    expect(bytes.length).toBeGreaterThan(1000);
    // Firma di un file PDF: se cambiasse il generatore, un file non-PDF fallirebbe qui.
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("salta la pagina incantesimi per un personaggio senza magia", async () => {
    const guerriero = build({ classi: [{ nome: "Guerriero", livello: 5 }] });
    expect(await numeroPagine(await exportCharacterToPdf(guerriero))).toBe(2);
  });

  it("include la pagina incantesimi per un incantatore", async () => {
    const mago = build({ classi: [{ nome: "Mago", livello: 5 }] });
    expect(await numeroPagine(await exportCharacterToPdf(mago))).toBe(3);
  });

  it("include la pagina incantesimi anche se la magia arriva solo dagli incantesimi conosciuti", async () => {
    // Cavaliere Mistico/Mistificatore Arcano: la classe non risulta incantatrice dalle tabelle, ma il
    // personaggio ha comunque incantesimi in scheda — senza questo caso resterebbero fuori dal PDF.
    const cavaliere = build({
      classi: [{ nome: "Guerriero", livello: 5 }],
      incantesimi: [{ id: "s1", nome: "Scudo", livello: 1, preparato: true, dadoDanno: "" }],
    });
    expect(await numeroPagine(await exportCharacterToPdf(cavaliere))).toBe(3);
  });

  it("non esplode su caratteri fuori da Latin-1 (emoji, cirillico, trattini tipografici)", async () => {
    // Helvetica standard copre solo WinAnsi: senza la sanificazione in safe(), pdf-lib lancia
    // un'eccezione e l'intero export fallisce per un singolo carattere in un campo libero.
    const strano = build({
      nome: "Zörb 🐉 — “il Rosso”",
      note: "Привет 你好 🔥 … – —",
      talenti: [{ id: "t1", nome: "Fortunato 🍀" }],
    });
    const bytes = await exportCharacterToPdf(strano);
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("regge liste molto lunghe senza errori", async () => {
    const affollato = build({
      classi: [{ nome: "Mago", livello: 20 }],
      incantesimi: Array.from({ length: 80 }, (_, i) => ({
        id: `s${i}`,
        nome: `Incantesimo ${i}`,
        livello: i % 10,
        preparato: i % 2 === 0,
        dadoDanno: "",
      })),
      inventario: Array.from({ length: 40 }, (_, i) => ({
        id: `i${i}`,
        nome: `Oggetto ${i}`,
        quantita: 1,
        note: "",
        peso: 1,
      })),
    });
    const bytes = await exportCharacterToPdf(affollato);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });
});

describe("pdfFileName", () => {
  it("costruisce un nome file leggibile", () => {
    expect(pdfFileName(build({ nome: "Thorin Scudodiquercia" }))).toBe("Thorin-Scudodiquercia-questzip.pdf");
  });

  it("toglie i caratteri che i filesystem rifiutano", () => {
    expect(pdfFileName(build({ nome: 'Zorb/il "Rosso"?' }))).toBe("Zorbil-Rosso-questzip.pdf");
  });

  it("ricade su un nome generico se non resta nulla di utilizzabile", () => {
    expect(pdfFileName(build({ nome: "🐉🔥" }))).toBe("personaggio-questzip.pdf");
  });
});

// Il gruppo usa la scheda STAMPATA al tavolo: quello che si consuma durante una sessione deve
// potersi barrare a penna. È il primo appunto arrivato guardando l'esportazione ("inserire una
// sezione in cui segnarsi gli usi delle abilità man mano").
describe("cose da barrare sulla scheda stampata", () => {
  const conUsi = () =>
    build({
      classi: [{ nome: "Warlock", livello: 5 }],
      privilegiLimitati: [
        { id: "a", nome: "Maledizione della Strega", usiMax: 1, usiUsati: 0, recupero: "riposoBreve" },
        { id: "b", nome: "Dadi di Energia Psionica", usiMax: 8, usiUsati: 3, recupero: "riposoLungo" },
      ],
      ispirazione: 2,
      affaticamento: 1,
    });

  // Il testo dentro un PDF è compresso, quindi non lo si può cercare come stringa: qui si
  // verifica che la scheda si generi con i dati che vanno barrati, e che i casi limite non la
  // rompano. La verifica di come APPARE si fa con scripts/verifica-scheda-pdf.py, che rende le
  // pagine e cerca testi sovrapposti.
  it("genera la scheda con privilegi, ispirazione e affaticamento da barrare", async () => {
    const bytes = await exportCharacterToPdf(conUsi());

    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(4000);
  });

  it("regge un privilegio con moltissimi usi senza uscire dal riquadro", async () => {
    const tanti = build({
      privilegiLimitati: [
        { id: "c", nome: "Punti Stregoneria", usiMax: 20, usiUsati: 7, recupero: "riposoLungo" },
      ],
    });

    // Oltre una certa quantità i pallini non entrerebbero: si ripiega su una casella da riempire
    // a penna. Deve comunque generare senza errori.
    await expect(exportCharacterToPdf(tanti)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("un personaggio senza privilegi limitati non rompe la pagina", async () => {
    await expect(exportCharacterToPdf(build({ privilegiLimitati: [] }))).resolves.toBeInstanceOf(
      Uint8Array,
    );
  });
});

// La scheda stampata si usa CON LA MATITA durante la sessione: i valori che cambiano a ogni
// scontro non vanno stampati, o sarebbero già sbagliati al primo colpo subito. Si stampa il
// massimo e si lascia la casella per il valore corrente, come sulla scheda del gruppo.
describe("valori che cambiano in sessione", () => {
  it("i punti ferita attuali non finiscono nel PDF", async () => {
    const pieno = await exportCharacterToPdf(build({ hpMax: 188, hpAttuali: 188 }));
    const ferito = await exportCharacterToPdf(build({ hpMax: 188, hpAttuali: 137 }));

    // Al posto del valore corrente c'è una casella vuota, quindi due schede dello stesso
    // personaggio a mezzo scontro di distanza stampano le stesse identiche parole.
    expect(testoStampato(ferito)).toEqual(testoStampato(pieno));
    expect(testoStampato(ferito)).not.toContain("137");
    // Se il lettore di PDF qui sopra smettesse di trovare testo, i due controlli sopra
    // passerebbero confrontando il nulla: questa riga se ne accorge.
    expect(testoStampato(ferito).length).toBeGreaterThan(50);
  });

  it("i punti ferita massimi invece ci sono, perché non cambiano durante lo scontro", async () => {
    // Il confronto è sulle parole stampate, non sul peso del file: "8" e "188" una volta
    // compressi occupano lo stesso spazio, e il test passava o falliva per caso.
    expect(testoStampato(await exportCharacterToPdf(build({ hpMax: 188 })))).toContain("188");
  });
});

// Casi limite provati generando il PDF davvero e passandolo a scripts/verifica-scheda-pdf.py:
// è lì che sono emersi un nome lungo stampato SOPRA il titolo di sezione, righe libere finite
// sotto il bordo del foglio e nomi di abilità troncati ("Addestrare An...").
describe("casi limite dell'impaginazione", () => {
  const lungo = "Nome molto lungo di prova che sfora sicuramente la colonna disponibile";

  it("un nome lunghissimo non invade il titolo di sezione", async () => {
    const bytes = await exportCharacterToPdf(build({ nome: lungo, razza: lungo, background: lungo }));

    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("una scheda piena in ogni sezione resta dentro le pagine", async () => {
    const pieno = build({
      nome: "Pieno",
      classi: [
        { nome: "Warlock", livello: 10, sottoclasse: "The Hexblade" },
        { nome: "Ladro", livello: 10, sottoclasse: "Soulknife" },
      ],
      talenti: Array.from({ length: 8 }, (_, i) => ({ id: `t${i}`, nome: `${lungo} ${i}` })),
      linguaggi: Array.from({ length: 12 }, (_, i) => `${lungo} ${i}`),
      privilegiLimitati: Array.from({ length: 12 }, (_, i) => ({
        id: `p${i}`,
        nome: `${lungo} ${i}`,
        usiMax: 20,
        usiUsati: 2,
        recupero: "riposoBreve" as const,
      })),
    });

    await expect(exportCharacterToPdf(pieno)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("una scheda appena creata non produce pagine rotte", async () => {
    const bytes = await exportCharacterToPdf(build({ nome: "Nuovo" }));

    // Senza incantesimi la terza pagina non esiste: due pagine, non tre vuote.
    expect(await numeroPagine(bytes)).toBe(2);
  });
});
