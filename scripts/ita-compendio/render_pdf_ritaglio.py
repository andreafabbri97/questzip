"""Rende un RITAGLIO di pagina di un manuale PDF attorno a un testo, ad alto ingrandimento.

Per verificare un numero o leggere una scheda piccola costa molto meno della pagina intera
(render_pdf_page.py), e a questo ingrandimento una cifra non si confonde.

Uso: python render_pdf_ritaglio.py <chiave_libro> <pagina0based> "<testo da cercare>" <out.png>
       [sopra=40] [sotto=40] [sinistra=30] [larghezza=330]
Le misure sono in punti PDF, relative al primo punto in cui il testo compare nella pagina.
"""
import json
import os
import sys

import fitz

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(SCRIPT_DIR)),
    "Manuali DND 5E giocatore e DM",
    "Manuali campagna",
)


def main():
    if len(sys.argv) < 5:
        print(__doc__)
        sys.exit(1)
    libro, pagina, ago, out = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
    sopra, sotto, sinistra, larghezza = [float(x) for x in (sys.argv[5:9] + ["40", "40", "30", "330"][len(sys.argv) - 5:])]

    with open(os.path.join(SCRIPT_DIR, "books.json"), encoding="utf-8") as f:
        books = json.load(f)
    doc = fitz.open(os.path.join(PDF_ROOT, books[libro]["file"]))
    page = doc[pagina]
    trovati = page.search_for(ago)
    if not trovati:
        print(f"testo non trovato a pagina {pagina}: {ago!r}")
        sys.exit(2)
    r = trovati[0]
    clip = fitz.Rect(
        max(0, r.x0 - sinistra),
        max(0, r.y0 - sopra),
        min(page.rect.width, r.x0 - sinistra + larghezza),
        min(page.rect.height, r.y1 + sotto),
    )
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=clip).save(out)
    print(out, f"({len(trovati)} occorrenze, pagina {page.rect.width:.0f}x{page.rect.height:.0f} pt)")


if __name__ == "__main__":
    main()
