import { describe, expect, it } from "vitest";
import { confrontaDistanze, distanzeInglesi, distanzeItaliane } from "./distanze-mostro";

const valori = (distanze: { valore: string }[]) => distanze.map((d) => d.valore);

describe("distanzeInglesi", () => {
  it("converte i piedi a 1,5 metri ogni 5", () => {
    expect(valori(distanzeInglesi("reach 5 ft., one target"))).toEqual(["1,5"]);
    expect(valori(distanzeInglesi("a 60-foot cone"))).toEqual(["18"]);
    expect(valori(distanzeInglesi("within 120 feet of it"))).toEqual(["36"]);
  });

  it("divide le gittate doppie", () => {
    expect(valori(distanzeInglesi("range 20/60 ft., one target"))).toEqual(["6", "18"]);
  });

  it("legge la virgola delle migliaia, i pollici e le miglia", () => {
    expect(valori(distanzeInglesi("roughly 1,000 feet in diameter"))).toEqual(["300"]);
    expect(valori(distanzeInglesi("a gap 1 inch wide"))).toEqual(["0,025"]);
    expect(valori(distanzeInglesi("more than 1 mile from the target"))).toEqual(["1,5km"]);
  });

  it("legge il piede senza numero, quello extra e il mezzo piede", () => {
    expect(valori(distanzeInglesi("each foot of its walking speed"))).toEqual(["0,3"]);
    expect(valori(distanzeInglesi("Each foot of movement in water"))).toEqual(["0,3"]);
    expect(valori(distanzeInglesi("reach 5 ft. or range 30/120, one target"))).toEqual(["1,5", "9", "36"]);
    expect(valori(distanzeInglesi("costs it 2 extra feet, instead of 1 extra foot"))).toEqual(["0,6", "0,3"]);
    expect(valori(distanzeInglesi("a 2½-foot-diameter tunnel"))).toEqual(["0,75"]);
  });

  it("non prende per piedi le facce di un dado", () => {
    expect(distanzeInglesi("moves 1d6 feet in a random direction")).toEqual([]);
  });

  it("guarda dentro i tag di 5etools", () => {
    expect(valori(distanzeInglesi("moves {@dice 3d6 × 10} feet away"))).toEqual(["3"]);
  });
});

describe("distanzeItaliane", () => {
  it("legge metri, centimetri e chilometri", () => {
    expect(valori(distanzeItaliane("portata 1,5 m o gittata 6/18 m, un bersaglio"))).toEqual(["1,5", "6", "18"]);
    expect(valori(distanzeItaliane("il muro è spesso 30 cm"))).toEqual(["0,3"]);
    expect(valori(distanzeItaliane("a più di 1,5 km dal bersaglio"))).toEqual(["1,5km"]);
  });

  it("legge il numero anche quando l'unità è andata a capo", () => {
    expect(valori(distanzeItaliane("percepisce la magia entro 36\nmetri da sé"))).toEqual(["36"]);
  });

  it("legge il metro e mezzo scritto in lettere", () => {
    expect(valori(distanzeItaliane("per ogni metro e mezzo che percorre"))).toEqual(["1,5"]);
  });

  it("non prende per metri una emme che apre una parola", () => {
    expect(distanzeItaliane("per 1 minuto")).toEqual([]);
    expect(distanzeItaliane("3 m'è")).toEqual([]);
  });
});

describe("confrontaDistanze", () => {
  it("non trova differenze in una scheda fedele", () => {
    const esito = confrontaDistanze(
      "Attacco con Arma da Mischia: +4 al tiro per colpire, portata 1,5 m o gittata 6/18 m, un bersaglio.",
      "{@atk mw,rw} {@hit 4} to hit, reach 5 ft. or range 20/60 ft., one target.",
    );
    expect(esito).toEqual({ mancanti: [], inPiu: [] });
  });

  it("segnala la distanza letta male come una che manca e una in più", () => {
    const esito = confrontaDistanze("una creatura visibile entro 8 metri", "one creature within 60 feet of it");
    expect(valori(esito.mancanti)).toEqual(["18"]);
    expect(valori(esito.inPiu)).toEqual(["8"]);
    expect(esito.mancanti[0].contesto).toContain("within 60 feet");
  });

  it("segnala la frase che la scheda non ha", () => {
    const esito = confrontaDistanze("Morso. portata 1,5 m.", "Bite. reach 5 ft. The chuul senses magic within 120 feet.");
    expect(valori(esito.mancanti)).toEqual(["36"]);
    expect(esito.inPiu).toEqual([]);
  });

  // Il manuale dei mostri del multiverso converte così: sono numeri stampati, non refusi.
  it("accetta la conversione esatta dei piedi", () => {
    expect(confrontaDistanze("gittata 45/183 m", "range 150/600 ft.")).toEqual({ mancanti: [], inPiu: [] });
    expect(confrontaDistanze("lunga fino a 76 metri", "up to 250 feet long")).toEqual({ mancanti: [], inPiu: [] });
    expect(confrontaDistanze("gittata 24/97,5 m", "range 80/320 ft.")).toEqual({ mancanti: [], inPiu: [] });
  });

  // Sotto i 100 piedi il conto esatto arrotondato sarebbe la lettura sbagliata da trovare.
  it("non accetta la conversione esatta per le distanze corte", () => {
    const esito = confrontaDistanze("portata 5 m", "reach 15 ft.");
    expect(valori(esito.mancanti)).toEqual(["4,5"]);
    expect(valori(esito.inPiu)).toEqual(["5"]);
  });

  it("legge le migliaia scritte col punto", () => {
    expect(confrontaDistanze("entro 1.500 chilometri, a 3.000 metri", "within 1,000 miles, at 10,000 feet")).toEqual({
      mancanti: [],
      inPiu: [],
    });
  });

  it("dà la precedenza all'uguaglianza stretta", () => {
    const esito = confrontaDistanze("entro 183 metri, poi entro 180 metri", "within 600 feet, then within 600 feet");
    expect(esito).toEqual({ mancanti: [], inPiu: [] });
  });

  it("i riquadri delle varianti giustificano una distanza in più ma non sono richiesti", () => {
    const base = "Morso. reach 5 ft.";
    const variante = "The summoned mephit appears within 60 feet of its summoner.";
    expect(confrontaDistanze("Morso. portata 1,5 m. Compare entro 18 metri.", base, variante).inPiu).toEqual([]);
    expect(confrontaDistanze("Morso. portata 1,5 m.", base, variante)).toEqual({ mancanti: [], inPiu: [] });
  });
});
