"""Controlla una scheda personaggio esportata in PDF: testi sovrapposti e testi fuori pagina.

Un PDF generato si rompe in silenzio. Aggiungendo due riquadri alla prima pagina, il blocco dei
punti ferita ci e' finito sopra e il file restava valido: nessun test lo avrebbe visto, perche' il
testo dentro un PDF e' compresso e non si puo' cercare come stringa. Qui le pagine si leggono
davvero, con le coordinate di ogni pezzo di testo.

Uso:
  python scripts/verifica-scheda-pdf.py <file.pdf> [--immagini <cartella>]

Con --immagini salva anche un PNG per pagina, per guardarla quando i numeri non bastano.
"""

import itertools
import os
import sys

from collections import Counter

import fitz

# Sotto questa frazione dell'area piu' piccola due testi si toccano soltanto (accenti, apici):
# sopra, uno copre l'altro e sulla carta diventa illeggibile.
SOGLIA_SOVRAPPOSIZIONE = 0.35


def testi_con_posizione(pagina):
    trovati = []
    for blocco in pagina.get_text("dict")["blocks"]:
        for riga in blocco.get("lines", []):
            for pezzo in riga.get("spans", []):
                testo = pezzo["text"].strip()
                if testo:
                    trovati.append((fitz.Rect(pezzo["bbox"]), testo))
    return trovati


def controlla(percorso, cartella_immagini=None):
    documento = fitz.open(percorso)
    problemi = 0

    for numero, pagina in enumerate(documento, start=1):
        testi = testi_con_posizione(pagina)
        sovrapposti = []
        for (rett1, testo1), (rett2, testo2) in itertools.combinations(testi, 2):
            comune = rett1 & rett2
            if comune.is_empty:
                continue
            minima = min(rett1.get_area(), rett2.get_area())
            if minima > 0 and comune.get_area() > SOGLIA_SOVRAPPOSIZIONE * minima:
                sovrapposti.append((testo1, testo2))

        fuori = [t for r, t in testi if not fitz.Rect(pagina.rect).contains(r)]

        # Anche i riquadri e le linee: l'errore che ha fatto nascere questo script era un blocco
        # disegnato sopra un altro, non un testo fuori posto.
        margine = fitz.Rect(pagina.rect)
        disegni_fuori = [
            d for d in pagina.get_drawings()
            if not margine.contains(fitz.Rect(d["rect"]))
        ]

        print(
            f"pagina {numero}: {len(testi)} testi, {len(sovrapposti)} sovrapposti, "
            f"{len(fuori)} fuori pagina, {len(disegni_fuori)} riquadri fuori pagina"
        )
        for testo1, testo2 in sovrapposti[:10]:
            print(f"    sovrapposti: {testo1!r} <-> {testo2!r}")
        for testo in fuori[:10]:
            print(f"    fuori pagina: {testo!r}")
        # Colonne storte: due allineamenti a 1-3 punti di distanza non sono due colonne, sono
        # una colonna sbagliata. A occhio si vedono subito, nei numeri no — finche' non si
        # contano. Cosi' sono stati trovati tiri salvezza e abilita' sfalsati di un punto, e i
        # testi dentro i riquadri rientrati di due rispetto al resto della colonna.
        partenze = Counter(round(r.x0) for r, _ in testi)
        usate = sorted(partenze)
        storte = [
            (a, b)
            for a, b in zip(usate, usate[1:])
            if 0 < b - a <= 3 and partenze[a] >= 4 and partenze[b] >= 4
        ]
        for a, b in storte:
            print(f"    colonne disallineate: x={a} e x={b}")

        problemi += len(sovrapposti) + len(fuori) + len(disegni_fuori) + len(storte)

        if cartella_immagini:
            os.makedirs(cartella_immagini, exist_ok=True)
            immagine = os.path.join(cartella_immagini, f"scheda-p{numero}.png")
            pagina.get_pixmap(matrix=fitz.Matrix(1.6, 1.6)).save(immagine)
            print(f"    immagine: {immagine}")

    print("\nnessun problema di impaginazione" if problemi == 0 else f"\n{problemi} problemi da guardare")
    return 0 if problemi == 0 else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    cartella = None
    if "--immagini" in sys.argv:
        indice = sys.argv.index("--immagini")
        cartella = sys.argv[indice + 1] if len(sys.argv) > indice + 1 else "."
    sys.exit(controlla(sys.argv[1], cartella))
