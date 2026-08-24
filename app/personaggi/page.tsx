"use client";

import { useEffect, useState } from "react";
import {
  deleteCharacterRemote,
  getMyCharacters,
  syncCharacterRemote,
} from "@/app/actions/character-sync";
import { AiUsageHint } from "@/components/ai-usage-hint";
import { isAiAvailable } from "@/app/actions/ai";
import { importCharacterFromPdfWithAi } from "@/app/actions/character-pdf-ai";
import { pesoTotale, riduciImmagine } from "@/lib/image-downscale";

// Tetto di sicurezza per l'invio all'IA. Il limite vero è doppio: le Server Action di Next.js
// accettano di default 1 MB di corpo (alzato in next.config.ts) e Vercel si ferma comunque
// intorno ai 4,5 MB per richiesta. Meglio dirlo prima con un messaggio chiaro che lasciar
// fallire il trasporto con un errore incomprensibile — che è esattamente com'era prima.
const MAX_INVIO_BYTE = 3.5 * 1024 * 1024;
import { useLocalCollection } from "@/lib/storage";
import { characterSchema, newCharacter, totalLevel, type Character } from "@/lib/dnd";
import { importCharacterFromPdf } from "@/lib/pdf-character-import";
import { CharacterSheet } from "@/components/personaggi/character-sheet-core";
import { formatClassSummary } from "@/components/personaggi/helpers";

