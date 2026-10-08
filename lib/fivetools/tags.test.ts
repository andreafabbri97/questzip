import { describe, expect, it } from "vitest";
import { stripTags } from "./tags";

describe("stripTags", () => {
  it("risolve i tag semplici", () => {
    expect(stripTags("Infligge {@damage 8d6} danni da fuoco.")).toBe("Infligge 8d6 danni da fuoco.");
    expect(stripTags("{@atk mw} {@hit 4} to hit")).toBe("Melee Weapon Attack: +4 to hit");
    expect(stripTags("prova su {@dc 15}")).toBe("prova su DC 15");
  });

  it("con tre o più segmenti mostra l'ultimo, che è il testo da visualizzare", () => {
    expect(stripTags("vedi {@spell fireball|phb|palla di fuoco}")).toBe("vedi palla di fuoco");
    expect(stripTags("vedi {@spell fireball|phb}")).toBe("vedi fireball");
  });

  // Il caso vero: il privilegio "Dedicated Weapon" del monaco (Tasha's) comincia con un tag dentro
  // l'altro. Prima la regex si fermava alla prima graffa di chiusura, quindi inghiottiva il tag
  // esterno insieme all'interno, restituiva l'ultimo segmento dopo le pipe e lasciava una graffa
  // orfana: in scheda si leggeva "funzionalità opzionale}" (segnalato dall'utente).
  it("risolve i tag annidati senza lasciare graffe orfane", () => {
    const grezzo = "{@i 2nd-level monk {@variantrule optional class features|tce|optional feature}}";

    const risultato = stripTags(grezzo);

    expect(risultato).toBe("2nd-level monk optional feature");
    expect(risultato).not.toContain("}");
    expect(risultato).not.toContain("{");
  });

  it("regge più tag annidati nella stessa frase", () => {
    expect(
      stripTags("{@i vedi {@spell fireball|phb|palla di fuoco}} e {@i anche {@dc 15}}"),
    ).toBe("vedi palla di fuoco e anche DC 15");
  });

  // Un tag mai chiuso non deve mandare in cerchio il ciclo di passate.
  it("lascia stare un tag malformato invece di bloccarsi", () => {
    expect(stripTags("testo {@i mai chiuso")).toBe("testo {@i mai chiuso");
  });

  it("un testo senza tag resta identico", () => {
    expect(stripTags("Nessun tag qui.")).toBe("Nessun tag qui.");
  });
});

describe("stripTags in italiano", () => {
  // Il Compendio ha la traduzione italiana, ma i frammenti meccanici restavano in inglese in
  // mezzo alla frase tradotta. Su "{@recharge}" era peggio: nessuno lo scioglieva affatto sul
  // ramo italiano e 166 creature lo mostravano alla lettera (segnalato dall'utente).
  it("rende la ricarica in italiano", () => {
    expect(stripTags("Occhi Lampeggianti {@recharge}:", "it")).toBe("Occhi Lampeggianti (Ricarica 6):");
    expect(stripTags("Soffio {@recharge 5}:", "it")).toBe("Soffio (Ricarica 5-6):");
  });

  it("usa CD e non DC, che in italiano e' un'altra cosa", () => {
    expect(stripTags("Tiro salvezza {@dc 15}.", "it")).toBe("Tiro salvezza CD 15.");
    expect(stripTags("Tiro salvezza {@dc 15}.")).toBe("Tiro salvezza DC 15.");
  });

  it("traduce il tipo di attacco e il 'colpito'", () => {
    expect(stripTags("{@atk mw} {@h}", "it")).toBe("Attacco con Arma da Mischia: Colpito: ");
    expect(stripTags("{@atk rs}", "it")).toBe("Attacco con Incantesimo a Distanza:");
  });

  it("i valori numerici non cambiano con la lingua", () => {
    expect(stripTags("{@hit 7} e {@damage 2d6}", "it")).toBe("+7 e 2d6");
    expect(stripTags("{@hit 7} e {@damage 2d6}")).toBe("+7 e 2d6");
  });

  it("senza indicare la lingua resta l'inglese, come prima", () => {
    expect(stripTags("{@recharge}")).toBe("(Recharge 6)");
  });
});
