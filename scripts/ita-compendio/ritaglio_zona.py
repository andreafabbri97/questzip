"""Rende una zona di una pagina indicata in coordinate, o la pagina intera con una griglia sopra.

Serve a scrivere i ritocchi di una lettura fatta con l'OCR di Windows (lettura-windows.mjs), che
ragiona in pixel della pagina a 300 dpi:
- con la griglia si vede dove stanno, in quelle coordinate, una cartina o una tabella;
- con le coordinate si ritaglia la tabella da trascrivere, senza rendere tutta la pagina.

render_pdf_ritaglio.py fa la stessa cosa cercando un testo, ma in una scansione il testo da
cercare non c'è.

Uso: python ritaglio_zona.py <chiave_libro> <pagina> <uscita.png> griglia
     python ritaglio_zona.py <chiave_libro> <pagina> <uscita.png> <x0> <y0> <x1> <y1> [dpi=100]
     La pagina si conta da zero.
"""
import sys

import fitz
from PIL import Image, ImageDraw

from ocr_windows_pdf import percorso_pdf

# Le coordinate dell'OCR sono pixel a 300 dpi, quelle del PDF punti.
PUNTI_PER_PIXEL = 72 / 300
DPI_GRIGLIA = 48
PASSO_GRIGLIA = 400


def griglia(pagina, uscita):
    pm = pagina.get_pixmap(dpi=DPI_GRIGLIA)
    immagine = Image.frombytes("RGB", (pm.width, pm.height), pm.samples)
    disegno = ImageDraw.Draw(immagine)
    k = DPI_GRIGLIA / 300
    for x in range(0, int(pm.width / k), PASSO_GRIGLIA):
        disegno.line([(x * k, 0), (x * k, pm.height)], fill=(255, 0, 0), width=1)
        disegno.text((x * k + 2, 2), str(x), fill=(255, 0, 0))
    for y in range(0, int(pm.height / k), PASSO_GRIGLIA):
        disegno.line([(0, y * k), (pm.width, y * k)], fill=(0, 0, 255), width=1)
        disegno.text((2, y * k + 2), str(y), fill=(0, 0, 255))
    immagine.save(uscita)
    print(f"{uscita}: {pm.width}x{pm.height}, una riga ogni {PASSO_GRIGLIA} pixel della pagina a 300 dpi")


def main():
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    chiave, pagina, uscita = sys.argv[1], int(sys.argv[2]), sys.argv[3]
    doc = fitz.open(percorso_pdf(chiave))
    if sys.argv[4] == "griglia":
        griglia(doc[pagina], uscita)
        return
    if len(sys.argv) < 8:
        sys.exit(__doc__)
    x0, y0, x1, y1 = (float(v) * PUNTI_PER_PIXEL for v in sys.argv[4:8])
    dpi = int(sys.argv[8]) if len(sys.argv) > 8 else 100
    pm = doc[pagina].get_pixmap(dpi=dpi, clip=fitz.Rect(x0, y0, x1, y1))
    pm.save(uscita)
    print(f"{uscita}: {pm.width}x{pm.height}")


if __name__ == "__main__":
    main()
