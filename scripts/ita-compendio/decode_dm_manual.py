"""Decodifica il testo del Manuale del Dungeon Master, il cui font è offuscato (~2000
sotto-insiemi di font distinti, ciascuno con una propria rinumerazione interna dei glifi,
nessuna mappa ToUnicode — vedi lo studio in scripts/ita-compendio/README più sotto).

Idea chiave (diversa dal tentativo di OCR-per-singolo-glifo ipotizzato inizialmente): non serve
isolare ogni glifo. La pagina RENDERIZZATA è perfettamente leggibile a occhio (e da un OCR)
perché il font sbagliato ha comunque la forma grafica giusta — è solo il codice/CID associato a
ogni glifo che è "rimescolato" per quel sotto-insieme. Quindi:

  1. Per ogni pagina: OCR dell'immagine renderizzata (testo VERO, posizione approssimativa) +
     estrazione geometrica di PyMuPDF (testo SBAGLIATO ma posizione ESATTA, carattere per
     carattere, raggruppato per sotto-insieme di font).
  2. Si allineano le due liste per posizione (stessa riga, stessa parola, stessa lunghezza in
     caratteri) per costruire, sotto-insieme per sotto-insieme, una tabella "codice sbagliato →
     lettera vera" (una "stele di Rosetta" per ogni font).
  3. Ogni codice viene visto più volte nelle pagine dove compare quel sotto-insieme: si tiene il
     voto di maggioranza, scartando i codici visti troppo poche volte o con voti troppo divisi
     (rumore OCR).
  4. Fase finale: si rilegge tutto il libro sostituendo ogni carattere con la lettera vera
     risolta per il suo sotto-insieme; dove manca una risoluzione affidabile si lascia un
     segnaposto "¿" (mai una lettera indovinata a caso).

Uso:
  python decode_dm_manual.py align [pagina_inizio] [pagina_fine]   # costruisce/aggiorna la mappa
  python decode_dm_manual.py decode                                # applica la mappa a tutto il libro
"""
import json
import os
import sys
from collections import Counter, defaultdict

import fitz
import easyocr

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PDF = (
    r"C:\Users\andre\Desktop\questzip\Manuali DND 5E giocatore e DM\Manuali campagna"
    r"\Manuali DM\D&D 5e - Manuale del Dungeon Master.pdf"
)
OUT_DIR = os.path.join(SCRIPT_DIR, "extracted")
MAP_PATH = os.path.join(OUT_DIR, "dm-manuale-mappa.json")
DECODED_PATH = os.path.join(OUT_DIR, "dm-manuale.json")


def pymupdf_words(page):
    """Parole ricostruite dai singoli caratteri (rawdict), raggruppate per sotto-insieme di
    font: [(font, y, x0, [(x, char), ...]), ...]. Una "parola" qui è una sequenza di caratteri
    dello stesso font senza spazi/gap ampi fra loro — non ha bisogno di sapere cosa significano
    per essere ricostruita, solo la geometria."""
    d = page.get_text("rawdict")
    chars = []
    for block in d["blocks"]:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                font = span.get("font", "")
                for c in span.get("chars", []):
                    ch = c.get("c", "")
                    bbox = c.get("bbox")
                    if not ch or ch.isspace() or not bbox:
                        continue
                    chars.append((font, bbox[1], bbox[0], bbox[2], ch))
    chars.sort(key=lambda c: (round(c[1] / 3), c[2]))

    words = []
    current = None
    for font, y, x0, x1, ch in chars:
        if (
            current is not None
            and current[0] == font
            and abs(current[1] - y) < 4
            and x0 - current[4] < 6
        ):
            current[3].append((x0, ch))
            current[4] = x1
        else:
            if current:
                words.append((current[0], current[1], current[2], current[3]))
            current = [font, y, x0, [(x0, ch)], x1]
    if current:
        words.append((current[0], current[1], current[2], current[3]))
    return words


def ocr_words(reader, img_path):
    """Parole vere lette dall'OCR sull'immagine della pagina: [(y, x0, text), ...]."""
    result = reader.readtext(img_path, detail=1, paragraph=False)
    out = []
    for bbox, text, conf in result:
        if conf < 0.3:
            continue
        xs = [p[0] for p in bbox]
        ys = [p[1] for p in bbox]
        for word in text.split():
            out.append((min(ys), min(xs), word))
    return out


