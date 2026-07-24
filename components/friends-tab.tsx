"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  cancelFriendRequest,
  getFriendsAndRequests,
  removeFriend,
  respondToFriendRequest,
  searchUsers,
  sendFriendRequest,
} from "@/app/actions/friends";

function Avatar({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return <span className="size-6 rounded-full bg-surface-raised shrink-0" />;
  return (
    <Image
      src={src}
      alt={alt}
      width={24}
      height={24}
      className="rounded-full shrink-0 object-cover"
    />
  );
}

/** Ricerca/richieste/lista amici — condiviso fra l'hub /chat (tab "Amici", per trovare con chi
 * iniziare una DM) e /profilo (sezione amici del proprio profilo): stessa lista, stessa
 * capacità di aggiungere/rimuovere, solo il contesto in cui compare cambia. */
export function FriendsTab({ onChat }: { onChat: (friendId: string) => void }) {
  const [data, setData] = useState<Awaited<ReturnType<typeof getFriendsAndRequests>> | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Awaited<ReturnType<typeof searchUsers>>>([]);
  const [error, setError] = useState("");

  const refresh = () => {
    getFriendsAndRequests().then(setData);
  };
  useEffect(refresh, []);

  useEffect(() => {
    const q = query.trim();
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      if (q.length < 2) {
        setResults([]);
        return;
      }
      searchUsers(q).then((r) => {
        if (!cancelled) setResults(r);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query]);

  if (!data) return <p className="text-muted">Caricamento…</p>;

  const friendIds = new Set(data.friends.map((f) => f.id));
  const outgoingIds = new Set(data.outgoing.map((o) => o.toUserId));
  const incomingIds = new Set(data.incoming.map((i) => i.fromUserId));

  const act = async (fn: () => Promise<void>) => {
    setError("");
    try {
      await fn();
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-edge bg-surface p-5 space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-muted">Cerca amici</h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome o email…"
          className="w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
        />
        {results.length > 0 && (
          <ul className="space-y-1.5">
            {results.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Avatar src={u.image} alt="" />
                  <span className="truncate text-sm text-foreground">{u.name ?? u.email}</span>
                </span>
                {friendIds.has(u.id) ? (
                  <span className="text-xs text-muted shrink-0">Già amici</span>
                ) : outgoingIds.has(u.id) ? (
                  <span className="text-xs text-muted shrink-0">Richiesta inviata</span>
                ) : incomingIds.has(u.id) ? (
                  <span className="text-xs text-muted shrink-0">Ti ha scritto</span>
                ) : (
                  <button
                    onClick={() => act(() => sendFriendRequest(u.id))}
                    className="text-xs font-bold text-accent-strong hover:underline shrink-0"
                  >
                    + Aggiungi
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {data.incoming.length > 0 && (
        <section className="rounded-xl border border-edge bg-surface p-5 space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-muted">Richieste ricevute</h2>
          <ul className="space-y-1.5">
            {data.incoming.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <span className="flex items-center gap-2 min-w-0 text-sm text-foreground">
                  <Avatar src={r.fromImage} alt="" />
                  <span className="truncate">{r.fromName ?? "Utente"}</span>
                </span>
                <span className="flex gap-2 shrink-0">
                  <button
                    onClick={() => act(() => respondToFriendRequest(r.id, true))}
                    className="text-xs font-bold text-accent-strong hover:underline"
                  >
                    Accetta
                  </button>
                  <button
                    onClick={() => act(() => respondToFriendRequest(r.id, false))}
                    className="text-xs text-muted hover:text-danger"
                  >
                    Rifiuta
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.outgoing.length > 0 && (
        <section className="rounded-xl border border-edge bg-surface p-5 space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-muted">Richieste inviate</h2>
          <ul className="space-y-1.5">
            {data.outgoing.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <span className="flex items-center gap-2 min-w-0 text-sm text-foreground">
                  <Avatar src={r.toImage} alt="" />
                  <span className="truncate">{r.toName ?? "Utente"}</span>
                </span>
                <button
                  onClick={() => act(() => cancelFriendRequest(r.id))}
                  className="text-xs text-muted hover:text-danger shrink-0"
                >
                  Annulla
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-edge bg-surface p-5 space-y-2">
        <h2 className="text-sm uppercase tracking-widest text-muted">I tuoi amici</h2>
        {data.friends.length === 0 ? (
          <p className="text-sm text-muted">Nessun amico ancora — cercalo qui sopra.</p>
        ) : (
          <ul className="space-y-1.5">
            {data.friends.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <span className="flex items-center gap-2 min-w-0 text-sm text-foreground">
                  <Avatar src={f.image} alt="" />
                  <span className="truncate">{f.name ?? "Utente"}</span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => onChat(f.id)}
                    className="text-xs font-bold text-accent-strong hover:underline"
                  >
                    💬 Chatta
                  </button>
                  <button
                    onClick={() => act(() => removeFriend(f.id))}
                    className="text-xs text-muted hover:text-danger"
                  >
                    Rimuovi
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
