"""Renderizza pagine specifiche di un manuale PDF come immagini PNG, per farle leggere
direttamente a Claude quando l'estrazione testuale/OCR e' inaffidabile (niente pdftoppm
disponibile in questo ambiente per il tool Read nativo sui PDF).

Uso: python render_pdf_page.py <chiave_libro> <pagina0based>[,<pagina0based>...] [outDir]
Le pagine sono 0-based, stesso indice usato in extracted/<libro>.json (fitz).
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
    if len(sys.argv) < 3:
        print("Uso: python render_pdf_page.py <chiave_libro> <pagina0based>[,<pagina0based>...] [outDir]")
        sys.exit(1)

    key = sys.argv[1]
    page_indices = [int(p) for p in sys.argv[2].split(",")]
    out_dir = sys.argv[3] if len(sys.argv) > 3 else SCRIPT_DIR

    with open(os.path.join(SCRIPT_DIR, "books.json"), encoding="utf-8") as f:
        books = json.load(f)
    if key not in books:
        print(f"Chiave sconosciuta: {key}. Disponibili: {', '.join(books)}")
        sys.exit(1)

    pdf_path = os.path.join(PDF_ROOT, books[key]["file"])
    doc = fitz.open(pdf_path)
    os.makedirs(out_dir, exist_ok=True)

    for idx in page_indices:
        if idx < 0 or idx >= doc.page_count:
            print(f"Pagina {idx} fuori range (0-{doc.page_count - 1})")
            continue
        page = doc[idx]
        pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5))
        out_path = os.path.join(out_dir, f"{key}-p{idx}.png")
        pix.save(out_path)
        print(out_path)


if __name__ == "__main__":
    main()
