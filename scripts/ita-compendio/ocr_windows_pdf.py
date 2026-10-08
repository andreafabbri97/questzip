"""Legge le pagine di un manuale con l'OCR di Windows e ne salva le righe CON la loro posizione.

È il secondo lettore del progetto, dopo easyocr (ocr_extract_pdf.py), e serve dove il primo non
basta:
- le scansioni (la Guida della Costa della Spada): legge molto meglio, e soprattutto restituisce
  il riquadro di ogni parola, da cui si ricostruiscono colonne, capoversi e titoli
  (lib/ordine-di-lettura.ts). easyocr dava un testo già impastato, senza struttura;
- i PDF digitali col font offuscato (il Manuale del Dungeon Master): lo strato di testo è
  inservibile, ma la pagina resa in immagine è nitida e si legge quasi senza errori.

Non richiede installazioni: usa il riconoscimento dei caratteri incluso in Windows 10/11
(ocr-windows.ps1), che deve avere il pacchetto della lingua italiana.

Di ogni parola salva anche il colore della carta che ha attorno (`f`: rosso, verde, blu). Serve a
distinguere, senza leggere niente, il testo dalle etichette di una cartina (fondo colorato) e dai
riquadri di approfondimento (fondo appena tinto): vedi sfondoDi in lib/ordine-di-lettura.ts.

Uso: python ocr_windows_pdf.py <chiave_libro> [pagina_inizio] [pagina_fine] [--dpi 300] [--lingua it-IT]
     Le pagine si contano da zero, estremi compresi. Scrive extracted/<chiave>-windows.json
     (le pagine già lette restano: si può rilanciare su un altro intervallo).
     Con --sfondo non rilegge niente: aggiunge il colore di fondo alle pagine già lette.
"""
import json
import os
import subprocess
import sys
import tempfile

import fitz
import numpy as np

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_ROOT = os.path.join(os.path.dirname(os.path.dirname(SCRIPT_DIR)), "Manuali DND 5E giocatore e DM", "Manuali campagna")
OUT_DIR = os.path.join(SCRIPT_DIR, "extracted")
# I libri che non stanno in books.json perché non hanno uno strato di testo da cui partire.
SOLO_OCR = {
    "regole_base": "1. Regole principali.pdf",
    "costa_spada": "Guida_agli_Avventurieri_della_Costa_della_Spada.pdf",
    "oggetti_magici": "Oggetti Magici (Dm e Book of many things).pdf",
}
PAGINE_PER_VOLTA = 16
# Per il fondo e i pallini degli elenchi basta mezza risoluzione: non si leggono lettere.
DPI_SFONDO = 150


def percorso_pdf(chiave):
    with open(os.path.join(SCRIPT_DIR, "books.json"), encoding="utf-8") as f:
        libri = json.load(f)
    file = libri[chiave]["file"] if chiave in libri else SOLO_OCR.get(chiave)
    if not file:
        sys.exit(f"Libro sconosciuto: {chiave}")
    return os.path.join(PDF_ROOT, file)


def opzione(nome, predefinito):
    return sys.argv[sys.argv.index(nome) + 1] if nome in sys.argv else predefinito


def ha_un_punto_elenco(immagine, parola, k):
    """Vero se subito a sinistra della parola c'è il pallino di un elenco puntato.

    L'OCR ne vede la metà (è un segno di dieci punti in mezzo al bianco), e senza pallini le voci
    di un elenco non si distinguono dalle loro righe di seguito, che cominciano alla stessa
    altezza. Qui lo si cerca nell'immagine: una macchia scura piccola e compatta, staccata dalla
    parola e da ciò che sta più a sinistra. Una lettera della parola prima tocca il bordo della
    zona guardata, una lineetta è troppo larga.
    """
    h = parola["h"]
    alto, basso = int((parola["y"] + h * 0.15) * k), int((parola["y"] + h * 0.9) * k) + 1
    sinistra, destra = int((parola["x"] - h * 1.7) * k), int((parola["x"] - h * 0.3) * k)
    if sinistra < 0 or destra - sinistra < 4 or basso - alto < 3:
        return False
    scuri = immagine[alto:basso, sinistra:destra].sum(axis=2) < 3 * 130
    if not scuri.any():
        return False
    colonne = np.flatnonzero(scuri.any(axis=0))
    righe = np.flatnonzero(scuri.any(axis=1))
    larga, alta = colonne[-1] - colonne[0] + 1, righe[-1] - righe[0] + 1
    lato = h * k
    tocca_i_bordi = colonne[0] == 0 or colonne[-1] == scuri.shape[1] - 1
    compatta = lato * 0.15 <= larga <= lato * 0.6 and lato * 0.15 <= alta <= lato * 0.6 and 0.6 <= larga / alta <= 1.7
    piena = scuri.sum() >= larga * alta * 0.5
    return bool(not tocca_i_bordi and compatta and piena)