function ExportImport({
  characters,
  onImport,
}: {
  characters: Character[];
  onImport: (imported: Character[]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  // Solo per il PDF: a differenza del JSON (istantaneo, poche righe di testo) leggere un PDF di
  // qualche MB richiede un attimo — un pulsante che non dà nessun segnale in quell'intervallo
  // sembrerebbe rotto, specie perché il file picker si chiude subito.
  const [importingPdf, setImportingPdf] = useState(false);
  // Se l'assistente IA non è configurato (nessuna GEMINI_API_KEY sul server) l'opzione "prova
  // con l'IA" non deve nemmeno comparire — controllato una volta all'apertura della pagina.
  const [aiAvailable, setAiAvailable] = useState(false);
  // File non riconosciuto dal parser locale, in attesa di conferma esplicita dell'utente prima
  // di provare a leggerlo con l'IA (il file viene inviato a Google per l'analisi — non un
  // passaggio automatico/silenzioso, sono i dati personali del personaggio di qualcuno).
  const [pendingAiImport, setPendingAiImport] = useState<{ bytes: ArrayBuffer; mimeType: string }[] | null>(
    null,
  );
  const [aiImporting, setAiImporting] = useState(false);

  useEffect(() => {
    isAiAvailable().then(setAiAvailable).catch(() => setAiAvailable(false));
  }, []);

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(characters, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `questzip-personaggi-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    file
      .text()
      .then((text) => {
        const parsed = characterSchema.array().safeParse(JSON.parse(text));
        if (!parsed.success) {
          setError("File non valido: non sembra un export di personaggi QuestZip.");
          return;
        }
        onImport(parsed.data.map((character) => ({ ...character, id: crypto.randomUUID() })));
      })
      .catch(() => setError("Impossibile leggere il file."));
  };

  // Prima via: il template di scheda cartacea compilabile che il gruppo usa davvero (lo stesso
  // file .pdf vuoto condiviso fra tutti gli amici) — vedi lib/pdf-character-import.ts. Istantaneo,
  // gratuito, e più preciso dell'IA per QUESTO template specifico, quindi resta il tentativo
  // predefinito anche ora che esiste un fallback IA per tutto il resto.
  const importPdfFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    // Più file insieme: una scheda fotografata sta quasi sempre su 2-3 pagine, e prima se ne
    // poteva scegliere una sola — le altre non c'era proprio modo di caricarle.
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;
    setError(null);
    setPendingAiImport(null);
    setImportingPdf(true);
    try {
      // Un solo PDF: si tenta prima il parser locale del nostro template, che è istantaneo,
      // gratuito e più preciso dell'IA — e legge davvero le schede del gruppo.
      if (files.length === 1 && files[0].type === "application/pdf") {
        try {
          const character = await importCharacterFromPdf(await files[0].arrayBuffer());
          onImport([character]);
          return;
        } catch (err) {
          if (!aiAvailable) {
            setError(err instanceof Error ? err.message : "Impossibile leggere questo PDF.");
            return;
          }
        }
      }

      if (!aiAvailable) {
        setError("QuestZip non riconosce questo file come una scheda compatibile.");
        return;
      }

      // Le foto vengono rimpicciolite QUI, prima di partire: a piena risoluzione superano il
      // limite di corpo delle Server Action e l'import falliva sempre, senza che l'IA venisse
      // nemmeno interpellata.
      const allegati = await Promise.all(files.map(riduciImmagine));
      const peso = pesoTotale(allegati);
      if (peso > MAX_INVIO_BYTE) {
        setError(
          `I file sono troppo pesanti (${(peso / 1024 / 1024).toFixed(1)} MB in tutto, massimo ${MAX_INVIO_BYTE / 1024 / 1024}). Caricane meno alla volta, oppure usa il PDF invece delle foto.`,
        );
        return;
      }
      setPendingAiImport(allegati);
    } finally {
      setImportingPdf(false);
    }
  };

  // Chiamato solo dopo la conferma esplicita dell'utente (vedi il riquadro sotto) — il file
  // finisce sui server di Google per l'analisi, non deve mai partire in automatico.
  const confirmAiImport = () => {
    if (!pendingAiImport) return;
    setError(null);
    setAiImporting(true);
    importCharacterFromPdfWithAi(pendingAiImport)
      .then((character) => {
        onImport([character]);
        setPendingAiImport(null);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Impossibile leggere questo file con l'IA."),
      )
      .finally(() => setAiImporting(false));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {characters.length > 0 && (
        <button
          onClick={exportAll}
          className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-muted hover:text-foreground hover:border-accent/50 transition-colors"
        >
          ⬇ Esporta tutti (JSON)
        </button>
      )}
      <label className="rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-muted hover:text-foreground hover:border-accent/50 transition-colors cursor-pointer">
        ⬆ Importa
        <input type="file" accept="application/json" onChange={importFile} className="hidden" />
      </label>
      <label
        className={`rounded-lg border border-edge bg-surface-raised px-3 py-1.5 text-muted transition-colors ${
          importingPdf ? "opacity-60" : "hover:text-foreground hover:border-accent/50 cursor-pointer"
        }`}
      >
        {importingPdf ? "Importazione…" : aiAvailable ? "📄 Importa da PDF/foto" : "📄 Importa da PDF"}
        <input
          type="file"
          // Il tipo immagine ha senso solo se l'IA è disponibile: il parser locale legge solo
          // PDF compilabili, una foto passa per forza dal fallback IA.
          accept={aiAvailable ? "application/pdf,image/*" : "application/pdf"}
          multiple={aiAvailable}
          onChange={importPdfFile}
          disabled={importingPdf}
          className="hidden"
        />
      </label>
      {error && <span className="text-xs text-danger">{error}</span>}
      {pendingAiImport && (
        <div className="w-full rounded-lg border border-edge bg-surface-raised p-3 text-xs text-muted space-y-2">
          <p>
            {pendingAiImport.length > 1
              ? `${pendingAiImport.length} pagine da leggere come un'unica scheda.`
              : "Questo file non sembra il nostro template PDF conosciuto."}{" "}
            Vuoi provare a leggerlo con l&apos;assistente IA? Il contenuto verrà inviato a Google
            per l&apos;analisi.
          </p>
          <div className="flex gap-2">
            <button
              onClick={confirmAiImport}
              disabled={aiImporting}
              className="rounded-lg bg-accent text-background font-bold px-3 py-1.5 text-xs hover:bg-accent-strong transition-colors disabled:opacity-60"
            >
              {aiImporting ? "Lettura in corso…" : "Sì, prova con l'IA"}
            </button>
            <button
              onClick={() => setPendingAiImport(null)}
              disabled={aiImporting}
              className="rounded-lg border border-edge px-3 py-1.5 text-xs text-foreground hover:border-accent/50 transition-colors disabled:opacity-60"
            >
              Annulla
            </button>
          </div>
          <AiUsageHint />
        </div>
      )}
    </div>
  );
}

type CloudStatus = "syncing" | "synced" | "error";

