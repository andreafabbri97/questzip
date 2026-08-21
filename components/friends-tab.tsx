"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
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
  // La query a cui i risultati attuali corrispondono davvero, aggiornata INSIEME a essi. Da qui si
  // ricava "sto ancora cercando" senza un altro stato e senza setState sincrono nell'effetto
  // (vietato dalle regole del progetto): il debounce di 250ms fa parte dell'attesa, e senza
  // contarlo "nessun utente trovato" comparirebbe fra un tasto e l'altro mentre si digita.
  const [resultsQuery, setResultsQuery] = useState("");
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
        setResultsQuery(q);
        return;
      }
      searchUsers(q)
        .then((r) => {
          if (cancelled) return;
          setResults(r);
          setResultsQuery(q);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setResultsQuery(q);
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
      <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-muted">Cerca amici</h2>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nome o email…"
          className="input-focus w-full rounded-lg border border-edge bg-surface-raised px-3 py-2 text-foreground"
        />
        {/* Senza questo, una ricerca senza risultati era indistinguibile da "sto ancora cercando":
            non compariva nulla. Legato a "searching" e non alla sola lunghezza della query,
            altrimenti il messaggio comparirebbe durante il debounce e il viaggio verso il server —
            cioè proprio mentre stiamo ancora cercando, l'inverso di quello che deve dire. */}
        {query.trim().length >= 2 && resultsQuery === query.trim() && results.length === 0 && (
          <p className="text-sm text-muted">Nessun utente trovato.</p>
        )}

        {results.length > 0 && (
          <ul className="space-y-1.5">
            {results.map((u) => (
              <li
                key={u.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <Link
                  href={`/profilo/${u.id}`}
                  className="flex items-center gap-2 min-w-0 hover:text-accent-strong transition-colors"
                >
                  <Avatar src={u.image} alt="" />
                  <span className="truncate text-sm text-foreground">{u.name ?? "Utente"}</span>
                </Link>
                {friendIds.has(u.id) ? (
                  <span className="text-xs text-muted shrink-0">Già amici</span>
                ) : outgoingIds.has(u.id) ? (
                  <span className="text-xs text-muted shrink-0">Richiesta inviata</span>
                ) : incomingIds.has(u.id) ? (
                  <span className="text-xs text-muted shrink-0">Ti ha inviato una richiesta</span>
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
        <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-muted">Richieste ricevute</h2>
          <ul className="space-y-1.5">
            {data.incoming.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <Link
                  href={`/profilo/${r.fromUserId}`}
                  className="flex items-center gap-2 min-w-0 text-sm text-foreground hover:text-accent-strong transition-colors"
                >
                  <Avatar src={r.fromImage} alt="" />
                  <span className="truncate">{r.fromName ?? "Utente"}</span>
                </Link>
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
        <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-2">
          <h2 className="text-sm uppercase tracking-widest text-muted">Richieste inviate</h2>
          <ul className="space-y-1.5">
            {data.outgoing.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-edge bg-surface-raised px-3 py-2"
              >
                <Link
                  href={`/profilo/${r.toUserId}`}
                  className="flex items-center gap-2 min-w-0 text-sm text-foreground hover:text-accent-strong transition-colors"
                >
                  <Avatar src={r.toImage} alt="" />
                  <span className="truncate">{r.toName ?? "Utente"}</span>
                </Link>
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

      <section className="card-elevated rounded-xl border border-edge bg-surface p-5 space-y-2">
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
                <Link
                  href={`/profilo/${f.id}`}
                  className="flex items-center gap-2 min-w-0 text-sm text-foreground hover:text-accent-strong transition-colors"
                >
                  <Avatar src={f.image} alt="" />
                  <span className="truncate">{f.name ?? "Utente"}</span>
                </Link>
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => onChat(f.id)}
                    className="text-xs font-bold text-accent-strong hover:underline"
                  >
                    💬 Chatta
                  </button>
                  <button
                    onClick={() => {
                      // A 3px da "Chatta", e togliendo l'amicizia sparisce anche la conversazione
                      // diretta dalla lista di /chat: merita una conferma come le altre azioni
                      // distruttive dell'app.
                      if (!window.confirm(`Rimuovere ${f.name ?? "questo utente"} dagli amici?`)) return;
                      act(() => removeFriend(f.id));
                    }}
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
