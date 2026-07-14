"""Estrae il testo grezzo, pagina per pagina, da uno dei manuali PDF elencati in books.json.
Uso: python extract_pdf.py <chiave_libro>
Richiede: pip install pymupdf
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
OUT_DIR = os.path.join(SCRIPT_DIR, "extracted")


def main():
    if len(sys.argv) != 2:
        print("Uso: python extract_pdf.py <chiave_libro>")
        sys.exit(1)

    key = sys.argv[1]
    with open(os.path.join(SCRIPT_DIR, "books.json"), encoding="utf-8") as f:
        books = json.load(f)

    if key not in books:
        print(f"Chiave sconosciuta: {key}. Disponibili: {', '.join(books)}")
        sys.exit(1)

    book = books[key]
    pdf_path = os.path.join(PDF_ROOT, book["file"])
    if not os.path.exists(pdf_path):
        print(f"PDF non trovato: {pdf_path}")
        sys.exit(1)

    doc = fitz.open(pdf_path)
    pages = [{"page": i, "text": doc[i].get_text()} for i in range(doc.page_count)]

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, f"{key}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"key": key, "nome": book["nome"], "pages": pages}, f, ensure_ascii=False)

    total_chars = sum(len(p["text"]) for p in pages)
    print(f"{key}: {len(pages)} pagine, {total_chars} caratteri -> {out_path}")


if __name__ == "__main__":
    main()
