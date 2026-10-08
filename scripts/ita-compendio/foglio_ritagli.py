"""Mette su un foglio solo il ritaglio di ogni buco trovato da parole-saltate.mjs.

Ogni ritaglio è la riga con il buco al centro, numerata come nell'elenco stampato: si guarda il
foglio una volta e si leggono tutte le parole saltate, invece di aprire una pagina per buco.

Uso: python foglio_ritagli.py <chiave_libro> <buchi.json> <uscita.png>
"""
import json
import sys

import fitz
from PIL import Image, ImageDraw

from ocr_windows_pdf import percorso_pdf

# Le coordinate dei buchi sono in pixel a 300 dpi, quelle del PDF in punti.
PUNTI_PER_PIXEL = 72 / 300
# Quanto testo tenere ai due lati del buco, in pixel a 300 dpi.
CONTESTO = 330


def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    chiave, elenco, uscita = sys.argv[1:4]
    with open(elenco, encoding="utf-8") as f:
        buchi = json.load(f)
    if not buchi:
        sys.exit("Nessun buco nell'elenco.")
    doc = fitz.open(percorso_pdf(chiave))
    k = PUNTI_PER_PIXEL
    ritagli = []
    for b in buchi:
        zona = fitz.Rect((b["x0"] - CONTESTO) * k, (b["y"] - 14) * k, (b["x1"] + CONTESTO) * k, (b["y"] + b["h"] + 16) * k)
        pm = doc[b["pagina"]].get_pixmap(dpi=150, clip=zona)
        ritagli.append(Image.frombytes("RGB", (pm.width, pm.height), pm.samples))

    larghezza = max(r.width for r in ritagli) + 40
    altezza = max(r.height for r in ritagli) + 4
    per_colonna = (len(ritagli) + 1) // 2
    foglio = Image.new("RGB", (larghezza * 2, altezza * per_colonna), "white")
    disegno = ImageDraw.Draw(foglio)
    for n, ritaglio in enumerate(ritagli):
        x, y = (n // per_colonna) * larghezza, (n % per_colonna) * altezza
        disegno.text((x + 2, y + 8), str(n), fill="red")
        foglio.paste(ritaglio, (x + 36, y))
    foglio.save(uscita)
    print(f"{len(ritagli)} ritagli in {uscita} ({foglio.width}x{foglio.height})")


if __name__ == "__main__":
    main()
