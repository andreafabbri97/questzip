import { describe, expect, it } from "vitest";
import {
  abbinaPrivilegiTradotti,
  dividiPerLivello,
  prossimoLivelloConPrivilegi,
} from "./privilegi-per-livello";

// Livelli presi da un caso vero: il Furfante Arcano di un Ladro 5 ha già i privilegi del 3°, non
// quelli del 9° in poi.
const furfanteArcano = [
  { name: "Incantesimi", level: 3 },
  { name: "Mano Magica Perfezionata", level: 3 },
  { name: "Imboscata Magica", level: 9 },
  { name: "Ladro Versatile", level: 13 },
  { name: "Ladro Impareggiabile", level: 17 },
];

describe("dividiPerLivello", () => {
  it("tiene fra gli ottenuti solo i privilegi fino al livello raggiunto", () => {
    const { ottenuti, futuri } = dividiPerLivello(furfanteArcano, 5);

    expect(ottenuti.map((f) => f.name)).toEqual(["Incantesimi", "Mano Magica Perfezionata"]);
    expect(futuri.map((f) => f.level)).toEqual([9, 13, 17]);
  });

  it("il privilegio del livello appena raggiunto è già ottenuto", () => {
    expect(dividiPerLivello(furfanteArcano, 3).ottenuti).toHaveLength(2);
    // Al 2° la sottoclasse non è ancora stata scelta: nulla è ottenuto, ma l'elenco resta
    // consultabile per decidere.
    expect(dividiPerLivello(furfanteArcano, 2).ottenuti).toHaveLength(0);
  });

  it("al 20° non resta niente di futuro", () => {
    expect(dividiPerLivello(furfanteArcano, 20).futuri).toEqual([]);
  });

  it("conserva l'ordine di partenza dentro ciascun gruppo", () => {
    const { ottenuti } = dividiPerLivello(
      [
        { name: "Secondo del 3°", level: 3 },
        { name: "Primo del 1°", level: 1 },
      ],
      5,
    );

    expect(ottenuti.map((f) => f.name)).toEqual(["Secondo del 3°", "Primo del 1°"]);
  });
});

describe("prossimoLivelloConPrivilegi", () => {
  it("annuncia il primo livello utile, non l'ultimo", () => {
    const { futuri } = dividiPerLivello(furfanteArcano, 5);

    expect(prossimoLivelloConPrivilegi(futuri)).toBe(9);
  });

  it("non annuncia niente se non manca più nulla", () => {
    expect(prossimoLivelloConPrivilegi([])).toBeNull();
  });
});

describe("abbinaPrivilegiTradotti", () => {
  it("abbina in ordine quando i due elenchi coincidono a quel livello", () => {
    const privilegi = [
      { name: "Sneak Attack", level: 1 },
      { name: "Cunning Action", level: 2 },
    ];
    const tradotti = [
      { level: 1, name: "Attacco furtivo", text: "Una volta per turno…" },
      { level: 2, name: "Azione astuta", text: "Scatto, disimpegno…" },
    ];

    expect(abbinaPrivilegiTradotti(privilegi, tradotti).map((t) => t?.name)).toEqual([
      "Attacco furtivo",
      "Azione astuta",
    ]);
  });

  // Il caso vero: al 3° livello del Ladro Lama Spirituale i privilegi inglesi sono tre e le righe
  // tradotte due, quindi l'ordine non prova niente. Prima scivolavano e in scheda compariva
  // "Lama Spirituale (Psi-Bolstered Knack)" — il nome di un altro privilegio.
  it("rinuncia al livello in cui i conteggi non combaciano, invece di far scivolare i nomi", () => {
    const privilegi = [
      { name: "Psionic Power", level: 3 },
      { name: "Psi-Bolstered Knack", level: 3 },
      { name: "Soulknife", level: 3 },
      { name: "Uncanny Dodge", level: 5 },
    ];
    const tradotti = [
      { level: 3, name: "Potere Psionico", text: "…" },
      { level: 3, name: "Lama Spirituale", text: "…" },
      { level: 5, name: "Schivata inquietante", text: "…" },
    ];

    const abbinati = abbinaPrivilegiTradotti(privilegi, tradotti);

    expect(abbinati.slice(0, 3)).toEqual([null, null, null]);
    // Il 5°, dove i conteggi tornano, resta abbinato.
    expect(abbinati[3]?.name).toBe("Schivata inquietante");
  });

  it("senza testo tradotto non abbina nulla", () => {
    expect(abbinaPrivilegiTradotti([{ name: "Sneak Attack", level: 1 }], [])).toEqual([null]);
  });
});
