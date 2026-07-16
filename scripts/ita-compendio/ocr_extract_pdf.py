"""Estrae il testo, pagina per pagina, da un PDF scansionato (senza text layer) via OCR.
Uso per i manuali di sole regole/lore generali che non hanno un text layer estraibile con
PyMuPDF (extract_pdf.py): "Regole principali" e "Guida agli Avventurieri della Costa della
Spada". Richiede `pip install easyocr` (usa il modello italiano).

Uso: python ocr_extract_pdf.py <chiave_libro> [pagina_inizio] [pagina_fine]
"""
import json
import os
import sys

import fitz
import easyocr

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(SCRIPT_DIR)),
    "Manuali DND 5E giocatore e DM",
    "Manuali campagna",
)
OUT_DIR = os.path.join(SCRIPT_DIR, "extracted")

BOOKS = {
    "regole_base": "1. Regole principali.pdf",
    "costa_spada": "Guida_agli_Avventurieri_della_Costa_della_Spada.pdf",
    "oggetti_magici": "Oggetti Magici (Dm e Book of many things).pdf",
}

# Lingua del modello OCR per libro (default italiano). "oggetti_magici" è un file misto: le
# pagine 0-7 sono l'estratto inglese del Book of Many Things (già estratte col modello inglese,
# non ritoccare), le pagine 8+ sono il vero catalogo "OGGETTI MAGICI A-Z" in italiano.
LANGUAGES = {}


def main():
    if len(sys.argv) < 2:
        print("Uso: python ocr_extract_pdf.py <chiave_libro> [pagina_inizio] [pagina_fine]")
        sys.exit(1)

    key = sys.argv[1]
    if key not in BOOKS:
        print(f"Chiave sconosciuta: {key}. Disponibili: {', '.join(BOOKS)}")
        sys.exit(1)

    pdf_path = os.path.join(PDF_ROOT, BOOKS[key])
    if not os.path.exists(pdf_path):
        print(f"PDF non trovato: {pdf_path}")
        sys.exit(1)

    doc = fitz.open(pdf_path)
    start = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    end = int(sys.argv[3]) if len(sys.argv) > 3 else doc.page_count

    out_path = os.path.join(OUT_DIR, f"{key}.json")
    os.makedirs(OUT_DIR, exist_ok=True)
    if os.path.exists(out_path):
        with open(out_path, encoding="utf-8") as f:
            existing = json.load(f)
        pages = {p["page"]: p["text"] for p in existing["pages"]}
    else:
        pages = {}

    reader = easyocr.Reader(LANGUAGES.get(key, ["it"]), gpu=False)
    for i in range(start, end):
        pix = doc[i].get_pixmap(dpi=200)
        img_path = os.path.join(SCRIPT_DIR, "_ocr_tmp.png")
        pix.save(img_path)
        result = reader.readtext(img_path, detail=0, paragraph=True)
        pages[i] = "\n".join(result)
        print(f"{key} pagina {i + 1}/{doc.page_count}: {len(pages[i])} caratteri")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(
                {"key": key, "nome": key, "pages": [{"page": p, "text": pages[p]} for p in sorted(pages)]},
                f,
                ensure_ascii=False,
            )
    os.remove(os.path.join(SCRIPT_DIR, "_ocr_tmp.png"))
    print(f"-> {out_path}")


if __name__ == "__main__":
    main()