def aggiungi_sfondo(doc, indice, pagina, dpi):
    """Mette in ogni parola della pagina ciò che il testo letto non dice e l'immagine sì.

    - `f`, il colore della carta attorno: il riquadro della parola si allarga un poco e se ne
      prendono i punti più chiari. L'inchiostro è scuro, quindi ciò che resta è il fondo; la
      mediana lo rende insensibile a una macchia.
    - `p`: 1 se a sinistra ha il pallino di un elenco puntato (vedi ha_un_punto_elenco).
    """
    pm = doc[indice].get_pixmap(dpi=DPI_SFONDO)
    immagine = np.frombuffer(pm.samples, dtype=np.uint8).reshape(pm.height, pm.width, pm.n)[:, :, :3].astype(int)
    k = DPI_SFONDO / dpi
    for riga in pagina["righe"]:
        for parola in riga["parole"]:
            parola.pop("p", None)
            margine = parola["h"] * 0.4
            alto = max(int((parola["y"] - margine) * k), 0)
            basso = int((parola["y"] + parola["h"] + margine) * k) + 1
            sinistra = max(int((parola["x"] - margine) * k), 0)
            destra = int((parola["x"] + parola["w"] + margine) * k) + 1
            punti = immagine[alto:basso, sinistra:destra].reshape(-1, 3)
            if len(punti) == 0:
                continue
            luce = punti.sum(axis=1)
            chiari = punti[luce >= np.percentile(luce, 60)]
            parola["f"] = [int(v) for v in np.median(chiari, axis=0)]
            if ha_un_punto_elenco(immagine, parola, k):
                parola["p"] = 1


def main():
    # Solo --dpi e --lingua vogliono un valore dopo di sé: «--sfondo 8 158» sono un'opzione e due pagine.
    con_valore = ("--dpi", "--lingua")
    posizionali = [a for i, a in enumerate(sys.argv[1:], 1) if not a.startswith("--") and sys.argv[i - 1] not in con_valore]
    if not posizionali:
        sys.exit(__doc__)
    chiave = posizionali[0]
    dpi = int(opzione("--dpi", "300"))
    lingua = opzione("--lingua", "it-IT")
    doc = fitz.open(percorso_pdf(chiave))
    inizio = int(posizionali[1]) if len(posizionali) > 1 else 0
    fine = min(int(posizionali[2]) if len(posizionali) > 2 else len(doc) - 1, len(doc) - 1)

    os.makedirs(OUT_DIR, exist_ok=True)
    uscita = os.path.join(OUT_DIR, f"{chiave}-windows.json")
    dati = {"dpi": dpi, "pagine": {}}
    if os.path.exists(uscita):
        with open(uscita, encoding="utf-8") as f:
            dati = json.load(f)
        if dati.get("dpi") != dpi:
            sys.exit(f"{uscita} è stato letto a {dati.get('dpi')} dpi: cancellarlo per rileggere a {dpi}")

    if "--sfondo" in sys.argv:
        fatte = [i for i in range(inizio, fine + 1) if str(i) in dati["pagine"]]
        for i in fatte:
            aggiungi_sfondo(doc, i, dati["pagine"][str(i)], dpi)
        with open(uscita, "w", encoding="utf-8") as f:
            json.dump(dati, f, ensure_ascii=False)
        print(f"colore di fondo aggiunto a {len(fatte)} pagine di {uscita}")
        return

    pagine = list(range(inizio, fine + 1))
    for k in range(0, len(pagine), PAGINE_PER_VOLTA):
        gruppo = pagine[k : k + PAGINE_PER_VOLTA]
        # Le immagini pesano (una scansione a 300 dpi sono 10 MB): un gruppo per volta, poi via.
        with tempfile.TemporaryDirectory() as cartella:
            immagini = []
            for i in gruppo:
                percorso = os.path.join(cartella, f"p{i:03d}.png")
                doc[i].get_pixmap(dpi=dpi).save(percorso)
                immagini.append(percorso)
            elenco = os.path.join(cartella, "elenco.txt")
            with open(elenco, "w", encoding="utf-8") as f:
                f.write("\n".join(immagini))
            subprocess.run(
                ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", os.path.join(SCRIPT_DIR, "ocr-windows.ps1"), elenco, lingua],
                check=True,
                stdout=subprocess.DEVNULL,
            )
            for i, percorso in zip(gruppo, immagini):
                with open(percorso + ".ocr.json", encoding="utf-8-sig") as f:
                    dati["pagine"][str(i)] = json.load(f)
                aggiungi_sfondo(doc, i, dati["pagine"][str(i)], dpi)
        with open(uscita, "w", encoding="utf-8") as f:
            json.dump(dati, f, ensure_ascii=False)
        print(f"pagine {gruppo[0]}-{gruppo[-1]} lette", flush=True)
    print(f"{len(dati['pagine'])} pagine in {uscita}")


if __name__ == "__main__":
    main()
