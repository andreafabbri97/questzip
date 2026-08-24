"use client";

/**
 * Riduce una foto prima di mandarla al server. Serve perché una foto scattata col telefono pesa
 * tipicamente 2-6 MB, mentre una Server Action di Next.js accetta di default 1 MB di corpo e
 * Vercel si ferma comunque intorno ai 4,5 MB: senza questo passaggio l'import IA falliva SEMPRE,
 * e l'errore arrivava dal trasporto — l'IA non veniva nemmeno interpellata.
 *
 * 1600px sul lato lungo e qualità 0,72 sono abbondanti perché un modello legga il testo di una
 * scheda (di solito 200-400 KB a pagina), e permettono di mandare più pagine insieme restando
 * sotto i limiti. I PDF NON passano di qui: Gemini li legge nativamente e rasterizzarli in canvas
 * richiederebbe una libreria di rendering PDF in più.
 */
const LATO_MAX = 1600;
const QUALITA = 0.72;

export async function riduciImmagine(file: File): Promise<{ bytes: ArrayBuffer; mimeType: string }> {
  if (!file.type.startsWith("image/")) {
    return { bytes: await file.arrayBuffer(), mimeType: file.type || "application/pdf" };
  }

  const bitmap = await createImageBitmap(file).catch(() => null);
  // Se il browser non sa decodificare l'immagine si manda l'originale: meglio un tentativo che
  // pesa troppo (con un errore chiaro) che un fallimento silenzioso qui.
  if (!bitmap) return { bytes: await file.arrayBuffer(), mimeType: file.type };

  const scala = Math.min(1, LATO_MAX / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scala));
  const h = Math.max(1, Math.round(bitmap.height * scala));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { bytes: await file.arrayBuffer(), mimeType: file.type };
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITA),
  );
  if (!blob) return { bytes: await file.arrayBuffer(), mimeType: file.type };
  return { bytes: await blob.arrayBuffer(), mimeType: "image/jpeg" };
}

/** Somma dei byte di più allegati — usata per avvisare PRIMA di inviare, invece di lasciare che
 * sia il trasporto a fallire con un errore incomprensibile. */
export function pesoTotale(allegati: { bytes: ArrayBuffer }[]): number {
  return allegati.reduce((somma, a) => somma + a.bytes.byteLength, 0);
}
