"use client";

import { useState } from "react";
import Link from "next/link";
import { syncCharacterRemote } from "@/app/actions/character-sync";
import { CharacterSheet } from "@/components/personaggi/character-sheet-core";
import { characterSchema, type Character } from "@/lib/dnd";
import { useLocalCollection } from "@/lib/storage";

/**
 * La propria scheda, APERTA DA DENTRO LA CAMPAGNA.
 *
 * Prima, durante una sessione, per segnare due danni o spendere uno slot bisognava uscire dalla
 * campagna, andare in Personaggi, modificare, e tornare indietro — perdendo di vista combattimento,
 * mappa e chat. Qui si monta esattamente la stessa scheda della pagina Personaggi (stesso
 * componente, stesso localStorage, stesso backup sull'account), solo sopra la campagna: quello che
 * si scrive qui è la stessa identica scheda, non una copia.
 *
 * Nota sull'abbinamento: la riga condivisa con la campagna porta il NOME del personaggio, non il
 * suo id (lo scatto è per utente+campagna). Si cerca quindi per nome, con due ripieghi ragionevoli:
 * se il giocatore ha un solo personaggio è per forza quello, e se non si trova nulla si dice
 * chiaramente che la scheda vive su un altro dispositivo invece di mostrare un riquadro vuoto.
 */
export function MiaSchedaOverlay({
  nomeInCampagna,
  onChiudi,
}: {
  nomeInCampagna: string;
  onChiudi: () => void;
}) {
  const { items, persist, loaded } = useLocalCollection("questzip:personaggi", characterSchema);
  const [sceltoId, setSceltoId] = useState<string | null>(null);

  const perNome = items.filter((c) => c.nome === nomeInCampagna);
  const personaggio =
    items.find((c) => c.id === sceltoId) ??
    (perNome.length === 1 ? perNome[0] : null) ??
    (items.length === 1 ? items[0] : null);

  const salva = (aggiornato: Character) => {
    persist(items.map((c) => (c.id === aggiornato.id ? aggiornato : c)));
    // Stesso backup in background della pagina Personaggi: un errore di rete non deve impedire
    // di continuare a giocare, la copia locale è già salvata.
    syncCharacterRemote(aggiornato).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-background">
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-widest text-muted">
            La tua scheda · aperta dalla campagna
          </p>
          <button
            onClick={onChiudi}
            className="rounded-lg border border-edge px-3 py-1.5 text-xs font-bold text-foreground hover:border-accent"
          >
            ← Torna alla campagna
          </button>
        </div>

        {!loaded ? (
          <p className="text-sm text-muted">Caricamento…</p>
        ) : personaggio ? (
          <CharacterSheet
            character={personaggio}
            onSave={salva}
            onBack={onChiudi}
            onDelete={onChiudi}
            mostraElimina={false}
          />
        ) : items.length === 0 ? (
          <div className="card-elevated rounded-xl border border-edge bg-surface p-5 text-sm text-muted">
            Su questo dispositivo non c&apos;è nessuna scheda salvata. Aprila una volta da{" "}
            <Link href="/personaggi" className="text-accent-strong underline">
              Personaggi
            </Link>{" "}
            e verrà scaricata dal backup sul tuo account.
          </div>
        ) : (
          <div className="card-elevated space-y-2 rounded-xl border border-edge bg-surface p-5">
            <p className="text-sm text-muted">
              Nessuna scheda si chiama «{nomeInCampagna}» su questo dispositivo — forse l&apos;hai
              rinominata. Quale vuoi aprire?
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSceltoId(c.id)}
                  className="rounded-lg border border-edge px-3 py-1.5 text-sm font-bold text-foreground hover:border-accent"
                >
                  {c.nome || "Senza nome"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
