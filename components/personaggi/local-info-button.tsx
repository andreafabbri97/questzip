"use client";

import { useEffect, useState } from "react";
import { SimpleEntryModal, type SimpleEntryData } from "./simple-entry-modal";

// Stessa euristica di normalizzazione nome usata altrove nel progetto (accenti/punteggiatura
// ignorati) — duplicata invece di importata da mention-search.ts perché lì è privata e la firma
// di questo confronto è leggermente diversa (contro un elenco di candidati locale, non il
// Compendio intero).
function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Come CompendioInfoButton, ma per voci che non sono nel Compendio vero e proprio (privilegi a
 * usi limitati, infusioni) — il chiamante fornisce l'elenco dei candidati tra cui cercare (es.
 * solo le classi/sottoclassi del personaggio, o le infusioni disponibili), la ricerca è comunque
 * per nome esatto normalizzato. Se non trova nulla non mostra alcun bottone.
 */
export function LocalInfoButton({
  nome,
  loadCandidates,
  label = "📖 Verifica",
}: {
  nome: string;
  loadCandidates: () => Promise<SimpleEntryData[]>;
  label?: string;
}) {
  const [match, setMatch] = useState<SimpleEntryData | null>(null);
  const [open, setOpen] = useState(false);

  const trimmed = nome.trim();
  // Stesso pattern di CompendioInfoButton: azzera il match durante il render quando il nome
  // cambia, invece che con un setState sincrono dentro l'effetto sotto.
  const [loadedNome, setLoadedNome] = useState(trimmed);
  if (trimmed !== loadedNome) {
    setLoadedNome(trimmed);
    setMatch(null);
  }

  useEffect(() => {
    if (!trimmed) return;
    let cancelled = false;
    const q = normalize(trimmed);
    loadCandidates().then((candidates) => {
      if (cancelled) return;
      setMatch(candidates.find((c) => normalize(c.title) === q) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [trimmed, loadCandidates]);

  if (!match) return null;

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-xs font-bold text-accent-strong hover:underline">
        {label}
      </button>
      <SimpleEntryModal data={open ? match : null} onClose={() => setOpen(false)} />
    </>
  );
}