def align_page(page, reader, votes):
    pix = page.get_pixmap(dpi=200)
    img_path = os.path.join(SCRIPT_DIR, "_dm_tmp.png")
    pix.save(img_path)
    # scala: rawdict è in punti PDF (72dpi), il pixmap è a 200dpi
    scale = 200 / 72

    wrong_words = pymupdf_words(page)
    real_words = ocr_words(reader, img_path)

    used_real = [False] * len(real_words)
    for font, y, x0, cells in wrong_words:
        py, px = y * scale, x0 * scale
        best_idx, best_dist = None, 40
        for i, (ry, rx, rtext) in enumerate(real_words):
            if used_real[i] or len(rtext) != len(cells):
                continue
            dist = abs(ry - py) + abs(rx - px)
            if dist < best_dist:
                best_idx, best_dist = i, dist
        if best_idx is None:
            continue
        used_real[best_idx] = True
        _, _, rtext = real_words[best_idx]
        for (_, wrong_char), real_char in zip(cells, rtext):
            votes[font][wrong_char][real_char] += 1


def cmd_align(start, end):
    doc = fitz.open(PDF)
    end = min(end, doc.page_count)
    votes = defaultdict(lambda: defaultdict(Counter))
    if os.path.exists(MAP_PATH):
        with open(MAP_PATH, encoding="utf-8") as f:
            saved = json.load(f)
        for font, chars in saved.get("votes", {}).items():
            for wrong_char, counts in chars.items():
                votes[font][wrong_char] = Counter(counts)
        # riprende da dove si era fermata l'ultima esecuzione, invece di rifare pagine già viste
        start = max(start, saved.get("last_page", -1) + 1)

    reader = easyocr.Reader(["it"], gpu=False)
    for i in range(start, end):
        align_page(doc[i], reader, votes)
        resolved = sum(1 for chars in votes.values() for c in chars if sum(chars[c].values()) >= 2)
        print(f"pagina {i + 1}/{doc.page_count}: {len(votes)} font, {resolved} codici risolti finora")
        with open(MAP_PATH, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "last_page": i,
                    "votes": {font: {c: dict(counts) for c, counts in chars.items()} for font, chars in votes.items()},
                },
                f,
                ensure_ascii=False,
            )
    if os.path.exists(os.path.join(SCRIPT_DIR, "_dm_tmp.png")):
        os.remove(os.path.join(SCRIPT_DIR, "_dm_tmp.png"))
    print(f"-> {MAP_PATH}")


def resolve_mapping():
    with open(MAP_PATH, encoding="utf-8") as f:
        saved = json.load(f)
    mapping = {}
    for font, chars in saved["votes"].items():
        mapping[font] = {}
        for wrong_char, counts in chars.items():
            total = sum(counts.values())
            best_char, best_votes = max(counts.items(), key=lambda kv: kv[1])
            if total >= 2 and best_votes / total >= 0.6:
                mapping[font][wrong_char] = best_char
    return mapping


def cmd_decode():
    mapping = resolve_mapping()
    doc = fitz.open(PDF)
    pages = []
    for i in range(doc.page_count):
        d = doc[i].get_text("rawdict")
        out = []
        for block in d["blocks"]:
            for line in block.get("lines", []):
                line_text = []
                for span in line.get("spans", []):
                    font = span.get("font", "")
                    font_map = mapping.get(font, {})
                    for c in span.get("chars", []):
                        ch = c.get("c", "")
                        line_text.append(ch if ch.isspace() else font_map.get(ch, "¿"))
                out.append("".join(line_text))
        pages.append({"page": i, "text": "\n".join(out)})
        if (i + 1) % 20 == 0:
            print(f"decodificata pagina {i + 1}/{doc.page_count}")

    with open(DECODED_PATH, "w", encoding="utf-8") as f:
        json.dump({"key": "dm_manuale", "nome": "Manuale del Dungeon Master", "pages": pages}, f, ensure_ascii=False)
    print(f"-> {DECODED_PATH}")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("align", "decode"):
        print(__doc__)
        sys.exit(1)
    if sys.argv[1] == "align":
        start = int(sys.argv[2]) if len(sys.argv) > 2 else 0
        end = int(sys.argv[3]) if len(sys.argv) > 3 else start + 10
        cmd_align(start, end)
    else:
        cmd_decode()
