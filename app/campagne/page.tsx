"use client";

import { useState } from "react";
import {
  campaignSchema,
  newCampaign,
  type Campaign,
  type SessionNote,
} from "@/lib/dnd";
import { useLocalCollection } from "@/lib/storage";

export default function CampaignsPage() {
  const { items, persist, loaded } = useLocalCollection("questzip:campagne", campaignSchema);
  const [openId, setOpenId] = useState<string | null>(null);

  const open = items.find((campaign) => campaign.id === openId) ?? null;

  const upsert = (campaign: Campaign) => {
    const exists = items.some((item) => item.id === campaign.id);
    persist(
      exists
        ? items.map((item) => (item.id === campaign.id ? campaign : item))
        : [...items, campaign],
    );
  };

  const remove = (id: string) => {
    persist(items.filter((item) => item.id !== id));
    setOpenId(null);
  };

  const create = () => {
    const campaign = newCampaign();
    upsert(campaign);
    setOpenId(campaign.id);
  };

  if (!loaded) {
    return <p className="text-muted">Caricamento…</p>;
  }

  if (open) {
    return (
      <CampaignDetail
        campaign={open}
        onChange={upsert}
        onDelete={() => remove(open.id)}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-accent-strong">Campagne</h1>
        <button
          onClick={create}
          className="rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors"
        >
          + Nuova
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-edge bg-surface/50 p-10 text-center text-muted">
          <p className="text-4xl mb-3">🗺️</p>
          <p>Nessuna campagna ancora. L&apos;avventura ti aspetta!</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((campaign) => (
            <li key={campaign.id}>
              <button
                onClick={() => setOpenId(campaign.id)}
                className="w-full text-left rounded-xl border border-edge bg-surface p-4 hover:border-accent/50 hover:bg-surface-raised transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-foreground">
                    {campaign.nome || "Senza nome"}
                  </span>
                  <span className="text-xs text-muted">
                    {campaign.sessioni.length}{" "}
                    {campaign.sessioni.length === 1 ? "sessione" : "sessioni"}
                  </span>
                </div>
                <p className="text-sm text-muted mt-0.5 line-clamp-1">
                  {campaign.descrizione || "—"}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CampaignDetail({
  campaign,
  onChange,
  onDelete,
  onBack,
}: {
  campaign: Campaign;
  onChange: (campaign: Campaign) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [newPlayer, setNewPlayer] = useState("");

  const set = <K extends keyof Campaign>(key: K, value: Campaign[K]) =>
    onChange({ ...campaign, [key]: value });

  const addNote = () => {
    if (!noteTitle.trim() && !noteText.trim()) return;
    const note: SessionNote = {
      id: crypto.randomUUID(),
      data: new Date().toISOString().slice(0, 10),
      titolo: noteTitle.trim() || `Sessione ${campaign.sessioni.length + 1}`,
      testo: noteText.trim(),
    };
    set("sessioni", [note, ...campaign.sessioni]);
    setNoteTitle("");
    setNoteText("");
  };

  const addPlayer = () => {
    const name = newPlayer.trim();
    if (!name) return;
    set("giocatori", [...campaign.giocatori, name]);
    setNewPlayer("");
  };

  const inputClass =
    "mt-1 w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground";
  const labelClass = "text-xs uppercase tracking-widest text-muted";

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-muted hover:text-foreground">
          ← Campagne
        </button>
        <button
          onClick={() => {
            if (window.confirm(`Eliminare ${campaign.nome || "la campagna"}?`)) {
              onDelete();
            }
          }}
          className="text-sm text-danger hover:underline"
        >
          Elimina
        </button>
      </div>

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-4">
        <label className="block">
          <span className={labelClass}>Nome della campagna</span>
          <input
            value={campaign.nome}
            onChange={(event) => set("nome", event.target.value)}
            placeholder="Es. La Maledizione di Strahd"
            className={`${inputClass} text-lg font-bold`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Descrizione</span>
          <textarea
            value={campaign.descrizione}
            onChange={(event) => set("descrizione", event.target.value)}
            placeholder="Ambientazione, trama, tono…"
            rows={3}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Master</span>
          <input
            value={campaign.master}
            onChange={(event) => set("master", event.target.value)}
            placeholder="Chi fa il DM?"
            className={inputClass}
          />
        </label>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-muted">Giocatori</h2>
        {campaign.giocatori.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {campaign.giocatori.map((player, index) => (
              <li
                key={`${player}-${index}`}
                className="flex items-center gap-1.5 rounded-full border border-edge bg-surface-raised px-3 py-1 text-sm"
              >
                {player}
                <button
                  onClick={() =>
                    set(
                      "giocatori",
                      campaign.giocatori.filter((_, i) => i !== index),
                    )
                  }
                  className="text-muted hover:text-danger"
                  aria-label={`Rimuovi ${player}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <input
            value={newPlayer}
            onChange={(event) => setNewPlayer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addPlayer();
            }}
            placeholder="Nome giocatore"
            className="flex-1 rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
          />
          <button
            onClick={addPlayer}
            className="rounded-lg border border-edge bg-surface-raised px-4 text-sm text-muted hover:text-foreground transition-colors"
          >
            Aggiungi
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-4">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Diario delle sessioni
        </h2>
        <div className="space-y-2">
          <input
            value={noteTitle}
            onChange={(event) => setNoteTitle(event.target.value)}
            placeholder="Titolo (es. Sessione 3 — La cripta)"
            className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
          />
          <textarea
            value={noteText}
            onChange={(event) => setNoteText(event.target.value)}
            placeholder="Cosa è successo in questa sessione?"
            rows={3}
            className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
          />
          <button
            onClick={addNote}
            className="rounded-lg bg-accent text-background font-bold px-4 py-2 text-sm hover:bg-accent-strong transition-colors"
          >
            Aggiungi al diario
          </button>
        </div>

        {campaign.sessioni.length > 0 && (
          <ul className="space-y-3 pt-2">
            {campaign.sessioni.map((note) => (
              <li
                key={note.id}
                className="rounded-lg border border-edge bg-surface-raised p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-foreground">{note.titolo}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted">{note.data}</span>
                    <button
                      onClick={() =>
                        set(
                          "sessioni",
                          campaign.sessioni.filter((item) => item.id !== note.id),
                        )
                      }
                      className="text-muted hover:text-danger text-sm"
                      aria-label={`Elimina ${note.titolo}`}
                    >
                      ×
                    </button>
                  </div>
                </div>
                {note.testo && (
                  <p className="text-sm text-muted mt-1 whitespace-pre-wrap">
                    {note.testo}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
