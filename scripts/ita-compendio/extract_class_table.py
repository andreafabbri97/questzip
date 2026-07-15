"""Estrae la tabella di progressione livelli di tutte le classi usando le coordinate
geometriche dei caratteri nella pagina (non il testo lineare, dove le celle escono in ordine
sparso e irrecuperabile). Per ogni classe produce: livello -> {bonusCompetenza, privilegi[]}.
Le colonne extra specifiche di classe (slot incantesimo, punti ki, ecc.) sono scartate: si
tiene solo la parte comune a tutte le classi (livello, bonus competenza, nomi dei privilegi).

Scoperta chiave (dopo aver diagnosticato perché Mago/Stregone/Warlock/Monaco davano risultati
quasi vuoti): NON è un problema di larghezza colonna. Per queste 4 classi il numero di livello
spesso non viene proprio estratto come testo dal PDF (verificato a occhio confrontando col
rendering della pagina: "3°", "4°" ecc. sono visivamente presenti ma assenti dal text layer per
molte righe) — probabilmente un sotto-insieme di font senza mappa Unicode per quei glifi
specifici, la stessa famiglia di problema del Manuale del DM ma limitata a poche celle.
Un tentativo precedente di rilevare dinamicamente la larghezza della colonna "Privilegi"
cercando l'intestazione è stato provato e scartato per lo stesso motivo indicato più sotto.

Fix: non ci si affida più al numero di livello. Le righe vengono numerate per ORDINE DI
COMPARSA (la prima riga con un bonus competenza "+N" dopo l'intestazione è il livello 1, la
successiva il livello 2, ecc. — sempre 20 livelli per ogni classe in D&D 5e). Il bonus "+N" è
l'unica cella affidabile su OGNI riga di ogni classe, quindi è l'ancora giusta per contare le
righe. Il resto della riga (senza vincoli di posizione X) viene classificato per CONTENUTO: le
colonne extra di classe (slot incantesimo, punti stregoneria/ki, dadi, movimento, ecc.) sono
sempre numeriche/simboliche brevi, i privilegi sono sempre frasi con parole vere — quindi si
filtra per "sembra un numero/simbolo" invece che per "sta a sinistra di X", il che generalizza
a qualunque classe senza bisogno di conoscere la sua particolare disposizione di colonne.

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


BONUS_RE = re.compile(r"^\+\d{1,2}$")


def estimate_row_spacing(rows, header_idx, fallback=11.6):
    # Alcune classi (Stregone, Warlock) impaginano il testo dei privilegi su una riga fisica
    # leggermente sfalsata rispetto alle colonne numeriche della stessa riga logica — il
    # "salto" fra le due può essere PIÙ PICCOLO dello spazio fra due livelli consecutivi,
    # quindi non si può distinguere "stessa riga, testo spostato" da "riga nuova" guardando
    # solo il gap dall'ultima riga. Si stima invece la spaziatura reale fra livelli dal gap
    # minimo fra righe che contengono un bonus di competenza "+N" (quasi sempre presente),
    # e la si usa come metro per capire quando è iniziata davvero una riga nuova.
    anchor_ys = [
        y for y, cells in rows[header_idx + 1 :] if any(BONUS_RE.match(t.strip()) for _, t in cells)
    ]
    gaps = [b - a for a, b in zip(anchor_ys, anchor_ys[1:]) if b - a > 3]
    return min(gaps) if gaps else fallback


def proficiency_bonus(level):
    # Regola fissa 5e (identica per tutte le classi/edizioni): +2 ai livelli 1-4, +3 al 5-8,
    # ecc. Calcolata invece di estratta dal PDF: la cella "+N" non si estrae in modo affidabile
    # su tutte le righe (scoperto proprio su queste 4 classi: alcune righe ne sono del tutto
    # prive nel text layer), ma la regola stessa è una costante di gioco nota, non un dato da
    # recuperare dal libro.
    return f"+{2 + (level - 1) // 4}"


def find_header_row_index(rows):
    for i, (_, cells) in enumerate(rows):
        if any("Privilegi" in t for _, t in cells):
            return i
    return None


def is_junk_row(cells):
    # riga che non contiene NULLA che assomigli a un dato vero (bonus "+N", una parola vera
    # di almeno 2 lettere consecutive, o un numero pulito): frammenti di rigo decorativo
    # estratti per errore come testo (es. ", ." o "l '", visti fra l'intestazione e la prima
    # riga vera). Anche la riga più spoglia della tabella ("Privilegi" vuoto) ha sempre almeno
    # una colonna numerica vera, quindi questo filtro non scarta mai una riga di dati genuina.
    for _, t in cells:
        s = t.strip()
        if BONUS_RE.match(s) or re.match(r"^\d+$", s) or re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ]{2,}", s):
            return False
    return True


def build_table(rows):
    header_idx = find_header_row_index(rows)
    if header_idx is None:
        return {}
    spacing = estimate_row_spacing(rows, header_idx)
    # Alcune pagine hanno una colonna di testo narrativo affiancata alla tabella (es. Barbaro,
    # dove il riquadro di ambientazione condivide l'intervallo Y delle ultime righe): si
    # individua la larghezza vera della tabella dalle prime righe sicuramente pulite (la prosa
    # non può essere iniziata così presto) e si scarta tutto ciò che sta molto più a destra.
    safe_sample = rows[header_idx : header_idx + 15]
    table_right_edge = max((x for _, cells in safe_sample for x, _ in cells), default=None)
    entries = {}
    level = 0
    level_start_y = rows[header_idx][0]
    prev_y = level_start_y
    for y, raw_cells in rows[header_idx + 1 :]:
        cells = (
            [(x, t) for x, t in raw_cells if x <= table_right_edge + 20]
            if table_right_edge is not None
            else raw_cells
        )
        if not cells or is_junk_row(cells):
            continue
        if level > 0 and (y - prev_y) > spacing * 1.6:
            break
        has_bonus = any(BONUS_RE.match(t.strip()) for _, t in cells)
        # Segnale primario: la cella "+N" del bonus di competenza è quasi sempre presente ed è
        # l'ancora più affidabile per una riga nuova (gestisce sia il caso Barbaro, dove un
        # privilegio lungo va a capo su una seconda riga fisica SENZA bonus — resta
        # correttamente una continuazione — sia il caso Warlock, dove testo e colonne
        # numeriche della stessa riga logica sono su righe fisiche separate).
        # Fallback secondario, solo quando manca anche il bonus (visto succedere su singole
        # righe isolate, es. Stregone livello 5): se siamo arrivati quasi a una riga intera di
        # distanza dall'inizio del livello corrente, è più probabile che sia iniziato un nuovo
        # livello "silenzioso" piuttosto che una continuazione. Margine tenuto molto vicino a
        # 1 (non 0.9): il testo a capo su due righe è più comune del bonus mancante, e il suo
        # rapporto rispetto alla spaziatura può arrivare fino a ~0.93 su alcune classi (visto
        # su Ladro) — un margine più largo lo scambierebbe per un livello nuovo.
        is_new_level = level == 0 or has_bonus or (y - level_start_y) >= spacing * 0.98
        if is_new_level and level < 20:
            level += 1
            entries[level] = {
                "bonusCompetenza": proficiency_bonus(level),
                "privilegiRaw": [t for _, t in sorted(cells)],
            }
            level_start_y = y
        elif level > 0:
            entries[level]["privilegiRaw"].extend(t for _, t in sorted(cells))
        prev_y = y
    return entries


def is_extra_column_token(text):
    t = text.strip()
    if re.match(r"^[+\-]?\d+([,.]\d+)?$", t):
        return True
    if re.match(r"^\(?\d*\s*[Dd]ad[oi]\)?$", t):
        return True
    if re.match(r"^\d+[dD]\d{1,2}$", t):
        return True
    if re.match(r"^\+?\d+([,.]\d+)?\s*m\.?$", t):
        return True
    if re.match(r"^\d{1,2}°$", t):
        return True
    if t in ("Illimitata", "-", "—", "*", ", .", ", , ."):
        return True
    # residui corti privi di due lettere vere consecutive: frammenti di numero di livello
    # non decodificati (es. "i �", "2�") o altro rumore di estrazione, mai un vero
    # nome di privilegio (che è sempre fatto di parole).
    if len(t) <= 4 and not re.search(r"[A-Za-zÀ-ÖØ-öø-ÿ]{2,}", t):
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
    rows = cluster_rows(spans)
    table = build_table(rows)

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