export default function CharactersPage() {
  const { items, persist, loaded } = useLocalCollection("questzip:personaggi", characterSchema);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Il localStorage resta la copia "veloce" (scritta solo al salvataggio esplicito dalla scheda,
  // vedi CharacterSheet); questo stato riflette solo il backup in background sull'account — vedi
  // app/actions/character-sync.ts.
  const [cloudStatus, setCloudStatus] = useState<Record<string, CloudStatus>>({});

  const editing = items.find((character) => character.id === editingId) ?? null;

  // Nessun debounce qui (a differenza di una prima versione di questa feature): da quando il
  // salvataggio è diventato un'azione esplicita (bottone "Salva", non più ad ogni tasto) upsert()
  // viene chiamato di rado, quindi si può spingere subito sul server senza rischiare una raffica
  // di richieste di rete durante la digitazione.
  const pushRemote = (character: Character) => {
    setCloudStatus((prev) => ({ ...prev, [character.id]: "syncing" }));
    syncCharacterRemote(character)
      .then(() => setCloudStatus((prev) => ({ ...prev, [character.id]: "synced" })))
      .catch(() => setCloudStatus((prev) => ({ ...prev, [character.id]: "error" })));
  };

  // Riconciliazione col backup cloud, una sola volta all'apertura della pagina (non ad ogni
  // cambio di "items", altrimenti ogni tasto ririchiamerebbe getMyCharacters()): i personaggi
  // presenti solo sul server (creati/modificati da un altro dispositivo) vengono importati in
  // locale, quelli presenti solo in locale vengono spinti sul server, e per chi esiste in
  // entrambi vince la copia con "aggiornatoAl" più recente — proporzionato: un personaggio non è
  // mai modificato da due persone insieme, a differenza di una campagna condivisa.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    getMyCharacters().then((remote) => {
      if (cancelled) return;
      const remoteMap = new Map(remote.map((r) => [r.id, r]));
      const localIds = new Set(items.map((c) => c.id));
      const toPush: Character[] = [];
      let changed = false;

      let merged = items.map((local) => {
        const remoteRow = remoteMap.get(local.id);
        if (!remoteRow) {
          toPush.push(local);
          return local;
        }
        if (local.aggiornatoAl >= remoteRow.aggiornatoAl) {
          if (local.aggiornatoAl > remoteRow.aggiornatoAl) toPush.push(local);
          return local;
        }
        changed = true;
        return remoteRow.dataJson;
      });

      for (const [id, row] of remoteMap) {
        if (!localIds.has(id)) {
          merged = [...merged, row.dataJson];
          changed = true;
        }
      }

      if (changed) persist(merged);
      toPush.forEach(pushRemote);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const upsert = (character: Character) => {
    const stamped = { ...character, aggiornatoAl: Date.now() };
    const exists = items.some((item) => item.id === stamped.id);
    persist(
      exists
        ? items.map((item) => (item.id === stamped.id ? stamped : item))
        : [...items, stamped],
    );
    pushRemote(stamped);
  };

  const remove = (id: string) => {
    persist(items.filter((item) => item.id !== id));
    setEditingId(null);
    deleteCharacterRemote(id).catch(() => {});
  };

  const create = () => {
    const character = newCharacter();
    upsert(character);
    setEditingId(character.id);
  };

  if (!loaded) {
    return <p className="text-muted">Caricamento…</p>;
  }

  if (editing) {
    return (
      <CharacterSheet
        key={editing.id}
        character={editing}
        onSave={upsert}
        onDelete={() => remove(editing.id)}
        onBack={() => setEditingId(null)}
        cloudStatus={cloudStatus[editing.id]}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-2xl lg:max-w-5xl 2xl:max-w-6xl [@media(min-width:2200px)]:max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="heading-ornate text-3xl font-bold text-accent-strong">Personaggi</h1>
        <button
          onClick={create}
          className="glow-accent rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors active:scale-[0.97]"
        >
          + Nuovo
        </button>
      </div>

      <ExportImport
        characters={items}
        onImport={(imported) => {
          const stamped = imported.map((c) => ({ ...c, aggiornatoAl: Date.now() }));
          persist([...items, ...stamped]);
          stamped.forEach(pushRemote);
        }}
      />

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge bg-surface/50 p-10 text-center text-muted">
          <p className="text-4xl mb-3">🛡️</p>
          <p>Nessun personaggio ancora. Crea il tuo primo eroe!</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 [@media(min-width:2200px)]:grid-cols-4">
          {items.map((character) => (
            <li key={character.id}>
              <button
                onClick={() => setEditingId(character.id)}
                className="w-full h-full text-left card-elevated rounded-xl border border-edge bg-surface p-4 hover:border-accent/50 hover:bg-surface-raised transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">
                    {character.nome || "Senza nome"}
                  </span>
                  <span className="text-xs text-muted">
                    PF {character.hpAttuali}/{character.hpMax} · CA{" "}
                    {character.classeArmatura}
                  </span>
                </div>
                <p className="text-sm text-muted mt-0.5">
                  {[character.razza, formatClassSummary(character.classi)]
                    .filter(Boolean)
                    .join(" ") || "—"}{" "}
                  · Livello {totalLevel(character.classi)}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

