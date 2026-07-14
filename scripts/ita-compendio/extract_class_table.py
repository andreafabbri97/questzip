"""Estrae la tabella di progressione livelli di tutte le classi usando le coordinate
geometriche dei caratteri nella pagina (non il testo lineare, dove le celle escono in ordine
sparso e irrecuperabile). Per ogni classe produce: livello -> {bonusCompetenza, privilegi[]}.
Le colonne extra specifiche di classe (slot incantesimo, punti ki, ecc.) sono scartate: si
tiene solo la parte comune a tutte le classi (livello, bonus competenza, nomi dei privilegi).

La larghezza della colonna "Privilegi" varia da classe a classe (le classi incantatrici hanno
colonne extra a destra per gli slot incantesimo, che spingono via la larghezza disponibile):
si individua dinamicamente cercando la posizione X dell'intestazione "Privilegi" e della
colonna successiva (se c'è), invece di un taglio fisso uguale per tutte le pagine.

Uso: python extract_class_table.py
"""
import json
import os
import re

import fitz

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PDF = r"C:\Users\andre\Desktop\questzip\Manuali DND 5E giocatore e DM\Manuali campagna\1. D&D_5e_Player's_Handbook_Manuale_del_Giocatore_HQ_09_2021.pdf"
OUT_PATH = os.path.join(SCRIPT_DIR, "parsed", "phb-classi-tabelle.json")

CLASS_PAGES = {
    "Barbaro": 47,
    "Bardo": 53,
    "Chierico": 57,
    "Druido": 65,
    "Guerriero": 71,
    "Ladro": 77,
    "Mago": 82,
    "Monaco": 90,
    "Paladino": 96,
    "Ranger": 103,
    "Stregone": 108,
    "Warlock": 114,
}


def normalize_level_token(text):
    cleaned = text.strip().replace(" ", "")
    cleaned = re.sub(r"[^0-9A-Za-z]+$", "", cleaned)
    cleaned = cleaned.replace("l", "1").replace("I", "1").replace("i", "1")
    cleaned = cleaned.replace("O", "0").replace("o", "0").replace("g", "9")
    if cleaned.isdigit():
        n = int(cleaned)
        if 1 <= n <= 20:
            return n
    return None


def all_spans(page, y_max=470):
    d = page.get_text("dict")
    spans = []
    for block in d["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                text = span["text"].strip()
                if text and span["bbox"][1] < y_max:
                    spans.append((span["bbox"][1], span["bbox"][0], text))
    return spans


# NOTA: un tentativo di rilevare dinamicamente la larghezza della colonna "Privilegi" cercando
# l'intestazione è stato provato e scartato — l'allineamento verticale dell'intestazione varia
# troppo da pagina a pagina per essere una tolleranza affidabile, e su alcune classi peggiorava
# il risultato rispetto al taglio fisso. Le classi con colonne extra per gli incantesimi
# (Mago, Stregone, Warlock) e Monaco restano con risultati scarsi: lavoro futuro.
def find_privilegi_column_range(spans):
    return 0, 280


def cluster_rows(spans, tolerance=2.5):
    spans = sorted(spans, key=lambda s: s[0])
    rows = []
    for y, x, text in spans:
        if rows and abs(rows[-1][0] - y) <= tolerance:
            rows[-1][1].append((x, text))
            rows[-1][0] = (rows[-1][0] + y) / 2
        else:
            rows.append([y, [(x, text)]])
    return rows


def build_table(rows, privilegi_left, privilegi_right):
    entries = {}
    current_level = None
    seen_header = False
    seen_level_1 = False
    for y, all_cells in rows:
        all_cells.sort()
        # tiene la cella di livello/bonus (a sinistra della colonna Privilegi) più le celle
        # DENTRO la colonna Privilegi; scarta tutto ciò che sta oltre (colonne extra di classe)
        cells = [(x, t) for x, t in all_cells if x < privilegi_right]
        if len(cells) >= 2 and cells[0][1].strip() == "Livello":
            seen_header = True
            continue
        if len(cells) < 2:
            if current_level is not None and cells:
                entries[current_level]["privilegiRaw"].append(cells[0][1])
            continue
        level = normalize_level_token(cells[0][1])
        implicit_level_1 = level is None and seen_header and not seen_level_1
        if implicit_level_1:
            level = 1
        if level is not None:
            seen_level_1 = True
            current_level = level
            bonus_idx, rest_start = (0, 1) if implicit_level_1 else (1, 2)
            if level not in entries:
                entries[level] = {"bonusCompetenza": cells[bonus_idx][1].strip(), "privilegiRaw": []}
            for _, text in cells[rest_start:]:
                entries[level]["privilegiRaw"].append(text)
        elif current_level is not None:
            for _, text in cells:
                entries[current_level]["privilegiRaw"].append(text)
    return entries


def is_extra_column_token(text):
    t = text.strip()
    if re.match(r"^[+\-]?\d+$", t):
        return True
    if re.match(r"^\(?\d*\s*[Dd]ad[oi]\)?$", t):
        return True
    if t in ("Illimitata", "-", "—", "*", ", .", ", , ."):
        return True
    return False


def clean_privilegi(raw_tokens):
    text_tokens = [t for t in raw_tokens if not is_extra_column_token(t)]
    joined = " ".join(text_tokens)
    names = [n.strip() for n in joined.split(",") if n.strip()]
    # un vero nome di privilegio è sempre una frase breve (2-6 parole); l'ultimo livello (20)
    # della tabella, non avendo una riga successiva che lo delimiti, a volte continua ad
    # accumulare testo narrativo dalla prosa sotto la tabella — lo scartiamo per lunghezza
    return [n for n in names if len(n) <= 45]


def extract_class_table(page_num):
    doc = fitz.open(PDF)
    page = doc[page_num]
    spans = all_spans(page)
    column_range = find_privilegi_column_range(spans)
    if column_range is None:
        return {}
    privilegi_left, privilegi_right = column_range
    rows = cluster_rows(spans)
    table = build_table(rows, privilegi_left, privilegi_right)

    out = {}
    for level in sorted(table.keys()):
        out[str(level)] = {
            "bonusCompetenza": table[level]["bonusCompetenza"],
            "privilegi": clean_privilegi(table[level]["privilegiRaw"]),
        }
    return out


def main():
    result = {}
    for nome, page_num in CLASS_PAGES.items():
        table = extract_class_table(page_num)
        result[nome] = table
        print(f"{nome} (pagina {page_num}): {len(table)}/20 livelli estratti")

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"-> {OUT_PATH}")


if __name__ == "__main__":
    main()
