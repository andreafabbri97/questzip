import { describe, expect, it } from "vitest";
import { togliProsaDiPagina } from "./prosa-di-pagina";

const righe = (...r: string[]) => r.join("\n");

// Sei righe di racconto: né cifre né termini di regole.
const PROSA = [
  "Gli oblex sono melme capaci di sottrarre i ricordi",
  "alle loro prede. Create dai mind flayer, queste viscide",
  "creature si nutrono dei pensieri altrui, plasmando",
  "le personalità che rubano per creare copie delle",
  "loro vittime, il che li aiuta a raccogliere ancora",
  "più vittime per i loro padroni divoratori di menti.",
];

describe("togliProsaDiPagina", () => {
  // Il Nupperibo di Mostri del Multiverso: dopo il morso veniva la pagina degli oblex.
  it("toglie la prosa che segue un titolo letto male", () => {
    const testo = righe(
      "Morso. Attacco con arma da mischia: +5 al tiro per colpire,",
      "portata 1,5 m, un bersaglio. Colpo: 6 (1d6 + 3) danni perforanti.",
      "0BLEX",
      ...PROSA,
    );
    expect(togliProsaDiPagina(testo)).toBe(
      righe(
        "Morso. Attacco con arma da mischia: +5 al tiro per colpire,",
        "portata 1,5 m, un bersaglio. Colpo: 6 (1d6 + 3) danni perforanti.",
      ),
    );
  });

  it("toglie la prosa in MEZZO alla scheda e tiene ciò che viene dopo", () => {
    const testo = righe(
      "Resistenza alla magia. L'eco dispone di vantaggio ai tiri salvezza",
      "contro incantesimi e altri effetti magici.",
      "Nuo'lo Cotro, nvo'I) (),'l'l)IJCu=! L(), rtil'I(), vo!C()",
      "Eco DI DEMOGORGON",
      ...PROSA,
      "Due teste. L'eco dispone di vantaggio ai tiri salvezza per non",
      "essere accecato, assordato o stordito.",
    );
    expect(togliProsaDiPagina(testo)).toBe(
      righe(
        "Resistenza alla magia. L'eco dispone di vantaggio ai tiri salvezza",
        "contro incantesimi e altri effetti magici.",
        "Due teste. L'eco dispone di vantaggio ai tiri salvezza per non",
        "essere accecato, assordato o stordito.",
      ),
    );
  });

  // Un tratto vero può non avere né numeri né termini di regole: è corto, e si riconosce da lì.
  it("tiene un tratto breve che chiude la prosa", () => {
    const testo = righe(
      "Morso. Colpo: 6 (1d6 + 3) danni perforanti.",
      "Eco DI DEMOGORGON",
      ...PROSA,
      "Sempre all'erta. Quando una delle due teste dell'eco dorme, l'altra",
      "è sveglia.",
    );
    expect(togliProsaDiPagina(testo)).toBe(
      righe(
        "Morso. Colpo: 6 (1d6 + 3) danni perforanti.",
        "Sempre all'erta. Quando una delle due teste dell'eco dorme, l'altra",
        "è sveglia.",
      ),
    );
  });

  it("toglie le righe di glifi isolate", () => {
    const testo = righe("Artiglio. Colpo: 7 (2d4 + 2) danni taglienti.", "i>", "•?", "Morso. Colpo: 4 (1d8) danni perforanti.");
    expect(togliProsaDiPagina(testo)).toBe(
      righe("Artiglio. Colpo: 7 (2d4 + 2) danni taglienti.", "Morso. Colpo: 4 (1d8) danni perforanti."),
    );
  });

  // Senza uno stacco visibile non si tocca niente: potrebbe essere la coda di un'azione.
  it("non toglie righe senza numeri se non c'è uno stacco prima", () => {
    const testo = righe(
      "Ladro di Corpi. Il divoracervelli avvia una contesa con un umanoide.",
      "Se vince, divora magicamente il cervello della vittima,",
      "si insedia nel cranio e assume il controllo del corpo.",
      "Conserva la comprensione del Gergo delle Profondità,",
      "la telepatia e i propri tratti. Sotto ogni altro aspetto",
      "adotta le statistiche della vittima. Sa tutto ciò che",
      "sapeva la creatura, inclusi i linguaggi.",
    );
    expect(togliProsaDiPagina(testo)).toBe(testo);
  });

  // Meno di sei righe dopo un titolo non bastano a dire che è prosa.
  it("non toglie poche righe dopo un titolo", () => {
    const testo = righe("Morso. Colpo: 6 (1d6 + 3) danni.", "VARIANTE", "Alcuni esemplari sono più grandi", "e vivono nelle paludi.");
    expect(togliProsaDiPagina(testo)).toBe(testo);
  });

  it("non perde mai un numero", () => {
    const testo = righe(
      "Morso. Colpo: 6 (1d6 + 3) danni perforanti.",
      "0BLEX",
      ...PROSA.slice(0, 3),
      "Un oblex adulto può imitare fino a 12 creature diverse",
      ...PROSA.slice(3),
    );
    // La riga col numero interrompe la prosa: prima ce ne sono tre, dopo tre. Resta tutto.
    expect(togliProsaDiPagina(testo)).toContain("fino a 12 creature");
    expect(togliProsaDiPagina(testo)).toContain("0BLEX");
  });

  // Righe vere che la prima versione della regola scambiava per glifi (viste in anteprima, prima
  // di applicare qualunque cosa): parentesi, trattini, parole corte, lettere staccate dall'OCR.
  it("non scambia per rumore le righe di regole lette male", () => {
    const buone = [
      "difficili, compresi i soffitti (lungo i quali si muove a testa in giù),",
      "planare (solo se stesso)",
      "(solo se stesso)",
      "è rinchiusa in questo modo, la creatura è trattenuta",
      "e i l bersagl io è incapacitato e perde i l controllo",
      "se lo supera, l 'effetto svanisce.",
      "taglienti...",
      "di sé.",
      "da lui.",
      "del couatl}.",
    ];
    for (const riga of buone) {
      const testo = righe("Morso. Colpo: 6 (1d6 + 3) danni perforanti.", riga, "Artiglio. Colpo: 4 (1d4 + 2) danni.");
      expect(togliProsaDiPagina(testo)).toBe(testo);
    }
  });

  it("riconosce come rumore i resti di fregi e illustrazioni", () => {
    const glifi = ["i>", "•?", "™?", "d#", "- - -", "c:===============================:::J", "Nuo'lo Cotro, nvo'I) (),'l'l)IJCu=! L(), rtil'I(), vo!C()"];
    for (const riga of glifi) {
      const testo = righe("Morso. Colpo: 6 (1d6 + 3) danni perforanti.", riga, "Artiglio. Colpo: 4 (1d4 + 2) danni.");
      expect(togliProsaDiPagina(testo)).toBe(
        righe("Morso. Colpo: 6 (1d6 + 3) danni perforanti.", "Artiglio. Colpo: 4 (1d4 + 2) danni."),
      );
    }
  });

  it("lascia al suo posto il riquadro di una variante", () => {
    const testo = righe(
      "Morso. Colpo: 6 (1d6 + 3) danni perforanti.",
      "VARIANTE: FAMIGLIO QUASIT",
      ...PROSA,
      "Famiglio. Il quasit può servire un altro essere come famiglio.",
    );
    expect(togliProsaDiPagina(testo)).toBe(testo);
  });

  // Le schede trascritte a mano: paragrafi lunghi separati da una riga vuota, senza stacchi.
  it("lascia intatta una scheda trascritta a mano", () => {
    const testo = [
      "Anfibio. Il drago può respirare in aria e in acqua.",
      "Resistenza Leggendaria (3/Giorno). Se il drago fallisce un tiro salvezza, può scegliere invece di superarlo.",
      "Imperscrutabile. La sfinge è immune a qualsiasi effetto che tenti di percepire le emozioni o leggere i pensieri.",
    ].join("\n\n");
    expect(togliProsaDiPagina(testo)).toBe(testo);
  });
});
